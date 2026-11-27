import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Generates a clean, filesystem-safe .gltf filename from the blueprint's name.
 */
export function buildGltfFilename(modelName: string): string {
  const slug = modelName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return `${slug || 'archwalk-3d-model'}.gltf`;
}

function cloneNodeForExport(node: THREE.Object3D): THREE.Object3D | null {
  if (node.userData?.excludeFromExport) {
    return null;
  }

  // Shallow clone preserves transforms and shares geometry/material without mutating the live scene
  const cloned = node.clone(false);
  cloned.visible = true;
  if (cloned instanceof THREE.PointLight || cloned instanceof THREE.SpotLight) {
    cloned.decay = 2;
  }

  for (const child of node.children) {
    const clonedChild = cloneNodeForExport(child);
    if (clonedChild) {
      cloned.add(clonedChild);
    }
  }

  return cloned;
}

/**
 * Builds a clean temporary export hierarchy from the active architectural root group,
 * omitting infinite studio backdrop planes while keeping walls, floors, roof, and furniture.
 */
export function createExportableGroup(
  archGroup: THREE.Object3D,
  modelName: string,
): THREE.Group {
  archGroup.updateMatrixWorld(true);

  const wrapper = new THREE.Group();
  wrapper.name = modelName.trim() || 'ArchWalk3DModel';

  for (const child of archGroup.children) {
    const clonedChild = cloneNodeForExport(child);
    if (clonedChild) {
      wrapper.add(clonedChild);
    }
  }

  wrapper.updateMatrixWorld(true);
  return wrapper;
}

/**
 * Serializes the given Three.js architectural group into a self-contained glTF 2.0 JSON object.
 */
export async function exportArchitectureToGltfJson(
  archGroup: THREE.Object3D,
  modelName: string,
): Promise<Record<string, unknown>> {
  const exportGroup = createExportableGroup(archGroup, modelName);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(exportGroup, {
    binary: false,
    onlyVisible: false,
  });

  if (result instanceof ArrayBuffer) {
    throw new Error('Unexpected binary buffer returned for JSON GLTF export.');
  }

  return result as Record<string, unknown>;
}

/**
 * Exports the active 3D architectural model to a self-contained .gltf file and triggers a browser download.
 */
export async function downloadArchitectureGltf(
  archGroup: THREE.Object3D,
  modelName: string,
): Promise<string> {
  const gltfJson = await exportArchitectureToGltfJson(archGroup, modelName);
  const filename = buildGltfFilename(modelName);
  const serialized = JSON.stringify(gltfJson, null, 2);
  const blob = new Blob([serialized], { type: 'model/gltf+json' });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return filename;
}
