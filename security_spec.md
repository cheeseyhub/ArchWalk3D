# Security Specification — ArchWalk 3D Firestore Rules

## 1. Data Invariants
1. **Default Deny**: Every collection outside `/blueprints/{blueprintId}` and `/furnitureAssets/{assetId}` is denied read and write.
2. **Verified Owner Isolation**: Only authenticated users with `request.auth.token.email_verified == true` may read, list, create, update, or delete their own documents (`ownerId == request.auth.uid`).
3. **Immutable Ownership & Creation Time**: `ownerId` and `createdAt` can never be mutated after creation. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **Action-Based Blueprint Updates**: Updates to `/blueprints/{blueprintId}` are strictly restricted to:
   - Rename (`affectedKeys().hasOnly(['name', 'updatedAt'])`)
   - Furniture placement edits (`affectedKeys().hasOnly(['furniture', 'updatedAt'])`)
   Both wrapped in `isValidBlueprint(incoming())`.
5. **Immutable Furniture Catalog Assets**: `/furnitureAssets/{assetId}` documents are immutable after creation (`allow update: if false;`), strictly bounded (`parts.size() >= 1 && parts.size() <= 16`, `name <= 80`, `description <= 240`, `prompt <= 400`, dimensions within physical meters), and stored as native maps/lists.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Fail with PERMISSION_DENIED)
1. Unauthenticated read/list on `/blueprints` or `/furnitureAssets`.
2. Unverified email user (`email_verified: false`) creating a `/furnitureAssets/fa_1` doc.
3. Cross-user `get` or `list` targeting another user's `ownerId`.
4. Spoofing `ownerId` on `/furnitureAssets/{assetId}` create (`ownerId: "victim_uid"`).
5. Shadow field / mass assignment (`isAdmin: true`, `imageBase64: "..."`) on create for either collection.
6. Volumetric DoS on `/furnitureAssets` (`parts` array of 25 items or `name` of 200 chars).
7. Empty `parts` array (`parts: []`) or non-map part (`parts: ["bad"]`) on `/furnitureAssets`.
8. Backdated/future-dated `createdAt` timestamp on create (`createdAt != request.time`).
9. Mutating `/furnitureAssets/{assetId}` via `update` (must always be denied).
10. Blueprint update attempting to change `ownerId`, `rooms`, `walls`, or `createdAt` alongside `furniture`.
11. Blueprint furniture update exceeding 150 items or injecting non-map furniture entry (`furniture: ["bad"]`).
12. Malformed document ID with path traversal or oversized characters (`../evil` or 200-char ID).
