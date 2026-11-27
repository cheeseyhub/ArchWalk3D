import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBlueprintBounds } from '../arch/blueprint';
import { DEMO_HOUSE_BLUEPRINT } from '../arch/demoHouse';
import {
  computeTightShadowFrustum,
  getLightingPresetConfig,
  LIGHTING_PRESET_ORDER,
  LIGHTING_PRESETS,
} from './lightingPresets';
import { MAX_PROCEDURAL_TEXTURE_SIZE, quantizeTextureRepeat } from './textures';

test('all three architectural lighting presets are calibrated with distinct exposure and interior light', () => {
  assert.deepEqual(LIGHTING_PRESET_ORDER, ['daylight', 'golden_hour', 'night']);

  const day = getLightingPresetConfig('daylight');
  const golden = getLightingPresetConfig('golden_hour');
  const night = getLightingPresetConfig('night');

  // Exposure values stay in balanced ACESFilmic range
  for (const cfg of [day, golden, night]) {
    assert.ok(cfg.toneMappingExposure >= 0.85 && cfg.toneMappingExposure <= 1.3);
    assert.ok(cfg.environmentIntensity > 0 && cfg.environmentIntensity <= 1.2);
  }

  // Sun angle is lower in Golden Hour than Daylight for long warm architectural shadows
  assert.ok(golden.sunPosition[1] < day.sunPosition[1]);

  // Night boosts warm interior architectural fixtures while dropping exterior sky IBL
  assert.ok(night.interiorLightIntensity > golden.interiorLightIntensity);
  assert.ok(golden.interiorLightIntensity > day.interiorLightIntensity);
  assert.ok(night.environmentIntensity < day.environmentIntensity);
  assert.equal(Object.keys(LIGHTING_PRESETS).length, 3);
});

test('computeTightShadowFrustum fits the building footprint tightly and texture cache caps at 512px', () => {
  const bounds = computeBlueprintBounds(DEMO_HOUSE_BLUEPRINT);
  const frustum = computeTightShadowFrustum(bounds);

  assert.equal(frustum.left, -frustum.right);
  assert.equal(frustum.bottom, -frustum.top);
  assert.ok(frustum.right >= Math.max(bounds.width, bounds.depth) / 2);
  assert.ok(frustum.right <= 20, 'Frustum should remain tight around demo house');
  assert.equal(frustum.targetX, bounds.centerX);
  assert.equal(frustum.targetZ, bounds.centerZ);

  assert.ok(MAX_PROCEDURAL_TEXTURE_SIZE <= 512);
  assert.equal(quantizeTextureRepeat(2.24), 2.0);
  assert.equal(quantizeTextureRepeat(2.26), 2.5);
  assert.equal(quantizeTextureRepeat(0.1), 0.5);
});
