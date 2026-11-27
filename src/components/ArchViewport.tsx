import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { computeBlueprintBounds, getRoomCameraPose } from '../arch/blueprint';
import {
  classifyFurnitureItemDiff,
  computeSeatCameraPose,
  getFurnitureDisplayLabel,
  getFurnitureInteractionDescriptor,
} from '../arch/blueprintHistory';
import { buildWallColliders, resolvePlayerCollision, type SolidWallCollider } from '../arch/collision';
import { snapPlacementPosition } from '../arch/furnitureCatalog';
import type {
  BlueprintBounds,
  BlueprintFurniture,
  CameraMode,
  GeneratedFurnitureAsset,
  HoveredFurnitureInfo,
  LightingPreset,
  RenderQuality,
  SpatialBlueprint,
} from '../arch/types';
import { buildArchitectureScene, disposeObject3D } from '../three/buildArchitecture';
import {
  applyFurnitureColorInPlace,
  applyFurniturePreviewScale,
  applyFurnitureTransformInPlace,
  buildFurnitureGroup,
  buildFurniturePlacementGhost,
  buildSelectionRing,
  getFurnitureStableKey,
  type InteractiveFurnitureController,
} from '../three/buildFurniture';
import { downloadArchitectureGltf } from '../three/exportGltf';
import { computeTightShadowFrustum, getLightingPresetConfig } from '../three/lightingPresets';
import { createProceduralTextureSet, type ProceduralTextureSet } from '../three/textures';

export interface TeleportRequest {
  roomId: string;
  nonce: number;
}

export type FurniturePreviewPatch = Partial<
  Pick<BlueprintFurniture, 'x' | 'z' | 'rotationY' | 'width' | 'depth' | 'height' | 'color'>
>;

export interface ArchViewportHandle {
  exportGltf: () => Promise<string>;
  getViewportSpawnCenter: () => { x: number; z: number };
  previewFurnitureEdit: (index: number, patch: FurniturePreviewPatch) => void;
}

interface ArchViewportProps {
  blueprint: SpatialBlueprint;
  cameraMode: CameraMode;
  showRoof: boolean;
  lightingPreset: LightingPreset;
  renderQuality: RenderQuality;
  teleportRequest: TeleportRequest | null;
  resetNonce: number;
  placingAsset: GeneratedFurnitureAsset | null;
  placementRotationY: number;
  arrangeMode: boolean;
  selectedFurnitureIndex: number | null;
  onPlaceFurniture: (x: number, z: number, rotationY: number) => void;
  onRotatePlacement: () => void;
  onCancelPlacement: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onActiveRoomChange: (roomId: string | null) => void;
  onSelectFurniture: (index: number | null) => void;
  onCommitMoveFurniture: (index: number, x: number, z: number) => void;
  onHoveredInteractionChange: (info: HoveredFurnitureInfo | null) => void;
  onSeatedChange: (seated: boolean) => void;
  onRotateSelected: (deltaRadians: number) => void;
  onDeleteSelected: () => void;
}

interface CameraFlight {
  active: boolean;
  targetPos: THREE.Vector3;
  targetLook: THREE.Vector3;
  endMode: CameraMode;
}

// Reusable scratch math objects to prevent GC allocations inside render ticks
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _up = new THREE.Vector3(0, 1, 0);
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.01);
const _hitPoint = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const ArchViewport = forwardRef<ArchViewportHandle, ArchViewportProps>(function ArchViewport(
  {
    blueprint,
    cameraMode,
    showRoof,
    lightingPreset,
    renderQuality,
    teleportRequest,
    resetNonce,
    placingAsset,
    placementRotationY,
    arrangeMode,
    selectedFurnitureIndex,
    onPlaceFurniture,
    onRotatePlacement,
    onCancelPlacement,
    onPointerLockChange,
    onActiveRoomChange,
    onSelectFurniture,
    onCommitMoveFurniture,
    onHoveredInteractionChange,
    onSeatedChange,
    onRotateSelected,
    onDeleteSelected,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<'default' | 'pointer' | 'move'>('default');
  const [isSeatedAttr, setIsSeatedAttr] = useState(false);
  const sceneRebuildCountRef = useRef(0);

  // Store latest React props & callbacks in refs so the WebGL lifecycle mounts once
  const blueprintRef = useRef(blueprint);
  blueprintRef.current = blueprint;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const showRoofRef = useRef(showRoof);
  showRoofRef.current = showRoof;
  const lightingPresetRef = useRef(lightingPreset);
  lightingPresetRef.current = lightingPreset;
  const renderQualityRef = useRef(renderQuality);
  renderQualityRef.current = renderQuality;
  const placingAssetRef = useRef(placingAsset);
  placingAssetRef.current = placingAsset;
  const placementRotationRef = useRef(placementRotationY);
  placementRotationRef.current = placementRotationY;
  const arrangeModeRef = useRef(arrangeMode);
  arrangeModeRef.current = arrangeMode;
  const selectedFurnitureIndexRef = useRef(selectedFurnitureIndex);
  selectedFurnitureIndexRef.current = selectedFurnitureIndex;
  const onPlaceFurnitureRef = useRef(onPlaceFurniture);
  onPlaceFurnitureRef.current = onPlaceFurniture;
  const onRotatePlacementRef = useRef(onRotatePlacement);
  onRotatePlacementRef.current = onRotatePlacement;
  const onCancelPlacementRef = useRef(onCancelPlacement);
  onCancelPlacementRef.current = onCancelPlacement;
  const onPointerLockRef = useRef(onPointerLockChange);
  onPointerLockRef.current = onPointerLockChange;
  const onActiveRoomRef = useRef(onActiveRoomChange);
  onActiveRoomRef.current = onActiveRoomChange;
  const onSelectFurnitureRef = useRef(onSelectFurniture);
  onSelectFurnitureRef.current = onSelectFurniture;
  const onCommitMoveFurnitureRef = useRef(onCommitMoveFurniture);
  onCommitMoveFurnitureRef.current = onCommitMoveFurniture;
  const onHoveredInteractionRef = useRef(onHoveredInteractionChange);
  onHoveredInteractionRef.current = onHoveredInteractionChange;
  const onSeatedChangeRef = useRef(onSeatedChange);
  onSeatedChangeRef.current = onSeatedChange;
  const onRotateSelectedRef = useRef(onRotateSelected);
  onRotateSelectedRef.current = onRotateSelected;
  const onDeleteSelectedRef = useRef(onDeleteSelected);
  onDeleteSelectedRef.current = onDeleteSelected;

  // Engine internals ref
  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    textures: ProceduralTextureSet;
    sharedTexturesSet: Set<THREE.Texture>;
    isSoftwareGl: boolean;
    archGroup: THREE.Group | null;
    roofGroup: THREE.Group | null;
    furnitureGroup: THREE.Group | null;
    furnitureItems: BlueprintFurniture[];
    furnitureRaycastTargets: THREE.Object3D[];
    interactiveRaycastTargets: THREE.Object3D[];
    interactiveControllers: InteractiveFurnitureController[];
    interactiveStates: Map<string, boolean>;
    selectionRing: THREE.Group | null;
    selectionRingBaseSize: { width: number; depth: number };
    interiorLights: THREE.PointLight[];
    downlightMaterial: THREE.MeshStandardMaterial | null;
    ghostGroup: THREE.Group | null;
    bounds: BlueprintBounds;
    lastHoverPos: { x: number; z: number } | null;
    colliders: SolidWallCollider[];
    flight: CameraFlight;
    yaw: number;
    pitch: number;
    isSeated: boolean;
    standPosition: THREE.Vector3;
    requestRender: () => void;
    markShadowsDirty: () => void;
    rebuildBlueprint: (bp: SpatialBlueprint, snapCamera: boolean) => void;
    syncFurnitureInPlace: (items: BlueprintFurniture[]) => void;
    previewFurnitureEdit: (index: number, patch: FurniturePreviewPatch) => void;
    syncPlacementGhost: (asset: GeneratedFurnitureAsset | null, rotY: number) => void;
    syncGhostRotation: (rotY: number) => void;
    syncSelectionRing: (enabled: boolean, index: number | null, items: BlueprintFurniture[]) => void;
    flyToDollhouse: (bp: SpatialBlueprint, immediate?: boolean) => void;
    flyToRoom: (roomId: string, bp: SpatialBlueprint) => void;
    applyRoofVisibility: (visible: boolean) => void;
    applyLightingPreset: (preset: LightingPreset) => void;
    applyRenderQuality: (quality: RenderQuality) => void;
    syncMode: (mode: CameraMode) => void;
    clearHoverState: () => void;
  } | null>(null);

  // Mount Three.js renderer, scene, lights, and input handlers ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const initialLighting = getLightingPresetConfig(lightingPresetRef.current);
    const initialHighQuality = renderQualityRef.current === 'high' && !isSoftwareGl;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialLighting.backgroundHex);
    scene.fog = new THREE.FogExp2(initialLighting.fogHex, initialLighting.fogDensity);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.08, 180);
    camera.position.set(13, 11.5, 13);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = initialLighting.toneMappingExposure;
    // Cap pixel ratio at 1.5x on GPUs (1.0x on software WebGL) for locked 60 FPS
    const getCappedPixelRatio = () => (isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    const targetPixelRatio = getCappedPixelRatio();
    renderer.setPixelRatio(targetPixelRatio);
    renderer.setSize(width, height);
    // On-demand shadow map updates: zero per-frame shadow re-rendering while camera orbits/walks
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = !isSoftwareGl;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const markShadowsDirty = () => {
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.needsUpdate = true;
      }
    };

    // Studio IBL reflections & indirect bounce light via PMREMGenerator + RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    scene.environment = envTarget.texture;
    scene.environmentIntensity = initialLighting.environmentIntensity;
    pmremGenerator.dispose();

    // Balanced 3-point warm/cool architectural lighting rig (ONLY primary sunlight casts shadows)
    const hemiLight = new THREE.HemisphereLight(
      initialLighting.hemiSkyHex,
      initialLighting.hemiGroundHex,
      initialLighting.hemiIntensity,
    );
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      initialLighting.sunColorHex,
      initialLighting.sunIntensity,
    );
    keyLight.position.set(...initialLighting.sunPosition);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1.5;
    keyLight.shadow.camera.far = 65;
    const initialFrustum = computeTightShadowFrustum(computeBlueprintBounds(blueprintRef.current));
    keyLight.shadow.camera.left = initialFrustum.left;
    keyLight.shadow.camera.right = initialFrustum.right;
    keyLight.shadow.camera.top = initialFrustum.top;
    keyLight.shadow.camera.bottom = initialFrustum.bottom;
    keyLight.shadow.bias = -0.00045;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = 2.0;
    keyLight.target.position.set(initialFrustum.targetX, 0, initialFrustum.targetZ);
    scene.add(keyLight.target);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      initialLighting.rimColorHex,
      initialLighting.rimIntensity,
    );
    rimLight.castShadow = false;
    rimLight.position.set(...initialLighting.rimPosition);
    scene.add(rimLight);

    // Lazily initialized post-processing composer (GTAO ambient occlusion) ONLY when Quality: High is active
    let composer: EffectComposer | null = null;
    let gtaoPass: GTAOPass | null = null;
    const ensureComposer = () => {
      if (isSoftwareGl || composer) return;
      const cw = Math.max(1, container.clientWidth);
      const ch = Math.max(1, container.clientHeight);
      const dpr = getCappedPixelRatio();
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(dpr);
      composer.setSize(cw, ch);

      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      gtaoPass = new GTAOPass(scene, camera, cw, ch);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.blendIntensity = 0.62;
      gtaoPass.updateGtaoMaterial({
        radius: 0.42,
        distanceExponent: 1.5,
        thickness: 1.0,
        scale: 1.05,
        samples: 12,
      });
      gtaoPass.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 6,
        samples: 12,
      });
      composer.addPass(gtaoPass);

      const outputPass = new OutputPass();
      composer.addPass(outputPass);
    };
    if (initialHighQuality) {
      ensureComposer();
    }

    // OrbitControls for Dollhouse inspection
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 2.5;
    controls.maxDistance = 65;
    controls.target.set(0, 1.1, 0);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextureSet(maxAniso);
    const sharedTexturesSet = textures.allSharedTextures;

    // First-person input & frame pacing state
    const keysPressed = new Set<string>();
    let isDraggingLook = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let isPointerLocked = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastFrameTime = performance.now();
    let disposed = false;

    const flight: CameraFlight = {
      active: false,
      targetPos: new THREE.Vector3(),
      targetLook: new THREE.Vector3(),
      endMode: 'orbit',
    };

    const syncYawPitchFromCamera = () => {
      _euler.setFromQuaternion(camera.quaternion, 'YXZ');
      if (engineRef.current) {
        engineRef.current.yaw = _euler.y;
        engineRef.current.pitch = THREE.MathUtils.clamp(_euler.x, -Math.PI * 0.44, Math.PI * 0.44);
      }
    };

    const hasActiveDoorAnimation = (): boolean => {
      const eng = engineRef.current;
      if (!eng) return false;
      for (const ctrl of eng.interactiveControllers) {
        if (!ctrl.doorPivots) continue;
        for (const dp of ctrl.doorPivots) {
          const targetY = ctrl.isActive ? dp.openY : dp.closedY;
          if (Math.abs(dp.pivot.rotation.y - targetY) > 0.004) {
            return true;
          }
        }
      }
      return false;
    };

    const hasActiveMotion = (): boolean => {
      if (flight.active) return true;
      if (hasActiveDoorAnimation()) return true;
      if (cameraModeRef.current === 'walk' && keysPressed.size > 0) return true;
      return false;
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    // Walk Mode center-screen hover probe callback (assigned after raycast helpers are initialized)
    let updateWalkHoverIfNeeded: ((force?: boolean) => void) | null = null;

    const stepSimulation = (dt: number) => {
      const eng = engineRef.current;
      if (!eng) return;

      // Smoothly animate hinged fridge & wardrobe doors toward target open/closed angle
      const doorLambda = isSoftwareGl ? 16 : 9.5;
      const doorAlpha = 1 - Math.exp(-doorLambda * dt);
      let doorAnimated = false;
      for (const ctrl of eng.interactiveControllers) {
        if (!ctrl.doorPivots) continue;
        for (const dp of ctrl.doorPivots) {
          const targetY = ctrl.isActive ? dp.openY : dp.closedY;
          const diff = targetY - dp.pivot.rotation.y;
          if (Math.abs(diff) <= 0.004) {
            if (dp.pivot.rotation.y !== targetY) {
              dp.pivot.rotation.y = targetY;
              doorAnimated = true;
            }
          } else {
            dp.pivot.rotation.y += diff * doorAlpha;
            doorAnimated = true;
          }
        }
      }
      if (doorAnimated) {
        markShadowsDirty();
      }

      if (flight.active) {
        const lambda = isSoftwareGl ? 14 : 7.5;
        const alpha = 1 - Math.exp(-lambda * dt);
        camera.position.lerp(flight.targetPos, alpha);

        if (flight.endMode === 'orbit') {
          controls.target.lerp(flight.targetLook, alpha);
          controls.update();
        } else {
          _lookTarget.copy(flight.targetLook);
          camera.lookAt(_lookTarget);
          syncYawPitchFromCamera();
        }

        const posDone = camera.position.distanceTo(flight.targetPos) < 0.04;
        const lookDone =
          flight.endMode === 'walk' ||
          controls.target.distanceTo(flight.targetLook) < 0.04;

        if (posDone && lookDone) {
          camera.position.copy(flight.targetPos);
          if (flight.endMode === 'orbit') {
            controls.target.copy(flight.targetLook);
            controls.update();
          } else {
            camera.lookAt(flight.targetLook);
            syncYawPitchFromCamera();
          }
          flight.active = false;
          if (cameraModeRef.current === 'walk') {
            updateWalkHoverIfNeeded?.(true);
          }
        }
        return;
      }

      if (cameraModeRef.current === 'walk') {
        // Apply current yaw & pitch
        _euler.set(eng.pitch, eng.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(_euler);

        // Compute horizontal movement vector from WASD / Arrow keys
        let moveZ = 0;
        let moveX = 0;
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) moveZ += 1;
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) moveZ -= 1;
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) moveX += 1;
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) moveX -= 1;

        if ((moveX !== 0 || moveZ !== 0) && !eng.isSeated) {
          camera.getWorldDirection(_forward);
          _forward.y = 0;
          if (_forward.lengthSq() > 1e-5) _forward.normalize();
          _right.crossVectors(_forward, _up).normalize();

          _move.set(0, 0, 0);
          _move.addScaledVector(_forward, moveZ);
          _move.addScaledVector(_right, moveX);
          if (_move.lengthSq() > 1e-5) _move.normalize();

          const walkSpeed = 3.2; // meters per second
          const nextX = camera.position.x + _move.x * walkSpeed * dt;
          const nextZ = camera.position.z + _move.z * walkSpeed * dt;

          const resolved = resolvePlayerCollision(nextX, nextZ, 0.28, eng.colliders);
          camera.position.x = resolved.x;
          camera.position.z = resolved.z;
          camera.position.y = 1.62;
        }

        updateWalkHoverIfNeeded?.(false);
      } else {
        controls.update();
      }
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.008, (now - lastFrameTime) / 1000));
        lastFrameTime = now;

        stepSimulation(dt);
        if (composer && renderQualityRef.current === 'high' && !isSoftwareGl) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }

        const done = () => {
          if (disposed) return;
          renderBusy = false;
          if (renderDirty || hasActiveMotion()) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    const flyToDollhouse = (bp: SpatialBlueprint, immediate = false) => {
      const bounds = computeBlueprintBounds(bp);
      const radius = Math.max(bounds.width, bounds.depth, 7);
      const aspectScale = camera.aspect < 1 ? 1 / Math.max(0.56, camera.aspect) : 1;
      const targetPos = new THREE.Vector3(
        bounds.centerX + radius * 0.92 * aspectScale,
        Math.max(10.5, radius * 1.02) * aspectScale,
        bounds.centerZ + radius * 0.96 * aspectScale,
      );
      const targetLook = new THREE.Vector3(bounds.centerX, 1.1, bounds.centerZ);

      if (immediate) {
        flight.active = false;
        camera.position.copy(targetPos);
        controls.target.copy(targetLook);
        controls.update();
      } else {
        flight.targetPos.copy(targetPos);
        flight.targetLook.copy(targetLook);
        flight.endMode = 'orbit';
        flight.active = true;
      }
      requestRender();
    };

    const flyToRoom = (roomId: string, bp: SpatialBlueprint) => {
      const room = bp.rooms.find((r) => r.id === roomId) ?? bp.rooms[0];
      if (!room) return;
      const pose = getRoomCameraPose(room, bp);
      flight.targetPos.set(pose.position[0], pose.position[1], pose.position[2]);
      flight.targetLook.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
      flight.endMode = 'walk';
      flight.active = true;
      onActiveRoomRef.current(room.id);
      requestRender();
    };

    const applyLightingPreset = (preset: LightingPreset) => {
      const cfg = getLightingPresetConfig(preset);
      scene.background = new THREE.Color(cfg.backgroundHex);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(cfg.fogHex);
        scene.fog.density = cfg.fogDensity;
      } else {
        scene.fog = new THREE.FogExp2(cfg.fogHex, cfg.fogDensity);
      }
      renderer.toneMappingExposure = cfg.toneMappingExposure;
      scene.environmentIntensity = cfg.environmentIntensity;

      hemiLight.color.setHex(cfg.hemiSkyHex);
      hemiLight.groundColor.setHex(cfg.hemiGroundHex);
      hemiLight.intensity = cfg.hemiIntensity;

      const eng = engineRef.current;
      const cx = eng?.bounds.centerX ?? 0;
      const cz = eng?.bounds.centerZ ?? 0;

      keyLight.color.setHex(cfg.sunColorHex);
      keyLight.intensity = cfg.sunIntensity;
      keyLight.position.set(cx + cfg.sunPosition[0], cfg.sunPosition[1], cz + cfg.sunPosition[2]);
      keyLight.target.position.set(cx, 0, cz);
      keyLight.target.updateMatrixWorld();

      rimLight.color.setHex(cfg.rimColorHex);
      rimLight.intensity = cfg.rimIntensity;
      rimLight.position.set(cx + cfg.rimPosition[0], cfg.rimPosition[1], cz + cfg.rimPosition[2]);

      if (eng) {
        for (const pt of eng.interiorLights) {
          pt.color.setHex(cfg.interiorLightColorHex);
          pt.intensity = cfg.interiorLightIntensity;
        }
        if (eng.downlightMaterial) {
          eng.downlightMaterial.emissiveIntensity = cfg.downlightEmissiveIntensity;
        }
      }

      markShadowsDirty();
      requestRender();
    };

    const applyRenderQuality = (quality: RenderQuality) => {
      const useHigh = quality === 'high' && !isSoftwareGl;
      if (useHigh) {
        ensureComposer();
      }
      if (gtaoPass) {
        gtaoPass.enabled = useHigh;
      }
      markShadowsDirty();
      requestRender();
    };

    const refreshFurnitureIndicesAndTargets = (furnitureGroup: THREE.Group | null) => {
      const eng = engineRef.current;
      if (!eng) return;
      const controllers: InteractiveFurnitureController[] = [];
      const allTargets: THREE.Object3D[] = [];
      const interactiveTargets: THREE.Object3D[] = [];

      if (furnitureGroup) {
        for (let i = 0; i < furnitureGroup.children.length; i++) {
          const child = furnitureGroup.children[i];
          child.userData.furnitureIndex = i;
          allTargets.push(child);
          const ctrl = child.userData?.interactiveController as
            | InteractiveFurnitureController
            | undefined;
          if (ctrl) {
            controllers.push(ctrl);
            interactiveTargets.push(child);
          }
        }
      }

      eng.interactiveControllers = controllers;
      eng.furnitureRaycastTargets = allTargets;
      eng.interactiveRaycastTargets = interactiveTargets;
    };

    const syncSelectionRing = (
      enabled: boolean,
      index: number | null,
      items: BlueprintFurniture[],
    ) => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.selectionRing) {
        scene.remove(eng.selectionRing);
        disposeObject3D(eng.selectionRing, sharedTexturesSet);
        eng.selectionRing = null;
      }

      if (enabled && index !== null && index >= 0 && index < items.length) {
        const item = items[index];
        const ring = buildSelectionRing(item.width, item.depth);
        ring.position.set(item.x, 0.014, item.z);
        ring.rotation.y = item.rotationY;
        scene.add(ring);
        eng.selectionRing = ring;
        eng.selectionRingBaseSize = { width: item.width, depth: item.depth };
      }

      requestRender();
    };

    const rebuildBlueprint = (bp: SpatialBlueprint, snapCamera: boolean) => {
      const eng = engineRef.current;
      if (!eng) return;

      sceneRebuildCountRef.current += 1;
      if (containerRef.current) {
        containerRef.current.dataset.sceneRebuilds = String(sceneRebuildCountRef.current);
      }

      if (eng.archGroup) {
        scene.remove(eng.archGroup);
        disposeObject3D(eng.archGroup, sharedTexturesSet);
        eng.archGroup = null;
        eng.roofGroup = null;
        eng.furnitureGroup = null;
        eng.furnitureItems = [];
        eng.furnitureRaycastTargets = [];
        eng.interactiveRaycastTargets = [];
        eng.interactiveControllers = [];
        eng.interiorLights = [];
        eng.downlightMaterial = null;
      }

      const built = buildArchitectureScene(bp, textures, isSoftwareGl, eng.interactiveStates);
      built.roofGroup.visible = showRoofRef.current;
      scene.add(built.rootGroup);
      eng.archGroup = built.rootGroup;
      eng.roofGroup = built.roofGroup;
      eng.furnitureGroup = built.furnitureGroup;
      eng.furnitureItems = bp.furniture.slice();
      refreshFurnitureIndicesAndTargets(built.furnitureGroup);
      eng.interiorLights = built.interiorLights;
      eng.downlightMaterial = built.downlightMaterial;
      eng.bounds = built.bounds;
      eng.colliders = buildWallColliders(bp.walls);

      const showRing =
        cameraModeRef.current === 'orbit' &&
        !placingAssetRef.current &&
        selectedFurnitureIndexRef.current !== null;
      syncSelectionRing(showRing, selectedFurnitureIndexRef.current, bp.furniture);

      // Fit primary directional light's 1024x1024 shadow frustum tightly to building bounds
      const frustum = computeTightShadowFrustum(built.bounds);
      keyLight.shadow.camera.left = frustum.left;
      keyLight.shadow.camera.right = frustum.right;
      keyLight.shadow.camera.top = frustum.top;
      keyLight.shadow.camera.bottom = frustum.bottom;
      keyLight.shadow.camera.near = frustum.near;
      keyLight.shadow.camera.far = frustum.far;
      keyLight.shadow.camera.updateProjectionMatrix();

      // Sync active lighting preset intensities & sun offset onto freshly built house
      applyLightingPreset(lightingPresetRef.current);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      markShadowsDirty();

      if (cameraModeRef.current === 'orbit') {
        flyToDollhouse(bp, snapCamera);
      } else {
        const defaultRoom = bp.rooms[0];
        if (defaultRoom) flyToRoom(defaultRoom.id, bp);
      }
    };

    /**
     * Reconciles furniture changes IN-PLACE without rebuilding walls, floors, roof,
     * or unchanged furniture items. Position/rotation/color mutate the existing Three.js
     * Group directly; only dimension-changed or added items build a single Group.
     */
    const syncFurnitureInPlace = (nextItems: BlueprintFurniture[]) => {
      const eng = engineRef.current;
      if (!eng || !eng.archGroup) return;

      if (!eng.furnitureGroup) {
        const freshGroup = new THREE.Group();
        freshGroup.name = 'furniture-root-group';
        eng.archGroup.add(freshGroup);
        eng.furnitureGroup = freshGroup;
      }

      const fGroup = eng.furnitureGroup;
      const prevItems = eng.furnitureItems;
      let shadowsNeedUpdate = false;

      // Fast path: identical count (covers move, rotate, resize, recolor, and undo/redo of those)
      if (prevItems.length === nextItems.length && fGroup.children.length === nextItems.length) {
        for (let i = 0; i < nextItems.length; i++) {
          const prev = prevItems[i];
          const next = nextItems[i];
          const existing = fGroup.children[i] as THREE.Group | undefined;
          if (!existing) continue;

          const diff = classifyFurnitureItemDiff(prev, next);
          if (diff === 'none') {
            if (existing.scale.x !== 1 || existing.scale.y !== 1 || existing.scale.z !== 1) {
              existing.scale.set(1, 1, 1);
              shadowsNeedUpdate = true;
            }
            continue;
          }

          if (diff === 'transform' || diff === 'transform_and_color') {
            applyFurnitureTransformInPlace(existing, next.x, next.z, next.rotationY);
            existing.scale.set(1, 1, 1);
            shadowsNeedUpdate = true;
            if (diff === 'transform') continue;
          }

          if (diff === 'color' || diff === 'transform_and_color') {
            if (applyFurnitureColorInPlace(existing, next.color)) {
              existing.scale.set(1, 1, 1);
              continue;
            }
          }

          // Only this 1 furniture item changed dimensions/type/customParts -> replace just this 1 child
          const key = getFurnitureStableKey(next, i);
          const rebuilt = buildFurnitureGroup(next, textures, {
            index: i,
            initialActive: eng.interactiveStates.get(key),
          });
          fGroup.remove(existing);
          disposeObject3D(existing, sharedTexturesSet);
          fGroup.add(rebuilt);
          // Restore exact index slot in children array so indices match blueprint.furniture
          const addedAt = fGroup.children.length - 1;
          if (addedAt !== i) {
            fGroup.children.splice(addedAt, 1);
            fGroup.children.splice(i, 0, rebuilt);
          }
          shadowsNeedUpdate = true;
        }
      } else {
        // Reconcile additions/deletions while reusing surviving unchanged Groups by stable key
        const poolByKey = new Map<string, { group: THREE.Group; item: BlueprintFurniture }>();
        for (let i = 0; i < fGroup.children.length; i++) {
          const child = fGroup.children[i] as THREE.Group;
          const prevItem = prevItems[i];
          const key = String(child.userData.furnitureKey ?? '');
          if (key && prevItem && !poolByKey.has(key)) {
            poolByKey.set(key, { group: child, item: prevItem });
          }
        }

        const orderedGroups: THREE.Group[] = [];
        const reusedSet = new Set<THREE.Group>();

        for (let i = 0; i < nextItems.length; i++) {
          const next = nextItems[i];
          const key = getFurnitureStableKey(next, i);
          const pooled = poolByKey.get(key);
          if (pooled && !reusedSet.has(pooled.group)) {
            const diff = classifyFurnitureItemDiff(pooled.item, next);
            if (diff !== 'rebuild_item') {
              reusedSet.add(pooled.group);
              if (diff === 'transform' || diff === 'transform_and_color') {
                applyFurnitureTransformInPlace(pooled.group, next.x, next.z, next.rotationY);
              }
              if (diff === 'color' || diff === 'transform_and_color') {
                if (!applyFurnitureColorInPlace(pooled.group, next.color)) {
                  reusedSet.delete(pooled.group);
                }
              }
              if (reusedSet.has(pooled.group)) {
                pooled.group.scale.set(1, 1, 1);
                orderedGroups.push(pooled.group);
                continue;
              }
            }
          }

          orderedGroups.push(
            buildFurnitureGroup(next, textures, {
              index: i,
              initialActive: eng.interactiveStates.get(key),
            }),
          );
        }

        // Dispose only removed/replaced groups
        const currentChildren = fGroup.children.slice();
        for (const oldChild of currentChildren) {
          fGroup.remove(oldChild);
          if (!reusedSet.has(oldChild as THREE.Group)) {
            disposeObject3D(oldChild, sharedTexturesSet);
          }
        }
        for (const nextChild of orderedGroups) {
          fGroup.add(nextChild);
        }
        shadowsNeedUpdate = true;
      }

      eng.furnitureItems = nextItems.slice();
      refreshFurnitureIndicesAndTargets(fGroup);

      const showRing =
        cameraModeRef.current === 'orbit' &&
        !placingAssetRef.current &&
        selectedFurnitureIndexRef.current !== null;
      syncSelectionRing(showRing, selectedFurnitureIndexRef.current, nextItems);

      if (shadowsNeedUpdate) {
        markShadowsDirty();
      }
      requestRender();
    };

    const previewFurnitureEdit = (index: number, patch: FurniturePreviewPatch) => {
      const eng = engineRef.current;
      if (!eng || !eng.furnitureGroup) return;
      const group = eng.furnitureGroup.children[index] as THREE.Group | undefined;
      const item = blueprintRef.current.furniture[index];
      if (!group || !item) return;

      let shadowDirty = false;
      const nextX = patch.x ?? group.position.x;
      const nextZ = patch.z ?? group.position.z;
      const nextRot = patch.rotationY ?? group.rotation.y;

      if (patch.x !== undefined || patch.z !== undefined || patch.rotationY !== undefined) {
        applyFurnitureTransformInPlace(group, nextX, nextZ, nextRot);
        if (eng.selectionRing && selectedFurnitureIndexRef.current === index) {
          eng.selectionRing.position.set(nextX, 0.014, nextZ);
          eng.selectionRing.rotation.y = nextRot;
        }
        shadowDirty = true;
      }

      if (
        patch.width !== undefined ||
        patch.depth !== undefined ||
        patch.height !== undefined
      ) {
        const nextW = patch.width ?? item.width;
        const nextD = patch.depth ?? item.depth;
        const nextH = patch.height ?? item.height;
        applyFurniturePreviewScale(group, nextW, nextD, nextH);
        if (eng.selectionRing && selectedFurnitureIndexRef.current === index) {
          const baseRing = eng.selectionRingBaseSize;
          eng.selectionRing.scale.set(
            Math.max(0.2, nextW / Math.max(0.1, baseRing.width)),
            1,
            Math.max(0.2, nextD / Math.max(0.1, baseRing.depth)),
          );
        }
        shadowDirty = true;
      }

      if (patch.color !== undefined) {
        applyFurnitureColorInPlace(group, patch.color);
      }

      if (shadowDirty) {
        markShadowsDirty();
      }
      requestRender();
    };

    const syncPlacementGhost = (asset: GeneratedFurnitureAsset | null, rotY: number) => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.ghostGroup) {
        scene.remove(eng.ghostGroup);
        disposeObject3D(eng.ghostGroup, sharedTexturesSet);
        eng.ghostGroup = null;
      }

      if (asset) {
        const ghost = buildFurniturePlacementGhost(asset, textures);
        const startX = eng.lastHoverPos?.x ?? eng.bounds.centerX;
        const startZ = eng.lastHoverPos?.z ?? eng.bounds.centerZ;
        ghost.position.set(startX, 0.01, startZ);
        ghost.rotation.y = rotY;
        scene.add(ghost);
        eng.ghostGroup = ghost;
      }

      requestRender();
    };

    const syncGhostRotation = (rotY: number) => {
      const eng = engineRef.current;
      if (!eng || !eng.ghostGroup) return;
      eng.ghostGroup.rotation.y = rotY;
      requestRender();
    };

    const applyRoofVisibility = (visible: boolean) => {
      const eng = engineRef.current;
      if (!eng || !eng.roofGroup) return;
      eng.roofGroup.visible = visible;
      markShadowsDirty();
      requestRender();
    };

    let lastHoveredKey = '';
    const emitHoveredInteraction = (info: HoveredFurnitureInfo | null) => {
      const nextKey = info
        ? `${info.index}:${info.interactionKind}:${info.actionLabel}`
        : '';
      if (nextKey === lastHoveredKey) return;
      lastHoveredKey = nextKey;
      onHoveredInteractionRef.current?.(info);
    };

    const clearHoverState = () => {
      emitHoveredInteraction(null);
      setHoverCursor('default');
    };

    const syncMode = (mode: CameraMode) => {
      const eng = engineRef.current;
      clearHoverState();
      if (eng && eng.isSeated) {
        eng.isSeated = false;
        setIsSeatedAttr(false);
        onSeatedChangeRef.current(false);
      }

      if (mode === 'orbit') {
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock?.();
        }
        controls.enabled = true;
        flyToDollhouse(blueprintRef.current, false);
      } else {
        controls.enabled = false;
        // If camera is currently far above in dollhouse view, fly smoothly into first room
        if (camera.position.y > 2.4 && !flight.active) {
          const firstRoom = blueprintRef.current.rooms[0];
          if (firstRoom) {
            flyToRoom(firstRoom.id, blueprintRef.current);
          }
        } else {
          syncYawPitchFromCamera();
          requestRender();
        }
      }
    };

    engineRef.current = {
      scene,
      camera,
      renderer,
      controls,
      textures,
      sharedTexturesSet,
      isSoftwareGl,
      archGroup: null,
      roofGroup: null,
      furnitureGroup: null,
      furnitureItems: [],
      furnitureRaycastTargets: [],
      interactiveRaycastTargets: [],
      interactiveControllers: [],
      interactiveStates: new Map<string, boolean>(),
      selectionRing: null,
      selectionRingBaseSize: { width: 1, depth: 1 },
      interiorLights: [],
      downlightMaterial: null,
      ghostGroup: null,
      bounds: computeBlueprintBounds(blueprintRef.current),
      lastHoverPos: null,
      colliders: [],
      flight,
      yaw: 0,
      pitch: 0,
      isSeated: false,
      standPosition: new THREE.Vector3(0, 1.62, 0),
      requestRender,
      markShadowsDirty,
      rebuildBlueprint,
      syncFurnitureInPlace,
      previewFurnitureEdit,
      syncPlacementGhost,
      syncGhostRotation,
      syncSelectionRing,
      flyToDollhouse,
      flyToRoom,
      applyRoofVisibility,
      applyLightingPreset,
      applyRenderQuality,
      syncMode,
      clearHoverState,
    };

    // Initial blueprint build
    rebuildBlueprint(blueprintRef.current, true);

    // OrbitControls listeners
    const onOrbitStart = () => {
      flight.active = false;
    };
    const onOrbitChange = () => {
      if (cameraModeRef.current === 'orbit') {
        requestRender();
      }
    };
    controls.addEventListener('start', onOrbitStart);
    controls.addEventListener('change', onOrbitChange);

    // Interactive floor & furniture raycast helpers
    let downClientX = 0;
    let downClientY = 0;
    let downButton = -1;
    let lastGhostRaycastMs = 0;
    let lastHoverRaycastMs = 0;
    let lastWalkHoverMs = 0;

    // Arrange Mode drag-to-move state
    let draggingFurnitureIndex: number | null = null;
    let dragOffsetX = 0;
    let dragOffsetZ = 0;
    let dragStartX = 0;
    let dragStartZ = 0;
    let dragCurrentX = 0;
    let dragCurrentZ = 0;
    let dragMoved = false;

    const isVisibleInHierarchy = (obj: THREE.Object3D | null): boolean => {
      let cur = obj;
      while (cur) {
        if (!cur.visible) return false;
        cur = cur.parent;
      }
      return true;
    };

    const findFurnitureRoot = (
      obj: THREE.Object3D | null,
      furnitureGroup: THREE.Group,
    ): THREE.Group | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur && cur !== furnitureGroup) {
        if (cur.parent === furnitureGroup && typeof cur.userData?.furnitureIndex === 'number') {
          return cur as THREE.Group;
        }
        cur = cur.parent;
      }
      return null;
    };

    const raycastFloorPointRaw = (
      clientX: number,
      clientY: number,
    ): { x: number; z: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hit = _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);
      if (!hit) return null;
      return { x: hit.x, z: hit.z };
    };

    const raycastFloorPoint = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      const raw = raycastFloorPointRaw(clientX, clientY);
      if (!raw) return null;
      return snapPlacementPosition(raw.x, raw.z, eng.bounds, 0.1);
    };

    const raycastFurnitureAtNdc = (
      ndcX: number,
      ndcY: number,
      maxDistance: number,
      interactiveOnly = false,
    ): {
      group: THREE.Group;
      index: number;
      controller: InteractiveFurnitureController | null;
      distance: number;
    } | null => {
      const eng = engineRef.current;
      if (!eng || !eng.furnitureGroup) return null;

      // Targeted raycasting ONLY against dedicated furniture/interactive target arrays (never scene.children)
      const targets = interactiveOnly
        ? eng.interactiveRaycastTargets
        : eng.furnitureRaycastTargets;
      if (targets.length === 0) return null;

      _pointerNdc.set(ndcX, ndcY);
      _raycaster.setFromCamera(_pointerNdc, camera);
      _raycaster.near = 0.05;
      _raycaster.far = maxDistance;

      const hits = _raycaster.intersectObjects(targets, true);
      for (const hit of hits) {
        if (!isVisibleInHierarchy(hit.object)) continue;
        // Skip transparent floor contact-shadow discs so clicks/hovers feel exact
        if (hit.object instanceof THREE.Mesh) {
          const mat = hit.object.material;
          if (!Array.isArray(mat) && mat instanceof THREE.MeshBasicMaterial && mat.depthWrite === false) {
            continue;
          }
        }
        const fRoot = findFurnitureRoot(hit.object, eng.furnitureGroup);
        if (!fRoot) continue;
        const idx = fRoot.userData.furnitureIndex as number;
        const controller =
          (fRoot.userData.interactiveController as InteractiveFurnitureController | undefined) ?? null;
        return {
          group: fRoot,
          index: idx,
          controller,
          distance: hit.distance,
        };
      }
      return null;
    };

    const buildHoverInfo = (
      index: number,
      controller: InteractiveFurnitureController | null,
      mode: CameraMode,
    ): HoveredFurnitureInfo | null => {
      if (!controller) return null;
      const item = blueprintRef.current.furniture[index];
      if (!item) return null;
      const desc = getFurnitureInteractionDescriptor(item.type, mode, controller.isActive);
      if (!desc) return null;
      return {
        index,
        type: item.type,
        label: getFurnitureDisplayLabel(item),
        actionLabel: desc.actionLabel,
        interactionKind: desc.interactionKind,
      };
    };

    const triggerFurnitureInteraction = (
      index: number,
      controller: InteractiveFurnitureController,
    ) => {
      const eng = engineRef.current;
      if (!eng) return;
      const item = blueprintRef.current.furniture[index];
      if (!item) return;

      if (controller.kind === 'sit') {
        if (cameraModeRef.current !== 'walk') return;
        const pose = computeSeatCameraPose(item);
        eng.standPosition.set(pose.standPosition[0], pose.standPosition[1], pose.standPosition[2]);
        eng.isSeated = true;
        setIsSeatedAttr(true);
        onSeatedChangeRef.current(true);
        flight.targetPos.set(pose.position[0], pose.position[1], pose.position[2]);
        flight.targetLook.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
        flight.endMode = 'walk';
        flight.active = true;
        emitHoveredInteraction(null);
        requestRender();
        return;
      }

      const nextActive = !controller.isActive;
      controller.setActive(nextActive);
      eng.interactiveStates.set(controller.key, nextActive);
      requestRender();

      // Immediately refresh hovered prompt text so "Turn On" flips to "Turn Off" live
      const refreshed = buildHoverInfo(index, controller, cameraModeRef.current);
      emitHoveredInteraction(refreshed);
    };

    const standUpIfSeated = () => {
      const eng = engineRef.current;
      if (!eng || !eng.isSeated) return;
      eng.isSeated = false;
      setIsSeatedAttr(false);
      onSeatedChangeRef.current(false);

      const resolved = resolvePlayerCollision(
        eng.standPosition.x,
        eng.standPosition.z,
        0.28,
        eng.colliders,
      );
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      if (_forward.lengthSq() < 1e-4) _forward.set(0, 0, -1);
      else _forward.normalize();

      flight.targetPos.set(resolved.x, 1.62, resolved.z);
      flight.targetLook.set(resolved.x + _forward.x * 3, 1.58, resolved.z + _forward.z * 3);
      flight.endMode = 'walk';
      flight.active = true;
      requestRender();
    };

    // Walk Mode center-screen hover probe (within 2.5m)
    updateWalkHoverIfNeeded = (force = false) => {
      if (
        cameraModeRef.current !== 'walk' ||
        placingAssetRef.current ||
        arrangeModeRef.current
      ) {
        return;
      }
      const eng = engineRef.current;
      if (!eng || eng.isSeated || flight.active) {
        emitHoveredInteraction(null);
        return;
      }

      const now = performance.now();
      if (!force && now - lastWalkHoverMs < (isSoftwareGl ? 90 : 50)) return;
      lastWalkHoverMs = now;

      const hit = raycastFurnitureAtNdc(0, 0, 2.5, true);
      if (hit && hit.controller) {
        emitHoveredInteraction(buildHoverInfo(hit.index, hit.controller, 'walk'));
      } else {
        emitHoveredInteraction(null);
      }
    };

    // Walk mode pointer lock + drag-to-look mouse fallback
    const onCanvasClick = () => {
      if (placingAssetRef.current || arrangeModeRef.current) return;
      if (cameraModeRef.current === 'walk' && document.pointerLockElement !== renderer.domElement) {
        try {
          const res = renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
          if (res && typeof res.catch === 'function') {
            res.catch(() => {
              // Pointer lock can be declined in sandboxed iframes; drag-to-look remains active
            });
          }
        } catch {
          // Ignore pointer lock rejection
        }
      }
    };

    const onPointerLockChangeDom = () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
      onPointerLockRef.current(isPointerLocked);
    };

    // Track recent Orbit single-click toggle so double-clicking an interactive item to edit it
    // cleanly restores its prior on/off/open/closed state instead of leaving an accidental toggle.
    let lastSingleClickToggle: {
      index: number;
      controller: InteractiveFurnitureController;
      atMs: number;
    } | null = null;

    // Direct double-click furniture editing in Orbit Mode (no separate mode toggle required)
    const onDoubleClickCanvas = (e: MouseEvent) => {
      if (cameraModeRef.current !== 'orbit' || placingAssetRef.current) return;
      const eng = engineRef.current;
      if (!eng) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, false);
      if (!hit || hit.index < 0) return;

      // Revert accidental single-click toggle if the user double-clicked a lamp/TV/fridge/wardrobe
      if (
        lastSingleClickToggle &&
        lastSingleClickToggle.index === hit.index &&
        performance.now() - lastSingleClickToggle.atMs < 420
      ) {
        const prevCtrl = lastSingleClickToggle.controller;
        const restored = !prevCtrl.isActive;
        prevCtrl.setActive(restored);
        eng.interactiveStates.set(prevCtrl.key, restored);
        lastSingleClickToggle = null;
      }

      clearHoverState();
      onSelectFurnitureRef.current(hit.index);
      syncSelectionRing(true, hit.index, blueprintRef.current.furniture);
      markShadowsDirty();
      requestRender();
    };

    // Capture-phase pointerdown so dragging selected furniture disables OrbitControls before OrbitControls starts
    const onPointerDown = (e: PointerEvent) => {
      downClientX = e.clientX;
      downClientY = e.clientY;
      downButton = e.button;

      if (placingAssetRef.current) return;

      // Orbit Mode floor-plane drag: active in Arrange Mode (any furniture) OR directly on a double-click selected item
      if (
        cameraModeRef.current === 'orbit' &&
        e.button === 0 &&
        (arrangeModeRef.current || selectedFurnitureIndexRef.current !== null)
      ) {
        const eng = engineRef.current;
        if (!eng) return;
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, false);
        const canDragHit =
          hit &&
          hit.index >= 0 &&
          (arrangeModeRef.current || hit.index === selectedFurnitureIndexRef.current);

        if (canDragHit && hit) {
          const item = blueprintRef.current.furniture[hit.index];
          if (item) {
            flight.active = false;
            controls.enabled = false;
            draggingFurnitureIndex = hit.index;
            dragStartX = item.x;
            dragStartZ = item.z;
            dragCurrentX = item.x;
            dragCurrentZ = item.z;
            dragMoved = false;

            const floorHit = raycastFloorPointRaw(e.clientX, e.clientY);
            dragOffsetX = floorHit ? item.x - floorHit.x : 0;
            dragOffsetZ = floorHit ? item.z - floorHit.z : 0;

            if (arrangeModeRef.current) {
              onSelectFurnitureRef.current(hit.index);
              syncSelectionRing(true, hit.index, blueprintRef.current.furniture);
            }
            setHoverCursor('move');
            return;
          }
        }
      }

      if (cameraModeRef.current !== 'walk') return;
      flight.active = false;
      isDraggingLook = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      isDraggingLook = false;

      // Finish floor-plane drag and commit ONE Undo snapshot on release
      if (draggingFurnitureIndex !== null) {
        const committedIdx = draggingFurnitureIndex;
        const finalX = dragCurrentX;
        const finalZ = dragCurrentZ;
        const movedEnough =
          dragMoved && Math.hypot(finalX - dragStartX, finalZ - dragStartZ) > 0.005;

        draggingFurnitureIndex = null;
        dragMoved = false;
        controls.enabled = cameraModeRef.current === 'orbit';
        setHoverCursor('default');

        if (movedEnough) {
          onCommitMoveFurnitureRef.current(committedIdx, finalX, finalZ);
        }
        downButton = -1;
        return;
      }

      const wasCrispClick =
        downButton === 0 &&
        e.target === renderer.domElement &&
        Math.hypot(e.clientX - downClientX, e.clientY - downClientY) < 6;

      // Click-to-place custom furniture
      if (placingAssetRef.current && wasCrispClick) {
        const pt = raycastFloorPoint(e.clientX, e.clientY);
        if (pt) {
          if (engineRef.current) {
            engineRef.current.lastHoverPos = pt;
            if (engineRef.current.ghostGroup) {
              engineRef.current.ghostGroup.position.set(pt.x, 0.01, pt.z);
            }
          }
          onPlaceFurnitureRef.current(pt.x, pt.z, placementRotationRef.current);
        }
        downButton = -1;
        return;
      }

      // Clicking empty floor/background deselects active furniture (both Arrange Mode & direct double-click edit)
      if (
        cameraModeRef.current === 'orbit' &&
        wasCrispClick &&
        (arrangeModeRef.current || selectedFurnitureIndexRef.current !== null)
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, false);
          if (!hit || (!arrangeModeRef.current && hit.index !== selectedFurnitureIndexRef.current)) {
            onSelectFurnitureRef.current(null);
          }
        }
        downButton = -1;
        return;
      }

      // Orbit Mode (non-editing): crisp left-click toggles interactive furniture (lamp, TV, fridge, wardrobe)
      if (
        !arrangeModeRef.current &&
        selectedFurnitureIndexRef.current === null &&
        cameraModeRef.current === 'orbit' &&
        wasCrispClick
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, true);
          if (hit && hit.controller && hit.controller.kind !== 'sit') {
            triggerFurnitureInteraction(hit.index, hit.controller);
            lastSingleClickToggle = {
              index: hit.index,
              controller: hit.controller,
              atMs: performance.now(),
            };
          }
        }
      }

      downButton = -1;
    };

    const onPointerMoveCanvas = (e: PointerEvent) => {
      const eng = engineRef.current;
      if (!eng) return;

      // 1. Active floor-plane furniture drag (y = 0.01 locked, 60 FPS in-place transform)
      if (draggingFurnitureIndex !== null) {
        const floorHit = raycastFloorPointRaw(e.clientX, e.clientY);
        if (floorHit) {
          const snapped = snapPlacementPosition(
            floorHit.x + dragOffsetX,
            floorHit.z + dragOffsetZ,
            eng.bounds,
            0.05,
          );
          dragCurrentX = snapped.x;
          dragCurrentZ = snapped.z;
          dragMoved = true;

          const meshGroup = eng.furnitureGroup?.children[draggingFurnitureIndex];
          if (meshGroup) {
            meshGroup.position.set(snapped.x, 0.01, snapped.z);
          }
          if (eng.selectionRing) {
            eng.selectionRing.position.set(snapped.x, 0.014, snapped.z);
          }
          markShadowsDirty();
          requestRender();
        }
        return;
      }

      // 2. Custom furniture placement ghost tracking
      if (placingAssetRef.current) {
        if (!eng.ghostGroup) return;
        const now = performance.now();
        if (isSoftwareGl && now - lastGhostRaycastMs < 50) return;
        lastGhostRaycastMs = now;

        const pt = raycastFloorPoint(e.clientX, e.clientY);
        if (pt) {
          eng.lastHoverPos = pt;
          eng.ghostGroup.position.set(pt.x, 0.01, pt.z);
          requestRender();
        }
        return;
      }

      // 3. Orbit Mode hover feedback (throttled >= 50ms, targeted raycast only)
      if (cameraModeRef.current === 'orbit') {
        const now = performance.now();
        if (now - lastHoverRaycastMs < (isSoftwareGl ? 90 : 50)) return;
        lastHoverRaycastMs = now;

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const isEditingSelected = selectedFurnitureIndexRef.current !== null;
        if (arrangeModeRef.current) {
          const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, false);
          emitHoveredInteraction(null);
          setHoverCursor(hit ? 'move' : 'default');
        } else if (isEditingSelected) {
          const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, false);
          emitHoveredInteraction(null);
          setHoverCursor(hit && hit.index === selectedFurnitureIndexRef.current ? 'move' : 'default');
        } else {
          const hit = raycastFurnitureAtNdc(ndcX, ndcY, 120, true);
          if (hit && hit.controller && hit.controller.kind !== 'sit') {
            emitHoveredInteraction(buildHoverInfo(hit.index, hit.controller, 'orbit'));
            setHoverCursor('pointer');
          } else {
            emitHoveredInteraction(null);
            setHoverCursor('default');
          }
        }
      }
    };

    const onPointerLeaveCanvas = () => {
      if (draggingFurnitureIndex === null && cameraModeRef.current === 'orbit') {
        clearHoverState();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (cameraModeRef.current !== 'walk' || placingAssetRef.current) return;
      const eng = engineRef.current;
      if (!eng) return;

      if (isPointerLocked) {
        if (!eng.isSeated) flight.active = false;
        const sensitivity = 0.0022;
        eng.yaw -= e.movementX * sensitivity;
        eng.pitch = THREE.MathUtils.clamp(
          eng.pitch - e.movementY * sensitivity,
          -Math.PI * 0.44,
          Math.PI * 0.44,
        );
        requestRender();
      } else if (isDraggingLook) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        const sensitivity = 0.004;
        eng.yaw -= dx * sensitivity;
        eng.pitch = THREE.MathUtils.clamp(
          eng.pitch - dy * sensitivity,
          -Math.PI * 0.44,
          Math.PI * 0.44,
        );
        requestRender();
      }
    };

    // Keyboard WASD / Arrows + Walk E Interact + Arrange R/Delete/Esc + Placement R/Esc
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (placingAssetRef.current) {
        if (e.code === 'KeyR') {
          e.preventDefault();
          onRotatePlacementRef.current();
          return;
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          onCancelPlacementRef.current();
          return;
        }
      }

      // Selected furniture keyboard shortcuts (works for BOTH direct double-click edit & Arrange Mode)
      if (
        cameraModeRef.current === 'orbit' &&
        !placingAssetRef.current &&
        selectedFurnitureIndexRef.current !== null
      ) {
        if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onRotateSelectedRef.current(e.shiftKey ? -Math.PI / 4 : Math.PI / 4);
          return;
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
          e.preventDefault();
          onDeleteSelectedRef.current();
          return;
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          onSelectFurnitureRef.current(null);
          return;
        }
      }

      // Walk Mode 'E' key interaction
      if (
        e.code === 'KeyE' &&
        cameraModeRef.current === 'walk' &&
        !placingAssetRef.current &&
        !arrangeModeRef.current
      ) {
        const eng = engineRef.current;
        if (!eng) return;
        if (eng.isSeated) {
          e.preventDefault();
          standUpIfSeated();
          return;
        }
        const hit = raycastFurnitureAtNdc(0, 0, 2.5, true);
        if (hit && hit.controller) {
          e.preventDefault();
          triggerFurnitureInteraction(hit.index, hit.controller);
          return;
        }
      }

      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        if (cameraModeRef.current === 'walk') {
          const eng = engineRef.current;
          if (eng?.isSeated) {
            standUpIfSeated();
            return;
          }
          flight.active = false;
          keysPressed.add(e.code);
          lastFrameTime = performance.now();
          requestRender();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };

    const onBlur = () => {
      keysPressed.clear();
      isDraggingLook = false;
      downButton = -1;
      if (draggingFurnitureIndex !== null) {
        draggingFurnitureIndex = null;
        dragMoved = false;
        controls.enabled = cameraModeRef.current === 'orbit';
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };

    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('dblclick', onDoubleClickCanvas);
    renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onPointerMoveCanvas);
    renderer.domElement.addEventListener('pointerleave', onPointerLeaveCanvas);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('pointerlockchange', onPointerLockChangeDom);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ResizeObserver keeps canvas and post-processing targets crisp on layout changes
    let prevPortrait = width < height;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        const nextPortrait = w < h;
        const dpr = getCappedPixelRatio();
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h);
        if (composer) {
          composer.setPixelRatio(dpr);
          composer.setSize(w, h);
        }
        if (nextPortrait !== prevPortrait && cameraModeRef.current === 'orbit') {
          prevPortrait = nextPortrait;
          flyToDollhouse(blueprintRef.current, true);
        } else {
          prevPortrait = nextPortrait;
          requestRender();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onOrbitStart);
      controls.removeEventListener('change', onOrbitChange);
      controls.dispose();
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('dblclick', onDoubleClickCanvas);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointermove', onPointerMoveCanvas);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeaveCanvas);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('pointerlockchange', onPointerLockChangeDom);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      if (engineRef.current?.selectionRing) {
        disposeObject3D(engineRef.current.selectionRing, sharedTexturesSet);
      }
      if (engineRef.current?.ghostGroup) {
        disposeObject3D(engineRef.current.ghostGroup, sharedTexturesSet);
      }
      if (engineRef.current?.archGroup) {
        disposeObject3D(engineRef.current.archGroup, sharedTexturesSet);
      }
      gtaoPass?.dispose();
      composer?.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
  }, []);

  // Rebuild full architecture when structure changes, or fast furniture-only rebuild when only furniture edits occur
  const initialBlueprintRef = useRef(true);
  const lastStructureRef = useRef({
    name: blueprint.name,
    roof: blueprint.roof,
    rooms: blueprint.rooms,
    walls: blueprint.walls,
  });
  useEffect(() => {
    if (initialBlueprintRef.current) {
      initialBlueprintRef.current = false;
      return;
    }
    const prev = lastStructureRef.current;
    const structureChanged =
      prev.name !== blueprint.name ||
      prev.roof !== blueprint.roof ||
      prev.rooms !== blueprint.rooms ||
      prev.walls !== blueprint.walls;
    lastStructureRef.current = {
      name: blueprint.name,
      roof: blueprint.roof,
      rooms: blueprint.rooms,
      walls: blueprint.walls,
    };

    if (structureChanged) {
      engineRef.current?.rebuildBlueprint(blueprint, false);
    } else {
      engineRef.current?.syncFurnitureInPlace(blueprint.furniture);
    }
  }, [blueprint]);

  // Sync placement preview ghost when active asset changes
  useEffect(() => {
    engineRef.current?.syncPlacementGhost(placingAsset, placementRotationRef.current);
  }, [placingAsset]);

  // Update placement preview rotation smoothly without recreating geometry
  useEffect(() => {
    engineRef.current?.syncGhostRotation(placementRotationY);
  }, [placementRotationY]);

  // Toggle roof cutaway visibility
  useEffect(() => {
    engineRef.current?.applyRoofVisibility(showRoof);
  }, [showRoof]);

  // Apply live lighting preset (Daylight, Golden Hour, Night)
  useEffect(() => {
    engineRef.current?.applyLightingPreset(lightingPreset);
  }, [lightingPreset]);

  // Toggle render quality (High: GTAO ambient occlusion vs Fast: direct WebGLRenderer)
  useEffect(() => {
    engineRef.current?.applyRenderQuality(renderQuality);
  }, [renderQuality]);

  // Switch Orbit vs Walk mode
  const initialModeRef = useRef(true);
  useEffect(() => {
    if (initialModeRef.current) {
      initialModeRef.current = false;
      return;
    }
    engineRef.current?.syncMode(cameraMode);
  }, [cameraMode]);

  // Sync brass selection ring whenever an item is selected in Orbit Mode (via double-click or Arrange Mode)
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const showRing = cameraMode === 'orbit' && !placingAsset && selectedFurnitureIndex !== null;
    if (arrangeMode || showRing) {
      eng.clearHoverState();
    }
    eng.syncSelectionRing(showRing, selectedFurnitureIndex, blueprintRef.current.furniture);
  }, [cameraMode, placingAsset, arrangeMode, selectedFurnitureIndex, blueprint.furniture]);

  // Smoothly teleport inside a clicked room
  useEffect(() => {
    if (!teleportRequest) return;
    const eng = engineRef.current;
    if (eng?.isSeated) {
      eng.isSeated = false;
      setIsSeatedAttr(false);
      onSeatedChangeRef.current(false);
    }
    eng?.flyToRoom(teleportRequest.roomId, blueprintRef.current);
  }, [teleportRequest]);

  // Reset View action
  useEffect(() => {
    if (resetNonce === 0) return;
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.isSeated) {
      eng.isSeated = false;
      setIsSeatedAttr(false);
      onSeatedChangeRef.current(false);
    }
    if (cameraModeRef.current === 'orbit') {
      eng.flyToDollhouse(blueprintRef.current, false);
    } else {
      const firstRoom = blueprintRef.current.rooms[0];
      if (firstRoom) eng.flyToRoom(firstRoom.id, blueprintRef.current);
    }
  }, [resetNonce]);

  useImperativeHandle(
    ref,
    () => ({
      exportGltf: async () => {
        const eng = engineRef.current;
        if (!eng || !eng.archGroup) {
          throw new Error('3D model is not ready for export yet.');
        }
        return downloadArchitectureGltf(eng.archGroup, blueprintRef.current.name);
      },
      getViewportSpawnCenter: () => {
        const eng = engineRef.current;
        if (!eng) {
          const b = computeBlueprintBounds(blueprintRef.current);
          return { x: Number(b.centerX.toFixed(2)), z: Number(b.centerZ.toFixed(2)) };
        }
        const target = eng.controls.target;
        return snapPlacementPosition(target.x, target.z, eng.bounds, 0.1);
      },
      previewFurnitureEdit: (index: number, patch: FurniturePreviewPatch) => {
        engineRef.current?.previewFurnitureEdit(index, patch);
      },
    }),
    [],
  );

  const canvasCursorClass = placingAsset
    ? 'cursor-crosshair'
    : cameraMode === 'walk'
      ? 'cursor-crosshair'
      : hoverCursor === 'move'
        ? 'cursor-move'
        : hoverCursor === 'pointer'
          ? 'cursor-pointer'
          : 'cursor-grab active:cursor-grabbing';

  return (
    <div
      ref={containerRef}
      data-testid="arch-viewport"
      data-camera-mode={cameraMode}
      data-roof-visible={String(showRoof)}
      data-lighting-preset={lightingPreset}
      data-render-quality={renderQuality}
      data-placing={placingAsset ? placingAsset.name : ''}
      data-arrange-mode={String(arrangeMode)}
      data-selected-furniture={selectedFurnitureIndex !== null ? String(selectedFurnitureIndex) : ''}
      data-seated={String(isSeatedAttr)}
      data-furniture-count={String(blueprint.furniture.length)}
      className="relative w-full h-full overflow-hidden bg-[#12151c]"
    >
      {/* Isolated mount node for Three.js WebGL canvas */}
      <div
        ref={canvasMountRef}
        className={`w-full h-full ${canvasCursorClass}`}
      />

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#12151c] p-6 text-center">
          <div className="max-w-sm space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
              3D Viewport Paused
            </h2>
            <p className="text-sm text-[#9ca3af]">
              WebGL rendering context was interrupted. Reload the page or click Reset View to resume.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
