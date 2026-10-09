# B09 Repair, QC and Pickup

## Scope and plan

Implement only the repair, QC and pickup phase after B08 allocation reaches
`IN_REPAIR`. Use the existing booking action RPC, existing QC tables and the
documented QC queue endpoint. Verify locally first, then apply only the B09
migration to linked Cloud project `tlqvlsrmxueuuzxyltej`. No Cloud reset.

## Changes

- `20261009190000_b09_repair_qc_pickup.sql` adds guarded actions
  `COMPLETE_REPAIR`, `CLAIM_QC`, `PASS_QC`, `FAIL_QC`, `NOTIFY_READY` and
  `COMPLETE_PICKUP`.
- `20261009190100_b09_qc_queue_payload_keys.sql` is a forward Cloud correction
  for QC queue payload key casing.
- Booking detail now includes authorized `qcRuns[]` and `qcIssues[]`.
- Added `GET /api/v1/shops/[id]/qc-queue` and a typed B09 Supabase overlay
  without editing the generated `database.types.ts`.
- Added local native SQL tests, frontend action/route tests and Cloud B09
  acceptance coverage.

## Verification

- `npm run db:verify:postgres`: 127/127 passed; final no-op migration check
  returned `applied: []`.
- `npm test -- --run src/test/booking-actions.test.ts src/test/parts.test.ts`:
  29/29 passed.
- Frontend full `npm test`: 139/139 passed.
- Backend and frontend `npm run typecheck`: exit 0.
- Frontend `npm run lint` and `npm run build`: exit 0; build includes
  `/api/v1/shops/[id]/qc-queue`.

Cloud verification on `tlqvlsrmxueuuzxyltej`:

- Dry-run before base push showed only `20261009190000_b09_repair_qc_pickup.sql`;
  base push applied that migration with no seeds or roles.
- Cloud B09 initially exposed the QC queue payload-key mismatch. The applied
  base migration was preserved and forward migration
  `20261009190100_b09_qc_queue_payload_keys.sql` corrected the helper.
- Dry-run before the forward push showed only
  `20261009190100_b09_qc_queue_payload_keys.sql`; forward push applied that
  migration with no seeds or roles.
- Final dry-run reported `Remote database is up to date` with no pending
  migrations, seeds or roles.
- `npm run db:test:cloud:b09`: 1/1 passed, duration 82392.7631 ms.
- `npm run db:test:cloud:b08`: 3/3 passed, duration 247579.6857 ms.
- `npm run db:test:cloud:b07`: 1/1 passed on sequential rerun, duration
  78757.5965 ms. The first parallel attempt passed the test body but failed
  shared fixture cleanup; the sequential rerun cleaned up successfully.
- `npm run db:test:cloud:b06`: 5/5 passed, duration 139296.8896 ms.
- `npm run db:test:cloud`: 81/81 passed, duration 138082.8021 ms.
- `npm run db:lint` and `supabase migration list --linked` were blocked after
  migration by Supabase CLI temp-role authentication failure for
  `cli_login_postgres`; `SUPABASE_DB_PASSWORD` was not present. No schema lint
  result was produced after B09.

## Risks and limits

- B09 has no frontend dashboard; F11 remains the UI integration phase.
- Ready notification is same-state and idempotent per action key; it does not
  increment `state_version`.
- QC failures resolve when the technician resubmits repair; there is no separate
  issue assignment or issue comment thread.
- Payment, invoices, surveys and deployment hardening are outside this phase.
