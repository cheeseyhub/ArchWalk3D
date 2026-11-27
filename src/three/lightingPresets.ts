import type { BlueprintBounds, LightingPreset } from '../arch/types';

export interface LightingPresetConfig {
  id: LightingPreset;
  label: string;
  shortLabel: string;
  backgroundHex: number;
  fogHex: number;
  fogDensity: number;
  toneMappingExposure: number;
  environmentIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  sunColorHex: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  rimColorHex: number;
  rimIntensity: number;
  rimPosition: [number, number, number];
  interiorLightColorHex: number;
  interiorLightIntensity: number;
  downlightEmissiveIntensity: number;
}

export const LIGHTING_PRESET_ORDER: readonly LightingPreset[] = [
  'daylight',
  'golden_hour',
  'night',
] as const;

export const LIGHTING_PRESETS: Record<LightingPreset, LightingPresetConfig> = {
  daylight: {
    id: 'daylight',
    label: 'Daylight',
    shortLabel: 'Day',
    backgroundHex: 0x161c26,
    fogHex: 0x161c26,
    fogDensity: 0.012,
    toneMappingExposure: 0.96,
    environmentIntensity: 0.68,
    hemiSkyHex: 0xcfe2f8,
    hemiGroundHex: 0x453d34,
    hemiIntensity: 0.66,
    sunColorHex: 0xfff3de,
    sunIntensity: 1.55,
    sunPosition: [15, 22, 11],
    rimColorHex: 0x8fb8e6,
    rimIntensity: 0.42,
    rimPosition: [-15, 10, -13],
    interiorLightColorHex: 0xfff0d4,
    interiorLightIntensity: 0.78,
    downlightEmissiveIntensity: 1.0,
  },
  golden_hour: {
    id: 'golden_hour',
    label: 'Golden Hour',
    shortLabel: 'Golden',
    backgroundHex: 0x1a1419,
    fogHex: 0x22191c,
    fogDensity: 0.015,
    toneMappingExposure: 0.98,
    environmentIntensity: 0.52,
    hemiSkyHex: 0xf4a366,
    hemiGroundHex: 0x2b2024,
    hemiIntensity: 0.54,
    sunColorHex: 0xff8f3d,
    sunIntensity: 1.95,
    sunPosition: [24, 7.5, 11],
    rimColorHex: 0x6280b8,
    rimIntensity: 0.44,
    rimPosition: [-16, 9, -14],
    interiorLightColorHex: 0xffcf88,
    interiorLightIntensity: 1.85,
    downlightEmissiveIntensity: 1.95,
  },
  night: {
    id: 'night',
    label: 'Night',
    shortLabel: 'Night',
    backgroundHex: 0x0b0f17,
    fogHex: 0x0b0f17,
    fogDensity: 0.019,
    toneMappingExposure: 0.96,
    environmentIntensity: 0.3,
    hemiSkyHex: 0x3a527a,
    hemiGroundHex: 0x171820,
    hemiIntensity: 0.4,
    sunColorHex: 0x8eb0e6,
    sunIntensity: 0.72,
    sunPosition: [-12, 20, -14],
    rimColorHex: 0x5c7aa8,
    rimIntensity: 0.32,
    rimPosition: [14, 9, 12],
    interiorLightColorHex: 0xffcc82,
    interiorLightIntensity: 3.45,
    downlightEmissiveIntensity: 2.8,
  },
};

export interface ShadowFrustumConfig {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  targetX: number;
  targetZ: number;
}

/**
 * Fits the primary directional light's orthographic shadow frustum tightly around
 * the building footprint + exterior roof overhang so 1024x1024 texels stay sharp.
 */
export function computeTightShadowFrustum(bounds: BlueprintBounds): ShadowFrustumConfig {
  const halfDiag = Math.hypot(bounds.width / 2, bounds.depth / 2);
  const extent = Math.max(6.5, Math.min(28, Number((halfDiag + 2.4).toFixed(2))));
  return {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 1.5,
    far: Math.max(48, Math.round(extent * 3.8 + 18)),
    targetX: bounds.centerX,
    targetZ: bounds.centerZ,
  };
}

export function getLightingPresetConfig(preset: LightingPreset): LightingPresetConfig {
  return LIGHTING_PRESETS[preset] ?? LIGHTING_PRESETS.daylight;
}
