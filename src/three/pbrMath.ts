/**
 * Pure deterministic PBR texture synthesis math (zero DOM / Three.js dependencies)
 * so procedural heightfield -> tangent-space normalMap and roughnessMap calculations
 * can be unit-tested in Node and shared across every architectural material.
 */

export function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Converts a tileable normalized heightfield [0..1] (size x size) into RGBA bytes
 * for an OpenGL-convention tangent-space normal map (+X right, +Y up, +Z out)
 * using a wrapped 3x3 Sobel filter.
 */
export function heightfieldToNormalBytes(
  height: Float32Array,
  size: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const mask = size - 1;
  const isPow2 = (size & mask) === 0;

  const sample = (x: number, y: number): number => {
    const wx = isPow2 ? x & mask : ((x % size) + size) % size;
    const wy = isPow2 ? y & mask : ((y % size) + size) % size;
    return height[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      // Sobel gradients
      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // Tangent-space normal (+Z pointing out of surface)
      let nx = -dX * strength;
      let ny = dY * strength;
      let nz = 1.0;

      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      out[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  return out;
}

/**
 * Packs a normalized roughness field [0..1] (size x size) into grayscale RGBA bytes.
 * Three.js reads the Green channel of roughnessMap and multiplies it by material.roughness.
 */
export function roughnessFieldToBytes(
  roughness: Float32Array,
  size: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const val = Math.round(clamp01(roughness[i]) * 255);
    const idx = i * 4;
    out[idx] = val;
    out[idx + 1] = val;
    out[idx + 2] = val;
    out[idx + 3] = 255;
  }
  return out;
}
