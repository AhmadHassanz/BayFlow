# F06 verification — 2026-10-10 (Asia/Karachi)

Implemented F06 only: owner overview/shop switching, first/additional shop setup,
Operations / Team / Services / Hours settings, service create/edit/publication,
and staff create/role/deactivate/reactivate. Shared job details remain read-only;
F07 advisor actions were not implemented.

The user explicitly approved owner-only GET contracts on existing API routes:
owner shop index and detail, team roster, and `scope=owner` services including
inactive entries. Existing tables, guards and user-scoped RLS clients are used.
There is no migration, schema/grant/RLS change, new backend server or dependency.
The exact DTOs and count definitions are documented in docs/02-api-contract.md.

## Automated checks

```text
npm test -- src/test/owner-services.test.ts src/test/owner-ui.test.tsx
18 tests passed at the focused checkpoint

npm test -- src/test/booking-wizard.test.tsx
12 tests passed

npm test -- --maxWorkers=4
Test Files 26 passed (26)
Tests      260 passed (260)

npm run lint                      exit 0 (frontend)
npm run typecheck                 exit 0 (frontend and backend)
npm run build                     exit 0 (frontend)
Compiled successfully; generated pages 15/15

node backend/scripts/check-repository.mjs --history
findings: []                      exit 0

git diff --check                  exit 0
```

The build includes dynamic `/owner`, `/owner/shops/new` and
`/shops/[slug]/settings` plus all existing routes. Staff nested URLs continue using
UUID shop IDs even though the shared filesystem parameter is named `[slug]`.

The first full 26-worker test run timed out in an existing five-step booking test
(259 passed, 1 timeout). That file passed independently, and all 260 tests passed
with four workers. No assertions/timeouts were weakened and no test-runner source
configuration was changed to hide the failure.

Focused failures also caught strict DTO projections incorrectly retaining raw
snake_case keys and a manually set hours-validation error that blocked resubmit.
Both were corrected; DTOs are now explicit camelCase projections, and changing
hours clears their prior error before revalidation. No strict schema was weakened.

## Coverage and behavior

- Read-route tests verify Auth/ownership guards run before private queries;
  401/403 responses, malformed IDs, duplicate/unknown query rejection,
  owner/public service separation, safe failures and no-store/Vary Cookie.
- Service tests verify ownership filters, deterministic 50-row pages, exact
  per-shop counts, isolated summaries, count failure (not fake zero), inactive
  membership/service reads and minimal safe roster/profile DTOs.
- UI tests verify real count rendering, empty/network/retry, shop creation
  validation and payload, uncertain-result locks, split-shift overlap correction,
  SCHEDULE_CONFLICT copy, settings sections and private catalog scope, whole-PKR
  edit/reactivation and nullable-price creation, duplicate staff email, successful
  one-time credentials without storage, incomplete provisioning locks/password
  clearing, confirmed deactivation/role changes and expired owner sessions.
- The existing workspace server guard test now additionally denies a service
  advisor from `/settings`; owner navigation adds settings, others do not.
- Existing API/SQL guards continue enforcing actual owner identity plus active
  OWNER membership. The index uses authoritative ownership filters and RLS, never
  an Admin client. There is no client-only tenant or permission enforcement.

## Limits and operational configuration

No frontend server/browser, Cloud mutation, new account, clipboard write or email
round trip was run by the agent. DOM/route tests use explicit test fixtures and
mock transports; no real Cloud CRUD or visual approval is claimed. Existing RLS
policies were not changed; the native SQL harness was not rerun for read-only
query additions without SQL changes.

The inspected local app env contains public configuration only. Staff provisioning
requires exactly one server-only `SUPABASE_SECRET_KEY` or legacy
`SUPABASE_SERVICE_ROLE_KEY` configured privately. The implementation handles failed
or incomplete provisioning safely, but live staff creation remains unverified and
unavailable until that configuration is supplied. Never paste the key into chat,
client props, public env variables or Git.

Shop/service/staff creation has no backend idempotency contract. Mounted forms
lock further creates after uncertain network/5xx/invalid-response outcomes; the
user must inspect records/operator state before a fresh request. Navigation/reload
clears those in-memory locks. Staff initial passwords remain only in form/credential
state and are never stored or returned by roster APIs. Dismissing/navigating away
clears their display; clipboard copy is explicit and includes private-sharing copy.

Per-shop metrics are exact separate count queries, not a single transactional
snapshot. They can observe slightly different moments during concurrent workflow
changes. A full 50-shop overview page performs four count reads per shop; the
hackathon's three-shop setup is the intended current scale.

The generated database.types.ts was not written, regenerated or staged. During
this turn HEAD advanced externally to 97b2054; the prior generated-types change is
now in HEAD and its working-tree diff is empty. No user commit was reset. F06
changes remain unstaged; the agent made no commit or push. Both local env files
remain ignored and untouched, and the final secret audit found no matching current
local secret or recognizable privileged credential in candidates/index/history.

Next phase: F07 Service Advisor desk and guarded confirm/assign/cancel actions.
