import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBlueprintBounds, getRoomCameraPose } from '../arch/blueprint';
import { buildWallColliders, resolvePlayerCollision, type SolidWallCollider } from '../arch/collision';
import { snapPlacementPosition } from '../arch/furnitureCatalog';
import type {
  BlueprintBounds,
  BlueprintFurniture,
  CameraMode,
  GeneratedFurnitureAsset,
  SpatialBlueprint,
} from '../arch/types';
import { buildArchitectureScene, disposeObject3D } from '../three/buildArchitecture';
import { buildFurnitureGroup, buildFurniturePlacementGhost } from '../three/buildFurniture';
import { createProceduralTextureSet, type ProceduralTextureSet } from '../three/textures';

export interface TeleportRequest {
  roomId: string;
  nonce: number;
}

interface ArchViewportProps {
  blueprint: SpatialBlueprint;
  cameraMode: CameraMode;
  showRoof: boolean;
  teleportRequest: TeleportRequest | null;
  resetNonce: number;
  placingAsset: GeneratedFurnitureAsset | null;
  placementRotationY: number;
  onPlaceFurniture: (x: number, z: number, rotationY: number) => void;
  onRotatePlacement: () => void;
  onCancelPlacement: () => void;
  onPointerLockChange: (locked: boolean) => void;
  onActiveRoomChange: (roomId: string | null) => void;
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

export function ArchViewport({
  blueprint,
  cameraMode,
  showRoof,
  teleportRequest,
  resetNonce,
  placingAsset,
  placementRotationY,
  onPlaceFurniture,
  onRotatePlacement,
  onCancelPlacement,
  onPointerLockChange,
  onActiveRoomChange,
}: ArchViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Store latest React props & callbacks in refs so the WebGL lifecycle mounts once
  const blueprintRef = useRef(blueprint);
  blueprintRef.current = blueprint;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const showRoofRef = useRef(showRoof);
  showRoofRef.current = showRoof;
  const placingAssetRef = useRef(placingAsset);
  placingAssetRef.current = placingAsset;
  const placementRotationRef = useRef(placementRotationY);
  placementRotationRef.current = placementRotationY;
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
    ghostGroup: THREE.Group | null;
    bounds: BlueprintBounds;
    lastHoverPos: { x: number; z: number } | null;
    colliders: SolidWallCollider[];
    flight: CameraFlight;
    yaw: number;
    pitch: number;
    requestRender: () => void;
    rebuildBlueprint: (bp: SpatialBlueprint, snapCamera: boolean) => void;
    rebuildFurnitureOnly: (items: BlueprintFurniture[]) => void;
    syncPlacementGhost: (asset: GeneratedFurnitureAsset | null, rotY: number) => void;
    syncGhostRotation: (rotY: number) => void;
    flyToDollhouse: (bp: SpatialBlueprint, immediate?: boolean) => void;
    flyToRoom: (roomId: string, bp: SpatialBlueprint) => void;
    applyRoofVisibility: (visible: boolean) => void;
    syncMode: (mode: CameraMode) => void;
  } | null>(null);

  // Mount Three.js renderer, scene, lights, and input handlers ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();
    const bgHex = 0x12151c;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.017);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.08, 180);
    camera.position.set(13, 11.5, 13);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    // Studio IBL reflections via RoomEnvironment on all devices
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Balanced 3-point warm/cool architectural lighting rig
    const hemiLight = new THREE.HemisphereLight(0xcfe0f5, 0x3b332b, 0.92);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.95);
    keyLight.position.set(14, 22, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 60;
    const shadowD = 14;
    keyLight.shadow.camera.left = -shadowD;
    keyLight.shadow.camera.right = shadowD;
    keyLight.shadow.camera.top = shadowD;
    keyLight.shadow.camera.bottom = -shadowD;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9ec0e8, 0.55);
    rimLight.position.set(-14, 10, -12);
    scene.add(rimLight);

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
    const sharedTexturesSet = new Set<THREE.Texture>([
      textures.woodMap,
      textures.woodBump,
      textures.tileMap,
      textures.tileBump,
      textures.carpetMap,
      textures.carpetBump,
      textures.concreteMap,
      textures.concreteBump,
      textures.plasterBump,
      textures.roofBump,
      textures.contactShadow,
      textures.groundGrid,
    ]);

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

    const hasActiveMotion = (): boolean => {
      if (flight.active) return true;
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

    const stepSimulation = (dt: number) => {
      const eng = engineRef.current;
      if (!eng) return;

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

        if (moveX !== 0 || moveZ !== 0) {
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
        renderer.render(scene, camera);

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

    const rebuildBlueprint = (bp: SpatialBlueprint, snapCamera: boolean) => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.archGroup) {
        scene.remove(eng.archGroup);
        disposeObject3D(eng.archGroup, sharedTexturesSet);
        eng.archGroup = null;
        eng.roofGroup = null;
        eng.furnitureGroup = null;
      }

      const built = buildArchitectureScene(bp, textures, isSoftwareGl);
      built.roofGroup.visible = showRoofRef.current;
      scene.add(built.rootGroup);
      eng.archGroup = built.rootGroup;
      eng.roofGroup = built.roofGroup;
      eng.furnitureGroup = built.furnitureGroup;
      eng.bounds = built.bounds;
      eng.colliders = buildWallColliders(bp.walls);

      // Update key light shadow frustum tightly around blueprint bounds
      const d = Math.max(10, Math.max(built.bounds.width, built.bounds.depth) * 0.85);
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.updateProjectionMatrix();

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      if (cameraModeRef.current === 'orbit') {
        flyToDollhouse(bp, snapCamera);
      } else {
        const defaultRoom = bp.rooms[0];
        if (defaultRoom) flyToRoom(defaultRoom.id, bp);
      }
    };

    const rebuildFurnitureOnly = (items: BlueprintFurniture[]) => {
      const eng = engineRef.current;
      if (!eng || !eng.archGroup) return;

      if (eng.furnitureGroup) {
        eng.archGroup.remove(eng.furnitureGroup);
        disposeObject3D(eng.furnitureGroup, sharedTexturesSet);
      }

      const nextGroup = new THREE.Group();
      nextGroup.name = 'furniture-root-group';
      for (const item of items) {
        nextGroup.add(buildFurnitureGroup(item, textures));
      }
      eng.archGroup.add(nextGroup);
      eng.furnitureGroup = nextGroup;
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
      requestRender();
    };

    const syncMode = (mode: CameraMode) => {
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
      ghostGroup: null,
      bounds: computeBlueprintBounds(blueprintRef.current),
      lastHoverPos: null,
      colliders: [],
      flight,
      yaw: 0,
      pitch: 0,
      requestRender,
      rebuildBlueprint,
      rebuildFurnitureOnly,
      syncPlacementGhost,
      syncGhostRotation,
      flyToDollhouse,
      flyToRoom,
      applyRoofVisibility,
      syncMode,
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

    // Interactive floor raycast helper for furniture placement
    let downClientX = 0;
    let downClientY = 0;
    let downButton = -1;
    let lastGhostRaycastMs = 0;

    const raycastFloorPoint = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hit = _raycaster.ray.intersectPlane(_floorPlane, _hitPoint);
      if (!hit) return null;
      return snapPlacementPosition(hit.x, hit.z, eng.bounds, 0.1);
    };

    // Walk mode pointer lock + drag-to-look mouse fallback
    const onCanvasClick = () => {
      if (placingAssetRef.current) return;
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

    const onPointerDown = (e: PointerEvent) => {
      downClientX = e.clientX;
      downClientY = e.clientY;
      downButton = e.button;

      if (cameraModeRef.current !== 'walk' || placingAssetRef.current) return;
      flight.active = false;
      isDraggingLook = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      isDraggingLook = false;

      // Click-to-place furniture on crisp left-click without camera drag
      if (
        placingAssetRef.current &&
        downButton === 0 &&
        e.target === renderer.domElement &&
        Math.hypot(e.clientX - downClientX, e.clientY - downClientY) < 6
      ) {
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
      }
      downButton = -1;
    };

    const onPointerMoveCanvas = (e: PointerEvent) => {
      if (!placingAssetRef.current) return;
      const eng = engineRef.current;
      if (!eng || !eng.ghostGroup) return;

      const now = performance.now();
      if (isSoftwareGl && now - lastGhostRaycastMs < 45) return;
      lastGhostRaycastMs = now;

      const pt = raycastFloorPoint(e.clientX, e.clientY);
      if (pt) {
        eng.lastHoverPos = pt;
        eng.ghostGroup.position.set(pt.x, 0.01, pt.z);
        requestRender();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (cameraModeRef.current !== 'walk' || placingAssetRef.current) return;
      const eng = engineRef.current;
      if (!eng) return;

      if (isPointerLocked) {
        flight.active = false;
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

    // Keyboard WASD / Arrows + Placement Rotate (R) / Cancel (ESC)
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
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMoveCanvas);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('pointerlockchange', onPointerLockChangeDom);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ResizeObserver keeps canvas crisp when sidebar collapses/expands or window resizes
    let prevPortrait = width < height;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        const nextPortrait = w < h;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMoveCanvas);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('pointerlockchange', onPointerLockChangeDom);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      if (engineRef.current?.ghostGroup) {
        disposeObject3D(engineRef.current.ghostGroup, sharedTexturesSet);
      }
      if (engineRef.current?.archGroup) {
        disposeObject3D(engineRef.current.archGroup, sharedTexturesSet);
      }
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
      engineRef.current?.rebuildFurnitureOnly(blueprint.furniture);
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

  // Switch Orbit vs Walk mode
  const initialModeRef = useRef(true);
  useEffect(() => {
    if (initialModeRef.current) {
      initialModeRef.current = false;
      return;
    }
    engineRef.current?.syncMode(cameraMode);
  }, [cameraMode]);

  // Smoothly teleport inside a clicked room
  useEffect(() => {
    if (!teleportRequest) return;
    engineRef.current?.flyToRoom(teleportRequest.roomId, blueprintRef.current);
  }, [teleportRequest]);

  // Reset View action
  useEffect(() => {
    if (resetNonce === 0) return;
    const eng = engineRef.current;
    if (!eng) return;
    if (cameraModeRef.current === 'orbit') {
      eng.flyToDollhouse(blueprintRef.current, false);
    } else {
      const firstRoom = blueprintRef.current.rooms[0];
      if (firstRoom) eng.flyToRoom(firstRoom.id, blueprintRef.current);
    }
  }, [resetNonce]);

  return (
    <div
      ref={containerRef}
      data-testid="arch-viewport"
      data-camera-mode={cameraMode}
      data-roof-visible={String(showRoof)}
      data-placing={placingAsset ? placingAsset.name : ''}
      data-furniture-count={String(blueprint.furniture.length)}
      className="relative w-full h-full overflow-hidden bg-[#12151c]"
    >
      {/* Isolated mount node for Three.js WebGL canvas */}
      <div
        ref={canvasMountRef}
        className={`w-full h-full ${
          placingAsset
            ? 'cursor-crosshair'
            : cameraMode === 'walk'
              ? 'cursor-crosshair'
              : 'cursor-grab active:cursor-grabbing'
        }`}
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
}
