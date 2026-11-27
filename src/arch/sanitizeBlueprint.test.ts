import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCoordinateGridLayout, GRID_COLS, GRID_ROWS } from './gridOverlay';
import { sanitizeBlueprint } from './sanitizeBlueprint';
import type { SpatialBlueprint } from './types';

function makeBaseBlueprint(walls: SpatialBlueprint['walls']): SpatialBlueprint {
  return {
    name: 'Test Residence',
    roof: { style: 'flat', color: '#3b424c', overhang: 0.4 },
    rooms: [
      {
        id: 'living',
        name: 'Living Room',
        x: -2,
        z: 0,
        width: 4,
        depth: 4,
        floorMaterial: 'wood',
        floorColor: '#b7885a',
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        x: 2,
        z: 0,
        width: 4,
        depth: 4,
        floorMaterial: 'tile',
        floorColor: '#d9d5cc',
      },
    ],
    walls,
    furniture: [],
  };
}

test('sanitizeBlueprint snaps wall corners within 0.18m to exact shared coordinates', () => {
  const bp = makeBaseBlueprint([
    {
      id: 'w-north',
      x1: -4,
      z1: -2,
      x2: 0.06,
      z2: -2.04,
      height: 2.8,
      thickness: 0.2,
      color: '#ece8e0',
      openings: [],
    },
    {
      id: 'w-east',
      x1: -0.05,
      z1: -1.96,
      x2: 0,
      z2: 2,
      height: 2.8,
      thickness: 0.2,
      color: '#ece8e0',
      openings: [],
    },
  ]);

  const cleaned = sanitizeBlueprint(bp);
  assert.equal(cleaned.walls.length, 2);
  const north = cleaned.walls.find((w) => w.id === 'w-north')!;
  const east = cleaned.walls.find((w) => w.id === 'w-east')!;

  // The corner endpoints should match to the exact millimeter
  assert.equal(north.x2, east.x1);
  assert.equal(north.z2, east.z1);
});

test('sanitizeBlueprint does not snap endpoints farther apart than 0.18m', () => {
  const bp = makeBaseBlueprint([
    {
      id: 'w-left',
      x1: -4,
      z1: 0,
      x2: -1.2,
      z2: 0,
      height: 2.8,
      thickness: 0.2,
      color: '#ece8e0',
      openings: [],
    },
    {
      id: 'w-right',
      x1: -0.9,
      z1: 0,
      x2: 2,
      z2: 0,
      height: 2.8,
      thickness: 0.2,
      color: '#ece8e0',
      openings: [],
    },
  ]);

  const cleaned = sanitizeBlueprint(bp);
  assert.equal(cleaned.walls.length, 2);
  assert.ok(Math.abs(cleaned.walls[0].x2 - cleaned.walls[1].x1) > 0.25);
});

test('sanitizeBlueprint merges collinear overlapping duplicate walls within 0.15m and preserves reversed openings', () => {
  const bp = makeBaseBlueprint([
    // Living room's right wall (runs top-to-bottom along x = -0.05) with a door at z = -0.5..+0.4
    {
      id: 'living-east',
      x1: -0.05,
      z1: -2,
      x2: -0.05,
      z2: 2,
      height: 2.8,
      thickness: 0.16,
      color: '#ece8e0',
      openings: [
        { type: 'door', offset: 1.5, width: 0.9, height: 2.15, sillHeight: 0 },
      ],
    },
    // Kitchen's left wall (runs bottom-to-top along x = +0.06, 0.11m away) with a pass-through window near z = -1.6..-0.9
    {
      id: 'kitchen-west',
      x1: 0.06,
      z1: 2,
      x2: 0.06,
      z2: -2,
      height: 2.8,
      thickness: 0.18,
      color: '#ece8e0',
      openings: [
        // Running from z=2 toward z=-2: offset 2.9, width 0.7 covers z = -0.9 to z = -1.6
        { type: 'window', offset: 2.9, width: 0.7, height: 1.1, sillHeight: 1.0 },
        // Duplicate door at same span as living-east (z = +0.4 down to -0.5 -> offset 1.6, width 0.9)
        { type: 'door', offset: 1.6, width: 0.9, height: 2.15, sillHeight: 0 },
      ],
    },
  ]);

  const cleaned = sanitizeBlueprint(bp);
  assert.equal(cleaned.walls.length, 1);

  const shared = cleaned.walls[0];
  assert.equal(shared.thickness, 0.18);
  assert.ok(Math.abs(shared.x1 - 0.005) < 0.01);
  assert.ok(Math.abs(shared.x2 - 0.005) < 0.01);

  // Should contain BOTH the unique window and the single deduplicated door (2 openings total, not 3)
  assert.equal(shared.openings.length, 2);
  const win = shared.openings.find((o) => o.type === 'window');
  const door = shared.openings.find((o) => o.type === 'door');
  assert.ok(win, 'Window opening must be preserved');
  assert.ok(door, 'Door opening must be preserved');
  assert.ok(Math.abs(win.offset - 0.4) < 0.05, `Expected remapped window offset ~0.4, got ${win.offset}`);
  assert.ok(Math.abs(door.offset - 1.5) < 0.05, `Expected door offset ~1.5, got ${door.offset}`);
});

test('sanitizeBlueprint keeps parallel room walls separated by more than 0.15m intact', () => {
  const bp = makeBaseBlueprint([
    {
      id: 'hall-left',
      x1: -1.0,
      z1: -2,
      x2: -1.0,
      z2: 2,
      height: 2.8,
      thickness: 0.15,
      color: '#ece8e0',
      openings: [],
    },
    {
      id: 'hall-right',
      x1: 0.2,
      z1: -2,
      x2: 0.2,
      z2: 2,
      height: 2.8,
      thickness: 0.15,
      color: '#ece8e0',
      openings: [],
    },
  ]);

  const cleaned = sanitizeBlueprint(bp);
  assert.equal(cleaned.walls.length, 2);
});

test('computeCoordinateGridLayout builds exact 10x10 A-J by 1-10 grid geometry', () => {
  const layout = computeCoordinateGridLayout(2400, 1600, 1800);
  assert.equal(layout.imageWidth, 1800);
  assert.equal(layout.imageHeight, 1200);
  assert.equal(layout.colCenters.length, GRID_COLS.length);
  assert.equal(layout.rowCenters.length, GRID_ROWS.length);
  assert.equal(layout.colCenters[0].label, 'A');
  assert.equal(layout.colCenters[9].label, 'J');
  assert.equal(layout.rowCenters[0].label, '1');
  assert.equal(layout.rowCenters[9].label, '10');
  assert.equal(layout.verticalLines.length, 11);
  assert.equal(layout.horizontalLines.length, 11);
});
