import type { BlueprintWall } from './types';
import { decomposeWall } from './wallGeometry';

export interface SolidWallCollider {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  halfThickness: number;
}

/**
 * Extracts 2D line-segment colliders for every solid wall section and window sill,
 * leaving door openings completely clear so the user can walk between rooms.
 */
export function buildWallColliders(walls: BlueprintWall[]): SolidWallCollider[] {
  const colliders: SolidWallCollider[] = [];

  for (const wall of walls) {
    const { length, segments } = decomposeWall(wall);
    if (length < 0.05) continue;

    const dirX = (wall.x2 - wall.x1) / length;
    const dirZ = (wall.z2 - wall.z1) / length;
    const halfT = wall.thickness / 2;

    // Both full piers and window sills block walking; door openings have neither
    for (const seg of segments) {
      if (seg.kind === 'lintel') continue;
      const start = seg.uCenter - seg.uLength / 2;
      const end = seg.uCenter + seg.uLength / 2;
      colliders.push({
        x1: wall.x1 + dirX * start,
        z1: wall.z1 + dirZ * start,
        x2: wall.x1 + dirX * end,
        z2: wall.z1 + dirZ * end,
        halfThickness: halfT,
      });
    }
  }

  return colliders;
}

/**
 * Resolves a 2D circular player footprint against all solid wall segments
 * using iterative closest-point push-out (gives smooth wall sliding).
 */
export function resolvePlayerCollision(
  x: number,
  z: number,
  playerRadius: number,
  colliders: SolidWallCollider[],
): { x: number; z: number; collided: boolean } {
  let px = x;
  let pz = z;
  let collided = false;

  // Two passes handle corner intersections cleanly
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const vx = c.x2 - c.x1;
      const vz = c.z2 - c.z1;
      const lenSq = vx * vx + vz * vz;
      if (lenSq < 1e-6) continue;

      const t = Math.max(
        0,
        Math.min(1, ((px - c.x1) * vx + (pz - c.z1) * vz) / lenSq),
      );
      const closestX = c.x1 + t * vx;
      const closestZ = c.z1 + t * vz;

      const dx = px - closestX;
      const dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;
      const minDist = playerRadius + c.halfThickness;

      if (distSq < minDist * minDist) {
        collided = true;
        const dist = Math.sqrt(distSq);
        if (dist > 1e-5) {
          const push = minDist - dist;
          px += (dx / dist) * push;
          pz += (dz / dist) * push;
        } else {
          // Exactly on segment center: push along normal
          const len = Math.sqrt(lenSq);
          px += (-vz / len) * minDist;
          pz += (vx / len) * minDist;
        }
      }
    }
  }

  return { x: px, z: pz, collided };
}
