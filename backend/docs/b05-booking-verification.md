# B05 Transactional Booking Creation

## Plan and scope

Read AGENTS.md, blueprint B05 and root docs/00-05, existing SQL/auth/catalog code
and B01-B04 verification notes before editing. B04's dependency gate passed in
Cloud at checkpoint `40f1fc0`: migration applied with explicit approval, Cloud
lint passed, catalog 7/7 and post-migration RLS 81/81 passed with cleanup.

Implement only POST /api/v1/bookings, a narrow transactional booking RPC, private
idempotency storage, validation/types, meaningful native/API tests and a manual
Cloud acceptance suite. No UI, B06 transitions or extra backend server.
The user subsequently requested local implementation and manual Cloud application.
The user ran the B05 review/dry-run/push gate; the agent ran acceptance tests
after the migration was present in Cloud.

## Changes and security

- Migration: `20261009140203_b05_transactional_booking.sql`; six migrations now
  apply in the native harness. Previously deployed migrations are unchanged.
- RPC: public SECURITY INVOKER create_booking delegates to guarded private
  SECURITY DEFINER create_booking_impl. Empty search paths, qualified names,
  authenticated-only EXECUTE; private DTO helper has no client EXECUTE.
- New private booking_receipts table, actor/key primary key in CREATE_BOOKING
  namespace, canonical payload, booking FK and timestamp. RLS/no policies and
  revoked client grants; no public table, status or read-policy changes.
- Auth identity -> shared shop -> exclusive slot locks. READ COMMITTED is required
  to ensure fresh counts after waiting; higher isolation gets a retry conflict.
  The shop lock preserves B04's lock order and freezes settings/catalog/team edits.
- Current-clock publication/grid/horizon/capacity checks; all non-CANCELLED
  bookings count, including COMPLETED. Never trust public capacityRemaining.
- Strict SQL and Zod validation; verified getUser identity and user-scoped RPC.
  Existing own vehicles are reused only for matching plate/details and never
  updated. Foreign vehicle IDs are rejected as unsupported payload; foreign
  plates cannot confer another vehicle's ownership. No password field is allowed.
- PENDING booking, services, creation history, active-SA notices and receipt are
  atomic. New profile/vehicle side effects roll back on failure. Replays return
  current own booking state; changed normalized payload returns safe 409.
- Additive database.b05.ts overlay preserves the user's database.types.ts change.
- Best-effort bounded per-process HTTP limiter: 30 requests/minute per actor.
- Native test files run sequentially because the race suite commits isolated
  local fixtures; concurrency assertions still use independent simultaneous
  transactions. No sleep-based synchronization or capacity fix is used.

API limits, normalization, DTO/status codes and vehicle reuse are documented in
docs/02; schema/lock/receipt details are in docs/01. Reused vehicles are not edited.
Duplicate legacy own plates select the earliest created_at then ID; differing
details require an explicit future vehicle-management flow.

## Verification

Executed local results:

- `npm run db:verify:postgres`: **104/104 passed, 0 failed**, exit 0
  (35402.2101 ms for final tests). Six migrations + seed applied to a fresh generated
  loopback PostgreSQL 17 cluster; second application returned `applied: []`.
  Types were preserved and the disposable cluster shut down. The CLI calls this
  explicit loopback URL "remote"; it did not reset or contact Cloud.
- Sixteen B05 native tests cover known/unknown symptoms, vehicle ownership/reuse,
  same-key retries/mismatches, authorization/grants, invalid/foreign/inactive
  resources, current schedule/horizon, final-write rollback and independent
  connection races. Eight distinct customers at capacity two produced exactly
  two complete bookings and six BF001 conflicts with no losing vehicle effects.
  Eight simultaneous retries produced one booking/vehicle/services/history/notice/
  receipt. Concurrent distinct keys reused one own vehicle. Deterministic lock
  observation proved booking vs owner-save serialization in both directions.
  Final-write fault injection also proved a new actor profile rolls back; explicit
  capacity checks proved COMPLETED still counts and CANCELLED releases a place.
- The first native run found an ambiguous services variable/table reference.
  The table was explicitly aliased and the full rerun above passed. No deployed
  migration was edited.
- `npm run test` in frontend: **9 files / 110 tests passed**, exit 0.
  Includes strict payload, 401/403/409, single-RPC, narrow DTO, replay status and
  rate-limit tests, plus existing auth/catalog regressions.
- Frontend typecheck and backend typecheck: exit 0.
- Cloud B05/RLS JavaScript syntax checks: exit 0 before manual application.
- Frontend ESLint and production Next.js build: exit 0; the build compiled
  /api/v1/bookings and all existing B03/B04 routes.
- `npm run test:smoke`: **15/15 passed**, exit 0. Includes production booking
  401 and cross-origin 403 with no-store/safe envelopes; uses no real credentials
  and performs no Cloud writes.
- `git diff --check`: passed. Scoped checkpoint excludes the user's types file.

Executed Cloud results after user-run migration application:

- User confirmed the linked project reference `tlqvlsrmxueuuzxyltej`, migration
  list showed only B05 pending, and `supabase db push --dry-run` reported only
  `20261009140203_b05_transactional_booking.sql`.
- User then applied B05 manually; no seed or role push was reported.
- `npm run db:lint`: passed before the failing/passing test reruns.
- `npm run db:test:cloud:b03`: **12/12 passed**, exit 0
  (173848.9367 ms).
- `npm run db:test:cloud:b04`: **7/7 passed**, exit 0
  (114097.9286 ms).
- Initial B05 Cloud runs exposed a test harness typo in `effects()`: the vehicle
  count subquery missed a closing parenthesis, causing CLI SQL syntax errors near
  `vehicles`. The migration and API path were not changed.
- The shared Cloud CLI helper was hardened to parse JSON when Supabase prints a
  progress banner before it and to retry transient `db query` calls without
  exposing CLI output.
- After rebuilding the frontend, `npm run db:test:cloud:b05`: **9/9 passed**,
  exit 0 (236612.1884 ms).
- `npm run db:test:cloud`: **81/81 passed**, exit 0 (135183.2019 ms), with B02
  shops hidden, staff deactivated and Auth sessions signed out.

## Cloud commands and acceptance gate

Build the current frontend first; run Cloud suites sequentially because they use
shared marked fixtures. The B05 suite refuses fixture provisioning until the
exact B05 migration exists. It starts production Next.js without an Admin key;
Admin access exists only in test fixture tooling. Keys/tokens remain in memory.
No suite applies schema or imports the native seed into Cloud.

```powershell
Set-Location D:\BAYFLOW\frontend
npm run build

Set-Location D:\BAYFLOW\backend
if ((Get-Content supabase/.temp/project-ref -Raw).Trim() -ne 'tlqvlsrmxueuuzxyltej') {
  throw 'Wrong linked Supabase project'
}
npx --no-install supabase migration list --linked
npx --no-install supabase db push --dry-run
# Confirm only 20261009140203_b05_transactional_booking.sql, seeds: [], roles: [].
# Run the next command only after reviewing that output.
npx --no-install supabase db push
npm run db:lint
$env:BAYFLOW_TEST_PROJECT_REF = 'tlqvlsrmxueuuzxyltej'
npm run db:test:cloud:b03
npm run db:test:cloud:b04
npm run db:test:cloud:b05
npm run db:test:cloud
```

The new nine-test Cloud suite exercises real HTTP bookings, retries, capacity
races, symptom-only flow, customer/SA visibility, ownership and invalid inputs,
eligibility changes, receipt access denial and authoritative replay. Existing
Cloud RLS allowlists recognize B05 only when its exact migration is applied.
Cleanup discovers only exact per-run B05 shop names owned by the marked fixture
owner, cancels their fixture bookings, hides shops, deactivates non-owner staff,
then signs out shared fixture sessions. Immutable audit/receipt/vehicle records
remain. Cleanup errors fail the suite and require operator review.

## Remaining limitations and next phase

B05 is **PASSED**. Local acceptance, user-run Cloud application, Cloud lint,
B03/B04 regressions, B05 booking acceptance and full Cloud RLS regression passed.
The existing B04 owner-save horizon refresh and retained cancelled-slot behavior
remain. HTTP throttling is per-process; direct RPC uses SQL authorization and
transactional validation but has no distributed throttle. Receipt payloads
contain private submitted vehicle/symptom data and have no automatic expiration.
No vehicle-edit flow, B06 transitions/read lists or UI are implemented. Stop before
B06 until the B05 gate is verified and the next phase is explicitly requested.

Implementation references consulted:
[PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[READ COMMITTED snapshots](https://www.postgresql.org/docs/17/transaction-iso.html),
[Supabase function security](https://supabase.com/docs/guides/database/functions).
