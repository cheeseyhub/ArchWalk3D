import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlacedFurnitureItem,
  generateFurnitureAssetDocId,
  normalizeFurnitureParts,
  normalizeGeneratedFurnitureBatch,
  prepareFurnitureAssetPayload,
  snapPlacementPosition,
  STARTER_FURNITURE_ASSETS,
} from './furnitureCatalog';

test('generateFurnitureAssetDocId satisfies firestore.rules isValidId pattern', () => {
  const id = generateFurnitureAssetDocId();
  assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  assert.ok(id.length >= 1 && id.length <= 128);
});

test('normalizeFurnitureParts grounds floating or sunken parts flush at y = 0 and applies material-aware colors', () => {
  const parts = normalizeFurnitureParts([
    { shape: 'box', x: 0, y: -0.2, z: 0, width: 1.0, height: 0.4, depth: 0.6, color: '#abc', material: 'wood' },
    { shape: 'cylinder', x: 0, y: 0.3, z: 0, width: 0.2, height: 0.2, depth: 0.2, color: '5c4028', material: 'unknown' },
    { shape: 'sphere', x: 0, y: 0.6, z: 0, width: 0.3, height: 0.3, depth: 0.3, color: 'invalid', material: 'foliage' },
    { shape: 'box', x: 0, y: 0.8, z: 0, width: 0.4, height: 0.1, depth: 0.4, color: 'rgb(220, 210, 195)', material: 'fabric' },
  ]);

  assert.equal(parts.length, 4);
  // First part had bottom at -0.4; grounding shifts it up by +0.4 so bottom sits at 0
  assert.equal(parts[0].y, 0.2);
  assert.equal(parts[0].color, '#aabbcc');
  assert.equal(parts[1].y, 0.7);
  assert.equal(parts[1].material, 'wood');
  assert.equal(parts[1].color, '#5c4028');
  assert.equal(parts[2].color, '#456c48');
  assert.equal(parts[3].color, '#dcd2c3');
});

test('normalizeGeneratedFurnitureBatch normalizes 3 generated pieces and computes bounds', () => {
  const raw = {
    items: [
      {
        name: 'Sculptural Oak Chair',
        description: 'Warm Scandinavian accent chair',
        category: 'chair',
        width: 0.75,
        depth: 0.75,
        height: 0.85,
        color: '#a3784f',
        parts: [
          { shape: 'box', x: 0, y: 0.42, z: 0, width: 0.65, height: 0.1, depth: 0.65, color: '#a3784f', material: 'wood' },
          { shape: 'cylinder', x: -0.25, y: 0.2, z: -0.25, width: 0.05, height: 0.4, depth: 0.05, color: '#5c422c', material: 'wood' },
        ],
      },
      {
        name: 'Glass Side Table',
        description: 'Smoked glass top with blackened steel frame',
        category: 'table',
        width: 0.6,
        depth: 0.6,
        height: 0.55,
        color: '#2a2f36',
        parts: [], // Should fall back gracefully to valid procedural parts
      },
      {
        name: 'Ceramic Floor Vase',
        description: 'Matte terracotta planter',
        category: 'plant',
        width: 0.45,
        depth: 0.45,
        height: 1.2,
        color: '#b86a4a',
        parts: [
          { shape: 'cylinder', x: 0, y: 0.25, z: 0, width: 0.35, height: 0.5, depth: 0.35, color: '#b86a4a', material: 'ceramic' },
          { shape: 'sphere', x: 0, y: 0.85, z: 0, width: 0.45, height: 0.55, depth: 0.45, color: '#476b49', material: 'foliage' },
        ],
      },
    ],
  };

  const batch = normalizeGeneratedFurnitureBatch(raw, 'Scandinavian living room set');
  assert.equal(batch.length, 3);
  assert.equal(batch[0].name, 'Sculptural Oak Chair');
  assert.ok(batch[1].parts.length >= 1, 'Fallback parts must be generated if parts array is empty');
  assert.equal(batch[2].prompt, 'Scandinavian living room set');
});

test('snapPlacementPosition snaps to 0.1m grid and clamps within building bounds', () => {
  const bounds = {
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
  const snapped = snapPlacementPosition(1.24, -2.37, bounds, 0.1);
  assert.deepEqual(snapped, { x: 1.2, z: -2.4 });

  const clamped = snapPlacementPosition(40, -30, bounds, 0.1);
  assert.deepEqual(clamped, { x: 6, z: -5 });
});

test('prepareFurnitureAssetPayload and createPlacedFurnitureItem satisfy Firestore schema caps', () => {
  const sample = {
    ...STARTER_FURNITURE_ASSETS[0],
    name: 'A'.repeat(120),
    description: 'D'.repeat(400),
    prompt: 'P'.repeat(600),
    parts: Array.from({ length: 24 }, () => STARTER_FURNITURE_ASSETS[0].parts[0]),
  };

  const payload = prepareFurnitureAssetPayload('uid_test_1', sample);
  assert.equal(payload.ownerId, 'uid_test_1');
  assert.equal(payload.name.length, 80);
  assert.equal(payload.description.length, 240);
  assert.equal(payload.prompt.length, 400);
  assert.equal(payload.parts.length, 16);

  const placed = createPlacedFurnitureItem(STARTER_FURNITURE_ASSETS[2], 1.5, -0.5, Math.PI / 2);
  assert.equal(placed.type, 'table'); // 'custom' maps safely to a valid base FurnitureType
  assert.equal(placed.name, 'Brushed Brass Floor Lamp');
  assert.equal(placed.customParts?.length, 4);
});
