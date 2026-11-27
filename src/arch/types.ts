export type InputMode = 'floor_plan' | 'exterior' | 'single_room';

export type CameraMode = 'orbit' | 'walk';

export type LightingPreset = 'daylight' | 'golden_hour' | 'night';

export type RenderQuality = 'high' | 'fast';

export type RoofStyle = 'flat' | 'gabled';

export type FloorMaterialType = 'wood' | 'tile' | 'carpet' | 'concrete';

export type OpeningType = 'door' | 'window';

export type FurnitureType =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'chair'
  | 'desk'
  | 'counter'
  | 'toilet'
  | 'sink'
  | 'bathtub'
  | 'plant'
  | 'tv_stand'
  | 'rug'
  | 'coffee_table'
  | 'bookshelf'
  | 'wardrobe'
  | 'fridge'
  | 'floor_lamp';

export type FurnitureInteractionKind =
  | 'toggle_lamp'
  | 'toggle_tv'
  | 'toggle_door'
  | 'sit';

export interface HoveredFurnitureInfo {
  index: number;
  type: FurnitureType;
  label: string;
  actionLabel: string;
  interactionKind: FurnitureInteractionKind;
}

export type FurnitureCategory =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'chair'
  | 'desk'
  | 'counter'
  | 'toilet'
  | 'sink'
  | 'plant'
  | 'tv_stand'
  | 'custom';

export type FurniturePartShape = 'box' | 'cylinder' | 'sphere';

export type FurnitureMaterialKind =
  | 'wood'
  | 'fabric'
  | 'metal'
  | 'glass'
  | 'ceramic'
  | 'stone'
  | 'foliage';

export interface FurniturePartSpec {
  shape: FurniturePartShape;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  color: string;
  material: FurnitureMaterialKind;
}

export interface GeneratedFurnitureAsset {
  id: string;
  name: string;
  description: string;
  category: FurnitureCategory;
  prompt: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  parts: FurniturePartSpec[];
  createdAtMs: number;
  persistedInCloud?: boolean;
}

export interface BlueprintRoof {
  style: RoofStyle;
  color: string;
  overhang: number;
}

export interface BlueprintRoom {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  floorMaterial: FloorMaterialType;
  floorColor: string;
}

export interface WallOpening {
  type: OpeningType;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface BlueprintWall {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  thickness: number;
  color: string;
  openings: WallOpening[];
}

export interface BlueprintFurniture {
  id?: string;
  name?: string;
  type: FurnitureType;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  customParts?: FurniturePartSpec[];
}

export interface SpatialBlueprint {
  name: string;
  roof: BlueprintRoof;
  rooms: BlueprintRoom[];
  walls: BlueprintWall[];
  furniture: BlueprintFurniture[];
}

export interface BlueprintBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  maxWallHeight: number;
}
