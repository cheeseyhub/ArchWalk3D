import * as THREE from 'three';
import type { FloorMaterialType } from '../arch/types';

export interface ProceduralTextureSet {
  woodMap: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  tileMap: THREE.CanvasTexture;
  tileBump: THREE.CanvasTexture;
  carpetMap: THREE.CanvasTexture;
  carpetBump: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  plasterBump: THREE.CanvasTexture;
  roofBump: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  groundGrid: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
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

// Deterministic pseudo-random helper so procedural textures never flicker
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function buildWoodTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const [cColor, ctxC] = makeCanvas(size);
  const [cBump, ctxB] = makeCanvas(size);

  ctxC.fillStyle = '#d9d4cd';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#b0b0b0';
  ctxB.fillRect(0, 0, size, size);

  const plankRows = 8;
  const plankH = size / plankRows;

  for (let row = 0; row < plankRows; row++) {
    const y = row * plankH;
    const stagger = ((row * 173) % size);
    const tone = 212 + Math.floor((hash2(row, 1.3) - 0.5) * 32);
    ctxC.fillStyle = `rgb(${tone}, ${tone - 5}, ${tone - 12})`;
    ctxC.fillRect(0, y, size, plankH);

    // Subtle longitudinal grain fibers
    for (let g = 0; g < 18; g++) {
      const gy = y + hash2(row, g + 7) * plankH;
      const alpha = 0.04 + hash2(g, row) * 0.07;
      ctxC.fillStyle = g % 2 === 0 ? `rgba(80,55,35,${alpha})` : `rgba(255,250,242,${alpha})`;
      ctxC.fillRect(0, gy, size, 1.5);
      ctxB.fillStyle = `rgba(125,125,125,${alpha * 1.4})`;
      ctxB.fillRect(0, gy, size, 1.5);
    }

    // Horizontal plank seam
    ctxC.fillStyle = 'rgba(42, 30, 18, 0.42)';
    ctxC.fillRect(0, y, size, 2);
    ctxB.fillStyle = '#383838';
    ctxB.fillRect(0, y, size, 2);

    // Staggered vertical plank end joint
    ctxC.fillStyle = 'rgba(42, 30, 18, 0.35)';
    ctxC.fillRect(stagger, y, 2, plankH);
    ctxB.fillStyle = '#404040';
    ctxB.fillRect(stagger, y, 2, plankH);
  }

  return [
    configureTexture(cColor, true, maxAniso),
    configureTexture(cBump, false, maxAniso),
  ];
}

function buildTileTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const [cColor, ctxC] = makeCanvas(size);
  const [cBump, ctxB] = makeCanvas(size);

  // Grout background
  ctxC.fillStyle = '#9b9892';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#3a3a3a';
  ctxB.fillRect(0, 0, size, size);

  const cells = 4;
  const step = size / cells;
  const grout = 5;

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const shade = 232 + Math.floor((hash2(r * 7, c * 11) - 0.5) * 14);
      ctxC.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 4})`;
      ctxC.fillRect(c * step + grout / 2, r * step + grout / 2, step - grout, step - grout);

      ctxB.fillStyle = '#d4d4d4';
      ctxB.fillRect(c * step + grout / 2, r * step + grout / 2, step - grout, step - grout);

      // Subtle mineral speckles
      for (let s = 0; s < 32; s++) {
        const sx = c * step + grout + hash2(r * 31 + s, c * 13) * (step - grout * 2);
        const sy = r * step + grout + hash2(c * 29 + s, r * 17) * (step - grout * 2);
        ctxC.fillStyle = 'rgba(120,115,105,0.08)';
        ctxC.fillRect(sx, sy, 3, 2);
      }
    }
  }

  return [
    configureTexture(cColor, true, maxAniso),
    configureTexture(cBump, false, maxAniso),
  ];
}

function buildCarpetTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 256;
  const [cColor, ctxC] = makeCanvas(size);
  const [cBump, ctxB] = makeCanvas(size);

  ctxC.fillStyle = '#dad6d0';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#909090';
  ctxB.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const v = hash2(x * 0.37, y * 0.41);
      const lum = 205 + Math.floor(v * 34);
      ctxC.fillStyle = `rgb(${lum},${lum - 1},${lum - 2})`;
      ctxC.fillRect(x, y, 3, 3);
      const b = 100 + Math.floor(v * 95);
      ctxB.fillStyle = `rgb(${b},${b},${b})`;
      ctxB.fillRect(x, y, 3, 3);
    }
  }

  return [
    configureTexture(cColor, true, maxAniso),
    configureTexture(cBump, false, maxAniso),
  ];
}

function buildConcreteTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 256;
  const [cColor, ctxC] = makeCanvas(size);
  const [cBump, ctxB] = makeCanvas(size);

  ctxC.fillStyle = '#c8cacd';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#9a9a9a';
  ctxB.fillRect(0, 0, size, size);

  for (let i = 0; i < 140; i++) {
    const x = hash2(i, 2.1) * size;
    const y = hash2(3.7, i) * size;
    const rad = 12 + hash2(i, 9.1) * 32;
    const light = i % 2 === 0;
    ctxC.fillStyle = light ? 'rgba(245,246,248,0.08)' : 'rgba(90,94,100,0.08)';
    ctxC.beginPath();
    ctxC.arc(x, y, rad, 0, Math.PI * 2);
    ctxC.fill();

    ctxB.fillStyle = light ? 'rgba(200,200,200,0.12)' : 'rgba(80,80,80,0.12)';
    ctxB.beginPath();
    ctxB.arc(x, y, rad * 0.7, 0, Math.PI * 2);
    ctxB.fill();
  }

  return [
    configureTexture(cColor, true, maxAniso),
    configureTexture(cBump, false, maxAniso),
  ];
}

function buildPlasterBump(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    for (let x = 0; x < size; x += 3) {
      const v = 112 + Math.floor(hash2(x * 0.7, y * 0.9) * 32);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 3, 3);
    }
  }
  return configureTexture(canvas, false, maxAniso);
}

function buildRoofBump(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = '#7c7c7c';
  ctx.fillRect(0, 0, size, size);
  // Architectural standing-seam ribs
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = '#dfdfdf';
    ctx.fillRect(x, 0, 4, size);
    ctx.fillStyle = '#484848';
    ctx.fillRect(x + 4, 0, 2, size);
  }
  return configureTexture(canvas, false, maxAniso);
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

export function createProceduralTextureSet(maxAnisotropy: number): ProceduralTextureSet {
  const [woodMap, woodBump] = buildWoodTextures(maxAnisotropy);
  const [tileMap, tileBump] = buildTileTextures(maxAnisotropy);
  const [carpetMap, carpetBump] = buildCarpetTextures(maxAnisotropy);
  const [concreteMap, concreteBump] = buildConcreteTextures(maxAnisotropy);
  const plasterBump = buildPlasterBump(maxAnisotropy);
  const roofBump = buildRoofBump(maxAnisotropy);
  const contactShadow = buildContactShadow();
  const groundGrid = buildGroundGrid(maxAnisotropy);

  const all = [
    woodMap,
    woodBump,
    tileMap,
    tileBump,
    carpetMap,
    carpetBump,
    concreteMap,
    concreteBump,
    plasterBump,
    roofBump,
    contactShadow,
    groundGrid,
  ];

  return {
    woodMap,
    woodBump,
    tileMap,
    tileBump,
    carpetMap,
    carpetBump,
    concreteMap,
    concreteBump,
    plasterBump,
    roofBump,
    contactShadow,
    groundGrid,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}

export function createFloorMaterial(
  materialType: FloorMaterialType,
  floorColor: string,
  width: number,
  depth: number,
  textures: ProceduralTextureSet,
): THREE.MeshStandardMaterial {
  let baseMap: THREE.CanvasTexture;
  let baseBump: THREE.CanvasTexture;
  let roughness = 0.72;
  let bumpScale = 0.015;
  let tileScale = 2.0;

  switch (materialType) {
    case 'wood':
      baseMap = textures.woodMap;
      baseBump = textures.woodBump;
      roughness = 0.48;
      bumpScale = 0.012;
      tileScale = 2.4;
      break;
    case 'tile':
      baseMap = textures.tileMap;
      baseBump = textures.tileBump;
      roughness = 0.34;
      bumpScale = 0.016;
      tileScale = 1.8;
      break;
    case 'carpet':
      baseMap = textures.carpetMap;
      baseBump = textures.carpetBump;
      roughness = 0.92;
      bumpScale = 0.022;
      tileScale = 1.4;
      break;
    case 'concrete':
    default:
      baseMap = textures.concreteMap;
      baseBump = textures.concreteBump;
      roughness = 0.76;
      bumpScale = 0.014;
      tileScale = 2.5;
      break;
  }

  const mapClone = baseMap.clone();
  mapClone.needsUpdate = true;
  mapClone.repeat.set(Math.max(1, width / tileScale), Math.max(1, depth / tileScale));

  const bumpClone = baseBump.clone();
  bumpClone.needsUpdate = true;
  bumpClone.repeat.set(Math.max(1, width / tileScale), Math.max(1, depth / tileScale));

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(floorColor),
    map: mapClone,
    bumpMap: bumpClone,
    bumpScale,
    roughness,
    metalness: 0.03,
  });
}
