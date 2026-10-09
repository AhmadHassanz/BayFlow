# B04 Public Catalog, Owner Setup and Availability

## Scope and implementation

Blueprint B04 and docs/00-05 were reviewed before changes. This slice implements
owner shop creation/settings, service create/edit/soft-deactivation, public shop
directory, detail by ID/slug, public service catalog and capacity-aware slots.
No UI, booking mutation, extra application server, Docker or new dependency is
introduced. B05 has not started.

The service-member PATCH route completes service CRUD required by B04 and is now
recorded in docs/02. Soft deactivation is the contract's delete behavior; there is
no hard-delete API. Owner creation binds ownership to the verified identity.
An identity without staff privileges may become an owner; staff cannot self-promote.
An existing authoritative owner can create multiple shops. Shop, synchronized
profile and OWNER membership are one transaction, including deferred owner checks.

## Changes and boundaries

- Migration: `20261009121005_b04_public_catalog_and_slots.sql`.
- Public routes: `/api/v1/shops`, `/shops/[id]`, `/shops/by-slug/[slug]`,
  `/shops/[id]/services`, `/shops/[id]/slots`, all under `/api/v1`.
- Owner mutations: `POST /api/v1/owner/shops`,
  `PATCH /api/v1/owner/shops/[id]`, `POST /api/v1/shops/[id]/services`,
  `PATCH /api/v1/shops/[id]/services/[serviceId]`.
- Typed schemas: `frontend/src/lib/contracts/shops.ts`; query validation rejects
  unknown/duplicate keys, bad calendar dates, malformed IDs and unbounded pages.
- Services: `frontend/src/server/services/shops.ts`; explicit camelCase DTOs strip
  owner IDs/private fields. Literal name search escapes SQL LIKE wildcards.
- Public Supabase client: anonymous, session-free, never Admin. Mutations use
  verified user-scoped clients and the existing owner guard, then SQL authorization.
- Additive `database.b04.ts` overlay extends RPC/view types. The user's preexisting
  `database.types.ts` change is untouched and excluded from the checkpoint.
- Existing Cloud fixture slots now use tomorrow and valid weekly hours, allowing
  the RLS suite to test the new rolling public projection. Fixture hours are
  retained as structured JSON; the SQL-literal helper safely serializes/escapes
  JSON objects at the insertion boundary.

SQL adds two public SECURITY INVOKER wrappers and two guarded private SECURITY
DEFINER implementations. Private pure hours/grid/DTO helpers have no client
EXECUTE. All functions use empty search paths and qualified references. No tables,
RLS policies, base-table grants or statuses change. Shop/service edits lock and
recheck authoritative ownership and an active OWNER membership. Services retain
their tenant/identity and existing booking references when deactivated.

The existing public slot view adds only aggregate `capacity_remaining` and safe
`local_date`. It excludes unpublished shops, elapsed/out-of-horizon slots and
times no longer matching the current configuration. It uses built-ins rather
than granting anonymous execution on private helpers. Booking/customer IDs and
underlying booking rows remain private. Capacity counts all statuses except
CANCELLED, including COMPLETED, as required by the frozen state-machine contract.
Remaining capacity is clamped to zero; full slots are returned honestly.

## Hours, generation and appointment preservation

Hours use existing seed keys mon..sun with arrays of `[HH:MM,HH:MM]` pairs.
Missing days/empty arrays are closed; ordered non-overlapping intervals support
lunch breaks. At most four intervals/day; overnight windows are rejected.
Timezone defaults to Asia/Karachi, with validated database timezone names.
Duration is 15-240 integer minutes; capacity is 1-100. Settings are validated
independently in TypeScript and SQL. Public reads never mutate slots.

Owner setup saves generate today through local day 13, omitting elapsed starts,
closed periods, incomplete trailing intervals and timezone gaps/intervals whose
elapsed length differs during DST. UTC timestamptz values are persisted. The
existing `(shop_id,starts_at)` uniqueness preserves IDs across repeated saves.
No background scheduler is added: owners refresh the horizon by resaving current
settings, as specified by blueprint section 7.4.

Future slot rows are locked in time order. Settings that remove/shift an occupied
non-cancelled appointment or reduce capacity below occupancy fail with 409 and
roll back. Unreferenced obsolete future slots are removed; referenced slots are
retained for audit. Cancelled slots with incompatible end times stay recorded and
hidden, so a schedule change can leave that particular start unavailable. No
bookings or booking history are deleted. B05 must lock the slot and recheck
publication, current schedule/horizon and non-cancelled occupancy atomically.

## Verification commands

```powershell
Set-Location D:\BAYFLOW\backend
npm run db:verify:postgres
npm run typecheck
$env:BAYFLOW_TEST_PROJECT_REF = 'tlqvlsrmxueuuzxyltej'
npm run db:test:cloud
npx --no-install supabase db push --dry-run

Set-Location D:\BAYFLOW\frontend
npm run test
npm run lint
npm run typecheck
npm run build
npm run test:smoke

# Only after explicit approval of the reviewed migration:
Set-Location D:\BAYFLOW\backend
npx --no-install supabase db push
npm run db:lint
npm run db:test:cloud:b04
npm run db:test:cloud
```

## Executed evidence

- Native PostgreSQL 17 harness: exit 0, **88 tests / 88 passed / 0 failed**.
  Five migrations and seed applied to a fresh generated loopback database.
  Second migration application returned `applied: []`. Cloud was never reset;
  generated types were preserved. Twelve new SQL tests cover atomic first/multiple
  shops, failed-write rollback, staff/foreign-owner denial, hours validation,
  deterministic UTC slots, split shifts/closed days, horizon bounds, DST gaps,
  service tenant/soft-deactivation behavior, private aggregate capacity,
  appointment conflict rollback, publication hiding and function grants. One
  additional fixture-helper test verifies JSON structure and SQL quote escaping.
- Frontend: exit 0, **7 test files / 69 tests passed**. New cases exercise
  strict request/query validation, origin/auth denials, DTO privacy, literal search,
  local-date boundaries, safe error mapping and authoritative mutation responses.
- Frontend lint, frontend typecheck and backend typecheck: exit 0.
- Production Next.js build: exit 0, native Turbopack compiled all B03/B04 routes.
- Production HTTP smoke: exit 0, **13/13 passed**, safe no-store errors for
  missing sessions, cross-origin writes, malformed ID/query/date and auth callback.
  Uses a fake public configuration, no credentials and no Cloud writes.
- Cloud dry-run: exit 0; only B04 migration pending, `seeds: []`, `roles: []`.
- Cloud test JavaScript syntax checks: exit 0.
- Existing Cloud RLS regression against the currently applied B03 schema:
  exit 0, **81 tests / 81 passed / 0 failed** (152393 ms). It exercised the
  updated current-date/JSON fixtures and confirmed cleanup: shops hidden,
  non-owner staff deactivated, sessions signed out, audit fixtures retained.
  This is not evidence of B04 Cloud schema or catalog API acceptance.
- `git diff --check`: passed; scoped checkpoint excludes the user's types change.

The initial native run passed 84/86; two test-fixture assumptions were corrected:
elapsed slots today are excluded, and a COMPLETED booking requires completed_at.
The next run passed 86/86; adding the DST test passed 87/87, and the fixture
serialization test produced the final 88/88 result.
The first existing Cloud rerun failed in setup because the newly added fixture
hours object was unsupported by the primitive SQL literal helper. Cleanup
completed. A string-based fixture correction passed 80/81 but failed the unchanged
records assertion because REST returns a JSON object. The final helper supports
escaped JSON literals while fixtures retain their structured expected values;
the complete rerun passed 81/81 with cleanup. These were test corrections, not changes to application
authorization or SQL constraints.

## Cloud gate and remaining limitations

B04 Cloud schema is **NOT APPLIED**. B04 real Cloud catalog suite is **NOT RUN**;
it refuses fixture provisioning until the exact migration version exists. The
suite starts a production Next.js server without any Admin key, then checks
anonymous/staff denial, multi-shop owner creation, directory/detail privacy,
service edits/deactivation, deterministic slots, counted capacity, conflict
rollback, closed hours and unpublished 404s. It obtains fixture-management keys
only in memory through the existing CLI login. Cleanup matches unique per-run
shop names and known marked owner IDs, cancels its exact fixture booking, hides
shops, then deactivates/signs out shared fixtures. Audit-safe records remain.

B04 remains IN_PROGRESS until explicit approval, Cloud application, Cloud lint,
the new suite and post-migration RLS regression checks pass. No B05 work is
included. UI rendering belongs to F01/F02, and Vercel/browser integration remains
a separate gate. No rating, availability or successful test outcome is fabricated.

Technical references consulted:
[PostgreSQL date/time and AT TIME ZONE](https://www.postgresql.org/docs/17/functions-datetime.html),
[Supabase function security](https://supabase.com/docs/guides/database/functions).
