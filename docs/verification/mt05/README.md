# MT05 Marked Production Fixture Cleanup

## Plan

Inventory the exact linked project, identify only the existing B11 marker and
deterministic shop IDs, reject collisions or dependencies outside that fixture
set, perform one transaction-bound deletion, and verify the inventory is empty.
Never reset Cloud or match garages by names.

## Changes

- Added `backend/scripts/cleanup-cloud-demo.mjs` and
  `npm run db:demo:cleanup`.
- Dry-run is the default and requires an exact linked-project reference.
- Execution requires `--execute` and a project-specific confirmation phrase.
- Inventory covers Auth users, shops, memberships, catalog, slots, vehicles,
  bookings, every workflow child, immutable history, notifications, and private
  idempotency receipts.
- Cleanup rejects deterministic-ID ownership collisions and marked-user
  dependencies outside the target shops.
- The immutable-history trigger is disabled only inside the exact cleanup
  transaction and restored before commit; errors roll the transaction back.

## Cloud evidence

The dry-run found 3 shops, 16 marked Auth users, 15 memberships, 3 services,
104 slots, 3 inventory parts, 10 vehicles, 9 bookings, and their dependent rows.
`identity_collisions` and `external_dependencies` were both zero.

The approved execution returned `remaining_fixture_rows: 0`. A repeated dry-run
reported zero for every category. Production `GET /api/v1/shops?page=1` then
reported zero items and total zero. No Cloud database reset occurred.

## Tests

- Cleanup guard tests: 3/3 passed.
- Complete native suite: 148/148 passed.
- `git diff --check`: exit 0.

## Risk

The utility is specific to `bayflow-demo-b11-v1`; it is not an owner-shop deletion
feature and must not be generalized to display-name matching.
