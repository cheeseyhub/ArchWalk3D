import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildGltfFilename,
  createExportableGroup,
  exportArchitectureToGltfJson,
} from './exportGltf';

test('buildGltfFilename produces safe lowercase slugs with .gltf extension', () => {
  assert.equal(buildGltfFilename('Cedar Courtyard Residence'), 'cedar-courtyard-residence.gltf');
  assert.equal(buildGltfFilename('  Modern 2-BR / Loft #4!  '), 'modern-2-br-loft-4.gltf');
  assert.equal(buildGltfFilename('   '), 'archwalk-3d-model.gltf');
  assert.ok(buildGltfFilename('A'.repeat(120)).length <= 69);
});

test('createExportableGroup filters excluded studio backdrop while preserving hidden roof & geometry', () => {
  const root = new THREE.Group();
  root.name = 'architecture-root';

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial());
  backdrop.name = 'site-ground-grid';
  backdrop.userData.excludeFromExport = true;
  root.add(backdrop);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), new THREE.MeshStandardMaterial({ color: '#ece8e0' }));
  wall.name = 'wall-north';
  root.add(wall);

  const roof = new THREE.Group();
  roof.name = 'roof-cutaway-group';
  roof.visible = false; // Cutaway active in viewport
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshStandardMaterial({ color: '#383e47' }));
  slab.name = 'roof-slab';
  roof.add(slab);
  root.add(roof);

  const exportable = createExportableGroup(root, 'Test House');
  const names: string[] = [];
  exportable.traverse((obj) => {
    if (obj.name) names.push(obj.name);
  });

  assert.ok(!names.includes('site-ground-grid'), 'Backdrop grid must be omitted from export');
  assert.ok(names.includes('wall-north'), 'Wall mesh must be included');
  assert.ok(names.includes('roof-slab'), 'Roof geometry must be included even during cutaway');
  assert.equal(roof.visible, false, 'Live scene roof visibility must remain untouched');
});

test('exportArchitectureToGltfJson generates a valid glTF 2.0 asset with meshes and embedded buffers', async () => {
  const originalFileReader = globalThis.FileReader;
  if (typeof globalThis.FileReader === 'undefined') {
    class NodeFileReader {
      result: string | ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((buf) => {
          const b64 = Buffer.from(buf).toString('base64');
          const mime = blob.type || 'application/octet-stream';
          this.result = `data:${mime};base64,${b64}`;
          this.onloadend?.();
        });
      }
    }
    (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
  }

  try {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.1, 4),
      new THREE.MeshStandardMaterial({ color: '#b7885a', roughness: 0.6 }),
    );
    floor.name = 'floor-living';
    root.add(floor);

    const chair = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: '#5b3f2b', roughness: 0.5 }),
    );
    chair.name = 'furniture-chair';
    chair.position.set(1, 0.4, -0.5);
    root.add(chair);

    const gltf = await exportArchitectureToGltfJson(root, 'Sunlit Studio');
    const asset = gltf.asset as { version?: string } | undefined;
    const meshes = gltf.meshes as unknown[] | undefined;
    const buffers = gltf.buffers as Array<{ uri?: string; byteLength?: number }> | undefined;

    assert.equal(asset?.version, '2.0');
    assert.ok(Array.isArray(meshes) && meshes.length === 2, 'Expected 2 exported glTF meshes');
    assert.ok(
      Array.isArray(buffers) &&
        buffers.length >= 1 &&
        typeof buffers[0].uri === 'string' &&
        buffers[0].uri.startsWith('data:application/octet-stream;base64,'),
      'glTF JSON should embed geometry buffers as base64 data URIs',
    );
  } finally {
    if (typeof originalFileReader === 'undefined') {
      delete (globalThis as unknown as { FileReader?: unknown }).FileReader;
    } else {
      globalThis.FileReader = originalFileReader;
    }
  }
});
