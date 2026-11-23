import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposeWall } from './wallGeometry';
import type { BlueprintWall } from './types';

test('decomposeWall returns single full pier when wall has no openings', () => {
  const wall: BlueprintWall = {
    id: 'solid',
    x1: 0,
    z1: 0,
    x2: 5,
    z2: 0,
    height: 3,
    thickness: 0.2,
    color: '#ffffff',
    openings: [],
  };

  const result = decomposeWall(wall);
  assert.equal(result.length, 5);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].kind, 'pier');
  assert.equal(result.segments[0].uLength, 5);
  assert.equal(result.segments[0].yHeight, 3);
});

test('decomposeWall creates piers, lintels, and sills accurately for door and window', () => {
  const wall: BlueprintWall = {
    id: 'facade',
    x1: 0,
    z1: 0,
    x2: 10,
    z2: 0,
    height: 3,
    thickness: 0.24,
    color: '#ece8e0',
    openings: [
      { type: 'window', offset: 6, width: 2, height: 1.4, sillHeight: 0.8 },
      { type: 'door', offset: 1, width: 1.2, height: 2.2, sillHeight: 0 },
    ],
  };

  const result = decomposeWall(wall);
  // Openings should be sorted by offset
  assert.equal(result.openings[0].type, 'door');
  assert.equal(result.openings[1].type, 'window');

  const piers = result.segments.filter((s) => s.kind === 'pier');
  const lintels = result.segments.filter((s) => s.kind === 'lintel');
  const sills = result.segments.filter((s) => s.kind === 'sill');

  assert.equal(piers.length, 3);
  assert.equal(lintels.length, 2);
  assert.equal(sills.length, 1);

  // Total horizontal coverage of piers + openings must equal wall length
  const totalWidth =
    piers.reduce((sum, p) => sum + p.uLength, 0) +
    result.openings.reduce((sum, o) => sum + o.width, 0);
  assert.ok(Math.abs(totalWidth - 10) < 1e-6);

  // Window sill + height + lintel must equal wall height
  const winLintel = lintels[1];
  const winSill = sills[0];
  assert.ok(Math.abs(winSill.yHeight + 1.4 + winLintel.yHeight - 3) < 1e-6);
});
