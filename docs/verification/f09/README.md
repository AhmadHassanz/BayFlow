# F09 verification — 2026-10-10 (Asia/Karachi)

## Plan and scope

Read AGENTS.md, the exact blueprint F09 work order, current contracts, F07/F08
evidence and actual code/history before editing. Implement F09 only: advisor
review/edit/send, customer itemized decisions and rejected-estimate revision loop.
HEAD remains 97b2054. Prior unstaged F06–F08 work was preserved; no commit/push.
No new API field, endpoint, migration, RLS policy or backend application was added.
The prior F08 catalog migration remains local and Cloud application is pending.

## Changes

- Advisor sees the latest REVIEW/REJECTED server source separately from unsaved
  diagnosis and item edits. Existing PART IDs remain attached; descriptions,
  quantities/prices and line removal are supported, with added LABOUR. The UI
  uses no fabricated catalog entries or arbitrary part IDs. Technician-only
  catalog access remains unchanged; choosing new PART identities is outside
  this source-editing surface's existing read contract.
- SEND_ESTIMATE freezes the server-calculated revision and requests the customer's
  decision. REVISE_ESTIMATE preserves the declined revision and creates a new
  REVIEW version, which then requires a separate review/send action.
- Customer sees exact itemized server amounts, revision and created/sent/decision
  timestamps; older snapshots expand for inspection. Latest SENT + owning
  customer + AWAITING_CUSTOMER are mandatory for decision controls. Unsent
  REVIEW/DRAFT snapshots never render on the customer surface.
- Approval/decline use revision-and-total confirmation, optional trimmed reason,
  immutable expectedVersion/idempotencyKey, pending locks, uncertain replay and
  authoritative GET. Approval explicitly authorizes repair without collecting
  payment. There is no parts/QC/pickup mutation or staff customer impersonation.
- Mounted advisor drafts survive focus/record refresh; changed server version
  or revision blocks submission until explicit reset. Snapshot tenant/booking
  mismatches and duplicate revision numbers are rejected before rendering.
- Shared estimate ledger, responsive rules/table overflow, labelled 48px fields,
  semantic tables/disclosures, and customer route identity key. PKT date formatting
  moved to the shared format module with the previous export preserved.
- Updated API/UI integration contract, design notes, tests and ledger. Existing
  schemas and endpoints remain authoritative; no local-only status/total save.

## Actual automated outputs

```text
npm test -- --maxWorkers=4 src/test/estimate-review.test.ts src/test/estimate-workflow.test.tsx
Test Files 2 passed (2)
Tests      23 passed (23)

npm test -- --maxWorkers=4 src/test/booking-wizard.test.tsx
Test Files 1 passed (1)
Tests      12 passed (12)

npm test -- --maxWorkers=4
Test Files 32 passed (32)
Tests      325 passed (325)

npm run typecheck    frontend and backend       exit 0
npm run lint         frontend                   exit 0, no warnings
npm run build        frontend                   exit 0
Compiled successfully; Generated static pages (15/15)

npm run db:verify:postgres    backend, disposable loopback only
tests 141; pass 141; fail 0; skipped 0           exit 0
Second migration application: applied []
PostgreSQL verification complete.
```

The first full suite overlapped the production build and native SQL harness:
323 passed, one existing booking-wizard test timed out at 5000ms, and the later
lost-response draft assertion failed. After those jobs finished, the wizard
passed independently (12/12) and the full suite passed (325/325). This supports
resource contention as the likely cause; no test assertion/timeout/worker
configuration was weakened. Only execution scheduling changed for the rerun.

Initial strict typing caught action object widening/empty-payload inference;
intents now parse the existing discriminated action schema before opening the
dialog. Focused tests were corrected to target the unique stage heading and to
check native inherited fieldset disabling with :disabled. Behavioral assertions
and conservative submission locks remain intact.

## Coverage

Twenty-three new tests verify revision ordering, owning-customer/latest-SENT
decision guards, no foreign/duplicate snapshot rendering, source immutability,
unchanged PART identities, numeric/overflow/diagnosis validation and omitted
authoritative totals. DOM workflow covers send → decline with reason → new
revision → resend → approve, timestamps, intact old snapshot and persistence
after remount; exact sent rows; optional empty reason; duplicate pending click;
no status advance from POST alone; 401/403/404/409/422 safe guidance and reload;
uncertain same-body replay and locked cancellation; draft retention/stale blocking/
explicit reset; added labour; wrong-role/foreign-customer/unsent suppression;
conservative modal cancellation and foreign snapshot denial.

Native SQL reran existing B07 tests for real server-computed edited totals, exact
sent snapshots, foreign customer and technician approval denial, rejected-version
immutability and revision increments. Existing tenant, transaction, repair/QC and
race tests also passed. The harness bound a fresh disposable PostgreSQL database
to 127.0.0.1:55432; Supabase CLI's "remote" reset label refers to this explicit
loopback target. No Cloud reset, seed or mutation was performed. No generated
types flag was used.

## Risks and next phase

DOM transport is mocked with explicit test-only fixtures; native SQL is real
PostgreSQL but does not emulate Supabase Auth/REST. No frontend server/browser,
Cloud workflow, email round trip or manual visual approval is claimed. F09 uses
existing B07 Cloud actions. End-to-end creation of new technician PART estimates
still requires the pending F08 20261010110000 catalog migration to be applied
separately. Never reset or seed Cloud.

Advisor edits operate on parts already recorded in the source estimate; there is
no broadened catalog read. Unsaved drafts and uncertain intent keys remain mounted
memory only and clear on page reload/navigation. Server expectedVersion checks
guard every F09 mutation; status/timestamps/totals come from subsequent GET reads.
If a successful mutation's follow-up GET fails, the read offers retry.

Next phase is F10 parts desk and procure-to-allocate UI. F10+ remains unimplemented.
Protected database.types.ts, credential files and prior user changes remain intact;
no dependency install/upgrade or Git staging/commit/push was performed. Final
repository audit output is recorded below at the completed documentation checkpoint.

## Final repository checks

```text
node backend/scripts/check-repository.mjs --history
candidateFiles: 289; indexedBlobs: 237; localEnvFiles: 3
historyObjects: 892; findings: []                         exit 0

git diff --check                                         exit 0
git check-ignore frontend/.env.local backend/.env.b11-demo.local
frontend/.env.local
backend/.env.b11-demo.local
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
```

Only normal LF-to-CRLF working-copy notices were emitted; no whitespace-error
finding. Both private env files remain ignored; generated types and staging are
untouched. These checks include prior user/phase changes without overwriting them.
