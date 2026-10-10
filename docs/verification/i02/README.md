# I02 Tenant and Role Attack Rehearsal Verification

Date: 2026-10-10, Asia/Karachi. Base Git HEAD remained `97b2054`; the intentionally
dirty prior work was preserved. No file was staged, committed or pushed. I03,
I04, B12 and R00 were not started.

## Plan and changes

I02 reused the established Cloud Auth/REST and Route Handler suites rather than
creating another backend or fixture framework. The rehearsal covered Shop A and
Shop B owners/advisors/staff, both customers, assigned and unassigned technicians,
parts staff, two QC inspectors, inactive staff and an outsider.

The first Cloud RLS run produced 79/81 passes. Both failures were stale audit
expectations after the user-approved F08 migration: the exact migration list ended
at B10 and the private-function count/allowlist omitted
`private.list_estimate_catalog_impl`. All actual attack and unchanged-row tests
passed on that run. The test contract was updated for the applied additive F08
schema; no SQL migration, function, policy, grant or application authorization
logic changed. The full Cloud RLS suite then passed 81/81.

`frontend/e2e/security.spec.ts` adds the I02 production-boundary rehearsal using
the existing B11 demo identities and retained I01 pending booking. It verifies a
foreign customer and unassigned technician cannot read the booking, an advisor
cannot read or navigate into the foreign shop, and an action carrying fabricated
`nextStatus`, `role` and foreign `shopId` is rejected with HTTP 400. A subsequent
authorized read proves status, state version and complete history are unchanged.

## Actual commands and outputs

```text
BAYFLOW_TEST_PROJECT_REF=<private known demo reference> npm run db:test:cloud
tests 81; pass 79; fail 2
Attack/unchanged-row assertions passed. Two exact schema allowlists were stale
after migration 20261010110000.                               exit 1

BAYFLOW_TEST_PROJECT_REF=<private known demo reference> npm run db:test:cloud
tests 81; pass 81; fail 0; duration 129275.9778 ms             exit 0
Fixtures: 16 real Auth identities, three isolated shops.
Cleanup: shops hidden, staff deactivated, sessions signed out.

BAYFLOW_TEST_PROJECT_REF=<private known demo reference> node --test --test-concurrency=1 \
  supabase/tests/cloud-actions.test.mjs \
  supabase/tests/cloud-estimates.test.mjs \
  supabase/tests/cloud-parts.test.mjs \
  supabase/tests/cloud-repair-qc.test.mjs
tests 10; pass 10; fail 0; duration 362010.2041 ms              exit 0

npm run typecheck (frontend)
tsc --noEmit                                                   exit 0

npm run test:e2e:list
18 tests in 4 files; security.spec.ts listed for all viewports  exit 0

BAYFLOW_E2E_START_SERVER=1 npx playwright test e2e/security.spec.ts --project=desktop-1440
1 passed (35.9s)                                               exit 0

npm run db:test
Invalid standalone invocation: the test files expected the disposable native
PostgreSQL harness on 127.0.0.1:54322, which was not running. Nine static tests
passed and 132 connection/harness precondition failures followed. This command
does not represent a product regression.                              exit 1

npm run db:verify:postgres
PostgreSQL 17 disposable loopback harness; all 16 migrations applied; local seed
only; tests 141; pass 141; fail 0; second migration application applied []
PostgreSQL verification complete.                              exit 0

npm run typecheck (backend)
tsc --noEmit                                                   exit 0

npm test -- --maxWorkers=4 (frontend)
Test Files 37 passed (37); Tests 364 passed (364)              exit 0

npm run lint (frontend)
eslint .                                                       exit 0

npm run build (frontend)
Compiled successfully; Generated static pages (15/15)          exit 0

node backend/scripts/check-repository.mjs --history
candidateFiles: 324; indexedBlobs: 237; localEnvFiles: 3;
historyObjects: 991; findings: []                               exit 0

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

## Attack results

- Foreign booking IDs, customer IDs, shop URLs and child-table IDs disclosed no
  protected records.
- Shop B roles, unassigned/inactive staff and outsiders could not cross Shop A's
  tenant boundary; authorized same-shop counterparts retained access.
- Foreign estimate approval, arbitrary action authority fields, wrong actor/state,
  stale versions and non-owner QC decisions were rejected safely.
- Direct authenticated INSERT/PATCH/DELETE remained denied on all 18 application
  tables. Attempted booking status, stock and estimate changes left rows unchanged.
- Private helpers remained inaccessible through the Data API; authenticated
  execution remained limited to the audited guarded allowlist.
- Authorized confirmation/assignment/inspection, estimate approval, parts receipt/
  allocation, repair, QC fail/rework/pass, ready notice and pickup still passed.

## Risks and limitations

The Cloud suites deliberately create marked security fixtures and deactivate/hide
them during cleanup; audit records remain by design. The I02 browser test performs
only denied reads and a schema-invalid action, so it creates no new booking or
workflow history. The test uses the local production server against Supabase Cloud,
not a Vercel deployment. The known five high development-tool advisories remain
unchanged. No Cloud reset, reseed, deployment, migration application, admin-secret
exposure or generated-type rewrite occurred.

I03 is the exact next phase. It was not started here.
