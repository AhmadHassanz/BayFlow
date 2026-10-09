# B06 Booking State Engine

## Plan and scope

Read AGENTS.md, blueprint B06, root docs/00-05 and B05 verification before
editing. B05 is Cloud-verified at checkpoint `29d2377`. Implement only the B06
status engine: action schemas, expectedVersion, idempotency, history, confirm,
cancel, assign technician, start inspection and role-scoped booking reads.

No UI, estimate creation/review, parts, QC or pickup flow is included. The user
requested the same manual Cloud process as B05: the agent implemented and
verified locally only, and will provide CLI commands for the operator to apply.

## Changes and security

- Migrations: `20261009151303_b06_booking_state_engine.sql` and follow-up
  `20261009153959_b06_lint_list_my_bookings_input.sql`; eight migrations now
  apply in the native harness. Previously deployed migrations are unchanged.
- New private `booking_action_receipts` table stores actor/idempotency key,
  canonical action payload, booking ID and result version. RLS is enabled, no
  policies are added and ordinary table privileges are revoked.
- `public.apply_booking_action(input jsonb)` delegates to guarded private
  `apply_booking_action_impl`. Empty search paths, qualified names and
  authenticated-only EXECUTE are used. There is no generic `setStatus`.
- Supported actions are exactly `CONFIRM_BOOKING`, `ASSIGN_TECHNICIAN`,
  `START_INSPECTION` and `CANCEL_BOOKING`.
- The transaction locks the verified Auth identity and target booking, checks
  current status, expectedVersion, active role or technician assignment, then
  updates booking status/version, writes history, writes B06 notifications and
  stores the receipt atomically.
- Same-key replay returns the current authorized booking detail without another
  transition. Changed action payload conflicts with `IDEMPOTENCY_CONFLICT`.
- Added guarded read RPCs and routes for customer bookings, shop booking list and
  booking detail. Customers see own jobs, OWNER/SA see shop jobs, technicians see
  assigned jobs; unassigned/inactive/foreign staff are hidden.
- Additive `database.b06.ts` overlay preserves the user's generated
  `database.types.ts` change.

## Verification

Executed local results:

- `npm run db:verify:postgres`: **110/110 passed, 0 failed**, exit 0
  (44356.205 ms for final run). Eight migrations + seed applied to a fresh
  generated loopback PostgreSQL 17 cluster; second application returned
  `applied: []`. The disposable cluster shut down. This did not contact Cloud.
- Six B06 native tests cover confirm/assign/start, action idempotency, changed-key
  conflicts, stale versions, wrong-role/wrong-state denials, cancellation before
  repair, terminal immutability, role-scoped lists/detail and private grants.
- `npm run test` in frontend: **10 files / 122 tests passed**, exit 0.
- Frontend typecheck and backend typecheck: exit 0.
- Frontend ESLint and production Next.js build: exit 0; the build compiled
  `/api/v1/bookings/[id]`, `/actions`, `/me/bookings` and shop booking list.
- `npm run test:smoke`: **20/20 passed**, exit 0. Includes B06 route 401/403
  no-store/safe-envelope checks; uses no credentials and performs no Cloud writes.
- Cloud B06/RLS JavaScript syntax checks: exit 0 before manual application.
- After the first manual B06 push, Cloud lint reported one warning:
  `public.list_my_bookings` had an unused `input` parameter. The follow-up
  migration keeps the API signature, validates that optional input is `{}`, and
  removes the lint warning source without editing the already-applied B06 migration.

## Manual Cloud commands and acceptance gate

Run from a clean shell. Build frontend first; run Cloud suites sequentially
because they use shared marked fixtures. The B06 suite refuses fixture
provisioning until the exact B06 migration exists. No suite applies schema or
imports the native seed into Cloud.

```powershell
Set-Location D:\BAYFLOW\frontend
npm run build

Set-Location D:\BAYFLOW\backend
if ((Get-Content supabase/.temp/project-ref -Raw).Trim() -ne 'tlqvlsrmxueuuzxyltej') {
  throw 'Wrong linked Supabase project'
}
npx --no-install supabase migration list --linked
npx --no-install supabase db push --dry-run
# Confirm only pending B06 migrations:
# 20261009153959_b06_lint_list_my_bookings_input.sql if the base B06 migration
# was already applied, or both B06 migrations if applying from B05.
# Confirm no seeds/roles.
# Run the next command only after reviewing that output.
npx --no-install supabase db push
npm run db:lint
$env:BAYFLOW_TEST_PROJECT_REF = 'tlqvlsrmxueuuzxyltej'
npm run db:test:cloud:b03
npm run db:test:cloud:b04
npm run db:test:cloud:b05
npm run db:test:cloud:b06
npm run db:test:cloud
```

The new B06 Cloud suite exercises real HTTP action calls, stale versions, wrong
actors, wrong states, scoped reads, cancellation and idempotency. Cleanup hides
only its exact marked shop, cancels its fixture bookings where possible,
deactivates non-owner staff and signs out shared fixture sessions.

## Remaining limitations and next phase

B06 is **IN_PROGRESS: local acceptance passed, Cloud application/lint/acceptance
and regression pending manual execution**. No B06 Cloud outcome is claimed.
B07 estimate creation/review/customer decision remains unimplemented, as do
parts, repair, QC, pickup completion and all UI for these actions. Stop before
B07 until the B06 gate is verified and the next phase is explicitly requested.
