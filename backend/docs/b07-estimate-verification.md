# B07 Estimate Workflow

B07 implements estimate creation, service-advisor review/send, customer approval/rejection and advisor revision on top of the B06 booking action RPC. It does not add a second backend server or a new action surface.

## Changes

- `20261009161442_b07_estimate_actions.sql` extends the private booking action receipt allowlist and replaces `private.apply_booking_action_impl`.
- `20261009163309_b07_lint_unused_estimate_vars.sql` is a forward lint-only replacement for the same B07 functions after Cloud lint reported unused PL/pgSQL variables in the already-applied base B07 migration.
- New guarded actions: `SUBMIT_ESTIMATE`, `SEND_ESTIMATE`, `APPROVE_ESTIMATE`, `REJECT_ESTIMATE` and `REVISE_ESTIMATE`.
- Estimate items are validated server-side: diagnosis is required, PART lines require an existing same-shop inventory part, LABOUR lines cannot carry a part ID, and client-supplied subtotals/line totals are rejected.
- The booking detail DTO now returns `estimates[]` with sent/decided timestamps and computed item totals so customers see the exact version that the SA sent.
- `frontend/src/lib/contracts/booking-actions.ts` validates the new action payloads before route handlers call the RPC.

## Verification

Local verification:

- `npm run db:verify:postgres`: **113/113 passed**, exit 0.
- `npm test -- --run src/test/booking-actions.test.ts`: **13/13 passed**, exit 0.
- `npm run typecheck` in `frontend`: exit 0.
- `npm run typecheck` in `backend`: exit 0.
- `npm run build` in `frontend`: exit 0.
- `node --check supabase/tests/cloud-estimates.test.mjs` and `node --check supabase/tests/cloud-rls.test.mjs`: exit 0.

Cloud application and verification on linked project `tlqvlsrmxueuuzxyltej`:

- `npx --no-install supabase db push --dry-run`: planned `20261009161442_b07_estimate_actions.sql`, then after lint follow-up planned `20261009163309_b07_lint_unused_estimate_vars.sql`.
- `npx --no-install supabase db push`: applied both B07 migrations, no seed changes.
- `npm run db:lint`: first run flagged two unused variables; after the forward lint migration, **No schema errors found**, exit 0.
- `npm run db:test:cloud:b07`: **1/1 passed**, exit 0 (duration 85522.0247 ms).
- `npm run db:test:cloud:b06`: **5/5 passed**, exit 0 (duration 96107.2605 ms).
- `npm run db:test:cloud`: **81/81 passed**, exit 0 (duration 157707.2334 ms).
- `npx --no-install supabase migration list --linked`: local and remote match through `20261009163309`.

## Risks and limits

B07 stops at estimate approval/rejection/revision. It does not implement parts assignment, purchase orders, inventory allocation, repair, QC, pickup or UI screens. Customers approve only the latest sent snapshot; rejected snapshots remain immutable and advisor revision creates the next revision number.
