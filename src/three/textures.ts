import * as THREE from 'three';
import type { FloorMaterialType } from '../arch/types';
import { clamp01, hash2, heightfieldToNormalBytes, roughnessFieldToBytes } from './pbrMath';

export const MAX_PROCEDURAL_TEXTURE_SIZE = 512;

export type CachedPbrKey = 'wood' | 'tile' | 'carpet' | 'concrete' | 'plaster' | 'roof';

export interface PbrMaterialMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface ProceduralTextureSet {
  wood: PbrMaterialMaps;
  tile: PbrMaterialMaps;
  carpet: PbrMaterialMaps;
  concrete: PbrMaterialMaps;
  plaster: PbrMaterialMaps;
  roof: PbrMaterialMaps;
  contactShadow: THREE.CanvasTexture;
  groundGrid: THREE.CanvasTexture;
  allSharedTextures: Set<THREE.Texture>;
  getCachedPbrMaps: (
    kind: CachedPbrKey,
    repeatX: number,
    repeatY: number,
  ) => PbrMaterialMaps;
  getCachedGroundGrid: (repeat: number) => THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const clamped = Math.min(MAX_PROCEDURAL_TEXTURE_SIZE, Math.max(32, size));
  const canvas = document.createElement('canvas');
  canvas.width = clamped;
  canvas.height = clamped;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function bytesToCanvas(bytes: Uint8ClampedArray, size: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  imgData.data.set(bytes);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeat = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

function finalizePbrMaps(
  albedoCanvas: HTMLCanvasElement,
  heightField: Float32Array,
  roughnessField: Float32Array,
  size: number,
  normalStrength: number,
  maxAniso: number,
): PbrMaterialMaps {
  const normalBytes = heightfieldToNormalBytes(heightField, size, normalStrength);
  const roughBytes = roughnessFieldToBytes(roughnessField, size);

  const normalCanvas = bytesToCanvas(normalBytes, size);
  const roughCanvas = bytesToCanvas(roughBytes, size);

  return {
    map: configureTexture(albedoCanvas, true, maxAniso),
    normalMap: configureTexture(normalCanvas, false, maxAniso),
    roughnessMap: configureTexture(roughCanvas, false, maxAniso),
  };
}

/**
 * Synchronized architectural oak wood planks:
 * - Albedo: warm neutral wood value variation + cathedral grain fibers + recessed plank seams
 * - NormalMap: beveled plank grooves + directional wood pore fibers
 * - RoughnessMap: satin oiled wood planks (0.36-0.48) vs matte recessed seams (0.86)
 */
function buildWoodPbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  const plankRows = 8;
  const plankH = size / plankRows;

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / plankH);
    const localY = y - row * plankH;
    const stagger = (row * 97 + 41) % size;
    const rowSeed = hash2(row * 3.1, 7.7);

    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;

      // Distance from horizontal plank groove and staggered vertical butt joint
      const distHoriz = Math.min(localY, plankH - 1 - localY);
      const sx = (x - stagger + size) % size;
      const distVert = Math.min(sx, size - 1 - sx);
      const isHorizSeam = distHoriz <= 1;
      const isVertSeam = distVert <= 1;
      const isBevel = !isHorizSeam && !isVertSeam && (distHoriz === 2 || distVert === 2);

      // Determine plank sub-index so left/right of butt joint have distinct tone
      const plankCol = x >= stagger ? 1 : 0;
      const plankTone = 212 + (hash2(row * 5 + plankCol, 2.3) - 0.5) * 30;

      // Flowing longitudinal wood grain + subtle cathedral ring modulation
      const wave = Math.sin((y + rowSeed * 30) * 0.24 + Math.sin(x * 0.032 + row) * 2.2);
      const fineFiber = Math.sin(y * 1.45 + x * 0.04 + row * 11) * 0.5 + 0.5;
      const microNoise = hash2(x * 0.45 + row * 13, y * 0.85) - 0.5;

      let lum = plankTone + wave * 9 + (fineFiber - 0.5) * 10 + microNoise * 6;
      let h = 0.72 + wave * 0.06 + (fineFiber - 0.5) * 0.08 + microNoise * 0.03;
      let r = 0.41 + (1 - fineFiber) * 0.08 + Math.abs(wave) * 0.03;

      if (isHorizSeam || isVertSeam) {
        lum *= 0.42;
        h = 0.14;
        r = 0.88;
      } else if (isBevel) {
        lum *= 0.82;
        h = 0.48;
        r = 0.64;
      }

      const c = Math.max(0, Math.min(255, Math.round(lum)));
      data[pIdx] = c;
      data[pIdx + 1] = Math.max(0, Math.round(c * 0.975));
      data[pIdx + 2] = Math.max(0, Math.round(c * 0.94));
      data[pIdx + 3] = 255;

      height[idx] = clamp01(h);
      roughness[idx] = clamp01(r);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 2.4, maxAniso);
}

/**
 * Synchronized architectural honed porcelain tile:
 * - Albedo: subtle tile-to-tile mineral variation + recessed cement grout grid
 * - NormalMap: beveled tile edges dropping sharply into sandy grout channels
 * - RoughnessMap: honed satin ceramic face (0.24-0.34) vs matte porous grout (0.90)
 */
function buildTilePbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  const cells = 4;
  const step = size / cells;
  const groutHalf = 2;

  for (let y = 0; y < size; y++) {
    const rCell = Math.floor(y / step);
    const ly = y - rCell * step;

    for (let x = 0; x < size; x++) {
      const cCell = Math.floor(x / step);
      const lx = x - cCell * step;
      const idx = y * size + x;
      const pIdx = idx * 4;

      const edgeDist = Math.min(lx, step - 1 - lx, ly, step - 1 - ly);
      const isGrout = edgeDist < groutHalf;
      const isChamfer = edgeDist === groutHalf;

      const tileShade = 232 + (hash2(rCell * 7.3, cCell * 11.7) - 0.5) * 14;
      const vein = Math.sin((x * 0.07 + y * 0.05) + hash2(rCell, cCell) * 6.28) * 4.5;
      const speckle = (hash2(x * 0.73, y * 0.89) - 0.5) * 9;

      let lum: number;
      let h: number;
      let rough: number;

      if (isGrout) {
        const groutGrain = (hash2(x * 1.9, y * 1.7) - 0.5) * 14;
        lum = 152 + groutGrain;
        h = 0.16 + groutGrain * 0.005;
        rough = 0.91;
      } else if (isChamfer) {
        lum = tileShade * 0.92;
        h = 0.62;
        rough = 0.44;
      } else {
        lum = tileShade + vein + speckle;
        h = 0.88 + (vein * 0.004) + (speckle * 0.003);
        rough = 0.27 + Math.abs(speckle) * 0.008;
      }

      const c = Math.max(0, Math.min(255, Math.round(lum)));
      data[pIdx] = c;
      data[pIdx + 1] = Math.max(0, Math.round(c * 0.99));
      data[pIdx + 2] = Math.max(0, Math.round(c * 0.975));
      data[pIdx + 3] = 255;

      height[idx] = clamp01(h);
      roughness[idx] = clamp01(rough);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 2.8, maxAniso);
}

/**
 * Synchronized architectural woven wool carpet:
 * - Albedo: soft woven loop weave with organic micro-tuft tonal depth
 * - NormalMap: crisp isotropic woven loop texture
 * - RoughnessMap: uniformly plush matte fiber roughness (0.86-0.96)
 */
function buildCarpetPbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;

      const weaveX = Math.sin(x * 1.5708); // 4px loop cycle
      const weaveY = Math.sin(y * 1.5708 + ((x >> 2) % 2) * Math.PI);
      const weave = (weaveX * weaveY) * 0.5 + 0.5;
      const tuftNoise = hash2(Math.floor(x / 2) * 0.61, Math.floor(y / 2) * 0.73);
      const fine = hash2(x * 1.13, y * 1.29);

      const h = clamp01(0.28 + weave * 0.34 + tuftNoise * 0.28 + fine * 0.1);
      const lum = Math.round(196 + h * 46);
      const rough = clamp01(0.86 + (1 - h) * 0.1);

      data[pIdx] = lum;
      data[pIdx + 1] = Math.max(0, lum - 1);
      data[pIdx + 2] = Math.max(0, lum - 3);
      data[pIdx + 3] = 255;

      height[idx] = h;
      roughness[idx] = rough;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 2.2, maxAniso);
}

/**
 * Synchronized troweled architectural micro-cement / concrete:
 * - Albedo: soft troweled cloud mottling + fine mineral aggregate
 * - NormalMap: subtle trowel undulations + recessed micro-pores
 * - RoughnessMap: variegated burnished vs porous cement sheen (0.58-0.84)
 */
function buildConcretePbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  const tau = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const ny = (y / size) * tau;
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * tau;
      const idx = y * size + x;
      const pIdx = idx * 4;

      // Tileable low-frequency trowel clouds
      const cloud1 = Math.sin(nx * 2 + Math.cos(ny * 2) * 1.3) * Math.cos(ny * 2 - Math.sin(nx) * 0.9);
      const cloud2 = Math.sin(nx * 4 - ny * 3 + 1.2) * 0.5;
      const aggregate = hash2(x * 0.87, y * 0.93) - 0.5;
      const pore = hash2(x * 2.13, y * 1.97) > 0.965 ? -0.25 : 0;

      const h = clamp01(0.56 + cloud1 * 0.14 + cloud2 * 0.08 + aggregate * 0.12 + pore);
      const lum = Math.max(0, Math.min(255, Math.round(198 + cloud1 * 18 + cloud2 * 10 + aggregate * 14 + pore * 42)));
      // Burnished smooth patches vs matte porous patches
      const rough = clamp01(0.68 - cloud1 * 0.1 + (pore < 0 ? 0.18 : 0) + Math.abs(aggregate) * 0.12);

      data[pIdx] = lum;
      data[pIdx + 1] = lum;
      data[pIdx + 2] = Math.min(255, lum + 2);
      data[pIdx + 3] = 255;

      height[idx] = h;
      roughness[idx] = rough;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 1.9, maxAniso);
}

/**
 * Synchronized architectural wall plaster (Venetian / matte limewash):
 * - Albedo: bright neutral modulation (232-252) so multiplying by wall.color preserves exact hue
 * - NormalMap: subtle organic plaster trowel grain
 * - RoughnessMap: authentic matte wall finish with slight burnished lime variation (0.78-0.91)
 */
function buildPlasterPbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  const tau = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const ny = (y / size) * tau;
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * tau;
      const idx = y * size + x;
      const pIdx = idx * 4;

      const trowel = Math.sin(nx * 2 + ny) * Math.cos(ny * 2 - nx * 0.5);
      const micro = hash2(x * 0.71, y * 0.83) - 0.5;
      const fine = hash2(x * 1.91, y * 1.63) - 0.5;

      const h = clamp01(0.54 + trowel * 0.12 + micro * 0.18 + fine * 0.1);
      // Keep albedo near white so wall hex tint stays faithful
      const lum = Math.max(226, Math.min(255, Math.round(244 + trowel * 5 + micro * 7)));
      const rough = clamp01(0.84 - trowel * 0.05 + Math.abs(micro) * 0.08);

      data[pIdx] = lum;
      data[pIdx + 1] = lum;
      data[pIdx + 2] = Math.max(222, lum - 1);
      data[pIdx + 3] = 255;

      height[idx] = h;
      roughness[idx] = rough;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 1.35, maxAniso);
}

/**
 * Synchronized architectural standing-seam metal/slate roof panels.
 */
function buildRoofPbr(maxAniso: number): PbrMaterialMaps {
  const size = 256;
  const [albedoCanvas, ctx] = makeCanvas(size);
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  const height = new Float32Array(size * size);
  const roughness = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;
      const seamX = x % 32;
      const isRib = seamX >= 0 && seamX <= 3;
      const isShadow = seamX === 4 || seamX === 5;
      const micro = (hash2(x * 0.5, y * 0.5) - 0.5) * 10;

      let lum = 228 + micro;
      let h = 0.42 + micro * 0.004;
      let rough = 0.48 + Math.abs(micro) * 0.008;

      if (isRib) {
        lum = 248;
        h = 0.92;
        rough = 0.36;
      } else if (isShadow) {
        lum = 172;
        h = 0.22;
        rough = 0.68;
      }

      const c = Math.max(0, Math.min(255, Math.round(lum)));
      data[pIdx] = c;
      data[pIdx + 1] = c;
      data[pIdx + 2] = c;
      data[pIdx + 3] = 255;

      height[idx] = clamp01(h);
      roughness[idx] = clamp01(rough);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return finalizePbrMaps(albedoCanvas, height, roughness, size, 2.6, maxAniso);
}

function buildContactShadow(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(8, 10, 14, 0.52)');
  grad.addColorStop(0.65, 'rgba(8, 10, 14, 0.22)');
  grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return configureTexture(canvas, true, 1, false);
}

function buildGroundGrid(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(0, 0, size, size);

  // Subtle architectural site grid (1m minor, 4m major)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  const step = size / 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(217, 155, 78, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);

  return configureTexture(canvas, true, maxAniso);
}

export function quantizeTextureRepeat(value: number): number {
  const clamped = Math.max(0.5, Number.isFinite(value) ? value : 1);
  return Math.round(clamped * 2) / 2;
}

function clonePbrMaps(
  base: PbrMaterialMaps,
  repeatX: number,
  repeatY: number,
): PbrMaterialMaps {
  const rx = quantizeTextureRepeat(repeatX);
  const ry = quantizeTextureRepeat(repeatY);

  const map = base.map.clone();
  map.needsUpdate = true;
  map.repeat.set(rx, ry);

  const normalMap = base.normalMap.clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(rx, ry);

  const roughnessMap = base.roughnessMap.clone();
  roughnessMap.needsUpdate = true;
  roughnessMap.repeat.set(rx, ry);

  return { map, normalMap, roughnessMap };
}

export function createProceduralTextureSet(maxAnisotropy: number): ProceduralTextureSet {
  const wood = buildWoodPbr(maxAnisotropy);
  const tile = buildTilePbr(maxAnisotropy);
  const carpet = buildCarpetPbr(maxAnisotropy);
  const concrete = buildConcretePbr(maxAnisotropy);
  const plaster = buildPlasterPbr(maxAnisotropy);
  const roof = buildRoofPbr(maxAnisotropy);
  const contactShadow = buildContactShadow();
  const groundGrid = buildGroundGrid(maxAnisotropy);

  const baseByKey: Record<CachedPbrKey, PbrMaterialMaps> = {
    wood,
    tile,
    carpet,
    concrete,
    plaster,
    roof,
  };

  const allSharedTextures = new Set<THREE.Texture>([
    wood.map,
    wood.normalMap,
    wood.roughnessMap,
    tile.map,
    tile.normalMap,
    tile.roughnessMap,
    carpet.map,
    carpet.normalMap,
    carpet.roughnessMap,
    concrete.map,
    concrete.normalMap,
    concrete.roughnessMap,
    plaster.map,
    plaster.normalMap,
    plaster.roughnessMap,
    roof.map,
    roof.normalMap,
    roof.roughnessMap,
    contactShadow,
    groundGrid,
  ]);

  const tiledCache = new Map<string, PbrMaterialMaps>();
  const groundGridCache = new Map<number, THREE.CanvasTexture>();

  const getCachedPbrMaps = (
    kind: CachedPbrKey,
    repeatX: number,
    repeatY: number,
  ): PbrMaterialMaps => {
    const rx = quantizeTextureRepeat(repeatX);
    const ry = quantizeTextureRepeat(repeatY);
    const cacheKey = `${kind}:${rx}x${ry}`;
    const existing = tiledCache.get(cacheKey);
    if (existing) return existing;

    const cloned = clonePbrMaps(baseByKey[kind], rx, ry);
    tiledCache.set(cacheKey, cloned);
    allSharedTextures.add(cloned.map);
    allSharedTextures.add(cloned.normalMap);
    allSharedTextures.add(cloned.roughnessMap);
    return cloned;
  };

  const getCachedGroundGrid = (repeat: number): THREE.CanvasTexture => {
    const q = Math.max(4, Math.round(repeat));
    const existing = groundGridCache.get(q);
    if (existing) return existing;

    const tex = groundGrid.clone();
    tex.needsUpdate = true;
    tex.repeat.set(q, q);
    groundGridCache.set(q, tex);
    allSharedTextures.add(tex);
    return tex;
  };

  return {
    wood,
    tile,
    carpet,
    concrete,
    plaster,
    roof,
    contactShadow,
    groundGrid,
    allSharedTextures,
    getCachedPbrMaps,
    getCachedGroundGrid,
    dispose: () => {
      for (const tex of allSharedTextures) {
        tex.dispose();
      }
      allSharedTextures.clear();
      tiledCache.clear();
      groundGridCache.clear();
    },
  };
}

export function createFloorMaterial(
  materialType: FloorMaterialType,
  floorColor: string,
  width: number,
  depth: number,
  textures: ProceduralTextureSet,
  materialCache?: Map<string, THREE.MeshStandardMaterial>,
): THREE.MeshStandardMaterial {
  let kind: CachedPbrKey;
  let normalStrength = 0.55;
  let tileScale = 2.0;

  switch (materialType) {
    case 'wood':
      kind = 'wood';
      normalStrength = 0.52;
      tileScale = 2.2;
      break;
    case 'tile':
      kind = 'tile';
      normalStrength = 0.65;
      tileScale = 1.8;
      break;
    case 'carpet':
      kind = 'carpet';
      normalStrength = 0.72;
      tileScale = 1.4;
      break;
    case 'concrete':
    default:
      kind = 'concrete';
      normalStrength = 0.48;
      tileScale = 2.4;
      break;
  }

  const rx = quantizeTextureRepeat(Math.max(1, width / tileScale));
  const ry = quantizeTextureRepeat(Math.max(1, depth / tileScale));
  const matKey = `floor:${kind}:${floorColor.toLowerCase()}:${rx}x${ry}`;
  const cachedMat = materialCache?.get(matKey);
  if (cachedMat) return cachedMat;

  const maps = textures.getCachedPbrMaps(kind, rx, ry);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(floorColor),
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: maps.roughnessMap,
    // roughness = 1.0 lets the synchronized roughnessMap drive the exact calibrated PBR range
    roughness: 1.0,
    metalness: 0.03,
  });
  materialCache?.set(matKey, mat);
  return mat;
}

export function createWallPlasterMaterial(
  wallColor: string,
  wallLength: number,
  wallHeight: number,
  textures: ProceduralTextureSet,
  materialCache?: Map<string, THREE.MeshStandardMaterial>,
): THREE.MeshStandardMaterial {
  const tileMeters = 2.4;
  const rx = quantizeTextureRepeat(Math.max(1, wallLength / tileMeters));
  const ry = quantizeTextureRepeat(Math.max(1, wallHeight / tileMeters));
  const matKey = `wall:${wallColor.toLowerCase()}:${rx}x${ry}`;
  const cachedMat = materialCache?.get(matKey);
  if (cachedMat) return cachedMat;

  const maps = textures.getCachedPbrMaps('plaster', rx, ry);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(wallColor),
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughnessMap: maps.roughnessMap,
    roughness: 1.0,
    metalness: 0.02,
  });
  materialCache?.set(matKey, mat);
  return mat;
}
