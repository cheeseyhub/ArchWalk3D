import { getBlueprintAreaSqMeters, normalizeBlueprint } from './blueprint';
import type { InputMode, SpatialBlueprint } from './types';

export const VALID_INPUT_MODES = new Set<InputMode>(['floor_plan', 'exterior', 'single_room']);

function sanitizeHexColor(hex: string, fallback: string): string {
  const cleaned = hex.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(cleaned)) {
    return cleaned.slice(0, 9);
  }
  return fallback;
}

export function generateBlueprintDocId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `bp_${ts}_${rand}`;
}

export interface PreparedBlueprintPayload {
  ownerId: string;
  name: string;
  inputMode: InputMode;
  prompt: string;
  roof: {
    style: 'flat' | 'gabled';
    color: string;
    overhang: number;
  };
  rooms: SpatialBlueprint['rooms'];
  walls: SpatialBlueprint['walls'];
  furniture: SpatialBlueprint['furniture'];
  roomCount: number;
  areaSqMeters: number;
}

/**
 * Prepares a strictly validated native-map/list Firestore payload that complies
 * with firebase-blueprint.json and firestore.rules volumetric limits.
 */
export function prepareSavedBlueprintPayload(
  ownerId: string,
  blueprint: SpatialBlueprint,
  inputMode: InputMode,
  prompt: string,
): PreparedBlueprintPayload {
  const normalized = normalizeBlueprint(blueprint);
  const boundedRooms = normalized.rooms.slice(0, 40);
  const boundedWalls = normalized.walls.slice(0, 120);
  const boundedFurniture = normalized.furniture.slice(0, 150);

  const safeName = (normalized.name.trim() || 'Untitled Residence').slice(0, 80);
  const safePrompt = prompt.trim().slice(0, 600);
  const safeMode: InputMode = VALID_INPUT_MODES.has(inputMode) ? inputMode : 'floor_plan';
  const safeOverhang = Math.max(0, Math.min(3, Number(normalized.roof.overhang) || 0.4));
  const area = Math.max(
    1,
    Math.min(
      10000,
      Math.round(
        getBlueprintAreaSqMeters({
          ...normalized,
          rooms: boundedRooms,
        }) * 10,
      ) / 10,
    ),
  );

  return {
    ownerId,
    name: safeName,
    inputMode: safeMode,
    prompt: safePrompt,
    roof: {
      style: normalized.roof.style === 'gabled' ? 'gabled' : 'flat',
      color: sanitizeHexColor(normalized.roof.color, '#4c5462'),
      overhang: safeOverhang,
    },
    rooms: boundedRooms,
    walls: boundedWalls,
    furniture: boundedFurniture,
    roomCount: boundedRooms.length,
    areaSqMeters: area,
  };
}
