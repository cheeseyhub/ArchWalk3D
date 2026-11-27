import { normalizeFurnitureParts } from './furnitureCatalog';
import { sanitizeBlueprint } from './sanitizeBlueprint';
import type {
  BlueprintBounds,
  BlueprintFurniture,
  BlueprintRoom,
  BlueprintWall,
  FloorMaterialType,
  FurnitureType,
  OpeningType,
  RoofStyle,
  SpatialBlueprint,
  WallOpening,
} from './types';

const VALID_ROOF_STYLES = new Set<RoofStyle>(['flat', 'gabled']);
const VALID_FLOOR_MATERIALS = new Set<FloorMaterialType>([
  'wood',
  'tile',
  'carpet',
  'concrete',
]);
const VALID_OPENING_TYPES = new Set<OpeningType>(['door', 'window']);
const VALID_FURNITURE_TYPES = new Set<FurnitureType>([
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

const DEFAULT_FURNITURE_DIMS: Record<
  FurnitureType,
  { width: number; depth: number; height: number; color: string }
> = {
  sofa: { width: 2.2, depth: 0.92, height: 0.82, color: '#5c646d' },
  bed: { width: 1.8, depth: 2.1, height: 0.95, color: '#ddd6cc' },
  table: { width: 1.6, depth: 0.95, height: 0.76, color: '#8f6542' },
  chair: { width: 0.54, depth: 0.54, height: 0.84, color: '#7a593c' },
  desk: { width: 1.4, depth: 0.68, height: 0.75, color: '#9c734c' },
  counter: { width: 2.4, depth: 0.65, height: 0.9, color: '#e5e2dc' },
  toilet: { width: 0.44, depth: 0.68, height: 0.78, color: '#f4f4f2' },
  sink: { width: 0.85, depth: 0.52, height: 0.86, color: '#e8e5df' },
  bathtub: { width: 1.72, depth: 0.78, height: 0.58, color: '#f6f6f3' },
  plant: { width: 0.52, depth: 0.52, height: 1.35, color: '#4c724b' },
  tv_stand: { width: 1.7, depth: 0.44, height: 0.52, color: '#463930' },
  rug: { width: 2.6, depth: 1.8, height: 0.02, color: '#cfc6b8' },
  coffee_table: { width: 1.2, depth: 0.68, height: 0.42, color: '#8f6542' },
  bookshelf: { width: 1.15, depth: 0.36, height: 1.85, color: '#6b4f39' },
  wardrobe: { width: 1.4, depth: 0.62, height: 2.1, color: '#7f5e42' },
  fridge: { width: 0.82, depth: 0.74, height: 1.88, color: '#cfd5dc' },
  floor_lamp: { width: 0.44, depth: 0.44, height: 1.68, color: '#e6d8be' },
};

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function computeBlueprintBounds(blueprint: SpatialBlueprint): BlueprintBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxWallHeight = 2.8;

  for (const room of blueprint.rooms) {
    minX = Math.min(minX, room.x - room.width / 2);
    maxX = Math.max(maxX, room.x + room.width / 2);
    minZ = Math.min(minZ, room.z - room.depth / 2);
    maxZ = Math.max(maxZ, room.z + room.depth / 2);
  }

  for (const wall of blueprint.walls) {
    minX = Math.min(minX, wall.x1, wall.x2);
    maxX = Math.max(maxX, wall.x1, wall.x2);
    minZ = Math.min(minZ, wall.z1, wall.z2);
    maxZ = Math.max(maxZ, wall.z1, wall.z2);
    maxWallHeight = Math.max(maxWallHeight, wall.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return {
      minX: -5,
      maxX: 5,
      minZ: -4,
      maxZ: 4,
      centerX: 0,
      centerZ: 0,
      width: 10,
      depth: 8,
      maxWallHeight: 3,
    };
  }

  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width,
    depth,
    maxWallHeight,
  };
}

export function normalizeBlueprint(raw: unknown): SpatialBlueprint {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Blueprint payload must be a JSON object.');
  }

  const obj = raw as Record<string, unknown>;
  const name =
    typeof obj.name === 'string' && obj.name.trim().length > 0
      ? obj.name.trim().slice(0, 80)
      : 'Architectural Model';

  const rawRoof = (obj.roof && typeof obj.roof === 'object'
    ? obj.roof
    : {}) as Record<string, unknown>;
  const roofStyle: RoofStyle = VALID_ROOF_STYLES.has(rawRoof.style as RoofStyle)
    ? (rawRoof.style as RoofStyle)
    : 'flat';

  const roof = {
    style: roofStyle,
    color: sanitizeHexColor(rawRoof.color, '#3e444c'),
    overhang: clamp(Number(rawRoof.overhang ?? 0.45), 0.1, 1.5),
  };

  const rawRooms = Array.isArray(obj.rooms) ? obj.rooms : [];
  const rooms: BlueprintRoom[] = rawRooms
    .map((item, idx): BlueprintRoom | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const width = clamp(Number(r.width ?? 4), 1.0, 30);
      const depth = clamp(Number(r.depth ?? 4), 1.0, 30);
      const floorMaterial: FloorMaterialType = VALID_FLOOR_MATERIALS.has(
        r.floorMaterial as FloorMaterialType,
      )
        ? (r.floorMaterial as FloorMaterialType)
        : 'wood';
      const defaultFloorColor =
        floorMaterial === 'wood'
          ? '#b6895b'
          : floorMaterial === 'tile'
            ? '#d6d2c9'
            : floorMaterial === 'carpet'
              ? '#c5bfb6'
              : '#9ca0a5';
      return {
        id:
          typeof r.id === 'string' && r.id.trim().length > 0
            ? r.id.trim()
            : `room-${idx + 1}`,
        name:
          typeof r.name === 'string' && r.name.trim().length > 0
            ? r.name.trim().slice(0, 48)
            : `Room ${idx + 1}`,
        x: clamp(Number(r.x ?? 0), -50, 50),
        z: clamp(Number(r.z ?? 0), -50, 50),
        width,
        depth,
        floorMaterial,
        floorColor: sanitizeHexColor(r.floorColor, defaultFloorColor),
      };
    })
    .filter((r): r is BlueprintRoom => r !== null);

  if (rooms.length === 0) {
    throw new Error('Blueprint must contain at least one valid room.');
  }

  const rawWalls = Array.isArray(obj.walls) ? obj.walls : [];
  const walls: BlueprintWall[] = rawWalls
    .map((item, idx): BlueprintWall | null => {
      if (!item || typeof item !== 'object') return null;
      const w = item as Record<string, unknown>;
      const x1 = clamp(Number(w.x1 ?? 0), -50, 50);
      const z1 = clamp(Number(w.z1 ?? 0), -50, 50);
      const x2 = clamp(Number(w.x2 ?? 0), -50, 50);
      const z2 = clamp(Number(w.z2 ?? 0), -50, 50);
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.2) return null;

      const height = clamp(Number(w.height ?? 3.0), 2.1, 6.0);
      const thickness = clamp(Number(w.thickness ?? 0.2), 0.08, 0.6);

      const rawOpenings = Array.isArray(w.openings) ? w.openings : [];
      const openings: WallOpening[] = rawOpenings
        .map((op): WallOpening | null => {
          if (!op || typeof op !== 'object') return null;
          const o = op as Record<string, unknown>;
          const type: OpeningType = VALID_OPENING_TYPES.has(
            o.type as OpeningType,
          )
            ? (o.type as OpeningType)
            : 'window';
          const defaultW = type === 'door' ? 0.95 : 1.4;
          const defaultH = type === 'door' ? 2.15 : 1.4;
          const defaultSill = type === 'door' ? 0 : 0.85;
          const opWidth = clamp(Number(o.width ?? defaultW), 0.4, Math.max(0.4, length - 0.16));
          const sillHeight =
            type === 'door'
              ? 0
              : clamp(Number(o.sillHeight ?? defaultSill), 0.15, height - 0.6);
          const maxOpHeight = Math.max(0.5, height - sillHeight - 0.15);
          const opHeight = clamp(Number(o.height ?? defaultH), 0.5, maxOpHeight);
          const offset = clamp(
            Number(o.offset ?? 0.5),
            0.08,
            Math.max(0.08, length - opWidth - 0.08),
          );
          return {
            type,
            offset,
            width: opWidth,
            height: opHeight,
            sillHeight,
          };
        })
        .filter((o): o is WallOpening => o !== null);

      return {
        id:
          typeof w.id === 'string' && w.id.trim().length > 0
            ? w.id.trim()
            : `wall-${idx + 1}`,
        x1,
        z1,
        x2,
        z2,
        height,
        thickness,
        color: sanitizeHexColor(w.color, '#e7e4de'),
        openings,
      };
    })
    .filter((w): w is BlueprintWall => w !== null);

  const rawFurniture = Array.isArray(obj.furniture) ? obj.furniture : [];
  const furniture: BlueprintFurniture[] = rawFurniture
    .map((item): BlueprintFurniture | null => {
      if (!item || typeof item !== 'object') return null;
      const f = item as Record<string, unknown>;
      const type: FurnitureType = VALID_FURNITURE_TYPES.has(
        f.type as FurnitureType,
      )
        ? (f.type as FurnitureType)
        : 'table';
      const defaults = DEFAULT_FURNITURE_DIMS[type];
      const color = sanitizeHexColor(f.color, defaults.color);
      const customParts = Array.isArray(f.customParts)
        ? normalizeFurnitureParts(f.customParts, color)
        : undefined;
      const itemOut: BlueprintFurniture = {
        type,
        x: clamp(Number(f.x ?? 0), -50, 50),
        z: clamp(Number(f.z ?? 0), -50, 50),
        rotationY: Number.isFinite(Number(f.rotationY))
          ? Number(f.rotationY)
          : 0,
        width: clamp(Number(f.width ?? defaults.width), 0.2, 6.0),
        depth: clamp(Number(f.depth ?? defaults.depth), 0.2, 4.5),
        height: clamp(Number(f.height ?? defaults.height), 0.015, 3.2),
        color,
      };
      if (typeof f.id === 'string' && f.id.trim().length > 0) {
        itemOut.id = f.id.trim().slice(0, 64);
      }
      if (typeof f.name === 'string' && f.name.trim().length > 0) {
        itemOut.name = f.name.trim().slice(0, 80);
      }
      if (customParts && customParts.length > 0) {
        itemOut.customParts = customParts;
      }
      return itemOut;
    })
    .filter((f): f is BlueprintFurniture => f !== null);

  const preliminary: SpatialBlueprint = sanitizeBlueprint({
    name,
    roof,
    rooms,
    walls,
    furniture,
  });
  const bounds = computeBlueprintBounds(preliminary);

  // Recenter blueprint neatly around [0, 0] if shifted noticeably
  const shiftX = Math.abs(bounds.centerX) > 0.05 ? bounds.centerX : 0;
  const shiftZ = Math.abs(bounds.centerZ) > 0.05 ? bounds.centerZ : 0;

  if (shiftX === 0 && shiftZ === 0) {
    return preliminary;
  }

  return {
    name: preliminary.name,
    roof: preliminary.roof,
    rooms: preliminary.rooms.map((r) => ({
      ...r,
      x: Number((r.x - shiftX).toFixed(3)),
      z: Number((r.z - shiftZ).toFixed(3)),
    })),
    walls: preliminary.walls.map((w) => ({
      ...w,
      x1: Number((w.x1 - shiftX).toFixed(3)),
      z1: Number((w.z1 - shiftZ).toFixed(3)),
      x2: Number((w.x2 - shiftX).toFixed(3)),
      z2: Number((w.z2 - shiftZ).toFixed(3)),
    })),
    furniture: preliminary.furniture.map((f) => ({
      ...f,
      x: Number((f.x - shiftX).toFixed(3)),
      z: Number((f.z - shiftZ).toFixed(3)),
    })),
  };
}

/**
 * Computes a comfortable human-eye vantage point inside a room, offset slightly
 * from furniture and facing the longest open sightline across the room.
 */
export function getRoomCameraPose(
  room: BlueprintRoom,
  blueprint: SpatialBlueprint,
): { position: [number, number, number]; lookAt: [number, number, number] } {
  const eyeY = 1.62;
  const roomFurniture = blueprint.furniture.filter(
    (f) =>
      Math.abs(f.x - room.x) <= room.width / 2 + 0.2 &&
      Math.abs(f.z - room.z) <= room.depth / 2 + 0.2,
  );

  // Candidate standing points: room center first, then four interior quadrants
  const padX = Math.min(0.9, room.width * 0.24);
  const padZ = Math.min(0.9, room.depth * 0.24);
  const candidates: Array<[number, number]> = [
    [room.x, room.z],
    [room.x, room.z + padZ],
    [room.x - padX, room.z],
    [room.x + padX, room.z],
    [room.x, room.z - padZ],
  ];

  let bestPos: [number, number] = [room.x, room.z];
  let bestScore = -Infinity;

  for (const [cx, cz] of candidates) {
    let minDist = Infinity;
    for (const f of roomFurniture) {
      const clearance = Math.hypot(cx - f.x, cz - f.z) - Math.max(f.width, f.depth) * 0.42;
      minDist = Math.min(minDist, clearance);
    }
    const score = roomFurniture.length === 0 ? 1 : minDist;
    if (score > bestScore) {
      bestScore = score;
      bestPos = [cx, cz];
    }
  }

  // Face toward the room center or primary focal furniture (or longest axis)
  let targetX = room.x;
  let targetZ = room.z - 1.5;

  if (Math.hypot(bestPos[0] - room.x, bestPos[1] - room.z) > 0.25) {
    targetX = room.x;
    targetZ = room.z;
  } else if (roomFurniture.length > 0) {
    // Look toward the largest focal furniture piece (sofa, bed, table, tv_stand)
    const focal = [...roomFurniture].sort(
      (a, b) => b.width * b.depth - a.width * a.depth,
    )[0];
    targetX = focal.x;
    targetZ = focal.z;
  } else if (room.width >= room.depth) {
    targetX = room.x + 1.5;
    targetZ = room.z;
  }

  // Project look direction cleanly across the room at near-level eye height
  let dirX = targetX - bestPos[0];
  let dirZ = targetZ - bestPos[1];
  const horizLen = Math.hypot(dirX, dirZ);
  if (horizLen < 0.2) {
    dirX = 0;
    dirZ = -1;
  } else {
    dirX /= horizLen;
    dirZ /= horizLen;
  }

  return {
    position: [bestPos[0], eyeY, bestPos[1]],
    lookAt: [bestPos[0] + dirX * 3.0, 1.54, bestPos[1] + dirZ * 3.0],
  };
}

export function getBlueprintAreaSqMeters(blueprint: SpatialBlueprint): number {
  return blueprint.rooms.reduce((sum, r) => sum + r.width * r.depth, 0);
}
