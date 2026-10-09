# B08 Parts Workflow

## Scope and plan

Implement only procurement after an approved estimate: parts assignment, stock
availability, shortage ordering, partial/full receiving and allocation into
IN_REPAIR. Use the existing Next.js API and Supabase tables/functions, verify in
the disposable native PostgreSQL harness, then apply only the reviewed B08
migration to linked Cloud project `tlqvlsrmxueuuzxyltej`. No Cloud reset or seed push.

The referenced master blueprint is absent from this checkout. After that was
reported, the user explicitly instructed implementation to proceed. B08 uses
docs/00-05 as its available contract, and docs/01-03 record the concrete payloads,
stock rules and limits. No new tables, columns, status values or endpoint paths.

## Changes

- `20261009180000_b08_parts_workflow.sql` extends the B06/B07 action RPC with
  ASSIGN_PARTS, MARK_PARTS_READY, ORDER_PARTS, RECEIVE_PARTS and ALLOCATE_PARTS.
- Cloud lint found an implicit text-to-jsonb initializer and an overly strict
  IMMUTABLE declaration on the payload normalizer. Forward migration
  `20261009180100_b08_lint_parts_payload.sql` makes the initializer explicit and
  marks it STABLE. It also ensures a shortage order on a READY booking reports
  "Missing parts have been ordered" rather than an availability notice.
  The already-applied base migration is preserved.
- Required quantities aggregate the latest approved estimate's PART lines.
  Sorted inventory locks prevent competing bookings from overallocating.
- Ordering does not change stock. It excludes quantities already ordered but
  unreceived for the job. Positive receipt deltas update PO items and stock in
  one transaction; overdelivery rolls back the whole receipt.
- READY is advisory. If another job takes the stock, allocation conflicts with
  no partial effects; a same-state shortage order/receipt can restore stock.
- Allocation deducts the complete server-derived requirement once and enters
  IN_REPAIR. Labour-only jobs create no allocation rows.
- Actions, history, notifications and idempotency receipts commit atomically.
  Repeated keys return current detail without repeating stock or audit writes.
- Cancellation releases pre-repair reservations once and rejects history that
  has already reached IN_REPAIR.
- Guarded inventory RPCs support OWNER/PARTS list/create/catalog edits. New SKUs
  can carry opening quantities; existing stock cannot be overwritten.
- Existing endpoint paths now have strict Route Handlers. Booking detail shows
  required stock summaries without private cost and restricts PO data to
  OWNER/PARTS. An additive B08 types overlay leaves database.types.ts untouched.
- RLS policies and direct-write denial remain unchanged. New helpers are not
  executable by ordinary users; only guarded RPC implementations are granted.
- Native harness shutdown encountered Windows EBUSY twice after all 124 tests
  and no-op migration checks passed. The harness now validates its newly created
  directory is inside backend/.test-data and retries only transient filesystem
  cleanup failures after the PostgreSQL process has stopped. No Cloud command,
  target selection or dependency is changed.

## Verification

Final local verification:

- `npm run db:verify:postgres`: **124/124 passed**, exit 0, duration 57723.9218 ms.
  Both B08 migrations applied; second migration application returned `applied: []`.
  Includes shared-stock competition/recovery, simultaneous same-key allocation,
  receipt bounds/rollback, final receipt failure rollback, role/tenant/grant checks,
  estimate-line aggregation, cancellation release and labour-only repair start.
- `npm test` in frontend: **137/137 passed**, 11 files, exit 0.
- `npm test -- --run src/test/parts.test.ts src/test/booking-actions.test.ts`:
  **27/27 passed**, exit 0.
- Frontend/backend `npm run typecheck`: exit 0.
- Frontend `npm run lint` and `npm run build`: exit 0; production build includes
  the four documented inventory/order/receipt/allocation route surfaces.
- Node syntax checks for the native harness and both B08/RLS Cloud test files:
  exit 0. Staged `git diff --check` flags one trailing space on line 307 of the
  already-applied base B08 migration. It is preserved to keep applied migration
  source unchanged; remaining staged files pass the whitespace check.

Cloud application and acceptance on `tlqvlsrmxueuuzxyltej`:

- Read and compared `backend/supabase/.temp/project-ref` before both pushes.
- Base dry-run/push included only `20261009180000_b08_parts_workflow.sql`,
  no seeds or roles; push exit 0. Initial lint found the normalizer declaration
  warnings documented above.
- Forward dry-run/push included only `20261009180100_b08_lint_parts_payload.sql`,
  no seeds or roles; push exit 0. Already-applied migrations were not edited.
- Final `npm run db:lint`: **No schema errors found**, empty results, exit 0.
- `npm run db:test:cloud:b08` after the forward migration: **3/3 passed**,
  duration 140202.3203 ms. Uses real Auth cookies, production Next.js Route
  Handlers and user-scoped Supabase; the application process has no admin key.
- `npm run db:test:cloud:b07`: **1/1 passed**, duration 120694.056 ms.
- `npm run db:test:cloud:b06`: **5/5 passed**, duration 83549.3187 ms.
- `npm run db:test:cloud`: **81/81 passed**, duration 168585.3576 ms. RLS/grant
  allowlists recognize B08; fixture cleanup and Auth sign-outs completed.
- The sequential B08/B07/B06/RLS command exited **0**; every suite exited 0.
- Final migration list matches local/remote through **20261009180100**; final
  dry-run reports **Remote database is up to date**, no migrations/seeds/roles.

The native CLI calls explicit database URLs "remote" even when they identify
the harness's new loopback cluster. Its reset is local/disposable and never
targets Cloud.

The only pre-existing unrelated change, frontend/src/lib/supabase/database.types.ts,
was left untouched and excluded from staging. Its SHA256 before/final verification
was `30AB0195705F149EB2A66CB13286EE7B81D5EAC19F54751E843D332E1F20E3CE`.

## Risks and limits

- B08 stops at IN_REPAIR. No repair/QC/pickup action or frontend dashboard is added.
- Catalog saves have no workflow receipt; duplicate creates conflict on shop/SKU
  and cannot increase existing stock. Manual stock adjustment is outside B08.
- Only booking-linked orders are created. Receiving is limited to PARTS_ORDERED
  and PARTS_READY. Outstanding orders on cancelled/in-repair jobs remain audit
  records; supplier cancellation/replenishment accounting is outside this phase.
- Cancellation preserves received physical inventory and purchase orders. There
  is no unsupported PO cancellation state or automatic supplier reversal.
- Expected version changes only on state transitions. Distinct positive receipt
  intents in the same state still validate against remaining order quantities;
  each retry must reuse its original idempotency key.
- Marked Cloud fixture shops and memberships are deactivated; audit/order/stock
  records are retained. IN_REPAIR fixtures are not reversed to CANCELLED.

Next backend phase: B09 repair, QC claim/fail/pass loop and pickup.
