# F10 verification — 2026-10-10 (Asia/Karachi)

## Plan and changes

Read AGENTS.md, exact F10/F11 work orders, current contracts, F09 evidence, Git
status/history and implementation before editing. Implement and verify F10 before
F11. Base HEAD 97b2054; prior unstaged F06–F09 changes preserved. The user approved
the missing active same-shop PARTS-choice read scope and advisor ASSIGN_PARTS UI.

F10 adds assigned parts job filters, real inventory SKU/name/on-hand/reorder/cost
and catalog state, approved requirement/availability/allocation/shortage/order
comparison, PO creation, explicit partial/full delivered-now receipt deltas,
in-stock readiness, allocation and actual before/current server-stock snapshots.
The existing SQL remains authoritative; no local stock/status update occurs.

`GET /shops/[id]/team?scope=parts&page=N` uses existing active OWNER/SA authorization
and user-scoped membership/profile RLS. Projection is only PARTS user ID and nullable
name, deterministic bounded pages and total. Owner roster and staff mutations keep
their existing guards. No schema/migration/RLS/write-grant change or Admin client.
Advisor assignment uses the existing ASSIGN_PARTS action, version and key.

Parts list/detail additionally enforce the verified actor's assignment. Orders
are bounded by current requirement minus stock minus this job's outstanding POs;
receipts are positive deltas bounded by ordered-minus-received. Stock conflict
offers authoritative reload and shortage recovery. Immutable intents, pending
locks and uncertain-response same-key replay are shared with prior phases.
The stock reference uses the existing inventory API; names in required comparison
come from the approved estimate. No invented SKU, cost, supplier or stock record.

## Actual frontend/API checks

```text
npm test -- --maxWorkers=4 src/test/parts-desk.test.ts src/test/parts-desk-ui.test.tsx src/test/advisor-api.test.ts
Test Files 3 passed (3)
Tests      22 passed (22)

npm test -- --maxWorkers=4
Test Files 34 passed (34)
Tests      342 passed (342)

npm run typecheck   frontend and backend          exit 0
npm run lint        frontend                      exit 0, no warnings
npm run build       frontend                      exit 0
Compiled successfully; Generated static pages (15/15)

git diff --check                                  exit 0
node backend/scripts/check-repository.mjs --history
candidateFiles 297; indexedBlobs 237; historyObjects 925; findings []
git check-ignore frontend/.env.local backend/.env.b11-demo.local
both paths printed (ignored)
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
```

Seventeen new tests (plus five existing advisor API tests in the focused run)
verify the narrow parts-choice role/tenant/active guards and safe projection;
uncovered-vs-outstanding arithmetic; missing/unapproved/foreign requirements;
labour-only flow; quantity boundaries; order/partial/full receipt/allocation
sequence and remount persistence; no stock increase on PO creation; actual stock
deduction on authoritative allocation read; inventory fields/paging/access
failures; in-stock shortcut, over-order rejection, STOCK_CONFLICT recovery;
uncertain identical receipt retry; real assignment ID after confirmation; and
other-assignee list/detail suppression.

## Limits and next phase

No server/browser, Cloud mutation, email round trip or visual acceptance was run.
DOM fixtures are test-only and transports mocked; native database verification is
recorded separately when its current run finishes. There is no new F10 migration;
the F08 catalog migration is still pending on Cloud. No credential/type file was
written or staged, no package/dependency change and no commit/push.

Same-state partial receipt still uses the existing server's version/key semantics;
SQL bounds and locks remain authoritative if stock/order balances change without
a version increment. Draft quantities/intents and pre-action stock snapshots are
mounted-memory only; reload reads current records. The comparison represents two
read moments and can include concurrent job effects. Outstanding POs are retained
as audit records after repair/cancellation, but F10 receiving is parts-stage only.

Next: F11, after this verification checkpoint and resolution of its known claim
response contract conflict (blueprint says 409; B09 hides the losing actor's job
with 404). No F11 implementation had begun when this evidence was created.

## Native verification and completion checkpoint

```text
npm run db:verify:postgres
tests 141; pass 141; fail 0; skipped 0             exit 0
Second migration application: applied []
PostgreSQL verification complete.
```

The existing disposable harness bound a newly created database to loopback
127.0.0.1:55432; its CLI "remote" reset label is not a Cloud target. B08 real SQL
tests passed for partial receipts, readiness without reservation, exact allocation,
stock races, idempotent retries and permission denial. All prior B07/B09/tenant
tests passed too. No Cloud connection/reset/seed or generated-types flag was used.
F10 was complete and verified at this checkpoint before editing any F11 surface.
