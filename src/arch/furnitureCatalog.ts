import type {
  BlueprintBounds,
  BlueprintFurniture,
  FurnitureCategory,
  FurnitureMaterialKind,
  FurniturePartShape,
  FurniturePartSpec,
  FurnitureType,
  GeneratedFurnitureAsset,
} from './types';

const VALID_SHAPES = new Set<FurniturePartShape>(['box', 'cylinder', 'sphere']);
const VALID_MATERIALS = new Set<FurnitureMaterialKind>([
  'wood',
  'fabric',
  'metal',
  'glass',
  'ceramic',
  'stone',
  'foliage',
]);
const VALID_BASE_TYPES = new Set<FurnitureType>([
  'sofa',
  'bed',
  'table',
  'chair',
  'desk',
  'counter',
  'toilet',
  'sink',
  'bathtub',
  'plant',
  'tv_stand',
  'rug',
  'coffee_table',
  'bookshelf',
  'wardrobe',
  'fridge',
  'floor_lamp',
]);
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

const MATERIAL_FALLBACK_COLORS: Record<FurnitureMaterialKind, string> = {
  wood: '#7a5538',
  fabric: '#ddd4c7',
  metal: '#c49a52',
  glass: '#bcd7e6',
  ceramic: '#3d434c',
  stone: '#d4cdc0',
  foliage: '#456c48',
};

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

function round3(val: number): number {
  return Math.round(val * 1000) / 1000;
}

export function sanitizeFurnitureHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const hex6 = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex8 = trimmed.match(/^#?([0-9a-fA-F]{6})[0-9a-fA-F]{2}$/);
  if (hex8) return `#${hex8[1].toLowerCase()}`;
  const hex3 = trimmed.match(/^#?([0-9a-fA-F]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgb) {
    const toHex = (n: string) => clamp(Number(n), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  return fallback;
}

export function generateFurnitureAssetDocId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `fa_${ts}_${rand}`;
}

export function generatePlacedFurnitureId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pf_${ts}_${rand}`;
}

/**
 * Normalizes and grounds an array of composite 3D furniture part primitives so
 * every part has safe physical dimensions, valid materials/colors, and rests
 * cleanly at or above y = 0.
 */
export function normalizeFurnitureParts(
  rawParts: unknown,
  fallbackColor?: string,
): FurniturePartSpec[] {
  if (!Array.isArray(rawParts)) return [];

  const parsed: FurniturePartSpec[] = [];
  for (const entry of rawParts.slice(0, 16)) {
    if (!entry || typeof entry !== 'object') continue;
    const p = entry as Record<string, unknown>;
    const shape: FurniturePartShape = VALID_SHAPES.has(p.shape as FurniturePartShape)
      ? (p.shape as FurniturePartShape)
      : 'box';
    const material: FurnitureMaterialKind = VALID_MATERIALS.has(
      p.material as FurnitureMaterialKind,
    )
      ? (p.material as FurnitureMaterialKind)
      : 'wood';

    const width = round3(clamp(Number(p.width ?? 0.4), 0.02, 5.5));
    const height = round3(clamp(Number(p.height ?? 0.4), 0.02, 3.0));
    const depth = round3(clamp(Number(p.depth ?? 0.4), 0.02, 4.0));
    const x = round3(clamp(Number(p.x ?? 0), -3.0, 3.0));
    const y = round3(clamp(Number(p.y ?? height / 2), -1.0, 3.2));
    const z = round3(clamp(Number(p.z ?? 0), -2.5, 2.5));

    const materialFallback = MATERIAL_FALLBACK_COLORS[material] ?? fallbackColor ?? '#8d6e52';
    const part: FurniturePartSpec = {
      shape,
      x,
      y,
      z,
      width,
      height,
      depth,
      color: sanitizeFurnitureHex(p.color, materialFallback),
      material,
    };

    const rx = Number(p.rotationX);
    const ry = Number(p.rotationY);
    const rz = Number(p.rotationZ);
    if (Number.isFinite(rx) && Math.abs(rx) > 1e-4) {
      part.rotationX = round3(clamp(rx, -Math.PI, Math.PI));
    }
    if (Number.isFinite(ry) && Math.abs(ry) > 1e-4) {
      part.rotationY = round3(clamp(ry, -Math.PI, Math.PI));
    }
    if (Number.isFinite(rz) && Math.abs(rz) > 1e-4) {
      part.rotationZ = round3(clamp(rz, -Math.PI, Math.PI));
    }

    parsed.push(part);
  }

  if (parsed.length === 0) return [];

  // Shift parts vertically so the lowest bounding face sits flush on y = 0
  let minBottomY = Infinity;
  for (const part of parsed) {
    minBottomY = Math.min(minBottomY, part.y - part.height / 2);
  }

  if (Number.isFinite(minBottomY) && Math.abs(minBottomY) > 0.005) {
    for (const part of parsed) {
      part.y = round3(Math.max(part.height / 2, part.y - minBottomY));
    }
  }

  return parsed;
}

function buildFallbackParts(
  width: number,
  depth: number,
  height: number,
  color: string,
): FurniturePartSpec[] {
  const legH = round3(Math.max(0.12, height * 0.45));
  const topH = round3(Math.max(0.06, height - legH));
  const ox = round3(Math.max(0.06, width / 2 - 0.08));
  const oz = round3(Math.max(0.06, depth / 2 - 0.08));
  return [
    {
      shape: 'box',
      x: 0,
      y: round3(legH + topH / 2),
      z: 0,
      width,
      height: topH,
      depth,
      color,
      material: 'wood',
    },
    { shape: 'cylinder', x: -ox, y: round3(legH / 2), z: -oz, width: 0.05, height: legH, depth: 0.05, color: '#3b2e24', material: 'metal' },
    { shape: 'cylinder', x: ox, y: round3(legH / 2), z: -oz, width: 0.05, height: legH, depth: 0.05, color: '#3b2e24', material: 'metal' },
    { shape: 'cylinder', x: -ox, y: round3(legH / 2), z: oz, width: 0.05, height: legH, depth: 0.05, color: '#3b2e24', material: 'metal' },
    { shape: 'cylinder', x: ox, y: round3(legH / 2), z: oz, width: 0.05, height: legH, depth: 0.05, color: '#3b2e24', material: 'metal' },
  ];
}

/**
 * Normalizes the structured JSON output from the Gemini furniture generator
 * into a clean batch of 1–5 composite 3D furniture assets (target: 3 pieces).
 */
export function normalizeGeneratedFurnitureBatch(
  raw: unknown,
  prompt: string,
): GeneratedFurnitureAsset[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  const safePrompt = prompt.trim().slice(0, 400);
  const now = Date.now();
  const normalized: GeneratedFurnitureAsset[] = [];

  for (let idx = 0; idx < list.length && normalized.length < 5; idx++) {
    const entry = list[idx];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;

    const name =
      typeof item.name === 'string' && item.name.trim().length > 0
        ? item.name.trim().slice(0, 80)
        : `Custom Piece ${idx + 1}`;
    const description =
      typeof item.description === 'string'
        ? item.description.trim().slice(0, 240)
        : '';
    const category: FurnitureCategory = VALID_CATEGORIES.has(
      item.category as FurnitureCategory,
    )
      ? (item.category as FurnitureCategory)
      : 'custom';
    const rawWidth = clamp(Number(item.width ?? 1.0), 0.2, 6.0);
    const rawDepth = clamp(Number(item.depth ?? 0.8), 0.2, 4.5);
    const rawHeight = clamp(Number(item.height ?? 0.85), 0.2, 3.2);

    const parsedTopColor = sanitizeFurnitureHex(item.color, '');
    let parts = normalizeFurnitureParts(item.parts, parsedTopColor || '#967251');
    if (parts.length === 0) {
      parts = buildFallbackParts(rawWidth, rawDepth, rawHeight, parsedTopColor || '#967251');
    }
    const color = parsedTopColor || parts[0]?.color || '#967251';

    // Recompute bounding envelope cleanly from normalized parts
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxY = 0;
    for (const p of parts) {
      minX = Math.min(minX, p.x - p.width / 2);
      maxX = Math.max(maxX, p.x + p.width / 2);
      minZ = Math.min(minZ, p.z - p.depth / 2);
      maxZ = Math.max(maxZ, p.z + p.depth / 2);
      maxY = Math.max(maxY, p.y + p.height / 2);
    }

    const width = round3(clamp(Number.isFinite(maxX - minX) ? maxX - minX : rawWidth, 0.2, 6.0));
    const depth = round3(clamp(Number.isFinite(maxZ - minZ) ? maxZ - minZ : rawDepth, 0.2, 4.5));
    const height = round3(clamp(maxY > 0.1 ? maxY : rawHeight, 0.2, 3.2));

    normalized.push({
      id: generateFurnitureAssetDocId(),
      name,
      description,
      category,
      prompt: safePrompt,
      width,
      depth,
      height,
      color,
      parts,
      createdAtMs: now - idx,
    });
  }

  if (normalized.length === 0) {
    throw new Error('Furniture generator returned no valid furniture pieces.');
  }

  return normalized;
}

/**
 * Snaps a world floor point to an architectural grid and clamps it neatly inside
 * the building plinth so placed pieces never fly off into the horizon.
 */
export function snapPlacementPosition(
  x: number,
  z: number,
  bounds: BlueprintBounds,
  gridStep = 0.1,
): { x: number; z: number } {
  const step = Math.max(0.02, gridStep);
  const margin = 1.0;
  const clampedX = clamp(x, bounds.minX - margin, bounds.maxX + margin);
  const clampedZ = clamp(z, bounds.minZ - margin, bounds.maxZ + margin);
  return {
    x: round3(Math.round(clampedX / step) * step),
    z: round3(Math.round(clampedZ / step) * step),
  };
}

/**
 * Converts a catalog GeneratedFurnitureAsset into a placed BlueprintFurniture
 * entry ready to append to SpatialBlueprint.furniture.
 */
export function createPlacedFurnitureItem(
  asset: GeneratedFurnitureAsset,
  x: number,
  z: number,
  rotationY: number,
): BlueprintFurniture {
  const baseType: FurnitureType = VALID_BASE_TYPES.has(asset.category as FurnitureType)
    ? (asset.category as FurnitureType)
    : 'table';
  return {
    id: generatePlacedFurnitureId(),
    name: asset.name.slice(0, 80),
    type: baseType,
    x: round3(x),
    z: round3(z),
    rotationY: round3(rotationY),
    width: round3(clamp(asset.width, 0.2, 6.0)),
    depth: round3(clamp(asset.depth, 0.2, 4.5)),
    height: round3(clamp(asset.height, 0.2, 3.2)),
    color: sanitizeFurnitureHex(asset.color, '#8d6e52'),
    customParts: normalizeFurnitureParts(asset.parts, asset.color),
  };
}

export interface PreparedFurnitureAssetPayload {
  ownerId: string;
  name: string;
  description: string;
  category: FurnitureCategory;
  prompt: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  parts: FurniturePartSpec[];
}

/**
 * Prepares a strictly bounded Firestore payload adhering to firebase-blueprint.json
 * and firestore.rules volumetric limits for /furnitureAssets/{assetId}.
 */
export function prepareFurnitureAssetPayload(
  ownerId: string,
  asset: GeneratedFurnitureAsset,
): PreparedFurnitureAssetPayload {
  const color = sanitizeFurnitureHex(asset.color, '#8d6e52');
  const width = round3(clamp(asset.width, 0.2, 6.0));
  const depth = round3(clamp(asset.depth, 0.2, 4.5));
  const height = round3(clamp(asset.height, 0.2, 3.2));
  let parts = normalizeFurnitureParts(asset.parts, color).slice(0, 16);
  if (parts.length === 0) {
    parts = buildFallbackParts(width, depth, height, color);
  }

  return {
    ownerId,
    name: (asset.name.trim() || 'Custom Piece').slice(0, 80),
    description: asset.description.trim().slice(0, 240),
    category: VALID_CATEGORIES.has(asset.category) ? asset.category : 'custom',
    prompt: asset.prompt.trim().slice(0, 400),
    width,
    depth,
    height,
    color,
    parts,
  };
}

/**
 * Curated starter architectural pieces so users can immediately test interactive
 * placement even before running their first prompt generation.
 */
export const STARTER_FURNITURE_ASSETS: GeneratedFurnitureAsset[] = [
  {
    id: 'starter_walnut_armchair',
    name: 'Walnut Lounge Armchair',
    description: 'Sculpted walnut frame with bouclé seat and angled backrest',
    category: 'chair',
    prompt: 'Starter studio collection',
    width: 0.82,
    depth: 0.84,
    height: 0.82,
    color: '#d8cfc2',
    createdAtMs: 1,
    parts: [
      { shape: 'cylinder', x: -0.34, y: 0.16, z: -0.32, width: 0.045, height: 0.32, depth: 0.045, color: '#5b3f2b', material: 'wood' },
      { shape: 'cylinder', x: 0.34, y: 0.16, z: -0.32, width: 0.045, height: 0.32, depth: 0.045, color: '#5b3f2b', material: 'wood' },
      { shape: 'cylinder', x: -0.34, y: 0.16, z: 0.32, width: 0.045, height: 0.32, depth: 0.045, color: '#5b3f2b', material: 'wood' },
      { shape: 'cylinder', x: 0.34, y: 0.16, z: 0.32, width: 0.045, height: 0.32, depth: 0.045, color: '#5b3f2b', material: 'wood' },
      { shape: 'box', x: 0, y: 0.38, z: 0.02, width: 0.72, height: 0.16, depth: 0.72, color: '#d8cfc2', material: 'fabric' },
      { shape: 'box', x: 0, y: 0.62, z: -0.28, width: 0.7, height: 0.4, depth: 0.14, rotationX: -0.18, color: '#d8cfc2', material: 'fabric' },
      { shape: 'box', x: -0.37, y: 0.48, z: 0, width: 0.06, height: 0.05, depth: 0.72, color: '#5b3f2b', material: 'wood' },
      { shape: 'box', x: 0.37, y: 0.48, z: 0, width: 0.06, height: 0.05, depth: 0.72, color: '#5b3f2b', material: 'wood' },
    ],
  },
  {
    id: 'starter_travertine_table',
    name: 'Travertine Coffee Table',
    description: 'Low sculptural stone slab on twin fluted cylindrical plinths',
    category: 'table',
    prompt: 'Starter studio collection',
    width: 1.32,
    depth: 0.72,
    height: 0.42,
    color: '#d9d2c5',
    createdAtMs: 2,
    parts: [
      { shape: 'cylinder', x: -0.36, y: 0.18, z: 0, width: 0.3, height: 0.36, depth: 0.3, color: '#cbc3b5', material: 'stone' },
      { shape: 'cylinder', x: 0.36, y: 0.18, z: 0, width: 0.3, height: 0.36, depth: 0.3, color: '#cbc3b5', material: 'stone' },
      { shape: 'box', x: 0, y: 0.39, z: 0, width: 1.32, height: 0.06, depth: 0.72, color: '#e2dcd0', material: 'stone' },
      { shape: 'cylinder', x: 0.14, y: 0.46, z: -0.05, width: 0.18, height: 0.08, depth: 0.18, color: '#3d424b', material: 'ceramic' },
    ],
  },
  {
    id: 'starter_brass_lamp',
    name: 'Brushed Brass Floor Lamp',
    description: 'Marble base with slender brass stem and frosted opal globe',
    category: 'custom',
    prompt: 'Starter studio collection',
    width: 0.42,
    depth: 0.42,
    height: 1.68,
    color: '#cfa052',
    createdAtMs: 3,
    parts: [
      { shape: 'cylinder', x: 0, y: 0.04, z: 0, width: 0.36, height: 0.08, depth: 0.36, color: '#e6e3dc', material: 'stone' },
      { shape: 'cylinder', x: 0, y: 0.76, z: 0, width: 0.032, height: 1.36, depth: 0.032, color: '#cfa052', material: 'metal' },
      { shape: 'box', x: 0.12, y: 1.44, z: 0, width: 0.28, height: 0.025, depth: 0.025, color: '#cfa052', material: 'metal' },
      { shape: 'sphere', x: 0.24, y: 1.54, z: 0, width: 0.28, height: 0.28, depth: 0.28, color: '#f7efe0', material: 'glass' },
    ],
  },
];
