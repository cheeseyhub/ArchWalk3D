import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRedo,
  canUndo,
  classifyFurnitureItemDiff,
  computeSeatCameraPose,
  createCatalogFurnitureItem,
  createHistory,
  duplicateFurnitureAt,
  getFurnitureInteractionDescriptor,
  moveFurnitureAt,
  PROCEDURAL_FURNITURE_CATALOG,
  pushHistory,
  recolorFurnitureAt,
  redoHistory,
  removeFurnitureAt,
  resizeFurnitureAt,
  rotateFurnitureAt,
  setFurnitureRotationAt,
  undoHistory,
} from './blueprintHistory';
import { DEMO_HOUSE_BLUEPRINT } from './demoHouse';

test('Undo/Redo history stack pushes, undoes, redoes, and clears redo branch on new edit', () => {
  let hist = createHistory(DEMO_HOUSE_BLUEPRINT);
  assert.equal(canUndo(hist), false);
  assert.equal(canRedo(hist), false);

  const moved = moveFurnitureAt(hist.present, 0, -1.5, 2.2);
  hist = pushHistory(hist, moved);
  assert.equal(canUndo(hist), true);
  assert.equal(canRedo(hist), false);
  assert.equal(hist.present.furniture[0].x, -1.5);

  const rotated = rotateFurnitureAt(hist.present, 0, Math.PI / 4);
  hist = pushHistory(hist, rotated);

  hist = undoHistory(hist);
  assert.equal(hist.present.furniture[0].x, -1.5);
  assert.equal(hist.present.furniture[0].rotationY, DEMO_HOUSE_BLUEPRINT.furniture[0].rotationY);
  assert.equal(canRedo(hist), true);

  hist = redoHistory(hist);
  assert.ok(Math.abs(hist.present.furniture[0].rotationY - (DEMO_HOUSE_BLUEPRINT.furniture[0].rotationY + Math.PI / 4)) < 0.002);

  // Branching from undone state clears future stack
  hist = undoHistory(hist);
  const recolored = recolorFurnitureAt(hist.present, 0, '#a46042');
  hist = pushHistory(hist, recolored);
  assert.equal(canRedo(hist), false);
  assert.equal(hist.present.furniture[0].color, '#a46042');
});

test('Arrange mutation helpers resize, duplicate, spawn, and remove cleanly without mutating previous snapshots', () => {
  const initialCount = DEMO_HOUSE_BLUEPRINT.furniture.length;

  const resized = resizeFurnitureAt(DEMO_HOUSE_BLUEPRINT, 0, 2.8, 1.1);
  assert.equal(resized.furniture[0].width, 2.8);
  assert.equal(resized.furniture[0].depth, 1.1);
  assert.notEqual(DEMO_HOUSE_BLUEPRINT.furniture[0].width, 2.8);

  const dup = duplicateFurnitureAt(resized, 0);
  assert.equal(dup.blueprint.furniture.length, initialCount + 1);
  assert.equal(dup.newIndex, initialCount);
  assert.notEqual(dup.blueprint.furniture[dup.newIndex].x, resized.furniture[0].x);

  const spawned = createCatalogFurnitureItem('floor_lamp', 1.2, -0.5);
  assert.equal(spawned.type, 'floor_lamp');
  assert.equal(spawned.x, 1.2);
  assert.equal(spawned.z, -0.5);

  const removed = removeFurnitureAt(dup.blueprint, dup.newIndex);
  assert.equal(removed.furniture.length, initialCount);
  assert.ok(PROCEDURAL_FURNITURE_CATALOG.length >= 16);
});

test('getFurnitureInteractionDescriptor distinguishes Walk vs Orbit interactions cleanly', () => {
  // Floor lamp, TV, Fridge, Wardrobe work in both Orbit and Walk modes
  assert.equal(
    getFurnitureInteractionDescriptor('floor_lamp', 'orbit', true)?.actionLabel,
    'Turn Floor Lamp Off',
  );
  assert.equal(
    getFurnitureInteractionDescriptor('tv_stand', 'walk', false)?.actionLabel,
    'Turn TV On',
  );
  assert.equal(
    getFurnitureInteractionDescriptor('fridge', 'orbit', false)?.actionLabel,
    'Open Fridge',
  );
  assert.equal(
    getFurnitureInteractionDescriptor('wardrobe', 'walk', true)?.actionLabel,
    'Close Wardrobe',
  );

  // Sofa & chair sitting is available in Walk Mode only
  assert.equal(getFurnitureInteractionDescriptor('sofa', 'orbit', false), null);
  assert.equal(
    getFurnitureInteractionDescriptor('sofa', 'walk', false)?.interactionKind,
    'sit',
  );
  assert.equal(
    getFurnitureInteractionDescriptor('chair', 'walk', false)?.actionLabel,
    'Sit on Chair',
  );
});

test('computeSeatCameraPose places seated eye height at 1.1m facing outward along furniture +Z', () => {
  const sofa = {
    type: 'sofa' as const,
    x: -4.0,
    z: 1.5,
    rotationY: Math.PI / 2, // +Z rotated +90 deg around Y points toward +X
    width: 2.2,
    depth: 0.92,
    height: 0.82,
    color: '#5c646d',
  };

  const pose = computeSeatCameraPose(sofa);
  assert.equal(pose.position[1], 1.1);
  assert.ok(pose.lookAt[0] > pose.position[0] + 2.0, 'Should look outward along +X');
  assert.equal(pose.standPosition[1], 1.62);
  assert.ok(pose.standPosition[0] > sofa.x + 0.5, 'Stand position clears front of sofa');
});

test('setFurnitureRotationAt, height resize, and classifyFurnitureItemDiff support in-place updates', () => {
  const baseItem = DEMO_HOUSE_BLUEPRINT.furniture[0];
  const rotatedBp = setFurnitureRotationAt(DEMO_HOUSE_BLUEPRINT, 0, Math.PI * 0.75);
  assert.ok(Math.abs(rotatedBp.furniture[0].rotationY - Math.PI * 0.75) < 0.002);
  assert.equal(classifyFurnitureItemDiff(baseItem, rotatedBp.furniture[0]), 'transform');

  const recoloredBp = recolorFurnitureAt(DEMO_HOUSE_BLUEPRINT, 0, '#546e55');
  assert.equal(classifyFurnitureItemDiff(baseItem, recoloredBp.furniture[0]), 'color');

  const bothBp = recolorFurnitureAt(rotatedBp, 0, '#546e55');
  assert.equal(classifyFurnitureItemDiff(baseItem, bothBp.furniture[0]), 'transform_and_color');

  const resizedWithHeight = resizeFurnitureAt(DEMO_HOUSE_BLUEPRINT, 0, 2.4, 1.0, 1.15);
  assert.equal(resizedWithHeight.furniture[0].height, 1.15);
  assert.equal(classifyFurnitureItemDiff(baseItem, resizedWithHeight.furniture[0]), 'rebuild_item');
  assert.equal(classifyFurnitureItemDiff(baseItem, baseItem), 'none');
});
