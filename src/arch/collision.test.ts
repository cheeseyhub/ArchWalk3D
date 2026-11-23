import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWallColliders, resolvePlayerCollision } from './collision';
import type { BlueprintWall } from './types';

test('player is blocked by solid wall but passes unobstructed through doorway', () => {
  const wallWithDoor: BlueprintWall = {
    id: 'w-door',
    x1: 0,
    z1: 0,
    x2: 6,
    z2: 0,
    height: 3,
    thickness: 0.2,
    color: '#ffffff',
    openings: [{ type: 'door', offset: 2.5, width: 1.2, height: 2.2, sillHeight: 0 }],
  };

  const colliders = buildWallColliders([wallWithDoor]);
  // Should only produce 2 piers (lintel does not block walking)
  assert.equal(colliders.length, 2);

  // Walking into the solid pier at x=1.0 should push player back out
  const hitPier = resolvePlayerCollision(1.0, 0.12, 0.28, colliders);
  assert.equal(hitPier.collided, true);
  assert.ok(hitPier.z >= 0.37, `Expected pushout >= 0.37, got ${hitPier.z}`);

  // Walking right through the center of the door opening (x=3.1) should pass freely
  const throughDoor = resolvePlayerCollision(3.1, 0.0, 0.28, colliders);
  assert.equal(throughDoor.collided, false);
  assert.equal(throughDoor.x, 3.1);
  assert.equal(throughDoor.z, 0.0);
});
