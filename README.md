# ArchWalk 3D

**Convert architectural floor plans, building exteriors, and room photos into interactive, walkable 3D architectural models powered by Gemini Vision and Three.js.**

[![Development App](https://img.shields.io/badge/Live%20Development%20App-Cloud%20Run-d99b4e?style=for-the-badge)](https://ais-dev-4uykxg4zwp4jijhotuu4re-598168739165.asia-southeast1.run.app)
[![Shared Preview](https://img.shields.io/badge/Shared%20Preview-Cloud%20Run-2b303b?style=for-the-badge)](https://ais-pre-4uykxg4zwp4jijhotuu4re-598168739165.asia-southeast1.run.app)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-000000?style=flat-square&logo=threedotjs)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-ffca28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com/)

---

## Live Links

-- **Live Link :** (https://archwalk-3d.ai.studio)
> **Note:** ArchWalk 3D requires Google Sign-In via Firebase Authentication to save generated blueprints and custom furniture packs to your private cloud workspace.

---

## Overview

ArchWalk 3D is a full-stack architectural visualization studio that turns 2D images (floor plans, exterior elevations, or interior photographs) into real-time, navigable 3D spaces. Users can inspect models in Orbit Mode, walk inside at eye level with collision detection, interact with appliances and lighting, rearrange or generate custom 3D furniture, iterate with natural-language AI edits, persist models to Firestore, and export standard `.gltf` assets for Blender, Unreal Engine, or Unity.

---

## Key Features

### 1. Spatial Accuracy AI Pipeline
- **Hidden Coordinate Grid Pre-Processing:** Uploaded images are rendered onto an offscreen HTML5 Canvas with a numbered `10×10` (`A–J` × `1–10`) reference grid before being sent to Gemini Vision, anchoring real-world proportions to standard `0.9 m` door widths and `2.8 m` wall heights while keeping the original clean image in the UI preview.
- **Live Streaming Build Display:** Blueprint generation streams over Server-Sent Events (SSE) with a real-time build progress HUD displaying room discovery, wall count, furniture placement, and completion milestones.
- **Automated Geometry Cleanup (`sanitizeBlueprint`):** Every generated blueprint passes through a deterministic post-processing stage that snaps wall endpoints within `0.18 m` to eliminate corner gaps and merges collinear overlapping walls within `0.15 m` while preserving all door and window openings.
- **Iterative AI Editing with History:** Refine existing models using natural-language prompts (e.g., adding rooms, changing materials, or reconfiguring layouts) backed by a full Undo/Redo history stack.

### 2. Realistic ArchViz & 60 FPS Three.js Performance
- **Physically Based Lighting & Tone Mapping:** Uses `THREE.ACESFilmicToneMapping` and Image-Based Lighting (`PMREMGenerator` + `RoomEnvironment`) with calibrated **Daylight**, **Golden Hour**, and **Night** lighting presets.
- **Procedural PBR Material Engine:** Generates synchronized albedo, tangent-space normal, and roughness maps (`wood`, `tile`, `carpet`, `concrete`, `plaster`) cached in memory at `≤ 512×512` resolution with deterministic GPU disposal on blueprint swaps.
- **High / Fast Quality Toggle:** Defaults to **Fast** (direct `WebGLRenderer`, capped pixel ratio `≤ 1.5`) for smooth 60 FPS navigation, with an optional **High** mode enabling `EffectComposer` + `GTAOPass` contact ambient occlusion.
- **Optimized Shadows & Glass:** Uses a single shared translucent reflective `MeshStandardMaterial` for window glass (eliminating costly transmission passes) and an on-demand `1024×1024` directional sunlight shadow map whose frustum fits tightly to the building bounds and updates only when geometry, furniture, doors, roof visibility, or lighting changes.
- **In-Place Furniture Updates & Targeted Raycasting:** Moving, rotating, resizing, or recoloring furniture mutates only the affected Three.js group without rebuilding walls or floors, and pointer hover raycasting is throttled (`≥ 50 ms`) against dedicated interactive target arrays.

### 3. Direct Double-Click Furniture Editing & Arrange Mode
- **Double-Click Anywhere in Orbit Mode:** Double-clicking any furniture piece immediately highlights it with an architectural brass base ring and opens the floating **Furniture Inspector** without needing to toggle a separate mode.
- **Real-Time Manipulation:**
  - **Drag to Move:** Drag selected furniture directly across the floor plane (`y = 0` locked) while `OrbitControls` temporarily pauses.
  - **Free Rotation:** Smooth `0°–360°` rotation slider, quick `-45°` / `+45°` buttons, and `R` / `Shift+R` shortcuts.
  - **Live Resize & Finish:** Adjust width, depth, height, architectural color swatches, or a custom color picker in place.
  - **Duplicate & Delete:** Clone items nearby or remove them (`Delete` / `Backspace`).
- **Arrange Mode & Add Item Drawer:** Toggle **Arrange Furniture** in the top toolbar to spawn procedural items (`sofa`, `bed`, `table`, `chair`, `desk`, `rug`, `coffee_table`, `bookshelf`, `wardrobe`, `fridge`, `floor_lamp`, `plant`, `tv_stand`, `bathtub`, etc.) directly into the scene.
- **Clean History Sync:** All edits commit once on drag-end or control release to the Blueprint JSON state and Undo/Redo stack, automatically propagating to AI Edit, cloud saves, and glTF export.

### 4. Interactive Furniture & Walk Mode
- **Orbit & First-Person Walk Modes:** Switch between aerial inspection (with **Cutaway Roof** and **Room Teleport**) and eye-level walkthrough (`WASD` + mouse look + wall collision with unobstructed doorway pass-through).
- **Functional In-World Interactions:** Hover or look within `2.5 m` for contextual HUD prompts (`Click` in Orbit Mode or `E` in Walk Mode):
  - **Floor Lamp:** Toggle warm interior illumination and emissive shade.
  - **TV Stand:** Toggle between dark reflective glass and an active ambient screen glow.
  - **Fridge & Wardrobe:** Smoothly animate hinged doors swinging `90°` open and closed.
  - **Sofa & Chair:** In Walk Mode, smoothly sit down at seated eye height (`y = 1.1 m`) facing outward; press any movement key to stand back up.

### 5. AI Furniture Generator, Cloud Persistence & glTF Export
- **Prompt-to-Furniture Sets:** Describe a style or theme to generate three custom multi-part 3D furniture pieces at once, place them anywhere in your building, and store them in Firestore so they persist across reloads.
- **Mandatory Google Authentication & Saved Library:** Built houses and generated furniture packs are automatically persisted to Firebase Firestore per authenticated user so models never need to be regenerated after page reloads.
- **Export to glTF (`.gltf`):** Export the complete architectural model (including geometry, materials, and arranged furniture) as a standard glTF 2.0 file directly from the viewport toolbar.

---

## Controls & Shortcuts

| Mode | Input | Action |
| :--- | :--- | :--- |
| **Orbit Mode** | Left-drag / Right-drag / Scroll | Orbit camera / Pan / Zoom |
| **Orbit Mode** | Single-click interactive item | Toggle lamp, TV, fridge, or wardrobe door |
| **Orbit Mode** | **Double-click** any furniture | Select item & open Furniture Inspector |
| **Selected Item** | Drag item on floor | Move furniture (`y = 0` locked) |
| **Selected Item** | `R` / `Shift + R` | Rotate `+45°` / `-45°` |
| **Selected Item** | `Delete` / `Backspace` | Delete selected furniture |
| **Selected Item** | `Esc` or click empty background | Deselect and close inspector |
| **Walk Mode** | Click canvas | Lock pointer for first-person look |
| **Walk Mode** | `W` `A` `S` `D` / Arrow keys | Walk through rooms & doorways |
| **Walk Mode** | `E` | Interact with lamp, TV, doors, or sit on sofa/chair |
| **Walk Mode** | `Esc` | Release pointer lock |
| **Placement** | Move mouse / `R` / Click / `Esc` | Preview / Rotate / Place / Cancel custom furniture |

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, Motion
- **3D Engine:** Three.js (`OrbitControls`, `RoomEnvironment`, `PMREMGenerator`, `EffectComposer`, `GTAOPass`, `GLTFExporter`)
- **Backend:** Express.js (`server.ts`) with Vite dev middleware and SSE streaming endpoints
- **AI Models:** `@google/genai` SDK (Gemini Vision & structured JSON blueprint/furniture generation)
- **Auth & Database:** Firebase Authentication (Google Sign-In) & Cloud Firestore with security rules (`firestore.rules`)

---

## Project Structure

```text
.
├── server.ts                       # Express server, Firebase token verification & Gemini API routes
├── firestore.rules                 # Cloud Firestore security rules
├── firebase-blueprint.json         # Firestore schema blueprint
├── src/
│   ├── App.tsx                     # Root studio state, history stack, auth & cloud sync
│   ├── arch/
│   │   ├── types.ts                # SpatialBlueprint, furniture, wall & interaction types
│   │   ├── blueprint.ts            # Blueprint normalization, bounds & camera pose helpers
│   │   ├── blueprintHistory.ts     # Undo/Redo history & furniture mutation helpers
│   │   ├── collision.ts            # First-person wall collision & doorway clearance
│   │   ├── demoHouse.ts            # Built-in Cedar Courtyard Residence demo model
│   │   ├── furnitureCatalog.ts     # Custom AI furniture normalization & placement snapping
│   │   ├── gridOverlay.ts          # Offscreen 10x10 (A-J x 1-10) coordinate grid utility
│   │   ├── sanitizeBlueprint.ts    # Corner snapping (0.18m) & duplicate wall merging (0.15m)
│   │   ├── savedPayload.ts         # Firestore blueprint payload sanitization & ID helpers
│   │   ├── sseParser.ts            # Streaming SSE parser for live blueprint builds
│   │   ├── streamProgress.ts       # Incremental JSON stream progress tracker
│   │   └── wallGeometry.ts         # Wall pier, lintel & sill decomposition around openings
│   ├── three/
│   │   ├── buildArchitecture.ts    # Procedural walls, openings, shared glass, roof & site
│   │   ├── buildFurniture.ts       # Procedural & custom furniture meshes + in-place mutators
│   │   ├── exportGltf.ts           # glTF 2.0 scene filtering & export pipeline
│   │   ├── lightingPresets.ts      # Daylight/Golden/Night presets & tight shadow frustum
│   │   ├── pbrMath.ts              # Tangent-space normal & roughness map generation math
│   │   └── textures.ts             # Cached <=512px procedural PBR CanvasTexture library
│   ├── firebase/
│   │   ├── client.ts               # Firebase Auth & Firestore client initialization
│   │   ├── blueprints.ts           # Saved building CRUD & local fallback cache
│   │   └── furnitureAssets.ts      # Generated 3-piece furniture pack persistence
│   └── components/
│       ├── ArchViewport.tsx        # Three.js viewport, raycasting, drag/edit & Walk controller
│       ├── ViewportToolbar.tsx     # Orbit/Walk, Arrange, Undo/Redo, Lighting, Quality & glTF
│       ├── FurnitureInspector.tsx  # Floating inspector (0-360° rotation, W/D/H, finish, clone)
│       ├── AddFurniturePopover.tsx # Procedural furniture catalog spawner
│       ├── FurniturePanel.tsx      # AI 3-piece furniture generator & saved library
│       ├── StudioSidebar.tsx       # Image upload, AI Edit, Room Teleport & saved houses
│       ├── InteractionHud.tsx      # Hover/look interaction prompts & Walk crosshair
│       ├── BuildProgressOverlay.tsx# Live streaming build indicator
│       ├── PlacementHud.tsx        # Custom furniture placement overlay
│       ├── WalkModeHud.tsx         # Walk mode controls overlay
│       └── AuthGate.tsx            # Mandatory Google Sign-In screen
└── package.json
```

---

## Backend API Routes

All `/api/*` endpoints require a valid Firebase Auth ID token in the `Authorization: Bearer <token>` header.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/blueprint/generate-stream` | `POST` | Streams a `SpatialBlueprint` from an uploaded gridded image or AI edit prompt via SSE. |
| `/api/blueprint/generate` | `POST` | Non-streaming fallback endpoint returning a complete sanitized `SpatialBlueprint` JSON payload. |
| `/api/furniture/generate` | `POST` | Generates a batch of 3 procedural multi-part 3D furniture items from a text prompt. |

---

## Local Development

### Prerequisites
- Node.js 20+ (or compatible runtime with `npm` / `npx`)
- A Gemini API key (`GEMINI_API_KEY`)
- A Firebase project configured in `firebase-applet-config.json` with Google Authentication and Firestore enabled

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and populate your local values:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY="your_gemini_api_key"
APP_URL="http://localhost:3000"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

Starts Express + Vite middleware on port `3000`:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### 4. Build, Type-Check & Test

```bash
# Type-check TypeScript
npm run lint

# Run unit tests (spatial geometry, blueprint sanitization, history, PBR math, lighting, glTF)
npx tsx --test src/arch/*.test.ts src/three/*.test.ts

# Production build
npm run build
```

---

## Security & Data Model

- **Server-Side API Keys:** `GEMINI_API_KEY` is read strictly on the Express backend (`server.ts`) and never exposed to client bundles.
- **Authenticated Cloud Storage:** All saved blueprints (`blueprints`) and generated furniture packs (`furnitureAssets`) are scoped by authenticated user UID and enforced by `firestore.rules`.
