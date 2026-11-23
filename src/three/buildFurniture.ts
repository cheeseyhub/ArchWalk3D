import * as THREE from 'three';
import type {
  BlueprintFurniture,
  FurnitureMaterialKind,
  FurniturePartSpec,
  GeneratedFurnitureAsset,
} from '../arch/types';
import type { ProceduralTextureSet } from './textures';

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
  options?: { isGhost?: boolean },
): THREE.Group {
  const isGhost = Boolean(options?.isGhost);
  const group = new THREE.Group();
  group.name = item.id ? `furniture-${item.id}` : `furniture-${item.type}`;
  group.position.set(item.x, 0.01, item.z);
  group.rotation.y = item.rotationY;

  const w = item.width;
  const d = item.depth;
  const h = item.height;

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

  // Soft contact shadow disc on the floor directly beneath furniture
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
      addPart(
        group,
        new THREE.BoxGeometry(pedW, legH * 0.72, d - 0.1),
        new THREE.MeshStandardMaterial({ color: darkerColor, roughness: 0.55 }),
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
      const screenMat = new THREE.MeshStandardMaterial({
        color: '#111419',
        roughness: 0.12,
        metalness: 0.25,
      });
      addPart(group, new THREE.BoxGeometry(0.28, 0.02, 0.18), darkMetalMat, 0, h + 0.01, 0);
      addPart(group, new THREE.BoxGeometry(0.06, 0.12, 0.04), darkMetalMat, 0, h + 0.07, -0.02);
      addPart(group, new THREE.BoxGeometry(tvW, tvH, 0.035), darkMetalMat, 0, h + 0.12 + tvH / 2, -0.02);
      addPart(group, new THREE.BoxGeometry(tvW - 0.05, tvH - 0.05, 0.01), screenMat, 0, h + 0.12 + tvH / 2, 0.002);
      break;
    }
  }

  return group;
}
