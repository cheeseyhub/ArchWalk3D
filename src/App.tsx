import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { DEMO_HOUSE_BLUEPRINT } from './arch/demoHouse';
import {
  STARTER_FURNITURE_ASSETS,
  createPlacedFurnitureItem,
} from './arch/furnitureCatalog';
import { SseStreamParser, type ParsedSseEvent } from './arch/sseParser';
import type { BlueprintStreamProgress } from './arch/streamProgress';
import type {
  BlueprintFurniture,
  CameraMode,
  GeneratedFurnitureAsset,
  InputMode,
  SpatialBlueprint,
} from './arch/types';
import { ArchViewport, type TeleportRequest } from './components/ArchViewport';
import { AuthGate } from './components/AuthGate';
import {
  BuildProgressOverlay,
  type BuildProgressState,
  type BuildStageId,
} from './components/BuildProgressOverlay';
import { PlacementHud } from './components/PlacementHud';
import { StudioSidebar, type SidebarTab } from './components/StudioSidebar';
import { ViewportToolbar } from './components/ViewportToolbar';
import { WalkModeHud } from './components/WalkModeHud';
import {
  clearLocalCachedModel,
  deleteBlueprintFromFirestore,
  loadLocalCachedModel,
  saveBlueprintToFirestore,
  saveLocalCachedModel,
  subscribeUserBlueprints,
  updateBlueprintFurnitureInFirestore,
  type SavedBlueprintRecord,
} from './firebase/blueprints';
import { auth, googleProvider } from './firebase/client';
import {
  clearLocalFurnitureCatalog,
  deleteFurnitureAssetFromFirestore,
  loadLocalFurnitureCatalog,
  saveFurnitureAssetsToFirestore,
  saveLocalFurnitureCatalog,
  subscribeUserFurnitureAssets,
} from './firebase/furnitureAssets';

const EMPTY_STREAM_PROGRESS: BlueprintStreamProgress = {
  detectedName: null,
  roofStyle: null,
  roomsCount: 0,
  roomNames: [],
  wallsCount: 0,
  furnitureCount: 0,
  charsReceived: 0,
};

function createInitialBuildProgress(): BuildProgressState {
  return {
    stage: 'analyzing',
    statusText: 'Preparing architectural image...',
    elapsedMs: 0,
    stream: EMPTY_STREAM_PROGRESS,
  };
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Could not read uploaded image file.'));
        return;
      }
      resolve({
        base64: result.slice(commaIdx + 1),
        mimeType: file.type || 'image/png',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const initialCacheRef = useRef(loadLocalCachedModel());
  const initialCache = initialCacheRef.current;

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('building');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>(
    initialCache?.inputMode ?? 'floor_plan',
  );
  const [prompt, setPrompt] = useState(initialCache?.prompt ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgressState>(
    createInitialBuildProgress,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [blueprint, setBlueprint] = useState<SpatialBlueprint>(
    initialCache?.blueprint ?? DEMO_HOUSE_BLUEPRINT,
  );
  const [activeSavedId, setActiveSavedId] = useState<string | null>(
    initialCache?.savedDocId ?? null,
  );
  const [isUsingDemo, setIsUsingDemo] = useState<boolean>(!initialCache);

  // Firebase Auth + Firestore saved blueprints state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [savedModels, setSavedModels] = useState<SavedBlueprintRecord[]>([]);
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // Furniture Generator & Interactive Placement state
  const [furniturePrompt, setFurniturePrompt] = useState('');
  const [isGeneratingFurniture, setIsGeneratingFurniture] = useState(false);
  const [furnitureError, setFurnitureError] = useState<string | null>(null);
  const [generatedFurnitureCatalog, setGeneratedFurnitureCatalog] = useState<
    GeneratedFurnitureAsset[]
  >(() => loadLocalFurnitureCatalog());
  const [isSyncingFurniture, setIsSyncingFurniture] = useState(false);
  const [placingAsset, setPlacingAsset] = useState<GeneratedFurnitureAsset | null>(null);
  const [placementRotationY, setPlacementRotationY] = useState(0);

  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [showRoof, setShowRoof] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [teleportRequest, setTeleportRequest] = useState<TeleportRequest | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const userManuallySelectedRef = useRef(false);
  const hasRestoredFromFirestoreRef = useRef(false);

  // Clean up object URL when image changes or unmounts
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setSavedModels([]);
        hasRestoredFromFirestoreRef.current = false;
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to user's saved blueprints in Firestore only after auth is ready
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribe = subscribeUserBlueprints(
      user.uid,
      (records) => {
        setSavedModels(records);

        // On reload, restore the user's latest saved house automatically if they haven't manually switched
        if (
          !hasRestoredFromFirestoreRef.current &&
          !userManuallySelectedRef.current &&
          records.length > 0
        ) {
          hasRestoredFromFirestoreRef.current = true;
          const cachedId = initialCacheRef.current?.savedDocId ?? null;
          const preferred =
            (cachedId ? records.find((r) => r.id === cachedId) : null) ??
            (initialCacheRef.current ? null : records[0]);

          if (preferred) {
            setBlueprint(preferred.blueprint);
            setActiveSavedId(preferred.id);
            setInputMode(preferred.inputMode);
            setPrompt(preferred.prompt);
            setIsUsingDemo(false);
            saveLocalCachedModel({
              savedDocId: preferred.id,
              inputMode: preferred.inputMode,
              prompt: preferred.prompt,
              blueprint: preferred.blueprint,
              savedAtMs: preferred.updatedAtMs,
            });
          }
        }
      },
      (errText) => {
        setErrorMessage(errText);
      },
    );

    return unsubscribe;
  }, [authReady, user]);

  // Subscribe to user's persisted generated furniture assets in Firestore
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribe = subscribeUserFurnitureAssets(
      user.uid,
      (cloudAssets) => {
        setGeneratedFurnitureCatalog((prevLocal) => {
          const cloudIds = new Set(cloudAssets.map((a) => a.id));
          // Keep any unsynced local-only generated pieces alongside cloud assets
          const localOnly = prevLocal.filter(
            (a) => !a.persistedInCloud && !cloudIds.has(a.id),
          );
          const merged = [...localOnly, ...cloudAssets];
          saveLocalFurnitureCatalog(merged);
          return merged;
        });
      },
      (errText) => {
        setFurnitureError(errText);
      },
    );

    return unsubscribe;
  }, [authReady, user]);

  // Smooth live elapsed timer while generating building so UI visibly advances every 100ms
  useEffect(() => {
    if (!isGenerating) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const elapsedMs = performance.now() - started;
      setBuildProgress((prev) => ({
        ...prev,
        elapsedMs,
      }));
    }, 100);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to sign in with Google.',
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setErrorMessage(null);
    setFurnitureError(null);
    try {
      await signOut(auth);
      clearLocalCachedModel();
      clearLocalFurnitureCatalog();
      setActiveSavedId(null);
      setSavedModels([]);
      setGeneratedFurnitureCatalog([]);
      setPlacingAsset(null);
      setBlueprint({ ...DEMO_HOUSE_BLUEPRINT });
      setIsUsingDemo(true);
      setActiveRoomId(null);
      setCameraMode('orbit');
      setShowRoof(true);
      setImageFile(null);
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPrompt('');
      setFurniturePrompt('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to sign out.');
    }
  }, []);

  const handleImageSelect = useCallback((file: File) => {
    setErrorMessage(null);
    setImageFile(file);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const handleImageClear = useCallback(() => {
    setImageFile(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setErrorMessage(null);
  }, []);

  const handleCancelGenerate = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
  }, []);

  const persistBlueprintIfSignedIn = useCallback(
    async (
      nextBlueprint: SpatialBlueprint,
      mode: InputMode,
      notes: string,
    ): Promise<string | null> => {
      saveLocalCachedModel({
        savedDocId: null,
        inputMode: mode,
        prompt: notes,
        blueprint: nextBlueprint,
        savedAtMs: Date.now(),
      });

      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      setIsSavingToDb(true);
      try {
        const docId = await saveBlueprintToFirestore(
          currentUser.uid,
          nextBlueprint,
          mode,
          notes,
        );
        setActiveSavedId(docId);
        saveLocalCachedModel({
          savedDocId: docId,
          inputMode: mode,
          prompt: notes,
          blueprint: nextBlueprint,
          savedAtMs: Date.now(),
        });
        return docId;
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error
            ? `Model built locally, but saving to database failed: ${err.message}`
            : 'Model built locally, but saving to database failed.',
        );
        return null;
      } finally {
        setIsSavingToDb(false);
      }
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!imageFile) {
      setErrorMessage(
        'Please upload a PNG, JPG, or WEBP architectural image first, or click Load Demo House.',
      );
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const trimmedNotes = prompt.trim();
    setErrorMessage(null);
    setPlacingAsset(null);
    setBuildProgress(createInitialBuildProgress());
    setIsGenerating(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Please sign in with Google to generate a 3D model.');
      }
      const idToken = await currentUser.getIdToken();
      const { base64, mimeType } = await readFileAsBase64(imageFile);

      const response = await fetch('/api/blueprint/generate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          mode: inputMode,
          prompt: trimmedNotes,
        }),
      });

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errPayload.error || `Blueprint generation failed (HTTP ${response.status}).`,
        );
      }

      if (!response.body) {
        throw new Error('Streaming response is unavailable in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseParser = new SseStreamParser();
      let completedBlueprint: SpatialBlueprint | null = null;
      let streamError: string | null = null;

      const handleParsedEvent = (parsed: ParsedSseEvent) => {
        if (parsed.event === 'stage') {
          const payload = parsed.data as { stage?: BuildStageId; message?: string };
          setBuildProgress((prev) => ({
            ...prev,
            stage: payload.stage ?? prev.stage,
            statusText: payload.message ?? prev.statusText,
          }));
        } else if (parsed.event === 'heartbeat') {
          setBuildProgress((prev) => ({
            ...prev,
            statusText:
              prev.stage === 'reasoning'
                ? 'Analyzing architectural layout & calculating wall alignments...'
                : prev.statusText,
          }));
        } else if (parsed.event === 'progress') {
          const payload = parsed.data as { progress?: BlueprintStreamProgress };
          if (payload.progress) {
            const p = payload.progress;
            const summaryParts: string[] = [];
            if (p.roomsCount > 0) summaryParts.push(`${p.roomsCount} rooms`);
            if (p.wallsCount > 0) summaryParts.push(`${p.wallsCount} walls`);
            if (p.furnitureCount > 0) summaryParts.push(`${p.furnitureCount} items`);
            setBuildProgress((prev) => ({
              ...prev,
              stage: 'streaming',
              statusText:
                summaryParts.length > 0
                  ? `Drafting ${summaryParts.join(', ')}...`
                  : 'Streaming architectural blueprint...',
              stream: p,
            }));
          }
        } else if (parsed.event === 'complete') {
          const payload = parsed.data as { blueprint?: SpatialBlueprint };
          if (payload.blueprint) {
            completedBlueprint = payload.blueprint;
          }
        } else if (parsed.event === 'error') {
          const payload = parsed.data as { error?: string };
          streamError = payload.error || 'Blueprint generation failed.';
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        for (const parsed of sseParser.push(textChunk)) {
          handleParsedEvent(parsed);
        }
      }

      // Flush any trailing multibyte UTF-8 sequence and final buffered SSE block at EOF
      const trailingChunk = decoder.decode();
      if (trailingChunk) {
        for (const parsed of sseParser.push(trailingChunk)) {
          handleParsedEvent(parsed);
        }
      }
      for (const parsed of sseParser.flush()) {
        handleParsedEvent(parsed);
      }

      if (streamError) {
        throw new Error(streamError);
      }

      // Fallback to standard JSON endpoint if an intermediary proxy closed SSE early
      if (!completedBlueprint && !controller.signal.aborted) {
        setBuildProgress((prev) => ({
          ...prev,
          stage: 'building',
          statusText: 'Stream interrupted — retrying blueprint request...',
        }));
        const fallbackRes = await fetch('/api/blueprint/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: base64,
            mimeType,
            mode: inputMode,
            prompt: trimmedNotes,
          }),
        });
        const fallbackJson = (await fallbackRes.json().catch(() => ({}))) as {
          blueprint?: SpatialBlueprint;
          error?: string;
        };
        if (!fallbackRes.ok || !fallbackJson.blueprint) {
          throw new Error(
            fallbackJson.error ||
              'Generation finished without a blueprint payload. Please try again.',
          );
        }
        completedBlueprint = fallbackJson.blueprint;
      }

      if (!completedBlueprint) {
        throw new Error('Generation finished without a blueprint payload. Please try again.');
      }

      userManuallySelectedRef.current = true;
      setBlueprint(completedBlueprint);
      setIsUsingDemo(false);
      setActiveSavedId(null);
      setActiveRoomId(null);
      setCameraMode('orbit');
      setShowRoof(true);
      setResetNonce((n) => n + 1);

      await persistBlueprintIfSignedIn(completedBlueprint, inputMode, trimmedNotes);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to generate 3D model. Please try again.',
      );
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }, [imageFile, inputMode, prompt, persistBlueprintIfSignedIn]);

  // Helper to commit furniture edits inside the active house to localStorage + Firestore
  const commitBlueprintFurniture = useCallback(
    (updater: (prevFurniture: BlueprintFurniture[]) => BlueprintFurniture[]) => {
      setBlueprint((prev) => {
        const nextFurniture = updater(prev.furniture).slice(0, 150);
        const nextBlueprint: SpatialBlueprint = {
          ...prev,
          furniture: nextFurniture,
        };

        saveLocalCachedModel({
          savedDocId: activeSavedId,
          inputMode,
          prompt,
          blueprint: nextBlueprint,
          savedAtMs: Date.now(),
        });

        if (activeSavedId && auth.currentUser) {
          setIsSavingToDb(true);
          void updateBlueprintFurnitureInFirestore(activeSavedId, nextFurniture)
            .catch((err: unknown) => {
              setFurnitureError(
                err instanceof Error
                  ? `Furniture placed locally, but syncing to database failed: ${err.message}`
                  : 'Furniture placed locally, but syncing to database failed.',
              );
            })
            .finally(() => setIsSavingToDb(false));
        }

        return nextBlueprint;
      });
    },
    [activeSavedId, inputMode, prompt],
  );

  const handleGenerateFurniture = useCallback(async () => {
    const cleaned = furniturePrompt.trim();
    if (!cleaned) {
      setFurnitureError('Please enter a prompt describing the 3 furniture pieces you want.');
      return;
    }

    setFurnitureError(null);
    setIsGeneratingFurniture(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Please sign in with Google to generate custom furniture.');
      }
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/furniture/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ prompt: cleaned }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        items?: GeneratedFurnitureAsset[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(payload.items) || payload.items.length === 0) {
        throw new Error(
          payload.error || `Furniture generation failed (HTTP ${response.status}).`,
        );
      }

      const generatedItems = payload.items;

      // Update catalog + localStorage immediately so reloading never loses generated furniture
      setGeneratedFurnitureCatalog((prev) => {
        const next = [...generatedItems, ...prev].slice(0, 60);
        saveLocalFurnitureCatalog(next);
        return next;
      });
      setFurniturePrompt('');

      // Persist all generated furniture assets to Firestore
      if (auth.currentUser) {
        setIsSyncingFurniture(true);
        try {
          const savedCloud = await saveFurnitureAssetsToFirestore(
            auth.currentUser.uid,
            generatedItems,
          );
          const savedMap = new Map(savedCloud.map((item) => [item.id, item]));
          setGeneratedFurnitureCatalog((prev) => {
            const next = prev.map((item) => savedMap.get(item.id) ?? item);
            saveLocalFurnitureCatalog(next);
            return next;
          });
        } catch (err: unknown) {
          setFurnitureError(
            err instanceof Error
              ? `Furniture generated locally, but saving to database failed: ${err.message}`
              : 'Furniture generated locally, but saving to database failed.',
          );
        } finally {
          setIsSyncingFurniture(false);
        }
      }
    } catch (err: unknown) {
      setFurnitureError(
        err instanceof Error
          ? err.message
          : 'Unable to generate furniture right now. Please try again.',
      );
    } finally {
      setIsGeneratingFurniture(false);
    }
  }, [furniturePrompt]);

  const handleTogglePlaceAsset = useCallback((asset: GeneratedFurnitureAsset) => {
    setFurnitureError(null);
    setPlacingAsset((prev) => {
      if (prev?.id === asset.id) {
        return null;
      }
      setPlacementRotationY(0);
      setCameraMode('orbit');
      setShowRoof(false); // Automatically open cutaway view so interior floors are clear
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setSidebarOpen(false);
      }
      return asset;
    });
  }, []);

  const handlePlaceFurniture = useCallback(
    (x: number, z: number, rotY: number) => {
      if (!placingAsset) return;
      const placed = createPlacedFurnitureItem(placingAsset, x, z, rotY);
      commitBlueprintFurniture((prev) => [...prev, placed]);
    },
    [placingAsset, commitBlueprintFurniture],
  );

  const handleRotatePlacement = useCallback(() => {
    setPlacementRotationY((prev) => prev + Math.PI / 4);
  }, []);

  const handleCancelPlacement = useCallback(() => {
    setPlacingAsset(null);
  }, []);

  const handleDeleteCatalogAsset = useCallback(
    async (assetId: string) => {
      setFurnitureError(null);
      if (placingAsset?.id === assetId) {
        setPlacingAsset(null);
      }

      const target = generatedFurnitureCatalog.find((a) => a.id === assetId);
      setGeneratedFurnitureCatalog((prev) => {
        const next = prev.filter((a) => a.id !== assetId);
        saveLocalFurnitureCatalog(next);
        return next;
      });

      if (target?.persistedInCloud && auth.currentUser) {
        try {
          await deleteFurnitureAssetFromFirestore(assetId);
        } catch (err: unknown) {
          setFurnitureError(
            err instanceof Error ? err.message : 'Unable to delete furniture asset from database.',
          );
        }
      }
    },
    [generatedFurnitureCatalog, placingAsset],
  );

  const handleRotatePlacedItem = useCallback(
    (index: number) => {
      commitBlueprintFurniture((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? { ...item, rotationY: Number((item.rotationY + Math.PI / 4).toFixed(3)) }
            : item,
        ),
      );
    },
    [commitBlueprintFurniture],
  );

  const handleRemovePlacedItem = useCallback(
    (index: number) => {
      commitBlueprintFurniture((prev) => prev.filter((_, idx) => idx !== index));
    },
    [commitBlueprintFurniture],
  );

  const handleSaveCurrentToDb = useCallback(async () => {
    if (!user) return;
    setErrorMessage(null);
    await persistBlueprintIfSignedIn(blueprint, inputMode, prompt.trim());
  }, [user, blueprint, inputMode, prompt, persistBlueprintIfSignedIn]);

  const handleSelectSavedModel = useCallback((record: SavedBlueprintRecord) => {
    userManuallySelectedRef.current = true;
    setErrorMessage(null);
    setPlacingAsset(null);
    setBlueprint(record.blueprint);
    setActiveSavedId(record.id);
    setInputMode(record.inputMode);
    setPrompt(record.prompt);
    setIsUsingDemo(false);
    setActiveRoomId(null);
    setCameraMode('orbit');
    setShowRoof(true);
    setResetNonce((n) => n + 1);
    saveLocalCachedModel({
      savedDocId: record.id,
      inputMode: record.inputMode,
      prompt: record.prompt,
      blueprint: record.blueprint,
      savedAtMs: record.updatedAtMs,
    });
  }, []);

  const handleDeleteSavedModel = useCallback(
    async (id: string) => {
      setErrorMessage(null);
      try {
        await deleteBlueprintFromFirestore(id);
        if (activeSavedId === id) {
          setActiveSavedId(null);
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to delete saved model.',
        );
      }
    },
    [activeSavedId],
  );

  const handleLoadDemo = useCallback(() => {
    userManuallySelectedRef.current = true;
    setErrorMessage(null);
    setPlacingAsset(null);
    setBlueprint({ ...DEMO_HOUSE_BLUEPRINT });
    setActiveSavedId(null);
    setIsUsingDemo(true);
    setActiveRoomId(null);
    setCameraMode('orbit');
    setShowRoof(true);
    setResetNonce((n) => n + 1);
  }, []);

  const handleSelectRoom = useCallback((roomId: string) => {
    setPlacingAsset(null);
    setActiveRoomId(roomId);
    setCameraMode('walk');
    setTeleportRequest((prev) => ({
      roomId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleCameraModeChange = useCallback((mode: CameraMode) => {
    if (mode === 'walk') {
      setPlacingAsset(null);
    }
    setCameraMode(mode);
    if (mode === 'orbit') {
      setActiveRoomId(null);
    }
  }, []);

  const handleResetView = useCallback(() => {
    setResetNonce((n) => n + 1);
  }, []);

  const activeRoomName =
    blueprint.rooms.find((r) => r.id === activeRoomId)?.name ?? null;

  const canSaveCurrentToDb = Boolean(user && !activeSavedId && !isUsingDemo);

  // Mandatory Google Sign-In Gate: do not mount studio or 3D viewport until signed in
  if (!authReady || !user) {
    return (
      <AuthGate
        authReady={authReady}
        isSigningIn={isSigningIn}
        errorMessage={errorMessage}
        onSignIn={handleSignIn}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0f13] text-[#eceef2]">
      {/* Mobile backdrop scrim when sidebar drawer is open */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/55 md:hidden"
        />
      )}

      <StudioSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        imagePreviewUrl={imagePreviewUrl}
        imageFileName={imageFile?.name ?? null}
        onImageSelect={handleImageSelect}
        onImageClear={handleImageClear}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        prompt={prompt}
        onPromptChange={setPrompt}
        isGenerating={isGenerating}
        generatingElapsedMs={buildProgress.elapsedMs}
        errorMessage={errorMessage}
        onGenerate={handleGenerate}
        onLoadDemo={handleLoadDemo}
        blueprint={blueprint}
        activeRoomId={activeRoomId}
        onSelectRoom={handleSelectRoom}
        user={user}
        authReady={authReady}
        isSigningIn={isSigningIn}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        savedModels={savedModels}
        activeSavedId={activeSavedId}
        isSavingToDb={isSavingToDb}
        canSaveCurrentToDb={canSaveCurrentToDb}
        onSaveCurrentToDb={handleSaveCurrentToDb}
        onSelectSavedModel={handleSelectSavedModel}
        onDeleteSavedModel={handleDeleteSavedModel}
        furniturePrompt={furniturePrompt}
        onFurniturePromptChange={setFurniturePrompt}
        isGeneratingFurniture={isGeneratingFurniture}
        furnitureError={furnitureError}
        onGenerateFurniture={handleGenerateFurniture}
        generatedFurnitureCatalog={generatedFurnitureCatalog}
        starterFurnitureCatalog={STARTER_FURNITURE_ASSETS}
        placingAssetId={placingAsset?.id ?? null}
        onTogglePlaceAsset={handleTogglePlaceAsset}
        onDeleteCatalogAsset={handleDeleteCatalogAsset}
        onRotatePlacedItem={handleRotatePlacedItem}
        onRemovePlacedItem={handleRemovePlacedItem}
        isSyncingFurniture={isSyncingFurniture}
      />

      <main className="relative flex-1 h-full min-w-0 overflow-hidden">
        <ArchViewport
          blueprint={blueprint}
          cameraMode={cameraMode}
          showRoof={showRoof}
          teleportRequest={teleportRequest}
          resetNonce={resetNonce}
          placingAsset={placingAsset}
          placementRotationY={placementRotationY}
          onPlaceFurniture={handlePlaceFurniture}
          onRotatePlacement={handleRotatePlacement}
          onCancelPlacement={handleCancelPlacement}
          onPointerLockChange={setIsPointerLocked}
          onActiveRoomChange={setActiveRoomId}
        />

        <ViewportToolbar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          cameraMode={cameraMode}
          onCameraModeChange={handleCameraModeChange}
          showRoof={showRoof}
          onToggleRoof={() => setShowRoof((prev) => !prev)}
          onResetView={handleResetView}
        />

        <WalkModeHud
          visible={cameraMode === 'walk' && !placingAsset}
          isPointerLocked={isPointerLocked}
          activeRoomName={activeRoomName}
        />

        <PlacementHud
          asset={placingAsset}
          rotationY={placementRotationY}
          onRotate={handleRotatePlacement}
          onCancel={handleCancelPlacement}
        />

        <BuildProgressOverlay
          visible={isGenerating}
          progress={buildProgress}
          onCancel={handleCancelGenerate}
        />
      </main>
    </div>
  );
}
