# F08 verification — 2026-10-10 (Asia/Karachi)

F07 was completed, verified (277/277 tests, both typechecks, lint/build) and its
ledger/evidence written before F08 edits. F08 adds assigned technician workflow
only. Existing F06 changes remain unstaged, with no commit or push.

## Changes

- Assigned jobs request assignee=mine; detail/list reject unexpected tenant or
  technician identities. Real vehicle/customer context is fetched after the
  guarded booking read using existing RLS. Sticky summary and reported concerns
  precede the editor; absent context is explicitly unavailable/null.
- START_INSPECTION, diagnosis and itemized PART/LABOUR estimates, catalog paging
  including zero stock, whole-integer PKR previews with server bounds, and
  authoritative saved itemized records/totals. No subtotal/line total is submitted.
- COMPLETE_REPAIR, real QC issue descriptions/timestamps/open-resolved state and
  repair notes/resubmission. Existing SQL resolves issues and queues QC.
- Immutable expectedVersion/idempotencyKey confirmation and replay share F07's
  dialog. Editor locks during an intent and survives mounted focus/record refresh.
  Catalog focus enters its region and returns to its trigger on close/selection.
- Approved minimal catalog RPC migration plus additive type overlay, contextual
  GET fields, API/schema/design contracts and meaningful native/API/UI tests.
  No schema/table/status/write/RLS expansion, Admin key or generated types rewrite.

## Actual automated outputs

```text
npm test -- --maxWorkers=4 src/test/technician-api.test.ts src/test/technician-ui.test.tsx
Test Files 2 passed (2)
Tests      25 passed (25)

npm test -- --maxWorkers=4
Test Files 30 passed (30)
Tests      302 passed (302)

npm run db:verify:postgres    backend, disposable native PostgreSQL only
tests 141; pass 141; fail 0; skipped 0
Second migration application: applied []                exit 0

npm run typecheck   frontend and backend                 exit 0
npm run lint        frontend                             exit 0
npm run build       frontend                             exit 0
Compiled successfully; Generated static pages (15/15)
Route includes /api/v1/bookings/[id]/estimate-catalog
```

The final lint run had no warnings after removing an unused test import. The
initial focused UI run found two test fixtures reusing consumed Response objects
on refresh/remount; transports were corrected to return fresh Responses and all
tests passed. No assertion or timeout was weakened. Production checks and the
full suite followed the editor/focus/request-limit changes; removing an unused
import afterward did not change test behavior.

Twenty-five F08 frontend tests cover bounded safe catalog API, strict queries,
missing Auth/hidden booking denial, no raw SQL, strict minimal projection,
guard-before-context and exact vehicle/customer binding, missing-context null and
query error; exact integer preview, zero price, fractional/exponent/negative/
blank/out-of-range/overflow rejection, missing real part identity and row bounds;
assigned-only list/detail, actual context, inspection confirmation, mixed estimate
submission without totals, saved server records after remount, mounted draft
retention, QC failure detail and notes/resubmission, role suppression, catalog
network retry/paging/empty. F07 tests continue covering all shared mutation error
paths and uncertain replay. Four new native tests verify the catalog's actual SQL
authorization, zero stock, pagination, spoof denial and unchanged inventory RLS;
all prior transactional action/estimate/repair/QC/race tests passed too.

See [database evidence](../../../backend/docs/f08-estimate-catalog-verification.md)
for the exact migration/privilege model and disposable harness target.

## Risks and limits

F13 follow-up: the user approved forward application of 20261010110000 to the
linked demo project. It is applied; subsequent dry-run is up to date and Cloud
schema lint is clean. The full desktop PART estimate/procurement/QC/pickup journey
passed with real catalog choices. See F13 evidence for the final viewport gate.
The following notes describe the original F08 checkpoint before that approval.

Cloud application is pending: catalog choices require
20261010110000_f08_estimate_catalog.sql on tlqvlsrmxueuuzxyltej. Local tests do not
claim a deployed endpoint or live workflow acceptance. No frontend server/browser,
Cloud migration/data mutation, real Auth/email round trip or manual visual review
was run. SQL fixtures existed only in the disposable loopback harness. Existing
Cloud migrations are still through 20261010100000; never reset or seed Cloud.

Draft diagnosis/rows/repair notes and uncertain intents are in mounted memory;
refresh within the view preserves drafts, tab reload/navigation clears them and
reads the latest server version. The UI states this explicitly. Context reads
occur after the booking RPC as separate queries, so their fields can reflect a
slightly later read moment. Deleted/RLS-hidden context is null, query failures
remain actionable errors. Active catalog includes zero-stock items but excludes
soft-deactivated entries from new choices; existing estimate snapshots are intact.

Generated database.types.ts and private env files were not written/staged. RLS and
direct stock privileges remain unchanged. Final repository checks are recorded
below after the documentation checkpoint. Next frontend phase is F09, which was
not implemented. Apply/review the catalog migration before live F08 acceptance.

## Final repository checks

```text
node backend/scripts/check-repository.mjs --history
candidateFiles: 281
indexedBlobs: 237
localEnvFiles: 3
historyObjects: 816
findings: []                                              exit 0

git diff --check                                         exit 0
git check-ignore frontend/.env.local backend/.env.b11-demo.local
frontend/.env.local
backend/.env.b11-demo.local
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
```

Git emitted only normal LF-to-CRLF working-copy notices, with no whitespace-error
findings. The index remains unchanged/empty of staged changes; private credentials
and generated types remain untouched. No dependency install or upgrade occurred.
