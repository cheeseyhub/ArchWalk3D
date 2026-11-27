import assert from 'node:assert/strict';
import test from 'node:test';
import { heightfieldToNormalBytes, roughnessFieldToBytes } from './pbrMath';

test('heightfieldToNormalBytes encodes a flat surface as neutral tangent normal (128, 128, 255)', () => {
  const size = 8;
  const flat = new Float32Array(size * size).fill(0.5);
  const bytes = heightfieldToNormalBytes(flat, size, 2.0);

  assert.equal(bytes.length, size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    assert.equal(bytes[idx], 128);
    assert.equal(bytes[idx + 1], 128);
    assert.equal(bytes[idx + 2], 255);
    assert.equal(bytes[idx + 3], 255);
  }
});

test('heightfieldToNormalBytes produces tilted unit normals across a recessed grout groove', () => {
  const size = 16;
  const field = new Float32Array(size * size).fill(0.85);
  // Carve a vertical recessed groove at x = 8
  for (let y = 0; y < size; y++) {
    field[y * size + 8] = 0.1;
  }

  const bytes = heightfieldToNormalBytes(field, size, 2.5);
  // Pixel just left of the groove (x = 7) slopes downward to the right (+X normal > 128)
  const leftIdx = (4 * size + 7) * 4;
  // Pixel just right of the groove (x = 9) slopes downward to the left (-X normal < 128)
  const rightIdx = (4 * size + 9) * 4;

  assert.ok(bytes[leftIdx] > 170, `Expected left edge normal X > 170, got ${bytes[leftIdx]}`);
  assert.ok(bytes[rightIdx] < 85, `Expected right edge normal X < 85, got ${bytes[rightIdx]}`);
  assert.ok(bytes[leftIdx + 2] > 128, 'Z component must remain positive outward');
});

test('roughnessFieldToBytes clamps values to [0, 255] grayscale RGBA', () => {
  const field = new Float32Array([-0.2, 0.25, 0.9, 1.4]);
  const bytes = roughnessFieldToBytes(field, 2);

  assert.equal(bytes[0], 0);
  assert.equal(bytes[4], 64);
  assert.equal(bytes[8], Math.round(new Float32Array([0.9])[0] * 255));
  assert.equal(bytes[12], 255);
  // Green channel (used by Three.js roughnessMap) matches Red channel
  assert.equal(bytes[9], bytes[8]);
  assert.equal(bytes[11], 255);
});
