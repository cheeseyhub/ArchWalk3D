import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBlueprintStreamProgress } from './streamProgress';

test('returns zeroed progress on empty or whitespace buffer', () => {
  const empty = parseBlueprintStreamProgress('');
  assert.equal(empty.detectedName, null);
  assert.equal(empty.roofStyle, null);
  assert.equal(empty.roomsCount, 0);
  assert.deepEqual(empty.roomNames, []);
  assert.equal(empty.wallsCount, 0);
  assert.equal(empty.furnitureCount, 0);
  assert.equal(empty.charsReceived, 0);
});

test('extracts partial building name and roof style mid-stream', () => {
  const partial = `{
    "name": "Nordic Courtyard Villa",
    "roof": { "style": "gabled", "color": "#444b57"`;
  const progress = parseBlueprintStreamProgress(partial);
  assert.equal(progress.detectedName, 'Nordic Courtyard Villa');
  assert.equal(progress.roofStyle, 'gabled');
  assert.equal(progress.roomsCount, 0);
});

test('counts rooms, room names, walls, and furniture accurately without confusing room name with top-level name', () => {
  const partial = `{
    "rooms": [
      { "id": "r1", "name": "Living Room", "x": 0, "z": 0 },
      { "id": "r2", "name": "Kitchen", "x": 4, "z": 0 }
    ],
    "walls": [
      { "id": "w1", "openings": [ { "type": "door", "offset": 1.2 }, { "type": "window", "offset": 3.0 } ] },
      { "id": "w2", "openings": [] },
      { "id": "w3", "openings": [ { "type": "window" } ] }
    ],
    "furniture": [
      { "type": "sofa", "x": 0 },
      { "type": "table", "x": 2 }
    ],
    "name": "Cedar Studio House",
    "roof": { "style": "flat", "color": "#3a404a", "overhang": 0.4 }
  }`;

  const progress = parseBlueprintStreamProgress(partial);
  assert.equal(progress.detectedName, 'Cedar Studio House');
  assert.equal(progress.roofStyle, 'flat');
  assert.equal(progress.roomsCount, 2);
  assert.deepEqual(progress.roomNames, ['Living Room', 'Kitchen']);
  // Nested opening objects inside walls must NOT inflate wallsCount
  assert.equal(progress.wallsCount, 3);
  assert.equal(progress.furnitureCount, 2);
});

test('handles truncated string escapes cleanly without throwing', () => {
  const truncated = `{"name":"Modern \\"Glass\\" House","rooms":[{"id":"r1","name":"Atrium`;
  const progress = parseBlueprintStreamProgress(truncated);
  assert.equal(progress.detectedName, 'Modern "Glass" House');
  assert.equal(progress.roomsCount, 1);
  assert.deepEqual(progress.roomNames, []);
});
