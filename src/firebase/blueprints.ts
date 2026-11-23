import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getBlueprintAreaSqMeters, normalizeBlueprint } from '../arch/blueprint';
import {
  VALID_INPUT_MODES,
  generateBlueprintDocId,
  prepareSavedBlueprintPayload,
} from '../arch/savedPayload';
import type { BlueprintFurniture, InputMode, SpatialBlueprint } from '../arch/types';
import { OperationType, db, handleFirestoreError } from './client';

export interface SavedBlueprintRecord {
  id: string;
  ownerId: string;
  name: string;
  inputMode: InputMode;
  prompt: string;
  blueprint: SpatialBlueprint;
  roomCount: number;
  areaSqMeters: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface LocalCachedModel {
  savedDocId: string | null;
  inputMode: InputMode;
  prompt: string;
  blueprint: SpatialBlueprint;
  savedAtMs: number;
}

const LOCAL_CACHE_KEY = 'archwalk3d:last_blueprint:v1';

export { generateBlueprintDocId, prepareSavedBlueprintPayload };

export async function saveBlueprintToFirestore(
  ownerId: string,
  blueprint: SpatialBlueprint,
  inputMode: InputMode,
  prompt: string,
): Promise<string> {
  const docId = generateBlueprintDocId();
  const path = `blueprints/${docId}`;
  const payload = prepareSavedBlueprintPayload(ownerId, blueprint, inputMode, prompt);

  try {
    await setDoc(doc(db, 'blueprints', docId), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBlueprintFurnitureInFirestore(
  blueprintId: string,
  furniture: BlueprintFurniture[],
): Promise<void> {
  const path = `blueprints/${blueprintId}`;
  const boundedFurniture = furniture.slice(0, 150);
  try {
    await updateDoc(doc(db, 'blueprints', blueprintId), {
      furniture: boundedFurniture,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBlueprintFromFirestore(blueprintId: string): Promise<void> {
  const path = `blueprints/${blueprintId}`;
  try {
    await deleteDoc(doc(db, 'blueprints', blueprintId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function toTimestampMs(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return Date.now();
}

export function subscribeUserBlueprints(
  ownerId: string,
  onData: (records: SavedBlueprintRecord[]) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const path = 'blueprints';
  const q = query(collection(db, 'blueprints'), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: SavedBlueprintRecord[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        const rawMode = raw.inputMode as InputMode;
        const normalized = normalizeBlueprint({
          name: raw.name,
          roof: raw.roof,
          rooms: raw.rooms,
          walls: raw.walls,
          furniture: raw.furniture,
        });
        records.push({
          id: docSnap.id,
          ownerId: String(raw.ownerId ?? ownerId),
          name: normalized.name,
          inputMode: VALID_INPUT_MODES.has(rawMode) ? rawMode : 'floor_plan',
          prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
          blueprint: normalized,
          roomCount:
            typeof raw.roomCount === 'number' ? raw.roomCount : normalized.rooms.length,
          areaSqMeters:
            typeof raw.areaSqMeters === 'number'
              ? raw.areaSqMeters
              : Math.round(getBlueprintAreaSqMeters(normalized)),
          createdAtMs: toTimestampMs(raw.createdAt),
          updatedAtMs: toTimestampMs(raw.updatedAt),
        });
      });

      // Sort newest first on client to avoid requiring a composite index
      records.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) {
          onError(
            wrapped instanceof Error
              ? wrapped.message
              : 'Unable to sync saved blueprints from Firestore.',
          );
        }
      }
    },
  );
}

export function saveLocalCachedModel(model: LocalCachedModel): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(model));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function loadLocalCachedModel(): LocalCachedModel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalCachedModel>;
    if (!parsed || !parsed.blueprint) return null;
    const normalized = normalizeBlueprint(parsed.blueprint);
    const mode = parsed.inputMode;
    return {
      savedDocId: typeof parsed.savedDocId === 'string' ? parsed.savedDocId : null,
      inputMode: mode && VALID_INPUT_MODES.has(mode) ? mode : 'floor_plan',
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      blueprint: normalized,
      savedAtMs: typeof parsed.savedAtMs === 'number' ? parsed.savedAtMs : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearLocalCachedModel(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_CACHE_KEY);
  } catch {
    // Ignore
  }
}
