import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBlueprintBounds,
  getBlueprintAreaSqMeters,
  getRoomCameraPose,
  normalizeBlueprint,
  sanitizeHexColor,
} from './blueprint';
import { DEMO_HOUSE_BLUEPRINT } from './demoHouse';

test('sanitizeHexColor accepts 3-digit and 6-digit hex and falls back safely', () => {
  assert.equal(sanitizeHexColor('#abc', '#000000'), '#aabbcc');
  assert.equal(sanitizeHexColor('#12EF89', '#000000'), '#12ef89');
  assert.equal(sanitizeHexColor('rgb(1,2,3)', '#ece8e0'), '#ece8e0');
  assert.equal(sanitizeHexColor(null, '#ece8e0'), '#ece8e0');
});

test('DEMO_HOUSE_BLUEPRINT is centered near origin with valid rooms and area', () => {
  const bounds = computeBlueprintBounds(DEMO_HOUSE_BLUEPRINT);
  assert.equal(Math.abs(bounds.centerX) < 0.01, true);
  assert.equal(Math.abs(bounds.centerZ) < 0.01, true);
  assert.equal(bounds.width, 12);
  assert.equal(bounds.depth, 9);
  assert.equal(Math.round(getBlueprintAreaSqMeters(DEMO_HOUSE_BLUEPRINT)), 108);
});

test('normalizeBlueprint recenters off-center blueprints and clamps invalid values', () => {
  const normalized = normalizeBlueprint({
    name: 'Offset Loft',
    roof: { style: 'invalid-style', color: 'bad', overhang: 99 },
    rooms: [
      {
        id: 'r1',
        name: 'Studio',
        x: 20,
        z: 10,
        width: 6,
        depth: 4,
        floorMaterial: 'wood',
        floorColor: '#aabbcc',
      },
    ],
    walls: [
      {
        id: 'w1',
        x1: 17,
        z1: 8,
        x2: 23,
        z2: 8,
        height: 3,
        thickness: 0.2,
        color: '#ffffff',
        openings: [
          { type: 'door', offset: 10, width: 1.0, height: 2.2, sillHeight: 0.5 },
        ],
      },
    ],
    furniture: [
      {
        type: 'sofa',
        x: 20,
        z: 10,
        rotationY: 0,
        width: 2,
        depth: 0.9,
        height: 0.8,
        color: '#445566',
      },
    ],
  });

  assert.equal(normalized.roof.style, 'flat');
  assert.equal(normalized.roof.overhang, 1.5);
  assert.equal(normalized.rooms[0].x, 0);
  assert.equal(normalized.rooms[0].z, 0);
  // Door sill height must always be forced to 0
  assert.equal(normalized.walls[0].openings[0].sillHeight, 0);
  assert.ok(normalized.walls[0].openings[0].offset <= 6 - 1.0);
});

test('getRoomCameraPose places camera inside room at eye level with valid look target', () => {
  for (const room of DEMO_HOUSE_BLUEPRINT.rooms) {
    const pose = getRoomCameraPose(room, DEMO_HOUSE_BLUEPRINT);
    assert.equal(pose.position[1], 1.62);
    assert.ok(Math.abs(pose.position[0] - room.x) <= room.width / 2);
    assert.ok(Math.abs(pose.position[2] - room.z) <= room.depth / 2);
    const dist = Math.hypot(
      pose.lookAt[0] - pose.position[0],
      pose.lookAt[2] - pose.position[2],
    );
    assert.ok(dist >= 0.2, `Room ${room.name} look target should not be degenerate`);
  }
});
