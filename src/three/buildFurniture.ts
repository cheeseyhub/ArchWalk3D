import * as THREE from 'three';
import { getFurnitureDisplayLabel } from '../arch/blueprintHistory';
import type {
  BlueprintFurniture,
  FurnitureInteractionKind,
  FurnitureMaterialKind,
  FurniturePartSpec,
  GeneratedFurnitureAsset,
} from '../arch/types';
import type { ProceduralTextureSet } from './textures';

export interface InteractiveDoorPivot {
  pivot: THREE.Group;
  closedY: number;
  openY: number;
}

export interface InteractiveFurnitureController {
  key: string;
  kind: FurnitureInteractionKind;
  isActive: boolean;
  setActive: (active: boolean) => void;
  doorPivots?: InteractiveDoorPivot[];
}

export function getFurnitureStableKey(
  item: Pick<BlueprintFurniture, 'id' | 'type'>,
  index: number,
): string {
  return item.id && item.id.trim().length > 0 ? item.id : `${item.type}-${index}`;
}

/**
 * Mutates a furniture group's floor position and Y rotation in-place without rebuilding geometry.
 */
export function applyFurnitureTransformInPlace(
  group: THREE.Group,
  x: number,
  z: number,
  rotationY: number,
): void {
  group.position.set(x, 0.01, z);
  group.rotation.y = rotationY;
}

/**
 * Live-scales a furniture group relative to its built base dimensions during slider drag (60 FPS).
 */
export function applyFurniturePreviewScale(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
): void {
  const base = group.userData.baseDimensions as
    | { width: number; depth: number; height: number }
    | undefined;
  if (!base) return;
  const sx = Math.max(0.15, width / Math.max(0.05, base.width));
  const sy = Math.max(0.15, height / Math.max(0.015, base.height));
  const sz = Math.max(0.15, depth / Math.max(0.05, base.depth));
  group.scale.set(sx, sy, sz);
}

/**
 * Mutates a procedural furniture group's color-bound materials in-place without rebuilding geometry.
 * Returns true if in-place recoloring succeeded, or false if the group needs a rebuild (e.g. customParts).
 */
export function applyFurnitureColorInPlace(group: THREE.Group, hexColor: string): boolean {
  const updater = group.userData.applyColorInPlace as ((hex: string) => void) | undefined;
  if (!updater) return false;
  updater(hexColor);
  return true;
}

/**
 * Builds a crisp architectural brass selection ring around a furniture footprint
 * for Arrange Mode. Marked excludeFromExport so it never leaks into GLTF exports.
 */
export function buildSelectionRing(width: number, depth: number): THREE.Group {
  const ring = new THREE.Group();
  ring.name = 'arrange-selection-ring';
  ring.userData.excludeFromExport = true;

  const w = Math.max(0.42, width + 0.24);
  const d = Math.max(0.42, depth + 0.24);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      color: '#d99b4e',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.012;
  ring.add(pad);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.028, d)),
    new THREE.LineBasicMaterial({
      color: '#d99b4e',
      transparent: true,
      opacity: 0.98,
    }),
  );
  outline.position.y = 0.022;
  ring.add(outline);

  // Subtle corner brass L-markers for crisp architectural selection readability
  const cornerMat = new THREE.MeshBasicMaterial({
    color: '#d99b4e',
    transparent: true,
    opacity: 0.96,
  });
  const armLen = Math.min(0.24, Math.min(w, d) * 0.28);
  const armThick = 0.04;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const barX = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.012, armThick), cornerMat);
      barX.position.set(sx * (w / 2 - armLen / 2), 0.024, sz * (d / 2));
      ring.add(barX);

      const barZ = new THREE.Mesh(new THREE.BoxGeometry(armThick, 0.012, armLen), cornerMat);
      barZ.position.set(sx * (w / 2), 0.024, sz * (d / 2 - armLen / 2));
      ring.add(barZ);
    }
  }

  // Front direction indicator chevron (+Z is furniture front)
  const arrowGeo = new THREE.ConeGeometry(0.075, 0.18, 4);
  arrowGeo.rotateX(Math.PI / 2);
  const arrow = new THREE.Mesh(arrowGeo, cornerMat);
  arrow.position.set(0, 0.03, d / 2 + 0.12);
  ring.add(arrow);

  return ring;
}

function addPart(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotX, rotY, rotZ);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createPartMaterial(
  materialKind: FurnitureMaterialKind,
  hexColor: string,
  isGhost: boolean,
): THREE.Material {
  if (isGhost) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8b263'),
      emissive: new THREE.Color('#d99b4e'),
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.15,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
  }

  const color = new THREE.Color(hexColor);
  switch (materialKind) {
    case 'wood':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04 });
    case 'fabric':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.86 });
    case 'glass':
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.1,
        metalness: 0.08,
        transparent: true,
        opacity: 0.55,
      });
    case 'ceramic':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.04 });
    case 'stone':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.03 });
    case 'foliage':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.64, metalness: 0.02 });
  }
}

function createPartGeometry(part: FurniturePartSpec): THREE.BufferGeometry {
  if (part.shape === 'cylinder') {
    const r = Math.max(0.012, (part.width + part.depth) * 0.25);
    return new THREE.CylinderGeometry(r, r, part.height, 14);
  }
  if (part.shape === 'sphere') {
    const r = Math.max(0.015, Math.max(part.width, part.height, part.depth) * 0.5);
    const geo = new THREE.SphereGeometry(r, 14, 12);
    // Scale non-uniformly if ellipsoid proportions were requested
    const sx = part.width / (r * 2);
    const sy = part.height / (r * 2);
    const sz = part.depth / (r * 2);
    if (Math.abs(sx - 1) > 0.03 || Math.abs(sy - 1) > 0.03 || Math.abs(sz - 1) > 0.03) {
      geo.scale(sx, sy, sz);
    }
    return geo;
  }
  return new THREE.BoxGeometry(part.width, part.height, part.depth);
}

/**
 * Builds a translucent brass-tinted placement preview ghost with a ground
 * footprint guide ring for interactive click-to-place in the 3D viewport.
 */
export function buildFurniturePlacementGhost(
  asset: GeneratedFurnitureAsset,
  textures: ProceduralTextureSet,
): THREE.Group {
  const ghostItem: BlueprintFurniture = {
    type: asset.category === 'custom' ? 'table' : asset.category,
    name: asset.name,
    x: 0,
    z: 0,
    rotationY: 0,
    width: asset.width,
    depth: asset.depth,
    height: asset.height,
    color: asset.color,
    customParts: asset.parts,
  };
  const group = buildFurnitureGroup(ghostItem, textures, { isGhost: true });
  group.name = 'furniture-placement-ghost';

  // Translucent amber floor footprint pad + crisp outline guide sitting flush on the floor
  const w = Math.max(0.32, asset.width + 0.1);
  const d = Math.max(0.32, asset.depth + 0.1);
  const padMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      color: '#f2b862',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
  padMesh.rotation.x = -Math.PI / 2;
  padMesh.position.y = 0.022;
  group.add(padMesh);

  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.03, d));
  const lineMat = new THREE.LineBasicMaterial({
    color: '#ffd285',
    transparent: true,
    opacity: 0.95,
  });
  const outline = new THREE.LineSegments(edges, lineMat);
  outline.position.y = 0.032;
  group.add(outline);

  // Front direction chevron indicator so rotation angle is unmistakable
  const arrowGeo = new THREE.ConeGeometry(0.09, 0.22, 4);
  arrowGeo.rotateX(Math.PI / 2);
  const arrowMesh = new THREE.Mesh(
    arrowGeo,
    new THREE.MeshBasicMaterial({ color: '#ffd285', transparent: true, opacity: 0.95 }),
  );
  arrowMesh.position.set(0, 0.045, d / 2 + 0.15);
  group.add(arrowMesh);

  return group;
}

/**
 * Builds a composite 3-12 part procedural furniture model pivoted at bottom-center (y = 0)
 * with realistic PBR roughness/metalness contrast and soft contact shadow grounding.
 */
export function buildFurnitureGroup(
  item: BlueprintFurniture,
  textures: ProceduralTextureSet,
  options?: { isGhost?: boolean; index?: number; initialActive?: boolean },
): THREE.Group {
  const isGhost = Boolean(options?.isGhost);
  const index = options?.index ?? -1;
  const stableKey = getFurnitureStableKey(item, Math.max(0, index));
  const group = new THREE.Group();
  group.name = item.id ? `furniture-${item.id}` : `furniture-${item.type}`;
  group.position.set(item.x, 0.01, item.z);
  group.rotation.y = item.rotationY;
  group.userData.furnitureIndex = index;
  group.userData.furnitureType = item.type;
  group.userData.furnitureKey = stableKey;
  group.userData.furnitureLabel = getFurnitureDisplayLabel(item);

  const w = item.width;
  const d = item.depth;
  const h = item.height;
  group.userData.baseDimensions = { width: w, depth: d, height: h };

  // Custom prompt-generated multi-part procedural furniture
  if (item.customParts && item.customParts.length > 0) {
    if (!isGhost) {
      const shadowMat = new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.36,
      });
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 1.18, d * 1.18),
        shadowMat,
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.008;
      group.add(shadowPlane);
    }

    for (const part of item.customParts) {
      const geo = createPartGeometry(part);
      const mat = createPartMaterial(part.material, part.color, isGhost);
      addPart(
        group,
        geo,
        mat,
        part.x,
        part.y,
        part.z,
        part.rotationX ?? 0,
        part.rotationY ?? 0,
        part.rotationZ ?? 0,
        !isGhost,
      );
    }

    if (!isGhost && (item.type === 'sofa' || item.type === 'chair')) {
      const sitCtrl: InteractiveFurnitureController = {
        key: stableKey,
        kind: 'sit',
        isActive: false,
        setActive: () => {},
      };
      group.userData.interactiveController = sitCtrl;
    }

    return group;
  }

  const primaryColor = new THREE.Color(item.color);
  const darkerColor = primaryColor.clone().multiplyScalar(0.72);
  const lighterColor = primaryColor.clone().lerp(new THREE.Color('#ffffff'), 0.28);

  const fabricMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.88,
    metalness: 0.02,
  });
  const accentFabricMat = new THREE.MeshStandardMaterial({
    color: lighterColor,
    roughness: 0.85,
    metalness: 0.02,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4a3728'),
    roughness: 0.52,
    metalness: 0.05,
  });
  const warmWoodMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.46,
    metalness: 0.04,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b8c0c8'),
    roughness: 0.22,
    metalness: 0.88,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#272b30'),
    roughness: 0.32,
    metalness: 0.78,
  });
  const ceramicMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4f4f1'),
    roughness: 0.16,
    metalness: 0.04,
  });

  // Register color-bound materials so live recoloring mutates GPU uniforms in-place (0 rebuilds)
  const colorUpdaters: Array<(c: THREE.Color) => void> = [
    (c) => {
      fabricMat.color.copy(c);
      warmWoodMat.color.copy(c);
      accentFabricMat.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.28);
    },
  ];
  group.userData.applyColorInPlace = (hex: string) => {
    const nextColor = new THREE.Color(hex);
    for (const fn of colorUpdaters) {
      fn(nextColor);
    }
  };

  // Soft contact shadow disc on the floor directly beneath furniture (omitted on flat area rugs)
  if (!isGhost && item.type !== 'rug') {
    const shadowMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.36,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.18, d * 1.18),
      shadowMat,
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.008;
    group.add(shadowPlane);
  }

  switch (item.type) {
    case 'sofa': {
      const legH = 0.12;
      const baseH = 0.16;
      const seatH = 0.16;
      const armW = Math.min(0.18, w * 0.11);
      const backD = Math.min(0.22, d * 0.26);

      // 4 tapered legs
      const legGeo = new THREE.CylinderGeometry(0.022, 0.015, legH, 8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(
            group,
            legGeo,
            darkWoodMat,
            sx * (w / 2 - 0.1),
            legH / 2,
            sz * (d / 2 - 0.1),
          );
        }
      }
      // Base frame plinth
      addPart(group, new THREE.BoxGeometry(w, baseH, d), darkWoodMat, 0, legH + baseH / 2, 0);
      // Segmented seat cushions
      const cushionCount = w >= 2.0 ? 3 : 2;
      const innerW = w - armW * 2 - 0.04;
      const cushW = innerW / cushionCount - 0.02;
      for (let i = 0; i < cushionCount; i++) {
        const cx = -innerW / 2 + (i + 0.5) * (innerW / cushionCount);
        addPart(
          group,
          new THREE.BoxGeometry(cushW, seatH, d - backD - 0.04),
          fabricMat,
          cx,
          legH + baseH + seatH / 2,
          backD / 2,
        );
      }
      // Backrest & back cushions
      addPart(
        group,
        new THREE.BoxGeometry(w, h - legH - baseH, backD),
        fabricMat,
        0,
        legH + baseH + (h - legH - baseH) / 2,
        -d / 2 + backD / 2,
      );
      // Armrests
      const armH = Math.max(0.26, h * 0.42);
      for (const sx of [-1, 1]) {
        addPart(
          group,
          new THREE.BoxGeometry(armW, armH, d - 0.04),
          fabricMat,
          sx * (w / 2 - armW / 2),
          legH + baseH + armH / 2,
          0,
        );
      }
      // Accent throw pillows
      for (const sx of [-1, 1]) {
        addPart(
          group,
          new THREE.BoxGeometry(0.34, 0.3, 0.12),
          accentFabricMat,
          sx * (innerW / 2 - 0.22),
          legH + baseH + seatH + 0.14,
          -d / 2 + backD + 0.1,
          -0.18,
          sx * 0.25,
          0,
        );
      }
      if (!isGhost) {
        const sitCtrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'sit',
          isActive: false,
          setActive: () => {},
        };
        group.userData.interactiveController = sitCtrl;
      }
      break;
    }

    case 'bed': {
      const frameH = 0.24;
      const mattressH = 0.24;
      const headH = Math.max(0.92, h);

      // Platform base
      addPart(group, new THREE.BoxGeometry(w, frameH, d), darkWoodMat, 0, frameH / 2 + 0.06, 0);
      // 4 recessed plinth legs
      const legGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(group, legGeo, darkMetalMat, sx * (w / 2 - 0.12), 0.04, sz * (d / 2 - 0.12));
        }
      }
      // Upholstered headboard
      addPart(
        group,
        new THREE.BoxGeometry(w + 0.08, headH, 0.12),
        darkWoodMat,
        0,
        headH / 2,
        -d / 2 + 0.06,
      );
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.06, headH * 0.62, 0.06),
        accentFabricMat,
        0,
        headH * 0.62,
        -d / 2 + 0.13,
      );
      // Crisp white mattress
      const mattressMat = new THREE.MeshStandardMaterial({
        color: '#f2f0ec',
        roughness: 0.85,
        metalness: 0.01,
      });
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.08, mattressH, d - 0.18),
        mattressMat,
        0,
        frameH + 0.06 + mattressH / 2,
        0.04,
      );
      // Folded duvet / throw blanket
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.04, mattressH * 0.55, d * 0.58),
        fabricMat,
        0,
        frameH + 0.06 + mattressH + 0.02,
        d * 0.16,
      );
      // 2 pillows
      for (const sx of [-1, 1]) {
        addPart(
          group,
          new THREE.BoxGeometry(w * 0.38, 0.13, 0.42),
          mattressMat,
          sx * (w * 0.23),
          frameH + 0.06 + mattressH + 0.065,
          -d / 2 + 0.42,
        );
      }
      break;
    }

    case 'table': {
      const topThick = 0.055;
      const legH = Math.max(0.25, h - topThick);
      // Beveled tabletop
      addPart(group, new THREE.BoxGeometry(w, topThick, d), warmWoodMat, 0, h - topThick / 2, 0);
      // Recessed apron frame
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.18, 0.06, d - 0.18),
        darkWoodMat,
        0,
        h - topThick - 0.03,
        0,
      );
      // 4 tapered legs
      const legGeo = new THREE.CylinderGeometry(0.028, 0.018, legH, 10);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(
            group,
            legGeo,
            darkWoodMat,
            sx * (w / 2 - 0.1),
            legH / 2,
            sz * (d / 2 - 0.1),
          );
        }
      }
      // Subtle ceramic centerpiece bowl
      addPart(
        group,
        new THREE.CylinderGeometry(0.14, 0.08, 0.06, 16),
        ceramicMat,
        0,
        h + 0.03,
        0,
      );
      break;
    }

    case 'chair': {
      const seatY = h * 0.54;
      const legGeo = new THREE.CylinderGeometry(0.018, 0.012, seatY, 8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(
            group,
            legGeo,
            darkWoodMat,
            sx * (w / 2 - 0.06),
            seatY / 2,
            sz * (d / 2 - 0.06),
          );
        }
      }
      // Upholstered seat pad
      addPart(group, new THREE.BoxGeometry(w, 0.065, d), fabricMat, 0, seatY, 0);
      // Backrest stiles & top curved rail
      const backH = h - seatY;
      for (const sx of [-1, 1]) {
        addPart(
          group,
          new THREE.BoxGeometry(0.04, backH, 0.04),
          darkWoodMat,
          sx * (w / 2 - 0.06),
          seatY + backH / 2,
          -d / 2 + 0.04,
        );
      }
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.04, backH * 0.55, 0.045),
        fabricMat,
        0,
        seatY + backH * 0.68,
        -d / 2 + 0.04,
      );
      if (!isGhost) {
        const sitCtrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'sit',
          isActive: false,
          setActive: () => {},
        };
        group.userData.interactiveController = sitCtrl;
      }
      break;
    }

    case 'desk': {
      const topThick = 0.045;
      const legH = h - topThick;
      // Desktop slab
      addPart(group, new THREE.BoxGeometry(w, topThick, d), warmWoodMat, 0, h - topThick / 2, 0);
      // Matte metal sled legs
      for (const sx of [-1, 1]) {
        addPart(
          group,
          new THREE.BoxGeometry(0.04, legH, d - 0.08),
          darkMetalMat,
          sx * (w / 2 - 0.08),
          legH / 2,
          0,
        );
      }
      // Drawer pedestal on right side
      const pedW = Math.min(0.42, w * 0.3);
      const pedMat = new THREE.MeshStandardMaterial({ color: darkerColor, roughness: 0.55 });
      colorUpdaters.push((c) => pedMat.color.copy(c).multiplyScalar(0.72));
      addPart(
        group,
        new THREE.BoxGeometry(pedW, legH * 0.72, d - 0.1),
        pedMat,
        w / 2 - pedW / 2 - 0.12,
        legH - (legH * 0.72) / 2,
        0,
      );
      // Architectural studio monitor on desk
      addPart(group, new THREE.BoxGeometry(0.54, 0.32, 0.025), darkMetalMat, -0.1, h + 0.25, -d * 0.25);
      addPart(group, new THREE.BoxGeometry(0.06, 0.14, 0.04), metalMat, -0.1, h + 0.07, -d * 0.25);
      addPart(group, new THREE.BoxGeometry(0.22, 0.015, 0.16), metalMat, -0.1, h + 0.008, -d * 0.22);
      break;
    }

    case 'counter': {
      const toeH = 0.1;
      const topThick = 0.05;
      const cabH = h - toeH - topThick;
      // Recessed toe-kick
      addPart(group, new THREE.BoxGeometry(w - 0.04, toeH, d - 0.08), darkMetalMat, 0, toeH / 2, -0.02);
      // Lower cabinet carcass
      addPart(group, new THREE.BoxGeometry(w, cabH, d - 0.03), fabricMat, 0, toeH + cabH / 2, -0.01);
      // Overhanging stone/quartz countertop
      const counterTopMat = new THREE.MeshStandardMaterial({
        color: '#efede8',
        roughness: 0.24,
        metalness: 0.05,
      });
      addPart(group, new THREE.BoxGeometry(w + 0.04, topThick, d + 0.04), counterTopMat, 0, h - topThick / 2, 0);
      // Cabinet pulls / handles along front face
      const doors = Math.max(2, Math.round(w / 0.65));
      for (let i = 0; i < doors; i++) {
        const hx = -w / 2 + (i + 0.5) * (w / doors);
        addPart(
          group,
          new THREE.BoxGeometry(0.14, 0.016, 0.025),
          metalMat,
          hx,
          h - topThick - 0.12,
          d / 2,
        );
      }
      break;
    }

    case 'toilet': {
      // Sculpted pedestal base
      addPart(group, new THREE.CylinderGeometry(0.15, 0.13, 0.34, 14), ceramicMat, 0, 0.17, 0.06);
      // Bowl
      addPart(group, new THREE.CylinderGeometry(0.21, 0.16, 0.12, 16), ceramicMat, 0, 0.38, 0.08);
      // Seat lid
      addPart(group, new THREE.BoxGeometry(0.38, 0.035, 0.44), ceramicMat, 0, 0.45, 0.07);
      // Cistern water tank
      addPart(group, new THREE.BoxGeometry(0.4, 0.42, 0.2), ceramicMat, 0, 0.56, -d / 2 + 0.12);
      // Chrome flush button
      addPart(group, new THREE.CylinderGeometry(0.028, 0.028, 0.015, 12), metalMat, 0, 0.78, -d / 2 + 0.12);
      break;
    }

    case 'sink': {
      const topThick = 0.05;
      const cabH = h - topThick - 0.08;
      // Vanity cabinet
      addPart(group, new THREE.BoxGeometry(w, cabH, d - 0.04), fabricMat, 0, 0.08 + cabH / 2, 0);
      // Stone vanity top
      addPart(group, new THREE.BoxGeometry(w + 0.03, topThick, d + 0.02), ceramicMat, 0, h - topThick / 2, 0);
      // Basin rim
      addPart(
        group,
        new THREE.BoxGeometry(Math.min(0.56, w * 0.65), 0.04, Math.min(0.38, d * 0.68)),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.05 }),
        0,
        h + 0.015,
        0.02,
      );
      // Chrome gooseneck faucet
      addPart(group, new THREE.CylinderGeometry(0.015, 0.018, 0.18, 10), metalMat, 0, h + 0.09, -d * 0.28);
      addPart(
        group,
        new THREE.BoxGeometry(0.024, 0.024, 0.14),
        metalMat,
        0,
        h + 0.17,
        -d * 0.21,
      );
      break;
    }

    case 'bathtub': {
      // Sculpted architectural freestanding soaking tub with rounded stadium walls,
      // recessed hollow porcelain basin, chrome drain/overflow, and floor-mounted filler faucet
      const makeRoundedRectShape = (rw: number, rd: number, radius: number): THREE.Shape => {
        const shape = new THREE.Shape();
        const hw = rw / 2;
        const hd = rd / 2;
        const r = Math.min(radius, hw * 0.92, hd * 0.92);
        shape.moveTo(-hw + r, -hd);
        shape.lineTo(hw - r, -hd);
        shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
        shape.lineTo(hw, hd - r);
        shape.quadraticCurveTo(hw, hd, hw - r, hd);
        shape.lineTo(-hw + r, hd);
        shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
        shape.lineTo(-hw, -hd + r);
        shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
        return shape;
      };

      const makeRoundedRectPath = (rw: number, rd: number, radius: number): THREE.Path => {
        const path = new THREE.Path();
        const hw = rw / 2;
        const hd = rd / 2;
        const r = Math.min(radius, hw * 0.92, hd * 0.92);
        path.moveTo(-hw + r, -hd);
        path.lineTo(hw - r, -hd);
        path.quadraticCurveTo(hw, -hd, hw, -hd + r);
        path.lineTo(hw, hd - r);
        path.quadraticCurveTo(hw, hd, hw - r, hd);
        path.lineTo(-hw + r, hd);
        path.quadraticCurveTo(-hw, hd, -hw, hd - r);
        path.lineTo(-hw, -hd + r);
        path.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
        return path;
      };

      const tubCeramicMat = new THREE.MeshStandardMaterial({
        color: primaryColor.clone().lerp(new THREE.Color('#ffffff'), 0.35),
        roughness: 0.14,
        metalness: 0.04,
      });
      const innerBasinMat = new THREE.MeshStandardMaterial({
        color: primaryColor.clone().lerp(new THREE.Color('#eef2f4'), 0.45),
        roughness: 0.12,
        metalness: 0.04,
      });
      colorUpdaters.push((c) => {
        tubCeramicMat.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.35);
        innerBasinMat.color.copy(c).lerp(new THREE.Color('#eef2f4'), 0.45);
      });

      const rimThick = Math.min(0.085, Math.min(w, d) * 0.115);
      const outerRadius = Math.min(d * 0.44, 0.34);
      const innerW = Math.max(0.4, w - rimThick * 2);
      const innerD = Math.max(0.28, d - rimThick * 2);
      const innerRadius = Math.max(0.08, outerRadius - rimThick * 0.85);
      const baseH = 0.095;
      const wallExtrudeH = Math.max(0.28, h - baseH - 0.025);

      // 1. Slightly inset solid floor plinth + tub floor slab
      const plinthShape = makeRoundedRectShape(w - 0.06, d - 0.06, Math.max(0.08, outerRadius - 0.03));
      const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
        depth: baseH,
        bevelEnabled: false,
        curveSegments: 16,
      });
      plinthGeo.rotateX(-Math.PI / 2);
      addPart(group, plinthGeo, tubCeramicMat, 0, 0, 0);

      // 2. Inner basin bottom floor slightly raised above plinth
      const floorShape = makeRoundedRectShape(innerW + 0.04, innerD + 0.04, innerRadius);
      const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
        depth: 0.04,
        bevelEnabled: false,
        curveSegments: 16,
      });
      floorGeo.rotateX(-Math.PI / 2);
      addPart(group, floorGeo, innerBasinMat, 0, baseH - 0.005, 0);

      // 3. Sculpted hollow tub body shell with beveled rolled top rim
      const shellShape = makeRoundedRectShape(w, d, outerRadius);
      shellShape.holes.push(makeRoundedRectPath(innerW, innerD, innerRadius));
      const shellGeo = new THREE.ExtrudeGeometry(shellShape, {
        depth: wallExtrudeH,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.018,
        bevelSegments: 4,
        curveSegments: 18,
      });
      shellGeo.rotateX(-Math.PI / 2);
      addPart(group, shellGeo, tubCeramicMat, 0, baseH, 0);

      // 4. Gently reclined ergonomic backrest pillow ledge at the left (-X) head end
      const backrestGeo = new THREE.BoxGeometry(0.06, wallExtrudeH * 0.72, innerD * 0.72);
      addPart(
        group,
        backrestGeo,
        innerBasinMat,
        -innerW / 2 + 0.075,
        baseH + wallExtrudeH * 0.42,
        0,
        0,
        0,
        -0.28,
      );

      // 5. Chrome circular drain ring on the inner floor + overflow plate at faucet (+X) end
      addPart(
        group,
        new THREE.CylinderGeometry(0.034, 0.034, 0.008, 16),
        metalMat,
        innerW * 0.28,
        baseH + 0.038,
        0,
      );
      addPart(
        group,
        new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12),
        darkMetalMat,
        innerW * 0.28,
        baseH + 0.041,
        0,
      );
      addPart(
        group,
        new THREE.BoxGeometry(0.012, 0.022, 0.075),
        metalMat,
        innerW / 2 - 0.006,
        h - 0.11,
        0,
      );

      // 6. Sleek rim/deck-mounted chrome tub filler faucet & twin mixer controls at +X end
      const faucetX = w / 2 - rimThick * 0.48;
      const faucetBaseY = h + 0.02;
      // Vertical riser stem
      addPart(
        group,
        new THREE.CylinderGeometry(0.018, 0.024, 0.22, 12),
        metalMat,
        faucetX,
        faucetBaseY + 0.11,
        0,
      );
      // Curved overhanging filler spout pointing inward over the basin
      addPart(
        group,
        new THREE.BoxGeometry(0.18, 0.024, 0.03),
        metalMat,
        faucetX - 0.085,
        faucetBaseY + 0.21,
        0,
      );
      addPart(
        group,
        new THREE.CylinderGeometry(0.013, 0.013, 0.035, 10),
        metalMat,
        faucetX - 0.165,
        faucetBaseY + 0.19,
        0,
      );
      // Twin hot & cold chrome mixer knobs flanking the spout
      for (const sz of [-1, 1]) {
        addPart(
          group,
          new THREE.CylinderGeometry(0.018, 0.02, 0.055, 10),
          metalMat,
          faucetX,
          faucetBaseY + 0.028,
          sz * 0.11,
        );
        addPart(
          group,
          new THREE.BoxGeometry(0.055, 0.014, 0.016),
          metalMat,
          faucetX - 0.02,
          faucetBaseY + 0.052,
          sz * 0.11,
        );
      }

      // 7. Subtle warm folded wood bath tray resting across mid-tub for spa detail
      const trayMat = new THREE.MeshStandardMaterial({
        color: '#9c724b',
        roughness: 0.48,
        metalness: 0.03,
      });
      addPart(
        group,
        new THREE.BoxGeometry(0.18, 0.022, d + 0.02),
        trayMat,
        -w * 0.08,
        h + 0.032,
        0,
      );
      break;
    }

    case 'plant': {
      const potH = Math.min(0.42, h * 0.32);
      const potR = Math.min(0.24, w * 0.42);
      const potMat = new THREE.MeshStandardMaterial({
        color: '#d8d1c7',
        roughness: 0.68,
        metalness: 0.02,
      });
      const soilMat = new THREE.MeshStandardMaterial({
        color: '#3c2f24',
        roughness: 0.95,
      });
      const leafMat1 = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.62,
        metalness: 0.02,
      });
      const leafMat2 = new THREE.MeshStandardMaterial({
        color: primaryColor.clone().multiplyScalar(1.18),
        roughness: 0.58,
        metalness: 0.02,
      });
      colorUpdaters.push((c) => {
        leafMat1.color.copy(c);
        leafMat2.color.copy(c).multiplyScalar(1.18);
      });

      // Ceramic planter pot
      addPart(group, new THREE.CylinderGeometry(potR, potR * 0.72, potH, 16), potMat, 0, potH / 2, 0);
      addPart(group, new THREE.CylinderGeometry(potR * 0.92, potR * 0.92, 0.03, 14), soilMat, 0, potH - 0.01, 0);
      // Woody stem
      const stemH = h - potH * 0.8;
      addPart(group, new THREE.CylinderGeometry(0.016, 0.026, stemH * 0.65, 8), darkWoodMat, 0, potH + stemH * 0.3, 0);
      // Layered botanical foliage crown (5 distinct leaf clusters)
      const crownY = potH + stemH * 0.52;
      addPart(group, new THREE.DodecahedronGeometry(potR * 1.15, 0), leafMat1, 0, crownY + 0.18, 0);
      addPart(group, new THREE.DodecahedronGeometry(potR * 0.85, 0), leafMat2, potR * 0.55, crownY, potR * 0.35);
      addPart(group, new THREE.DodecahedronGeometry(potR * 0.88, 0), leafMat1, -potR * 0.52, crownY + 0.05, potR * 0.32);
      addPart(group, new THREE.DodecahedronGeometry(potR * 0.82, 0), leafMat2, 0.1, crownY - 0.05, -potR * 0.55);
      break;
    }

    case 'tv_stand': {
      const legH = 0.14;
      const bodyH = Math.max(0.32, h - legH);
      // Credenza legs
      const legGeo = new THREE.CylinderGeometry(0.018, 0.012, legH, 8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(group, legGeo, metalMat, sx * (w / 2 - 0.12), legH / 2, sz * (d / 2 - 0.08));
        }
      }
      // Console body
      addPart(group, new THREE.BoxGeometry(w, bodyH, d), warmWoodMat, 0, legH + bodyH / 2, 0);
      // Recessed media shelf strip
      addPart(group, new THREE.BoxGeometry(w * 0.44, bodyH * 0.38, 0.04), darkMetalMat, 0, legH + bodyH * 0.55, d / 2 - 0.01);
      // Flatscreen architectural TV on stand
      const tvW = Math.min(1.38, w * 0.78);
      const tvH = tvW * 0.56;
      const screenCenterY = h + 0.12 + tvH / 2;
      const screenMat = new THREE.MeshStandardMaterial({
        color: '#111419',
        roughness: 0.12,
        metalness: 0.25,
        emissive: new THREE.Color('#7ec2ff'),
        emissiveIntensity: 0,
      });
      const statusLedMat = new THREE.MeshStandardMaterial({
        color: '#2a303a',
        emissive: new THREE.Color('#6ee7b7'),
        emissiveIntensity: 0,
        roughness: 0.2,
      });
      addPart(group, new THREE.BoxGeometry(0.28, 0.02, 0.18), darkMetalMat, 0, h + 0.01, 0);
      addPart(group, new THREE.BoxGeometry(0.06, 0.12, 0.04), darkMetalMat, 0, h + 0.07, -0.02);
      addPart(group, new THREE.BoxGeometry(tvW, tvH, 0.035), darkMetalMat, 0, screenCenterY, -0.02);
      addPart(group, new THREE.BoxGeometry(tvW - 0.05, tvH - 0.05, 0.01), screenMat, 0, screenCenterY, 0.002);
      addPart(group, new THREE.BoxGeometry(0.03, 0.008, 0.012), statusLedMat, tvW * 0.42, h + 0.135, 0.004);

      if (!isGhost) {
        const tvLight = new THREE.PointLight(0x8ec5ff, 0, 5.2, 2);
        tvLight.castShadow = false;
        tvLight.position.set(0, screenCenterY, 0.34);
        group.add(tvLight);

        const initialOn = options?.initialActive ?? false;
        const ctrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'toggle_tv',
          isActive: initialOn,
          setActive: (active: boolean) => {
            ctrl.isActive = active;
            screenMat.emissiveIntensity = active ? 1.2 : 0;
            screenMat.color.set(active ? '#2b557a' : '#111419');
            statusLedMat.emissiveIntensity = active ? 1.8 : 0;
            tvLight.intensity = active ? 1.55 : 0;
          },
        };
        ctrl.setActive(initialOn);
        group.userData.interactiveController = ctrl;
      }
      break;
    }

    case 'floor_lamp': {
      const brassMat = new THREE.MeshStandardMaterial({
        color: '#cfa35e',
        roughness: 0.26,
        metalness: 0.86,
      });
      const baseMat = new THREE.MeshStandardMaterial({
        color: '#2b2f37',
        roughness: 0.45,
        metalness: 0.25,
      });
      const shadeMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.84,
        metalness: 0.02,
        emissive: new THREE.Color('#ffd08a'),
        emissiveIntensity: 0,
        side: THREE.DoubleSide,
      });
      colorUpdaters.push((c) => shadeMat.color.copy(c));
      const bulbMat = new THREE.MeshStandardMaterial({
        color: '#fff6e3',
        emissive: new THREE.Color('#ffe0a6'),
        emissiveIntensity: 0,
        roughness: 0.2,
      });

      const baseR = Math.min(0.2, Math.max(0.13, Math.min(w, d) * 0.42));
      const shadeH = Math.min(0.38, Math.max(0.24, h * 0.21));
      const shadeTopR = Math.min(0.18, Math.max(0.11, Math.min(w, d) * 0.34));
      const shadeBotR = Math.min(0.25, Math.max(0.16, Math.min(w, d) * 0.48));
      const stemH = Math.max(0.8, h - shadeH * 0.65);
      const shadeCenterY = h - shadeH / 2;

      // Weighted stone/dark metal circular base
      addPart(group, new THREE.CylinderGeometry(baseR * 0.92, baseR, 0.042, 20), baseMat, 0, 0.021, 0);
      addPart(group, new THREE.CylinderGeometry(0.032, 0.045, 0.04, 14), brassMat, 0, 0.055, 0);
      // Slim brushed-brass vertical column
      addPart(group, new THREE.CylinderGeometry(0.013, 0.016, stemH, 12), brassMat, 0, 0.04 + stemH / 2, 0);
      // Tapered linen drum shade (open ended so warm light escapes up & down)
      addPart(
        group,
        new THREE.CylinderGeometry(shadeTopR, shadeBotR, shadeH, 22, 1, true),
        shadeMat,
        0,
        shadeCenterY,
        0,
      );
      // Upper shade collar ring & glowing inner bulb
      addPart(group, new THREE.CylinderGeometry(0.022, 0.022, 0.06, 10), brassMat, 0, shadeCenterY - 0.04, 0);
      addPart(group, new THREE.SphereGeometry(0.045, 14, 12), bulbMat, 0, shadeCenterY + 0.01, 0, 0, 0, 0, false);

      if (!isGhost) {
        const lampLight = new THREE.PointLight(0xffd28e, 0, 7.5, 2);
        lampLight.castShadow = false;
        lampLight.position.set(0, shadeCenterY, 0);
        group.add(lampLight);

        const initialOn = options?.initialActive ?? true;
        const ctrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'toggle_lamp',
          isActive: initialOn,
          setActive: (active: boolean) => {
            ctrl.isActive = active;
            shadeMat.emissiveIntensity = active ? 0.72 : 0;
            bulbMat.emissiveIntensity = active ? 2.1 : 0;
            lampLight.intensity = active ? 2.6 : 0;
          },
        };
        ctrl.setActive(initialOn);
        group.userData.interactiveController = ctrl;
      }
      break;
    }

    case 'fridge': {
      const shellMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.28,
        metalness: 0.62,
      });
      colorUpdaters.push((c) => shellMat.color.copy(c));
      const cavityMat = new THREE.MeshStandardMaterial({
        color: '#202630',
        roughness: 0.65,
        metalness: 0.12,
      });
      const shelfGlassMat = new THREE.MeshStandardMaterial({
        color: '#d9ecff',
        roughness: 0.14,
        metalness: 0.08,
        transparent: true,
        opacity: 0.52,
      });
      const ledStripMat = new THREE.MeshStandardMaterial({
        color: '#eef8ff',
        emissive: new THREE.Color('#c5e8ff'),
        emissiveIntensity: 0.85,
        roughness: 0.2,
      });

      const doorT = 0.05;
      const wallT = 0.045;
      const bodyD = Math.max(0.32, d - doorT);
      const bodyZ = -doorT / 2;
      const innerW = Math.max(0.24, w - wallT * 2);
      const innerD = Math.max(0.2, bodyD - wallT);

      // Recessed hollow carcass (back, left, right, top, bottom, mid divider)
      addPart(group, new THREE.BoxGeometry(w, h, wallT), shellMat, 0, h / 2, bodyZ - bodyD / 2 + wallT / 2);
      addPart(group, new THREE.BoxGeometry(wallT, h, bodyD), shellMat, -w / 2 + wallT / 2, h / 2, bodyZ);
      addPart(group, new THREE.BoxGeometry(wallT, h, bodyD), shellMat, w / 2 - wallT / 2, h / 2, bodyZ);
      addPart(group, new THREE.BoxGeometry(innerW, wallT, bodyD), shellMat, 0, h - wallT / 2, bodyZ);
      addPart(group, new THREE.BoxGeometry(innerW, 0.07, bodyD), darkMetalMat, 0, 0.035, bodyZ);
      // Inner cavity dark back liner + fridge/freezer divider
      const splitY = h * 0.34;
      addPart(group, new THREE.BoxGeometry(innerW - 0.01, h - 0.12, 0.02), cavityMat, 0, h / 2, bodyZ - bodyD / 2 + wallT + 0.01);
      addPart(group, new THREE.BoxGeometry(innerW, 0.04, innerD), shellMat, 0, splitY, bodyZ + wallT * 0.3);

      // 3 crisp glass interior fridge shelves + cool LED top bar
      const upperSpan = h - wallT - splitY;
      for (let i = 1; i <= 3; i++) {
        const sy = splitY + (upperSpan * i) / 4;
        addPart(
          group,
          new THREE.BoxGeometry(innerW - 0.03, 0.014, innerD - 0.05),
          shelfGlassMat,
          0,
          sy,
          bodyZ + 0.02,
          0,
          0,
          0,
          false,
        );
      }
      addPart(group, new THREE.BoxGeometry(innerW * 0.65, 0.018, 0.035), ledStripMat, 0, h - wallT - 0.015, bodyZ + 0.06, 0, 0, 0, false);

      // Hinged upper fridge door & lower freezer door pivoted on right edge (+X) swinging outward 90 deg
      const hingeX = w / 2 - 0.022;
      const hingeZ = d / 2 - doorT / 2;
      const doorW = w - 0.01;
      const upperH = h - splitY - 0.035;
      const lowerH = splitY - 0.08;

      const upperPivot = new THREE.Group();
      upperPivot.name = 'fridge-upper-door-pivot';
      upperPivot.position.set(hingeX, splitY + 0.02 + upperH / 2, hingeZ);
      addPart(upperPivot, new THREE.BoxGeometry(doorW, upperH, doorT), shellMat, -doorW / 2 + 0.018, 0, 0);
      addPart(upperPivot, new THREE.BoxGeometry(0.022, upperH * 0.56, 0.04), metalMat, -doorW + 0.08, -upperH * 0.06, doorT / 2 + 0.02);
      group.add(upperPivot);

      const lowerPivot = new THREE.Group();
      lowerPivot.name = 'fridge-lower-door-pivot';
      lowerPivot.position.set(hingeX, 0.065 + lowerH / 2, hingeZ);
      addPart(lowerPivot, new THREE.BoxGeometry(doorW, lowerH, doorT), shellMat, -doorW / 2 + 0.018, 0, 0);
      addPart(lowerPivot, new THREE.BoxGeometry(0.022, lowerH * 0.58, 0.04), metalMat, -doorW + 0.08, 0.03, doorT / 2 + 0.02);
      group.add(lowerPivot);

      if (!isGhost) {
        const doorPivots: InteractiveDoorPivot[] = [
          { pivot: upperPivot, closedY: 0, openY: Math.PI / 2 },
          { pivot: lowerPivot, closedY: 0, openY: Math.PI / 2 },
        ];
        const initialOpen = options?.initialActive ?? false;
        for (const dp of doorPivots) {
          dp.pivot.rotation.y = initialOpen ? dp.openY : dp.closedY;
        }
        const ctrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'toggle_door',
          isActive: initialOpen,
          doorPivots,
          setActive: (active: boolean) => {
            ctrl.isActive = active;
          },
        };
        group.userData.interactiveController = ctrl;
      }
      break;
    }

    case 'wardrobe': {
      const doorT = 0.038;
      const wallT = 0.04;
      const bodyD = Math.max(0.32, d - doorT);
      const bodyZ = -doorT / 2;
      const innerW = Math.max(0.32, w - wallT * 2);
      const innerD = Math.max(0.24, bodyD - wallT);
      const innerMat = new THREE.MeshStandardMaterial({
        color: primaryColor.clone().multiplyScalar(0.76),
        roughness: 0.62,
        metalness: 0.03,
      });
      colorUpdaters.push((c) => innerMat.color.copy(c).multiplyScalar(0.76));
      const brassHandleMat = new THREE.MeshStandardMaterial({
        color: '#d4a76a',
        roughness: 0.24,
        metalness: 0.88,
      });

      // Architectural carcass (back, left, right, top crown, bottom plinth)
      addPart(group, new THREE.BoxGeometry(w, h, wallT), innerMat, 0, h / 2, bodyZ - bodyD / 2 + wallT / 2);
      addPart(group, new THREE.BoxGeometry(wallT, h, bodyD), warmWoodMat, -w / 2 + wallT / 2, h / 2, bodyZ);
      addPart(group, new THREE.BoxGeometry(wallT, h, bodyD), warmWoodMat, w / 2 - wallT / 2, h / 2, bodyZ);
      addPart(group, new THREE.BoxGeometry(w + 0.03, 0.055, d + 0.02), warmWoodMat, 0, h - 0.0275, 0);
      addPart(group, new THREE.BoxGeometry(w - 0.02, 0.09, bodyD), darkWoodMat, 0, 0.045, bodyZ);

      // Interior storage details visible when doors open: top shelf, chrome rail, lower shelf dividers
      addPart(group, new THREE.BoxGeometry(innerW, 0.03, innerD - 0.02), innerMat, 0, h * 0.78, bodyZ + 0.01);
      addPart(
        group,
        new THREE.CylinderGeometry(0.014, 0.014, innerW - 0.04, 10),
        metalMat,
        0,
        h * 0.71,
        bodyZ + 0.02,
        0,
        0,
        Math.PI / 2,
      );
      addPart(group, new THREE.BoxGeometry(innerW, 0.03, innerD - 0.02), innerMat, 0, h * 0.28, bodyZ + 0.01);
      addPart(group, new THREE.BoxGeometry(0.028, h * 0.22, innerD - 0.04), innerMat, 0, h * 0.17, bodyZ + 0.01);

      // Twin hinged doors pivoted cleanly at left (-X) and right (+X) front edges
      const doorH = h - 0.155;
      const doorY = 0.095 + doorH / 2;
      const leafW = w / 2 - 0.012;
      const hingeZ = d / 2 - doorT / 2;

      const leftPivot = new THREE.Group();
      leftPivot.name = 'wardrobe-left-door-pivot';
      leftPivot.position.set(-w / 2 + 0.018, doorY, hingeZ);
      addPart(leftPivot, new THREE.BoxGeometry(leafW, doorH, doorT), warmWoodMat, leafW / 2 - 0.012, 0, 0);
      addPart(leftPivot, new THREE.BoxGeometry(0.018, 0.32, 0.034), brassHandleMat, leafW - 0.07, 0.04, doorT / 2 + 0.018);
      group.add(leftPivot);

      const rightPivot = new THREE.Group();
      rightPivot.name = 'wardrobe-right-door-pivot';
      rightPivot.position.set(w / 2 - 0.018, doorY, hingeZ);
      addPart(rightPivot, new THREE.BoxGeometry(leafW, doorH, doorT), warmWoodMat, -leafW / 2 + 0.012, 0, 0);
      addPart(rightPivot, new THREE.BoxGeometry(0.018, 0.32, 0.034), brassHandleMat, -leafW + 0.07, 0.04, doorT / 2 + 0.018);
      group.add(rightPivot);

      if (!isGhost) {
        const doorPivots: InteractiveDoorPivot[] = [
          { pivot: leftPivot, closedY: 0, openY: -Math.PI / 2 },
          { pivot: rightPivot, closedY: 0, openY: Math.PI / 2 },
        ];
        const initialOpen = options?.initialActive ?? false;
        for (const dp of doorPivots) {
          dp.pivot.rotation.y = initialOpen ? dp.openY : dp.closedY;
        }
        const ctrl: InteractiveFurnitureController = {
          key: stableKey,
          kind: 'toggle_door',
          isActive: initialOpen,
          doorPivots,
          setActive: (active: boolean) => {
            ctrl.isActive = active;
          },
        };
        group.userData.interactiveController = ctrl;
      }
      break;
    }

    case 'rug': {
      const rugThick = Math.min(0.024, Math.max(0.014, h));
      const pileMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        roughness: 0.94,
        metalness: 0.01,
      });
      const borderMat = new THREE.MeshStandardMaterial({
        color: darkerColor,
        roughness: 0.92,
        metalness: 0.01,
      });
      colorUpdaters.push((c) => {
        pileMat.color.copy(c);
        borderMat.color.copy(c).multiplyScalar(0.72);
      });
      // Main woven rug pile
      addPart(group, new THREE.BoxGeometry(w, rugThick, d), pileMat, 0, rugThick / 2, 0, 0, 0, 0, false);
      // Subtle inset architectural woven border strips
      const inset = Math.min(0.14, Math.min(w, d) * 0.1);
      const stripW = 0.045;
      const bw = Math.max(0.2, w - inset * 2);
      const bd = Math.max(0.2, d - inset * 2);
      addPart(group, new THREE.BoxGeometry(bw, 0.004, stripW), borderMat, 0, rugThick + 0.002, bd / 2, 0, 0, 0, false);
      addPart(group, new THREE.BoxGeometry(bw, 0.004, stripW), borderMat, 0, rugThick + 0.002, -bd / 2, 0, 0, 0, false);
      addPart(group, new THREE.BoxGeometry(stripW, 0.004, bd), borderMat, bw / 2, rugThick + 0.002, 0, 0, 0, 0, false);
      addPart(group, new THREE.BoxGeometry(stripW, 0.004, bd), borderMat, -bw / 2, rugThick + 0.002, 0, 0, 0, 0, false);
      break;
    }

    case 'coffee_table': {
      const topThick = 0.042;
      const legH = Math.max(0.2, h - topThick);
      // Tabletop slab
      addPart(group, new THREE.BoxGeometry(w, topThick, d), warmWoodMat, 0, h - topThick / 2, 0);
      // Lower magazine shelf
      addPart(
        group,
        new THREE.BoxGeometry(w - 0.14, 0.025, d - 0.14),
        darkWoodMat,
        0,
        legH * 0.36,
        0,
      );
      // 4 slim tapered architectural legs
      const legGeo = new THREE.CylinderGeometry(0.022, 0.015, legH, 10);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addPart(
            group,
            legGeo,
            darkMetalMat,
            sx * (w / 2 - 0.08),
            legH / 2,
            sz * (d / 2 - 0.08),
          );
        }
      }
      // Subtle art book stack & ceramic accent vessel on top
      addPart(
        group,
        new THREE.BoxGeometry(Math.min(0.28, w * 0.28), 0.028, Math.min(0.22, d * 0.34)),
        accentFabricMat,
        -w * 0.18,
        h + 0.014,
        0.04,
        0,
        0.16,
        0,
      );
      addPart(
        group,
        new THREE.CylinderGeometry(0.065, 0.048, 0.11, 14),
        ceramicMat,
        w * 0.2,
        h + 0.055,
        -0.04,
      );
      break;
    }

    case 'bookshelf': {
      const sideT = 0.036;
      const backT = 0.02;
      const innerW = Math.max(0.25, w - sideT * 2);
      // Side stiles, back panel, top cap, bottom plinth
      addPart(group, new THREE.BoxGeometry(sideT, h, d), warmWoodMat, -w / 2 + sideT / 2, h / 2, 0);
      addPart(group, new THREE.BoxGeometry(sideT, h, d), warmWoodMat, w / 2 - sideT / 2, h / 2, 0);
      addPart(group, new THREE.BoxGeometry(w, h, backT), darkWoodMat, 0, h / 2, -d / 2 + backT / 2);
      addPart(group, new THREE.BoxGeometry(w + 0.02, 0.036, d + 0.01), warmWoodMat, 0, h - 0.018, 0);
      addPart(group, new THREE.BoxGeometry(w, 0.07, d), darkWoodMat, 0, 0.035, 0);

      // 4 interior horizontal shelves + architectural book clusters
      const shelfCount = 4;
      const bookPalette = ['#8f4d3b', '#3f5a6c', '#c7b89e', '#4b634e', '#2e333c'];
      for (let s = 1; s <= shelfCount; s++) {
        const sy = 0.08 + ((h - 0.14) * s) / (shelfCount + 1);
        addPart(group, new THREE.BoxGeometry(innerW, 0.026, d - 0.02), warmWoodMat, 0, sy, 0.005);

        // Place 2 neat book stacks per shelf
        const bookH = Math.min(0.22, (h - 0.14) / (shelfCount + 1) - 0.07);
        const clusterW = Math.min(0.28, innerW * 0.34);
        const bx = (s % 2 === 0 ? -1 : 1) * (innerW * 0.22);
        const bookMat = new THREE.MeshStandardMaterial({
          color: bookPalette[s % bookPalette.length],
          roughness: 0.72,
          metalness: 0.04,
        });
        addPart(
          group,
          new THREE.BoxGeometry(clusterW, bookH, d * 0.62),
          bookMat,
          bx,
          sy + 0.013 + bookH / 2,
          0.02,
        );
        if (s === 2) {
          addPart(
            group,
            new THREE.CylinderGeometry(0.055, 0.042, 0.14, 12),
            ceramicMat,
            -bx,
            sy + 0.083,
            0.02,
          );
        }
      }
      break;
    }
  }

  return group;
}
