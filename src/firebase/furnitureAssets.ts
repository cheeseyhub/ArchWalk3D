import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  generateFurnitureAssetDocId,
  normalizeFurnitureParts,
  prepareFurnitureAssetPayload,
} from '../arch/furnitureCatalog';
import type { FurnitureCategory, GeneratedFurnitureAsset } from '../arch/types';
import { OperationType, db, handleFirestoreError } from './client';

const LOCAL_FURNITURE_CACHE_KEY = 'archwalk3d:generated_furniture:v1';

const VALID_CATEGORIES = new Set<FurnitureCategory>([
  'sofa',
  'bed',
  'table',
  'chair',
  'desk',
  'counter',
  'toilet',
  'sink',
  'plant',
  'tv_stand',
  'custom',
]);

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

export async function saveFurnitureAssetsToFirestore(
  ownerId: string,
  assets: GeneratedFurnitureAsset[],
): Promise<GeneratedFurnitureAsset[]> {
  const saved: GeneratedFurnitureAsset[] = [];

  for (const asset of assets) {
    const docId =
      asset.id && /^[a-zA-Z0-9_\-]{1,128}$/.test(asset.id) && !asset.id.startsWith('starter_')
        ? asset.id
        : generateFurnitureAssetDocId();
    const path = `furnitureAssets/${docId}`;
    const payload = prepareFurnitureAssetPayload(ownerId, asset);

    try {
      await setDoc(doc(db, 'furnitureAssets', docId), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      saved.push({
        ...asset,
        id: docId,
        name: payload.name,
        description: payload.description,
        category: payload.category,
        prompt: payload.prompt,
        width: payload.width,
        depth: payload.depth,
        height: payload.height,
        color: payload.color,
        parts: payload.parts,
        persistedInCloud: true,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  return saved;
}

export async function deleteFurnitureAssetFromFirestore(assetId: string): Promise<void> {
  const path = `furnitureAssets/${assetId}`;
  try {
    await deleteDoc(doc(db, 'furnitureAssets', assetId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserFurnitureAssets(
  ownerId: string,
  onData: (assets: GeneratedFurnitureAsset[]) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  const path = 'furnitureAssets';
  const q = query(collection(db, 'furnitureAssets'), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const assets: GeneratedFurnitureAsset[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        const color = typeof raw.color === 'string' ? raw.color : '#8d6e52';
        const parts = normalizeFurnitureParts(raw.parts, color);
        if (parts.length === 0) return;

        const rawCategory = raw.category as FurnitureCategory;
        assets.push({
          id: docSnap.id,
          name: typeof raw.name === 'string' ? raw.name : 'Custom Piece',
          description: typeof raw.description === 'string' ? raw.description : '',
          category: VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'custom',
          prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
          width: typeof raw.width === 'number' ? raw.width : 1.0,
          depth: typeof raw.depth === 'number' ? raw.depth : 0.8,
          height: typeof raw.height === 'number' ? raw.height : 0.85,
          color,
          parts,
          createdAtMs: toTimestampMs(raw.createdAt),
          persistedInCloud: true,
        });
      });

      assets.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(assets);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) {
          onError(
            wrapped instanceof Error
              ? wrapped.message
              : 'Unable to sync generated furniture library from Firestore.',
          );
        }
      }
    },
  );
}

export function loadLocalFurnitureCatalog(): GeneratedFurnitureAsset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_FURNITURE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is GeneratedFurnitureAsset => {
        return (
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          Array.isArray(item.parts) &&
          item.parts.length > 0
        );
      })
      .slice(0, 60);
  } catch {
    return [];
  }
}

export function saveLocalFurnitureCatalog(assets: GeneratedFurnitureAsset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LOCAL_FURNITURE_CACHE_KEY,
      JSON.stringify(assets.slice(0, 60)),
    );
  } catch {
    // Ignore quota / privacy mode errors
  }
}
