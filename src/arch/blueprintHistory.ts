import type {
  BlueprintBounds,
  BlueprintFurniture,
  CameraMode,
  FurnitureInteractionKind,
  FurnitureType,
  SpatialBlueprint,
} from './types';
import { generatePlacedFurnitureId } from './furnitureCatalog';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const MAX_HISTORY_ENTRIES = 40;

export function createHistory<T>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

export function pushHistory<T>(
  state: HistoryState<T>,
  next: T,
  maxEntries = MAX_HISTORY_ENTRIES,
): HistoryState<T> {
  const past = [...state.past, state.present];
  const trimmedPast =
    past.length > maxEntries ? past.slice(past.length - maxEntries) : past;
  return {
    past: trimmedPast,
    present: next,
    future: [],
  };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}

export function canUndo<T>(state: HistoryState<T>): boolean {
  return state.past.length > 0;
}

export function canRedo<T>(state: HistoryState<T>): boolean {
  return state.future.length > 0;
}

export interface ProceduralFurnitureCatalogEntry {
  type: FurnitureType;
  label: string;
  group: 'Living' | 'Bedroom & Study' | 'Kitchen & Bath' | 'Lighting & Decor';
  width: number;
  depth: number;
  height: number;
  color: string;
  interactiveHint?: string;
}

export const PROCEDURAL_FURNITURE_CATALOG: readonly ProceduralFurnitureCatalogEntry[] = [
  {
    type: 'sofa',
    label: 'Sofa',
    group: 'Living',
    width: 2.2,
    depth: 0.92,
    height: 0.82,
    color: '#5c646d',
    interactiveHint: 'Sit in Walk',
  },
  {
    type: 'chair',
    label: 'Lounge Chair',
    group: 'Living',
    width: 0.68,
    depth: 0.68,
    height: 0.84,
    color: '#9c6640',
    interactiveHint: 'Sit in Walk',
  },
  {
    type: 'coffee_table',
    label: 'Coffee Table',
    group: 'Living',
    width: 1.2,
    depth: 0.68,
    height: 0.42,
    color: '#8f6542',
  },
  {
    type: 'tv_stand',
    label: 'TV Stand',
    group: 'Living',
    width: 1.75,
    depth: 0.45,
    height: 0.54,
    color: '#42362e',
    interactiveHint: 'Toggle TV',
  },
  {
    type: 'rug',
    label: 'Area Rug',
    group: 'Living',
    width: 2.6,
    depth: 1.8,
    height: 0.02,
    color: '#cfc6b8',
  },
  {
    type: 'table',
    label: 'Dining Table',
    group: 'Living',
    width: 1.65,
    depth: 0.95,
    height: 0.76,
    color: '#956a44',
  },
  {
    type: 'bed',
    label: 'Bed',
    group: 'Bedroom & Study',
    width: 1.85,
    depth: 2.1,
    height: 0.95,
    color: '#ddd6cc',
  },
  {
    type: 'wardrobe',
    label: 'Wardrobe',
    group: 'Bedroom & Study',
    width: 1.4,
    depth: 0.62,
    height: 2.1,
    color: '#7f5e42',
    interactiveHint: 'Open doors',
  },
  {
    type: 'desk',
    label: 'Studio Desk',
    group: 'Bedroom & Study',
    width: 1.45,
    depth: 0.68,
    height: 0.75,
    color: '#9c734c',
  },
  {
    type: 'bookshelf',
    label: 'Bookshelf',
    group: 'Bedroom & Study',
    width: 1.15,
    depth: 0.36,
    height: 1.85,
    color: '#6b4f39',
  },
  {
    type: 'fridge',
    label: 'Refrigerator',
    group: 'Kitchen & Bath',
    width: 0.82,
    depth: 0.74,
    height: 1.88,
    color: '#cfd5dc',
    interactiveHint: 'Open doors',
  },
  {
    type: 'counter',
    label: 'Counter',
    group: 'Kitchen & Bath',
    width: 1.8,
    depth: 0.64,
    height: 0.9,
    color: '#e5e2dc',
  },
  {
    type: 'sink',
    label: 'Vanity Sink',
    group: 'Kitchen & Bath',
    width: 0.92,
    depth: 0.52,
    height: 0.86,
    color: '#e8e5df',
  },
  {
    type: 'toilet',
    label: 'Toilet',
    group: 'Kitchen & Bath',
    width: 0.44,
    depth: 0.68,
    height: 0.78,
    color: '#f4f4f2',
  },
  {
    type: 'bathtub',
    label: 'Soaking Tub',
    group: 'Kitchen & Bath',
    width: 1.72,
    depth: 0.76,
    height: 0.58,
    color: '#f6f6f3',
  },
  {
    type: 'floor_lamp',
    label: 'Floor Lamp',
    group: 'Lighting & Decor',
    width: 0.44,
    depth: 0.44,
    height: 1.68,
    color: '#e6d8be',
    interactiveHint: 'Toggle light',
  },
  {
    type: 'plant',
    label: 'Potted Plant',
    group: 'Lighting & Decor',
    width: 0.52,
    depth: 0.52,
    height: 1.4,
    color: '#4c724b',
  },
] as const;

export const FURNITURE_COLOR_SWATCHES: readonly { label: string; hex: string }[] = [
  { label: 'Warm Linen', hex: '#dfd7ca' },
  { label: 'Honey Oak', hex: '#9c7148' },
  { label: 'Dark Walnut', hex: '#543c2b' },
  { label: 'Slate Charcoal', hex: '#49515c' },
  { label: 'Sage Olive', hex: '#546e55' },
  { label: 'Terracotta', hex: '#a46042' },
  { label: 'Brushed Steel', hex: '#cfd5dc' },
  { label: 'Porcelain White', hex: '#f4f3ef' },
] as const;

const LABEL_MAP = new Map<FurnitureType, string>(
  PROCEDURAL_FURNITURE_CATALOG.map((entry) => [entry.type, entry.label]),
);

export function getFurnitureDisplayLabel(item: Pick<BlueprintFurniture, 'type' | 'name'>): string {
  if (item.name && item.name.trim().length > 0) return item.name.trim();
  return LABEL_MAP.get(item.type) ?? item.type.replace(/_/g, ' ');
}

export function getFurnitureInteractionKind(
  type: FurnitureType,
): FurnitureInteractionKind | null {
  switch (type) {
    case 'floor_lamp':
      return 'toggle_lamp';
    case 'tv_stand':
      return 'toggle_tv';
    case 'fridge':
    case 'wardrobe':
      return 'toggle_door';
    case 'sofa':
    case 'chair':
      return 'sit';
    default:
      return null;
  }
}

export function getFurnitureInteractionDescriptor(
  type: FurnitureType,
  cameraMode: CameraMode,
  isActive: boolean,
): { interactionKind: FurnitureInteractionKind; actionLabel: string } | null {
  const kind = getFurnitureInteractionKind(type);
  if (!kind) return null;

  // Sitting is only available in Walk Mode
  if (kind === 'sit' && cameraMode !== 'walk') {
    return null;
  }

  switch (kind) {
    case 'toggle_lamp':
      return {
        interactionKind: kind,
        actionLabel: isActive ? 'Turn Floor Lamp Off' : 'Turn Floor Lamp On',
      };
    case 'toggle_tv':
      return {
        interactionKind: kind,
        actionLabel: isActive ? 'Turn TV Off' : 'Turn TV On',
      };
    case 'toggle_door': {
      const noun = type === 'fridge' ? 'Fridge' : 'Wardrobe';
      return {
        interactionKind: kind,
        actionLabel: isActive ? `Close ${noun}` : `Open ${noun}`,
      };
    }
    case 'sit': {
      const noun = type === 'sofa' ? 'Sofa' : 'Chair';
      return {
        interactionKind: kind,
        actionLabel: `Sit on ${noun}`,
      };
    }
  }
}

/**
 * Computes seated eye-height (y = 1.1m) camera position & outward look target
 * for sitting on a sofa or chair in Walk Mode.
 */
export function computeSeatCameraPose(item: BlueprintFurniture): {
  position: [number, number, number];
  lookAt: [number, number, number];
  standPosition: [number, number, number];
} {
  // Furniture local +Z is the front face (backrest is at -Z)
  const forwardX = Math.sin(item.rotationY);
  const forwardZ = Math.cos(item.rotationY);

  const seatOffset = Math.min(0.14, item.depth * 0.14);
  const posX = item.x + forwardX * seatOffset;
  const posZ = item.z + forwardZ * seatOffset;

  const standClearance = item.depth / 2 + 0.42;
  const standX = item.x + forwardX * standClearance;
  const standZ = item.z + forwardZ * standClearance;

  return {
    position: [Number(posX.toFixed(3)), 1.1, Number(posZ.toFixed(3))],
    lookAt: [
      Number((posX + forwardX * 3.0).toFixed(3)),
      1.08,
      Number((posZ + forwardZ * 3.0).toFixed(3)),
    ],
    standPosition: [Number(standX.toFixed(3)), 1.62, Number(standZ.toFixed(3))],
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function createCatalogFurnitureItem(
  type: FurnitureType,
  x: number,
  z: number,
): BlueprintFurniture {
  const entry =
    PROCEDURAL_FURNITURE_CATALOG.find((c) => c.type === type) ??
    PROCEDURAL_FURNITURE_CATALOG[0];

  return {
    id: generatePlacedFurnitureId(),
    name: entry.label,
    type: entry.type,
    x: round3(x),
    z: round3(z),
    rotationY: 0,
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    color: entry.color,
  };
}

export function updateFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  updater: (item: BlueprintFurniture) => BlueprintFurniture,
): SpatialBlueprint {
  if (index < 0 || index >= blueprint.furniture.length) return blueprint;
  const nextFurniture = blueprint.furniture.map((item, idx) =>
    idx === index ? updater(item) : item,
  );
  return {
    ...blueprint,
    furniture: nextFurniture,
  };
}

export function moveFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  x: number,
  z: number,
): SpatialBlueprint {
  return updateFurnitureAt(blueprint, index, (item) => ({
    ...item,
    x: round3(clamp(x, -50, 50)),
    z: round3(clamp(z, -50, 50)),
  }));
}

export function rotateFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  deltaRadians: number,
): SpatialBlueprint {
  return updateFurnitureAt(blueprint, index, (item) => ({
    ...item,
    rotationY: round3(item.rotationY + deltaRadians),
  }));
}

export function setFurnitureRotationAt(
  blueprint: SpatialBlueprint,
  index: number,
  radians: number,
): SpatialBlueprint {
  return updateFurnitureAt(blueprint, index, (item) => ({
    ...item,
    rotationY: round3(Number.isFinite(radians) ? radians : item.rotationY),
  }));
}

export function resizeFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  nextWidth: number,
  nextDepth: number,
  nextHeight?: number,
): SpatialBlueprint {
  return updateFurnitureAt(blueprint, index, (item) => ({
    ...item,
    width: round3(clamp(nextWidth, 0.25, 6.0)),
    depth: round3(clamp(nextDepth, 0.25, 4.5)),
    height:
      nextHeight !== undefined
        ? round3(clamp(nextHeight, item.type === 'rug' ? 0.015 : 0.12, 3.0))
        : item.height,
  }));
}

export function recolorFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  hexColor: string,
): SpatialBlueprint {
  const cleaned = /^#[0-9a-fA-F]{6}$/.test(hexColor.trim())
    ? hexColor.trim().toLowerCase()
    : '#9c7148';
  return updateFurnitureAt(blueprint, index, (item) => ({
    ...item,
    color: cleaned,
  }));
}

export type FurnitureDiffKind = 'none' | 'transform' | 'color' | 'transform_and_color' | 'rebuild_item';

/**
 * Classifies how a single furniture item changed so Three.js can mutate the existing
 * Group in-place (transform / material color) without tearing down geometry or walls.
 */
export function classifyFurnitureItemDiff(
  prev: BlueprintFurniture | undefined,
  next: BlueprintFurniture,
): FurnitureDiffKind {
  if (!prev) return 'rebuild_item';
  if (prev === next) return 'none';

  if (
    prev.type !== next.type ||
    prev.id !== next.id ||
    prev.customParts !== next.customParts ||
    Math.abs(prev.width - next.width) > 1e-4 ||
    Math.abs(prev.depth - next.depth) > 1e-4 ||
    Math.abs(prev.height - next.height) > 1e-4
  ) {
    return 'rebuild_item';
  }

  const transformChanged =
    Math.abs(prev.x - next.x) > 1e-4 ||
    Math.abs(prev.z - next.z) > 1e-4 ||
    Math.abs(prev.rotationY - next.rotationY) > 1e-4;
  const colorChanged = prev.color.toLowerCase() !== next.color.toLowerCase();

  if (transformChanged && colorChanged) return 'transform_and_color';
  if (transformChanged) return 'transform';
  if (colorChanged) return 'color';
  return 'none';
}

export function duplicateFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
  bounds?: BlueprintBounds,
): { blueprint: SpatialBlueprint; newIndex: number } {
  const source = blueprint.furniture[index];
  if (!source || blueprint.furniture.length >= 150) {
    return { blueprint, newIndex: index };
  }

  let nextX = source.x + Math.min(0.9, Math.max(0.55, source.width * 0.45));
  let nextZ = source.z + 0.35;
  if (bounds) {
    if (nextX > bounds.maxX - 0.5) {
      nextX = source.x - Math.min(0.9, Math.max(0.55, source.width * 0.45));
    }
    nextX = clamp(nextX, bounds.minX + 0.35, bounds.maxX - 0.35);
    nextZ = clamp(nextZ, bounds.minZ + 0.35, bounds.maxZ - 0.35);
  }

  const clone: BlueprintFurniture = {
    ...source,
    id: generatePlacedFurnitureId(),
    x: round3(nextX),
    z: round3(nextZ),
    customParts: source.customParts
      ? source.customParts.map((p) => ({ ...p }))
      : undefined,
  };

  const nextFurniture = [...blueprint.furniture, clone];
  return {
    blueprint: { ...blueprint, furniture: nextFurniture },
    newIndex: nextFurniture.length - 1,
  };
}

export function removeFurnitureAt(
  blueprint: SpatialBlueprint,
  index: number,
): SpatialBlueprint {
  if (index < 0 || index >= blueprint.furniture.length) return blueprint;
  return {
    ...blueprint,
    furniture: blueprint.furniture.filter((_, idx) => idx !== index),
  };
}
