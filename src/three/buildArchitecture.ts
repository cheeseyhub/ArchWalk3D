import * as THREE from 'three';
import { computeBlueprintBounds } from '../arch/blueprint';
import type { SpatialBlueprint } from '../arch/types';
import { decomposeWall } from '../arch/wallGeometry';
import { buildFurnitureGroup, getFurnitureStableKey } from './buildFurniture';
import {
  createFloorMaterial,
  createWallPlasterMaterial,
  type ProceduralTextureSet,
} from './textures';

export interface BuiltArchitecture {
  rootGroup: THREE.Group;
  roofGroup: THREE.Group;
  furnitureGroup: THREE.Group;
  interiorLights: THREE.PointLight[];
  downlightMaterial: THREE.MeshStandardMaterial;
  bounds: ReturnType<typeof computeBlueprintBounds>;
}

/**
 * Safely disposes all unique geometries, materials, and non-shared textures inside a Three.js hierarchy.
 */
export function disposeObject3D(root: THREE.Object3D, sharedTextures?: Set<THREE.Texture>): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();

  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      if (node.geometry && !disposedGeometries.has(node.geometry)) {
        disposedGeometries.add(node.geometry);
        node.geometry.dispose();
      }
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat || disposedMaterials.has(mat)) continue;
        disposedMaterials.add(mat);
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.map && !sharedTextures?.has(mat.map)) mat.map.dispose();
          if (mat.bumpMap && !sharedTextures?.has(mat.bumpMap)) mat.bumpMap.dispose();
          if (mat.normalMap && !sharedTextures?.has(mat.normalMap)) mat.normalMap.dispose();
          if (mat.roughnessMap && !sharedTextures?.has(mat.roughnessMap)) mat.roughnessMap.dispose();
        }
        mat.dispose();
      }
    }
  });
}

interface TreeSharedAssets {
  trunkMat: THREE.MeshStandardMaterial;
  foliageDark: THREE.MeshStandardMaterial;
  foliageLight: THREE.MeshStandardMaterial;
  trunkGeo: THREE.CylinderGeometry;
  crown1Geo: THREE.DodecahedronGeometry;
  crown2Geo: THREE.DodecahedronGeometry;
  crown3Geo: THREE.DodecahedronGeometry;
}

function buildStylizedTree(
  x: number,
  z: number,
  scale: number,
  shared: TreeSharedAssets,
): THREE.Group {
  const tree = new THREE.Group();
  tree.position.set(x, -0.18, z);
  tree.scale.setScalar(scale);

  const trunk = new THREE.Mesh(shared.trunkGeo, shared.trunkMat);
  trunk.position.y = 0.72;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const crown1 = new THREE.Mesh(shared.crown1Geo, shared.foliageDark);
  crown1.position.set(0, 1.95, 0);
  crown1.castShadow = true;
  tree.add(crown1);

  const crown2 = new THREE.Mesh(shared.crown2Geo, shared.foliageLight);
  crown2.position.set(0.45, 2.35, 0.28);
  crown2.castShadow = true;
  tree.add(crown2);

  const crown3 = new THREE.Mesh(shared.crown3Geo, shared.foliageLight);
  crown3.position.set(-0.42, 2.2, -0.22);
  crown3.castShadow = true;
  tree.add(crown3);

  return tree;
}

/**
 * Converts a SpatialBlueprint into a complete, walkable PBR 3D architectural model
 * with grounded site plinth, segmented walls, glass windows, doors, composite furniture,
 * and a toggleable roof + interior ceiling cutaway group.
 */
export function buildArchitectureScene(
  blueprint: SpatialBlueprint,
  textures: ProceduralTextureSet,
  _isSoftwareGl: boolean,
  interactiveStates?: Map<string, boolean>,
): BuiltArchitecture {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'architecture-root';
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-cutaway-group';

  const bounds = computeBlueprintBounds(blueprint);
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();

  // 1. Architectural Site Ground & Foundation Plinth
  const siteSize = Math.max(70, Math.max(bounds.width, bounds.depth) * 6);
  const gridTex = textures.getCachedGroundGrid(siteSize / 4);

  const siteGround = new THREE.Mesh(
    new THREE.PlaneGeometry(siteSize, siteSize),
    new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  siteGround.rotation.x = -Math.PI / 2;
  siteGround.position.y = -0.18;
  siteGround.receiveShadow = true;
  siteGround.name = 'site-ground-grid';
  siteGround.userData.excludeFromExport = true;
  rootGroup.add(siteGround);

  // Subtle architectural stone terrace plinth beneath the building
  const plinthPad = 1.4;
  const plinthMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width + plinthPad * 2, 0.18, bounds.depth + plinthPad * 2),
    new THREE.MeshStandardMaterial({
      color: '#2c3038',
      roughness: 1.0,
      metalness: 0.06,
      normalMap: textures.concrete.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: textures.concrete.roughnessMap,
    }),
  );
  plinthMesh.position.set(bounds.centerX, -0.09, bounds.centerZ);
  plinthMesh.receiveShadow = true;
  rootGroup.add(plinthMesh);

  // Architectural site context trees sharing geometries & materials
  const treeAssets: TreeSharedAssets = {
    trunkMat: new THREE.MeshStandardMaterial({ color: '#4d3a2c', roughness: 0.9 }),
    foliageDark: new THREE.MeshStandardMaterial({ color: '#39533f', roughness: 0.82 }),
    foliageLight: new THREE.MeshStandardMaterial({ color: '#4c6a50', roughness: 0.78 }),
    trunkGeo: new THREE.CylinderGeometry(0.11, 0.17, 1.45, 8),
    crown1Geo: new THREE.DodecahedronGeometry(0.95, 1),
    crown2Geo: new THREE.DodecahedronGeometry(0.72, 1),
    crown3Geo: new THREE.DodecahedronGeometry(0.65, 1),
  };
  const treeOffsetX = bounds.width / 2 + 4.4;
  const treeOffsetZ = bounds.depth / 2 + 3.8;
  const treeCoords: Array<[number, number, number]> = [
    [bounds.centerX - treeOffsetX, bounds.centerZ - treeOffsetZ * 0.7, 1.15],
    [bounds.centerX - treeOffsetX * 0.85, bounds.centerZ + treeOffsetZ * 0.9, 0.95],
    [bounds.centerX + treeOffsetX, bounds.centerZ - treeOffsetZ * 0.65, 1.05],
    [bounds.centerX + treeOffsetX * 0.95, bounds.centerZ + treeOffsetZ * 0.85, 1.2],
  ];
  for (const [tx, tz, sc] of treeCoords) {
    rootGroup.add(buildStylizedTree(tx, tz, sc, treeAssets));
  }

  // 2. Room Floors (offset at y = 0.01 to avoid coplanar Z-fighting with plinth)
  for (const room of blueprint.rooms) {
    const floorMat = createFloorMaterial(
      room.floorMaterial,
      room.floorColor,
      room.width,
      room.depth,
      textures,
      materialCache,
    );
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      floorMat,
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(room.x, 0.01, room.z);
    floorMesh.receiveShadow = true;
    floorMesh.name = `floor-${room.id}`;
    rootGroup.add(floorMesh);
  }

  // Shared trim, frame, and reflective glass materials (no expensive transmission pass)
  const windowFrameMat = new THREE.MeshStandardMaterial({
    color: '#252930',
    roughness: 0.36,
    metalness: 0.65,
  });
  const doorFrameMat = new THREE.MeshStandardMaterial({
    color: '#46372b',
    roughness: 0.54,
    metalness: 0.06,
  });
  const doorPanelMat = new THREE.MeshStandardMaterial({
    color: '#7a5a3d',
    roughness: 0.48,
    metalness: 0.05,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: '#d4a76a',
    roughness: 0.24,
    metalness: 0.9,
  });
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: '#d6d2c9',
    roughness: 0.65,
    metalness: 0.03,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#cde2f0',
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    metalness: 0.2,
    envMapIntensity: 1.5,
    depthWrite: false,
  });

  // 3. Segmented Walls, Baseboards, Doorways & Windows
  for (const wall of blueprint.walls) {
    const decomp = decomposeWall(wall);
    if (decomp.length < 0.05) continue;

    const wallGroup = new THREE.Group();
    wallGroup.name = `wall-${wall.id}`;
    wallGroup.position.set(wall.x1, 0, wall.z1);
    wallGroup.rotation.y = -decomp.angle;

    const wallMat = createWallPlasterMaterial(
      wall.color,
      decomp.length,
      wall.height,
      textures,
      materialCache,
    );

    for (const seg of decomp.segments) {
      const segMesh = new THREE.Mesh(
        new THREE.BoxGeometry(seg.uLength, seg.yHeight, wall.thickness),
        wallMat,
      );
      segMesh.position.set(seg.uCenter, seg.yCenter, 0);
      segMesh.castShadow = true;
      segMesh.receiveShadow = true;
      wallGroup.add(segMesh);

      // Architectural skirting baseboard along floor-touching piers and sills
      if (seg.kind === 'pier' || seg.kind === 'sill') {
        const skirtH = 0.09;
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(seg.uLength, skirtH, wall.thickness + 0.024),
          baseboardMat,
        );
        skirt.position.set(seg.uCenter, skirtH / 2 + 0.01, 0);
        skirt.receiveShadow = true;
        wallGroup.add(skirt);
      }
    }

    // Build detailed 3D frames for every door and window opening
    for (const op of decomp.openings) {
      const cx = op.start + op.width / 2;
      const frameDepth = wall.thickness + 0.036;

      if (op.type === 'window') {
        const frameT = 0.055;
        // Left & right vertical jambs
        for (const sx of [-1, 1]) {
          const jamb = new THREE.Mesh(
            new THREE.BoxGeometry(frameT, op.height, frameDepth),
            windowFrameMat,
          );
          jamb.position.set(cx + sx * (op.width / 2 - frameT / 2), op.sillHeight + op.height / 2, 0);
          jamb.castShadow = true;
          wallGroup.add(jamb);
        }
        // Top header frame
        const topFrame = new THREE.Mesh(
          new THREE.BoxGeometry(op.width, frameT, frameDepth),
          windowFrameMat,
        );
        topFrame.position.set(cx, op.sillHeight + op.height - frameT / 2, 0);
        wallGroup.add(topFrame);

        // Extended architectural window sill ledge
        const sillLedge = new THREE.Mesh(
          new THREE.BoxGeometry(op.width + 0.08, frameT * 1.15, frameDepth + 0.05),
          windowFrameMat,
        );
        sillLedge.position.set(cx, op.sillHeight + frameT / 2, 0);
        sillLedge.castShadow = true;
        wallGroup.add(sillLedge);

        // Center vertical mullion for wider windows
        if (op.width >= 1.35) {
          const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(0.036, op.height - frameT * 2, frameDepth * 0.72),
            windowFrameMat,
          );
          mullion.position.set(cx, op.sillHeight + op.height / 2, 0);
          wallGroup.add(mullion);
        }

        // Glazed architectural glass pane
        const glassPane = new THREE.Mesh(
          new THREE.BoxGeometry(op.width - frameT * 1.6, op.height - frameT * 1.6, 0.018),
          glassMat,
        );
        glassPane.position.set(cx, op.sillHeight + op.height / 2, 0);
        glassPane.renderOrder = 2;
        wallGroup.add(glassPane);
      } else {
        // Doorway frame (jambs + header + threshold) leaving clear walkable opening
        const jambT = 0.065;
        for (const sx of [-1, 1]) {
          const jamb = new THREE.Mesh(
            new THREE.BoxGeometry(jambT, op.height, frameDepth),
            doorFrameMat,
          );
          jamb.position.set(cx + sx * (op.width / 2 - jambT / 2), op.height / 2, 0);
          jamb.castShadow = true;
          wallGroup.add(jamb);
        }
        const header = new THREE.Mesh(
          new THREE.BoxGeometry(op.width + 0.04, jambT, frameDepth),
          doorFrameMat,
        );
        header.position.set(cx, op.height - jambT / 2, 0);
        wallGroup.add(header);

        // Subtle metallic door threshold strip
        const threshold = new THREE.Mesh(
          new THREE.BoxGeometry(op.width - jambT * 2, 0.014, wall.thickness + 0.02),
          windowFrameMat,
        );
        threshold.position.set(cx, 0.015, 0);
        wallGroup.add(threshold);

        // For standard single doors (width <= 1.25m), add a stylish door leaf swung open inward
        // so it reads unmistakably as an architectural door while staying walkable
        if (op.width <= 1.25) {
          const leafW = op.width - jambT * 2 - 0.02;
          const leafH = op.height - jambT - 0.02;
          const hingeGroup = new THREE.Group();
          hingeGroup.position.set(op.start + jambT, 0.015, 0);
          hingeGroup.rotation.y = Math.PI * 0.42;

          const leaf = new THREE.Mesh(
            new THREE.BoxGeometry(leafW, leafH, 0.042),
            doorPanelMat,
          );
          leaf.position.set(leafW / 2, leafH / 2, 0);
          leaf.castShadow = true;
          leaf.receiveShadow = true;
          hingeGroup.add(leaf);

          // Brass lever handle on both sides
          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.11, 0.022, 0.11),
            handleMat,
          );
          handle.position.set(leafW - 0.1, 1.0, 0);
          hingeGroup.add(handle);

          wallGroup.add(hingeGroup);
        }
      }
    }

    rootGroup.add(wallGroup);
  }

  // 4. Composite Procedural Furniture (isolated group for fast interactive edits)
  const furnitureGroup = new THREE.Group();
  furnitureGroup.name = 'furniture-root-group';
  for (let i = 0; i < blueprint.furniture.length; i++) {
    const item = blueprint.furniture[i];
    const key = getFurnitureStableKey(item, i);
    const fGroup = buildFurnitureGroup(item, textures, {
      index: i,
      initialActive: interactiveStates?.get(key),
    });
    furnitureGroup.add(fGroup);
  }
  rootGroup.add(furnitureGroup);

  // 5. Roof & Interior Ceiling Cutaway Group
  const wallH = bounds.maxWallHeight;
  const overhang = blueprint.roof.overhang;
  const roofW = bounds.width + overhang * 2;
  const roofD = bounds.depth + overhang * 2;

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: '#eceae4',
    roughness: 0.9,
    metalness: 0.01,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blueprint.roof.color),
    map: textures.roof.map,
    normalMap: textures.roof.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: textures.roof.roughnessMap,
    roughness: 1.0,
    metalness: 0.24,
  });
  const fasciaMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(blueprint.roof.color).multiplyScalar(0.68),
    roughness: 0.44,
    metalness: 0.38,
  });

  // Interior ceiling slab tucked strictly inside exterior wall perimeter so it never pokes out
  const ceilingSlab = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.5, bounds.width - 0.08), 0.07, Math.max(0.5, bounds.depth - 0.08)),
    ceilingMat,
  );
  ceilingSlab.position.set(bounds.centerX, wallH - 0.02, bounds.centerZ);
  ceilingSlab.receiveShadow = true;
  roofGroup.add(ceilingSlab);

  const downlightMat = new THREE.MeshStandardMaterial({
    color: '#fff6e5',
    emissive: new THREE.Color('#ffdfa8'),
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });

  // Add subtle ceiling downlight rings per room + cap warm interior PointLights at 4
  const largestRooms = [...blueprint.rooms]
    .sort((a, b) => b.width * b.depth - a.width * a.depth)
    .slice(0, 4);
  const litRoomIds = new Set(largestRooms.map((r) => r.id));
  const interiorLights: THREE.PointLight[] = [];

  for (const room of blueprint.rooms) {
    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.025, 16),
      downlightMat,
    );
    fixture.position.set(room.x, wallH - 0.06, room.z);
    roofGroup.add(fixture);

    if (litRoomIds.has(room.id)) {
      const interiorLight = new THREE.PointLight(0xfff0d4, 1.05, 12, 1.6);
      interiorLight.castShadow = false;
      interiorLight.position.set(room.x, wallH - 0.35, room.z);
      rootGroup.add(interiorLight);
      interiorLights.push(interiorLight);
    }
  }

  if (blueprint.roof.style === 'gabled') {
    // Orient ridge along the longer building axis with sleek modern pitch (~17 deg)
    const ridgeAlongX = bounds.width >= bounds.depth;
    const span = ridgeAlongX ? roofD : roofW;
    const run = ridgeAlongX ? roofW : roofD;
    const ridgeHeight = Math.min(2.05, Math.max(1.05, span * 0.165));
    const halfSpan = span / 2;
    const slopeLen = Math.hypot(halfSpan, ridgeHeight) + 0.14;
    const slopeAngle = Math.atan2(ridgeHeight, halfSpan);
    const roofThick = 0.15;

    const gableSubGroup = new THREE.Group();
    gableSubGroup.position.set(bounds.centerX, wallH, bounds.centerZ);
    if (!ridgeAlongX) {
      gableSubGroup.rotation.y = Math.PI / 2;
    }

    // Two pitched roof slopes meeting seamlessly at the ridge
    for (const side of [-1, 1]) {
      const slopeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(run, roofThick, slopeLen),
        roofMat,
      );
      slopeMesh.position.set(0, ridgeHeight / 2 + 0.02, (side * halfSpan) / 2);
      slopeMesh.rotation.x = side * slopeAngle;
      slopeMesh.castShadow = true;
      slopeMesh.receiveShadow = true;
      gableSubGroup.add(slopeMesh);

      // Architectural eave fascia strip along lower gutter edge
      const eaveTrim = new THREE.Mesh(
        new THREE.BoxGeometry(run + 0.04, 0.16, 0.06),
        fasciaMat,
      );
      eaveTrim.position.set(0, 0.01, side * halfSpan);
      gableSubGroup.add(eaveTrim);
    }

    // Crisp ridge beam cap
    const ridgeCap = new THREE.Mesh(
      new THREE.BoxGeometry(run + 0.06, 0.14, 0.24),
      fasciaMat,
    );
    ridgeCap.position.set(0, ridgeHeight + 0.09, 0);
    gableSubGroup.add(ridgeCap);

    // Flush triangular gable end infill walls aligned cleanly to both exterior ends
    const innerHalfSpan = (ridgeAlongX ? bounds.depth : bounds.width) / 2 + 0.12;
    const gableWallH = ridgeHeight + 0.02;
    const triShape = new THREE.Shape();
    triShape.moveTo(-innerHalfSpan, 0);
    triShape.lineTo(innerHalfSpan, 0);
    triShape.lineTo(0, gableWallH);
    triShape.closePath();

    const gableWallGeo = new THREE.ExtrudeGeometry(triShape, {
      depth: 0.24,
      bevelEnabled: false,
    });
    // Center extrusion around Z = 0 so both West and East gable walls sit symmetrically flush
    gableWallGeo.translate(0, 0, -0.12);

    const gableWallMat = createWallPlasterMaterial(
      blueprint.walls[0]?.color ?? '#ece8e0',
      innerHalfSpan * 2,
      gableWallH,
      textures,
      materialCache,
    );

    const endOffset = (ridgeAlongX ? bounds.width : bounds.depth) / 2;
    for (const sx of [-1, 1]) {
      const gableEnd = new THREE.Mesh(gableWallGeo, gableWallMat);
      gableEnd.rotation.y = Math.PI / 2;
      gableEnd.position.set(sx * endOffset, 0, 0);
      gableEnd.castShadow = true;
      gableEnd.receiveShadow = true;
      gableSubGroup.add(gableEnd);
    }

    roofGroup.add(gableSubGroup);
  } else {
    // Modern flat architectural roof with overhang soffit & parapet coping
    const roofDeck = new THREE.Mesh(
      new THREE.BoxGeometry(roofW, 0.22, roofD),
      roofMat,
    );
    roofDeck.position.set(bounds.centerX, wallH + 0.16, bounds.centerZ);
    roofDeck.castShadow = true;
    roofDeck.receiveShadow = true;
    roofGroup.add(roofDeck);

    // Crisp parapet rim around perimeter
    const rimH = 0.24;
    const rimT = 0.14;
    const rimY = wallH + 0.27 + rimH / 2;
    const northRim = new THREE.Mesh(new THREE.BoxGeometry(roofW, rimH, rimT), fasciaMat);
    northRim.position.set(bounds.centerX, rimY, bounds.centerZ - roofD / 2 + rimT / 2);
    roofGroup.add(northRim);

    const southRim = new THREE.Mesh(new THREE.BoxGeometry(roofW, rimH, rimT), fasciaMat);
    southRim.position.set(bounds.centerX, rimY, bounds.centerZ + roofD / 2 - rimT / 2);
    roofGroup.add(southRim);

    const westRim = new THREE.Mesh(new THREE.BoxGeometry(rimT, rimH, roofD - rimT * 2), fasciaMat);
    westRim.position.set(bounds.centerX - roofW / 2 + rimT / 2, rimY, bounds.centerZ);
    roofGroup.add(westRim);

    const eastRim = new THREE.Mesh(new THREE.BoxGeometry(rimT, rimH, roofD - rimT * 2), fasciaMat);
    eastRim.position.set(bounds.centerX + roofW / 2 - rimT / 2, rimY, bounds.centerZ);
    roofGroup.add(eastRim);
  }

  rootGroup.add(roofGroup);

  return {
    rootGroup,
    roofGroup,
    furnitureGroup,
    interiorLights,
    downlightMaterial: downlightMat,
    bounds,
  };
}
