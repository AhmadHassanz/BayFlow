# I01 Contract Sync and Real Data Cutover Verification

Date: 2026-10-10, Asia/Karachi. Base Git HEAD remained `97b2054`; the intentionally
dirty F06-F13 and F08 catalog work was preserved. No file was staged, committed or
pushed. I02, I03, I04, B12 and R00 were not started.

## Plan and completed work

I01 compared `docs/02-api-contract.md`, every `frontend/src/app/api/v1` Route
Handler, shared Zod contracts, server services/permissions, production API clients,
page/component consumers and the existing Playwright harness. The inventory found
no production mock record arrays, demo identities, hardcoded positive records,
client-only workflow status mutation or silent fake-record fallback.

Four authenticated views still assembled otherwise valid API URLs directly in
components: the staff booking queue, QC queue/claimed desk, inventory ledger and
technician estimate catalog. They now call typed functions in
`frontend/src/lib/api/workspace.ts`. Those functions validate UUIDs, pages,
assignee/status values, build one canonical query ordering and validate successful
camelCase envelopes with the same shared Zod output schemas used by the handlers.
Existing component response-scope checks remain in place.

The API inventory now records the implemented owner reads, scoped team read and
estimate-catalog read, and no longer describes the API as future-only. Its I01
section records the canonical client ownership, all 20 action discriminators, the
intentional B08 convenience-route delegation, the no-mock/no-fallback result and
the snake_case-to-camelCase boundary.

`frontend/e2e/i01.spec.ts` is the dedicated exit-gate test. It opens exactly two
independent authenticated browser contexts (customer and advisor), creates one
real booking, hard reloads and verifies `PENDING`, confirms it, hard reloads and
verifies `CONFIRMED`, assigns a real active technician returned by the scoped team
API, then hard reloads both sessions and verifies `ASSIGNED`.

## Actual commands and outputs

```text
npm test -- --run src/test/staff-workspace.test.tsx src/test/qc-workbench-ui.test.tsx src/test/technician-ui.test.tsx src/test/parts-desk-ui.test.tsx
Test Files 4 passed (4)
Tests 32 passed (32)                                      exit 0

npm run typecheck
tsc --noEmit                                              exit 0

npm run test:e2e:list
Total: 15 tests in 3 files; I01 listed for 375/768/1440    exit 0

npm test -- --run src/test/advisor-ui.test.tsx src/test/qc-workbench-ui.test.tsx
Test Files 2 passed (2)
Tests 21 passed (21)                                      exit 0

BAYFLOW_E2E_START_SERVER=1 BAYFLOW_E2E_DEMO_WRITES=1 npx playwright test e2e/i01.spec.ts --project=desktop-1440
First run: failed after the real booking write because an accessibility locator
matched both the record heading and timeline heading. No application assertion
failed; the selector was narrowed to the level-2 record heading.               exit 1

BAYFLOW_E2E_START_SERVER=1 BAYFLOW_E2E_DEMO_WRITES=1 npx playwright test e2e/i01.spec.ts --project=desktop-1440
1 passed (40.3s)                                          exit 0

npm test -- --run src/test/booking-wizard.test.tsx
Test Files 1 passed (1)
Tests 12 passed (12)                                      exit 0

npm test
Unbounded worker runs exposed the existing booking-wizard timing sensitivity:
one run had 363/364 pass; a repeat after its isolated 12/12 pass had 362/364.
No I01-touched test failed.                               exit 1

npm test -- --maxWorkers=4
Test Files 37 passed (37)
Tests 364 passed (364)                                    exit 0

npm run lint
eslint .                                                  exit 0

npm run build
Compiled successfully; Generated static pages (15/15)
All 24 /api/v1 Route Handlers, including estimate-catalog, were emitted. exit 0

cd backend; npm run typecheck
tsc --noEmit                                              exit 0

node backend/scripts/check-repository.mjs --history
candidateFiles: 321
indexedBlobs: 237
localEnvFiles: 3
historyObjects: 964
findings: []                                              exit 0

git diff --check                                          exit 0
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
git check-ignore frontend/.env.local backend/.env.b11-demo.local
frontend/.env.local
backend/.env.b11-demo.local                               exit 0

Get-NetTCPConnection -LocalPort 3104 -State Listen
port 3104: no listener

production mock/demo record search
matches only frontend/src/test setup and fixture files; no production match

direct /api/v1 URL search under production components/pages
empty output
```

## Exit gate and retained data

- No production mock arrays or hardcoded success records were found.
- Every production surface reads API/database state through a typed client or a
  server query that uses the same validated service projection as its Route Handler.
- One canonical URL builder now serves each authenticated queue/catalog read, and
  action names match the shared discriminated Zod union and SQL action service.
- The successful two-session run proved real booking, confirmation and assignment
  state survives hard reload in both customer and advisor sessions.

The first locator-failure run left one real `PENDING` I01 QA booking and the passing
run left one real `ASSIGNED` I01 QA booking in the disposable demo project. They
are legitimate QA history and were not deleted. No Cloud reset, reseed, migration,
deployment, visible browser, admin key, generated-type rewrite or direct database
mutation occurred.

## Risks and limitations

The normal unbounded Vitest command remains timing-sensitive in the pre-existing
booking-wizard suite under high worker concurrency; the same file passed 12/12 in
isolation and the established four-worker full gate passed 364/364. The five known
high development-tool advisories were not changed. I01 tested the authorized local
production server against Supabase Cloud, not a Vercel deployment. Notification
history remains the intentional latest-20 contract, and staff creation still needs
a privately configured server-only admin key.

I02 is the exact next phase. It was not started here.
