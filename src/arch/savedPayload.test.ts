import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_HOUSE_BLUEPRINT } from './demoHouse';
import { generateBlueprintDocId, prepareSavedBlueprintPayload } from './savedPayload';

test('generateBlueprintDocId matches firestore.rules isValidId pattern', () => {
  const id = generateBlueprintDocId();
  assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  assert.ok(id.length >= 1 && id.length <= 128);
});

test('prepareSavedBlueprintPayload clamps oversized strings, arrays, and computes exact schema keys', () => {
  const hugeRooms = Array.from({ length: 55 }, (_, i) => ({
    id: `r${i}`,
    name: `Room ${i}`,
    x: i * 4,
    z: 0,
    width: 3,
    depth: 3,
    floorMaterial: 'wood' as const,
    floorColor: '#b58d63',
  }));
  const hugeWalls = Array.from({ length: 140 }, (_, i) => ({
    id: `w${i}`,
    x1: -2,
    z1: (i - 70) * 0.5,
    x2: 2,
    z2: (i - 70) * 0.5,
    height: 3,
    thickness: 0.2,
    color: '#ece8e0',
    openings: [],
  }));
  const hugeFurniture = Array.from({ length: 180 }, () => ({
    type: 'chair' as const,
    x: 0,
    z: 0,
    rotationY: 0,
    width: 0.5,
    depth: 0.5,
    height: 0.9,
    color: '#555555',
  }));

  const payload = prepareSavedBlueprintPayload(
    'uid_abc123',
    {
      ...DEMO_HOUSE_BLUEPRINT,
      name: 'X'.repeat(140),
      roof: { style: 'gabled', color: 'not-a-hex', overhang: 99 },
      rooms: hugeRooms,
      walls: hugeWalls,
      furniture: hugeFurniture,
    },
    'exterior',
    'P'.repeat(900),
  );

  assert.equal(payload.ownerId, 'uid_abc123');
  assert.equal(payload.name.length, 80);
  assert.equal(payload.prompt.length, 600);
  assert.equal(payload.inputMode, 'exterior');
  assert.match(payload.roof.color, /^#[0-9a-fA-F]{6}$/);
  assert.ok(payload.roof.overhang >= 0 && payload.roof.overhang <= 3);
  assert.equal(payload.rooms.length, 40);
  assert.equal(payload.walls.length, 120);
  assert.equal(payload.furniture.length, 150);
  assert.equal(payload.roomCount, 40);
  assert.ok(payload.areaSqMeters > 0 && payload.areaSqMeters <= 10000);
});
