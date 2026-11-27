import type { BlueprintWall, SpatialBlueprint, WallOpening } from './types';

export const CORNER_SNAP_THRESHOLD_M = 0.18;
export const DUPLICATE_WALL_DISTANCE_M = 0.15;
const COLLINEAR_DOT_THRESHOLD = 0.985; // ~9.9 degrees tolerance
const MIN_WALL_LENGTH_M = 0.2;
const ENDPOINT_TOUCH_EPS_M = 0.05;

function round3(n: number): number {
  return Number(n.toFixed(3));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface EndpointRef {
  wallIdx: number;
  end: 1 | 2;
  x: number;
  z: number;
}

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[rb] = ra;
    }
  }
}

/**
 * Clamps and deduplicates openings along a wall of given length and height.
 */
function cleanWallOpenings(
  openings: WallOpening[],
  wallLength: number,
  wallHeight: number,
): WallOpening[] {
  if (openings.length === 0 || wallLength < 0.5) return [];

  const sanitized: WallOpening[] = [];
  for (const op of openings) {
    const maxW = Math.max(0.35, wallLength - 0.16);
    const width = round3(clamp(op.width, 0.35, maxW));
    const sillHeight =
      op.type === 'door'
        ? 0
        : round3(clamp(op.sillHeight, 0.15, Math.max(0.2, wallHeight - 0.6)));
    const maxH = Math.max(0.5, wallHeight - sillHeight - 0.12);
    const height = round3(clamp(op.height, 0.5, maxH));
    const maxOffset = Math.max(0.08, wallLength - width - 0.08);
    const offset = round3(clamp(op.offset, 0.08, maxOffset));

    sanitized.push({
      type: op.type,
      offset,
      width,
      height,
      sillHeight,
    });
  }

  sanitized.sort((a, b) => a.offset - b.offset);

  // Deduplicate identical or heavily overlapping openings (e.g., from two adjacent room walls)
  const deduped: WallOpening[] = [];
  for (const candidate of sanitized) {
    const cStart = candidate.offset;
    const cEnd = candidate.offset + candidate.width;
    let merged = false;

    for (let i = 0; i < deduped.length; i++) {
      const existing = deduped[i];
      const eStart = existing.offset;
      const eEnd = existing.offset + existing.width;
      const overlap = Math.min(cEnd, eEnd) - Math.max(cStart, eStart);
      const minWidth = Math.min(candidate.width, existing.width);

      if (overlap > 0 && overlap / Math.max(0.01, minWidth) >= 0.55) {
        // Keep door over window if both occupy the same span; otherwise keep the wider opening
        const keepCandidate =
          (candidate.type === 'door' && existing.type !== 'door') ||
          (candidate.type === existing.type && candidate.width > existing.width);
        if (keepCandidate) {
          deduped[i] = candidate;
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      deduped.push(candidate);
    }
  }

  return deduped;
}

/**
 * Step 1: Snaps any wall endpoints within `threshold` meters of each other to exact
 * shared centroid coordinates so architectural corners close tightly with no gaps.
 */
function snapWallCorners(walls: BlueprintWall[], threshold: number): BlueprintWall[] {
  if (walls.length === 0) return [];

  const endpoints: EndpointRef[] = [];
  for (let i = 0; i < walls.length; i++) {
    endpoints.push({ wallIdx: i, end: 1, x: walls[i].x1, z: walls[i].z1 });
    endpoints.push({ wallIdx: i, end: 2, x: walls[i].x2, z: walls[i].z2 });
  }

  const uf = new UnionFind(endpoints.length);
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      // Never collapse a wall's two opposite endpoints onto each other if wall is valid
      if (endpoints[i].wallIdx === endpoints[j].wallIdx) continue;
      const d = Math.hypot(endpoints[i].x - endpoints[j].x, endpoints[i].z - endpoints[j].z);
      if (d <= threshold) {
        uf.union(i, j);
      }
    }
  }

  const clusters = new Map<number, { sumX: number; sumZ: number; count: number }>();
  for (let i = 0; i < endpoints.length; i++) {
    const root = uf.find(i);
    const entry = clusters.get(root);
    if (entry) {
      entry.sumX += endpoints[i].x;
      entry.sumZ += endpoints[i].z;
      entry.count += 1;
    } else {
      clusters.set(root, { sumX: endpoints[i].x, sumZ: endpoints[i].z, count: 1 });
    }
  }

  const snappedCoords = endpoints.map((_, i) => {
    const c = clusters.get(uf.find(i))!;
    return {
      x: round3(c.sumX / c.count),
      z: round3(c.sumZ / c.count),
    };
  });

  const out: BlueprintWall[] = [];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const p1 = snappedCoords[i * 2];
    const p2 = snappedCoords[i * 2 + 1];
    const newLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (newLen < MIN_WALL_LENGTH_M) continue;

    // Adjust opening offsets slightly if start endpoint shifted along the wall axis
    const oldDx = w.x2 - w.x1;
    const oldDz = w.z2 - w.z1;
    const oldLen = Math.hypot(oldDx, oldDz);
    let deltaAlongStart = 0;
    if (oldLen > 1e-5) {
      const ux = oldDx / oldLen;
      const uz = oldDz / oldLen;
      deltaAlongStart = (p1.x - w.x1) * ux + (p1.z - w.z1) * uz;
    }

    const shiftedOpenings = w.openings.map((op) => ({
      ...op,
      offset: op.offset - deltaAlongStart,
    }));

    out.push({
      ...w,
      x1: p1.x,
      z1: p1.z,
      x2: p2.x,
      z2: p2.z,
      openings: cleanWallOpenings(shiftedOpenings, newLen, w.height),
    });
  }

  return out;
}

function tryMergeWallPair(
  a: BlueprintWall,
  b: BlueprintWall,
  maxPerpDist: number,
): BlueprintWall | null {
  const adx = a.x2 - a.x1;
  const adz = a.z2 - a.z1;
  const aLen = Math.hypot(adx, adz);

  const bdx = b.x2 - b.x1;
  const bdz = b.z2 - b.z1;
  const bLen = Math.hypot(bdx, bdz);

  if (aLen < MIN_WALL_LENGTH_M || bLen < MIN_WALL_LENGTH_M) return null;

  const aux = adx / aLen;
  const auz = adz / aLen;
  const bux = bdx / bLen;
  const buz = bdz / bLen;

  const dot = aux * bux + auz * buz;
  if (Math.abs(dot) < COLLINEAR_DOT_THRESHOLD) return null;

  // Choose canonical unit axis weighted by lengths (align B to A's direction)
  const bSign = dot >= 0 ? 1 : -1;
  const avgDx = aux * aLen + bux * bSign * bLen;
  const avgDz = auz * aLen + buz * bSign * bLen;
  const avgLen = Math.hypot(avgDx, avgDz);
  if (avgLen < 1e-5) return null;

  const ux = avgDx / avgLen;
  const uz = avgDz / avgLen;
  // Normal perpendicular to (ux, uz)
  const nx = -uz;
  const nz = ux;

  // Compute perpendicular positions of both walls relative to origin
  const aMidX = (a.x1 + a.x2) * 0.5;
  const aMidZ = (a.z1 + a.z2) * 0.5;
  const bMidX = (b.x1 + b.x2) * 0.5;
  const bMidZ = (b.z1 + b.z2) * 0.5;

  const perpA = aMidX * nx + aMidZ * nz;
  const perpB = bMidX * nx + bMidZ * nz;

  if (Math.abs(perpA - perpB) > maxPerpDist) return null;

  // Also ensure endpoints of B don't drift beyond tolerance from A's line
  const b1Perp = Math.abs((b.x1 * nx + b.z1 * nz) - perpA);
  const b2Perp = Math.abs((b.x2 * nx + b.z2 * nz) - perpA);
  if (Math.max(b1Perp, b2Perp) > maxPerpDist * 1.15) return null;

  // Project endpoints onto canonical axis u
  const ta1 = a.x1 * ux + a.z1 * uz;
  const ta2 = a.x2 * ux + a.z2 * uz;
  const aMin = Math.min(ta1, ta2);
  const aMax = Math.max(ta1, ta2);

  const tb1 = b.x1 * ux + b.z1 * uz;
  const tb2 = b.x2 * ux + b.z2 * uz;
  const bMin = Math.min(tb1, tb2);
  const bMax = Math.max(tb1, tb2);

  const overlapSpan = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  // Merge if walls overlap (duplicate walls between adjacent rooms) or are collinear segments
  // only when they genuinely overlap (strictly > 0.05m) OR share the exact same centerline (< 0.04m) and touch
  const isDuplicateOverlap = overlapSpan > ENDPOINT_TOUCH_EPS_M;
  if (!isDuplicateOverlap) {
    return null;
  }

  // Length-weighted centerline position
  const mergedPerp = (perpA * aLen + perpB * bLen) / (aLen + bLen);
  const minT = Math.min(aMin, bMin);
  const maxT = Math.max(aMax, bMax);
  const mergedLen = maxT - minT;
  if (mergedLen < MIN_WALL_LENGTH_M) return null;

  const newX1 = round3(ux * minT + nx * mergedPerp);
  const newZ1 = round3(uz * minT + nz * mergedPerp);
  const newX2 = round3(ux * maxT + nx * mergedPerp);
  const newZ2 = round3(uz * maxT + nz * mergedPerp);

  // Remap openings from both walls onto canonical [minT, maxT]
  const remapOpenings = (wall: BlueprintWall, tStart: number, tEnd: number): WallOpening[] => {
    const forward = tEnd >= tStart;
    return wall.openings.map((op) => {
      const worldStartT = forward
        ? tStart + op.offset
        : tStart - op.offset - op.width;
      return {
        ...op,
        offset: worldStartT - minT,
      };
    });
  };

  const mergedHeight = round3(Math.max(a.height, b.height));
  const mergedThickness = round3(Math.max(a.thickness, b.thickness));
  const allOpenings = [
    ...remapOpenings(a, ta1, ta2),
    ...remapOpenings(b, tb1, tb2),
  ];

  return {
    id: aLen >= bLen ? a.id : b.id,
    x1: newX1,
    z1: newZ1,
    x2: newX2,
    z2: newZ2,
    height: mergedHeight,
    thickness: mergedThickness,
    color: aLen >= bLen ? a.color : b.color,
    openings: cleanWallOpenings(allOpenings, mergedLen, mergedHeight),
  };
}

/**
 * Step 2: Detects overlapping/collinear duplicate walls (within `maxPerpDist`)
 * between adjacent rooms and merges them into a single shared wall while preserving
 * all door and window openings.
 */
function mergeCollinearDuplicateWalls(
  walls: BlueprintWall[],
  maxPerpDist: number,
): BlueprintWall[] {
  const working = walls.map((w) => ({
    ...w,
    openings: w.openings.map((op) => ({ ...op })),
  }));

  let didMerge = true;
  let guard = 0;
  const maxIterations = Math.max(16, working.length * 4);

  while (didMerge && guard < maxIterations) {
    didMerge = false;
    guard += 1;

    outer: for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const merged = tryMergeWallPair(working[i], working[j], maxPerpDist);
        if (merged) {
          working[i] = merged;
          working.splice(j, 1);
          didMerge = true;
          break outer;
        }
      }
    }
  }

  return working;
}

/**
 * Architectural geometry cleanup pass that runs on every Gemini blueprint before rendering:
 * 1. Snaps wall endpoints within 0.18m of each other to exact shared coordinates so corners close tightly.
 * 2. Merges overlapping/collinear duplicate walls within 0.15m into a single shared wall while preserving
 *    and deduplicating all door and window openings.
 * 3. Runs a final corner snap so merged shared walls stay watertight at every T-junction and corner.
 */
export function sanitizeBlueprint(blueprint: SpatialBlueprint): SpatialBlueprint {
  const snappedFirst = snapWallCorners(blueprint.walls, CORNER_SNAP_THRESHOLD_M);
  const merged = mergeCollinearDuplicateWalls(snappedFirst, DUPLICATE_WALL_DISTANCE_M);
  const finalWalls = snapWallCorners(merged, CORNER_SNAP_THRESHOLD_M);

  // Ensure wall IDs remain unique
  const seenIds = new Set<string>();
  const uniqueWalls = finalWalls.map((wall, idx) => {
    let id = wall.id || `wall-${idx + 1}`;
    if (seenIds.has(id)) {
      id = `${id}-${idx + 1}`;
    }
    seenIds.add(id);
    return { ...wall, id };
  });

  return {
    ...blueprint,
    walls: uniqueWalls,
  };
}
