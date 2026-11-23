import type { BlueprintWall, WallOpening } from './types';

export interface WallRectSegment {
  /** Center offset along the wall from (x1, z1), in meters */
  uCenter: number;
  /** Length along the wall axis, in meters */
  uLength: number;
  /** Center height from floor y=0, in meters */
  yCenter: number;
  /** Vertical height, in meters */
  yHeight: number;
  kind: 'pier' | 'lintel' | 'sill';
}

export interface ClampedOpening extends WallOpening {
  start: number;
  end: number;
}

export interface WallDecomposition {
  length: number;
  angle: number;
  segments: WallRectSegment[];
  openings: ClampedOpening[];
}

const MIN_EPS = 0.02;

/**
 * Pure mathematical decomposition of a wall with door and window openings
 * into solid non-overlapping piers, lintels, and sills.
 */
export function decomposeWall(wall: BlueprintWall): WallDecomposition {
  const dx = wall.x2 - wall.x1;
  const dz = wall.z2 - wall.z1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);

  if (length < MIN_EPS) {
    return { length: 0, angle: 0, segments: [], openings: [] };
  }

  // Sort openings along the wall and prevent overlap or out-of-bounds spans
  const sorted = [...(wall.openings ?? [])].sort((a, b) => a.offset - b.offset);
  const clampedOpenings: ClampedOpening[] = [];
  let cursor = 0;

  for (const op of sorted) {
    const rawStart = Math.max(cursor, Math.min(length, op.offset));
    const rawEnd = Math.min(length, rawStart + Math.max(0, op.width));
    const opWidth = rawEnd - rawStart;
    if (opWidth < 0.25) continue;

    const sillHeight =
      op.type === 'door'
        ? 0
        : Math.max(0, Math.min(wall.height - 0.35, op.sillHeight));
    const opHeight = Math.max(
      0.3,
      Math.min(wall.height - sillHeight, op.height),
    );

    clampedOpenings.push({
      ...op,
      offset: rawStart,
      width: opWidth,
      sillHeight,
      height: opHeight,
      start: rawStart,
      end: rawEnd,
    });
    cursor = rawEnd;
  }

  const segments: WallRectSegment[] = [];
  let u = 0;

  for (const op of clampedOpenings) {
    // Solid full-height pier before this opening
    if (op.start - u > MIN_EPS) {
      const pierLen = op.start - u;
      segments.push({
        uCenter: u + pierLen / 2,
        uLength: pierLen,
        yCenter: wall.height / 2,
        yHeight: wall.height,
        kind: 'pier',
      });
    }

    // Sill apron below window
    if (op.sillHeight > MIN_EPS) {
      segments.push({
        uCenter: op.start + op.width / 2,
        uLength: op.width,
        yCenter: op.sillHeight / 2,
        yHeight: op.sillHeight,
        kind: 'sill',
      });
    }

    // Lintel header above door or window
    const topOfOpening = op.sillHeight + op.height;
    const lintelHeight = wall.height - topOfOpening;
    if (lintelHeight > MIN_EPS) {
      segments.push({
        uCenter: op.start + op.width / 2,
        uLength: op.width,
        yCenter: topOfOpening + lintelHeight / 2,
        yHeight: lintelHeight,
        kind: 'lintel',
      });
    }

    u = op.end;
  }

  // Trailing full-height pier after final opening
  if (length - u > MIN_EPS) {
    const pierLen = length - u;
    segments.push({
      uCenter: u + pierLen / 2,
      uLength: pierLen,
      yCenter: wall.height / 2,
      yHeight: wall.height,
      kind: 'pier',
    });
  }

  return {
    length,
    angle,
    segments,
    openings: clampedOpenings,
  };
}
