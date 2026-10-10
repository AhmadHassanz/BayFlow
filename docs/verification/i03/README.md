# I03 Race Conditions and Edge Case Verification

Date: 2026-10-10, Asia/Karachi. Base Git HEAD remained `97b2054`; all intentional
prior working-tree changes were preserved. No file was staged, committed or pushed.
I04, B12 and R00 were not started.

## Plan and changes

I03 compared the required concurrency/edge cases with native PostgreSQL, Cloud
Route Handler and UI recovery coverage. Existing tests already used real parallel
connections for slot capacity, same-key booking replay, schedule/booking locking,
shared-stock allocation and same-key allocation retry. Existing domain/UI suites
covered cancellation limits, estimate rejection/revision, partial receipts,
idempotency mismatch, lost-response replay, stock-conflict reload and both 404/409
QC claim recovery.

`backend/tests/z-workflow-races.test.mjs` adds the three missing real parallel
transaction cases:

- two identical customer approvals serialize to one estimate decision, history
  event and action receipt; one response is the idempotent replay;
- two identical receipts add stock once and create one history/receipt pair;
- two different QC inspectors claim simultaneously, producing one claimant and
  one open run while the loser receives the approved hidden/stale conflict.

`frontend/e2e/i03.spec.ts` uses two authenticated advisor browser contexts loaded
from the same version of a real retained demo booking. Both submit confirmation
concurrently. The test requires one HTTP 201, one HTTP 409, useful reload guidance,
authoritative recovery and exactly one confirmation history event. The booking was
already an I01 QA record; I03 moved it from PENDING to CONFIRMED and created no new
booking.

No SQL migration, state, RLS policy, grant or application workflow implementation
changed. The verified transactional functions already enforced every invariant.

## Actual commands and outputs

```text
npm run db:verify:postgres
PostgreSQL 17 disposable loopback harness; 16 migrations plus local seed;
tests 144; pass 144; fail 0; second migration application applied []
PostgreSQL verification complete.                              exit 0

BAYFLOW_E2E_START_SERVER=1 BAYFLOW_E2E_DEMO_WRITES=1 \
  npx playwright test e2e/i03.spec.ts --project=desktop-1440
1 passed (30.2s)                                               exit 0

BAYFLOW_TEST_PROJECT_REF=<private known demo reference> npm run db:test:cloud:b05
tests 9; pass 9; fail 0; duration 240060.1991 ms               exit 0
Parallel capacity result: exactly two 201 responses and six safe 409 responses.

npm run typecheck (backend)
tsc --noEmit                                                   exit 0

npm run typecheck (frontend)
tsc --noEmit                                                   exit 0

npm test -- --maxWorkers=4 (frontend)
Test Files 37 passed (37); Tests 364 passed (364)              exit 0

npm run lint (frontend)
eslint .                                                       exit 0

npm run build (frontend)
Compiled successfully; Generated static pages (15/15)          exit 0

npm run test:e2e:list
21 tests in 5 files; i03.spec.ts listed for all viewports       exit 0

node backend/scripts/check-repository.mjs --history
candidateFiles: 327; indexedBlobs: 237; localEnvFiles: 3;
historyObjects: 999; findings: []                               exit 0

git diff --check                                                exit 0
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
git check-ignore frontend/.env.local backend/.env.b11-demo.local
frontend/.env.local
backend/.env.b11-demo.local                                     exit 0

Get-NetTCPConnection on 3104, 3107, 3108, 3109 and 3110
no listeners on all verification ports
```

## Verified invariants

- Capacity cannot be exceeded and losing bookings leave no vehicle/effect leak.
- Same idempotency key cannot duplicate a booking, estimate decision, stock
  receipt, allocation, history event or action receipt.
- Contending jobs cannot overdraw stock; the loser has no partial allocation.
- Exactly one QC inspector owns a claim and exactly one open QC run exists.
- Stale versions return 409 with actionable reload UI; hidden claimed jobs retain
  the authorized privacy-preserving 404 behavior.
- Pre-repair cancellation succeeds/replays safely; cancellation after repair is
  rejected without releasing consumed stock.
- Estimate rejection keeps the sent snapshot immutable and revision numbers rise.
- Partial receipts preserve exact deltas; changed-payload retries conflict.

## Risks and limitations

The native concurrency fixtures are disposable and were cleaned by the harness.
The Cloud B05 suite creates marked fixtures and deactivates/hides them during its
existing cleanup. The live stale-tab test changed one retained I01 QA booking from
PENDING to CONFIRMED. Testing used the local production server against Supabase
Cloud, not Vercel. The known five high development-tool advisories remain unchanged.
No Cloud reset, reseed, migration application, deployment or generated-type rewrite
occurred.

I04 is the exact next phase. It was not started here.
