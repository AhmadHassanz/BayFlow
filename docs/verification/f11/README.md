# F11 verification — 2026-10-10 (Asia/Karachi)

## Scope and checkpoint

F10 was finished and verified before F11 edits: 342 frontend tests, 141 native SQL,
both typechecks, lint/build, diff check and secret audit passed; its evidence and
PASSED ledger row were recorded first. F11 uses existing B09 contracts only.
No new endpoint, schema, migration, RLS/write privilege or Admin client was added.
Prior unstaged work and protected generated types remain intact; no commit/push.

Resolution on 2026-10-10: the user authorized the agent to choose the best F11
behavior. Preserve existing B09 hidden-resource P0002/404 after another inspector
claims the job, with 409 for stale visible requests. Docs/03 and docs/02 explicitly
amend the blueprint's 409-only expectation. No SQL/error translation or RLS change
is needed; verified tests and UI already handle both responses safely.

## Changes

- Separate unclaimed QC queue and own-claimed inspection reads, guarded against
  unexpected shop/status/claim records; labelled desktop/mobile job rows and paging.
- Claim confirmation; only the claimant with one matching open run can record
  checks. Operator-entered names map to boolean values in existing checklist JSON.
  No result is preselected. A fresh checklist is required for a different run.
- Explicit PASS_QC only after recorded checks pass; FAIL_QC requires written issue
  title/description. Notes/bounds/request size use existing action contracts plus
  readable client rules. Confirmation retains immutable version/key and locks
  duplicate submissions; uncertain requests replay the same intent.
- Real QC run outcomes, check results, notes and timestamps; issue open/resolved
  history. Existing F08 original-technician repair/resubmission resolves issues
  and queues another check. Technician feedback avoids duplicate issue text in
  adjacent history. No skip-QC, owner inspector control or automatic pass.
- After a successful QC decision, the inspector returns to the quality desk;
  detail GET is not attempted after their access is revoked by pass/fail. Hidden
  or conflicting jobs offer generic queue refresh; failed reads keep a desk link.
- Advisor NOTIFY_READY and owning customer/advisor COMPLETE_PICKUP only in
  READY_FOR_PICKUP. Real notice history hides repeat notification buttons across
  reload; pickup confirmation explains the terminal transition. The subsequent
  GET supplies COMPLETED/completedAt. No payment or F12 notification UI.

## Automated results so far

```text
npm test -- --maxWorkers=4 src/test/qc-workbench.test.ts src/test/qc-workbench-ui.test.tsx
Test Files 2 passed (2)
Tests      13 passed (13)

npm test -- --maxWorkers=4 src/test/technician-ui.test.tsx src/test/qc-workbench-ui.test.tsx src/test/qc-workbench.test.ts
Test Files 3 passed (3)
Tests      20 passed (20)

npm test -- --maxWorkers=4
Test Files 36 passed (36)
Tests      355 passed (355)

npm run typecheck   frontend and backend              exit 0
npm run lint        frontend                          exit 0, no warnings
```

The first full F11 run found duplicated issue text between technician feedback and
QC history, plus an older test lacking the newly used Next router mock. Production
history was changed to avoid duplicating issues already shown in technician
feedback; the test environment now supplies the router. The prior QC-role test
now expects an unrelated INSPECTING record to be suppressed, strengthening its
access assertion. Focused and full suites passed afterward; no timeout/behavioral
assertion was weakened.

Thirteen new tests cover explicit boolean checklist encoding and bounds,
unrecorded/duplicate/failed check rejection, mandatory written failure, exact
claimant/open-run binding and tenant context; full fail → original-tech repair →
second-QC pass → notice → customer pickup with remount persistence and immutable
old run; 404/409 safe claim recovery; actual queue/mine read paths and unexpected
queue rejection; no default pass, written failure and focus draft retention;
other-claimant denial and exit link; uncertain identical QC decision replay;
own-customer-only pickup and no pre-QC/terminal shortcuts.

The 141-test native run at the preceding F10 checkpoint also executed unchanged
B09 real SQL tests for claim exclusivity/hidden loser, fail/issue creation,
original-technician resubmission, second inspector pass, ready notice replay and
terminal pickup. The F11 backend is byte-for-byte unchanged; native SQL was not
unnecessarily rerun. It used disposable loopback PostgreSQL, never Cloud.

## Risks and completion status

F11 is PASSED at its automated local gate after the user-authorized contract
resolution. The prior choice was not inferred from elapsed time: the user's
follow-up explicitly delegated this decision. Closing the phase changes only
documentation; no source/test/SQL change warrants repeating its completed checks.

No server/browser, Cloud mutation, Auth/email round trip or manual visual approval
was run. Transport fixtures are test-only. The F08 catalog migration still needs
separate Cloud rollout for new technician PART selection. F12+ remains untouched.
QC lost-response replay can yield 404 after a saved decision because access ended;
the UI returns to the desk without claiming an unverified success. Checklist,
receipt and other drafts/intent keys are mounted-memory only and clear on reload.
Ready notice repeat suppression relies on actual history; SQL idempotency remains
per actor/key. The server still enforces every transition and actor prerequisite.

## Final local build and repository audit

```text
npm run build                         exit 0
Compiled successfully; Generated static pages (15/15)
node backend/scripts/check-repository.mjs --history
candidateFiles 306; indexedBlobs 237; localEnvFiles 3
historyObjects 925; findings []        exit 0
git diff --check                      exit 0
git check-ignore frontend/.env.local backend/.env.b11-demo.local
both paths printed (ignored)
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
git log -1 --oneline
97b2054 backend 12 phase left and frontend in progress
```

Only standard LF-to-CRLF working-copy notices were emitted, with no whitespace
findings. Build and audit passed. The subsequent explicit user authorization
resolved the last contract question and F11 was closed before F12 edits.
