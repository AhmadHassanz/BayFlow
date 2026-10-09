# Changelog

## B05 - 2026-10-09 (local verification; manual Cloud gate pending)

- Added POST /api/v1/bookings using verified cookie identity and one user-scoped
  transactional PostgreSQL RPC; no Admin client, UI or B06 actions.
- Added slot/shop locking and current schedule/horizon/capacity checks,
  active same-shop services, exact own-vehicle reuse and atomic PENDING creation,
  history, active-SA notifications and private actor/key idempotency receipts.
- Added strict request/DTO contracts, safe conflict mapping, a bounded per-process
  booking limiter and an additive types overlay preserving the user's types file.
- Added native capacity/retry/schedule races and rollback/ownership checks,
  frontend/API tests, production smoke and a guarded operator-run Cloud suite.
  Existing Cloud RLS allowlists recognize the optional B05 migration.
- No B05 Cloud migration, lint or test command was executed. Actual local results
  and manual application/acceptance commands are in the B05 verification guide.
- Local verification passed 104 native tests, 110 frontend tests and 15 production
  HTTP smoke checks; frontend lint/build and both typechecks exited 0.

## B04 - 2026-10-09

- Applied the reviewed B04 migration to Cloud with explicit user approval;
  fresh dry-run and push included only B04, no seeds or role changes.
- Cloud lint passed with no schema errors; real catalog acceptance passed 7/7
  and post-migration RLS regression passed 81/81, including fixture cleanup.
  B04 is PASSED. See the B04 verification guide for retained limitations.

- Added atomic shop/profile/OWNER membership setup and owner-only shop settings,
  plus service create/edit/soft-deactivation with strict tenant checks.
- Added public directory/filter/detail, services and capacity-aware slot APIs with
  bounded queries, safe camelCase DTOs and anonymous projection reads.
- Added validated weekly split shifts, timezone-aware 14-day slot generation,
  repeatable slot IDs and rollback on conflicts with booked future appointments.
- Preserved all base-table write-denial/RLS boundaries, tables and status values;
  the public slot view exposes only aggregate remaining capacity and local date.
- Passed 88 native verification tests, 69 frontend tests, 13 production HTTP smoke checks,
  lint, both typechecks and production build. Cloud dry-run lists only B04,
  no seeds/roles. Real B04 Cloud verification subsequently passed as recorded above.
- Added a guarded Cloud catalog suite and current-date RLS fixtures; preserved
  the user's generated-types modification. No B05 or UI work was added.
- Reran existing Cloud RLS against B03 schema with the updated fixtures: 81/81
  passed with successful cleanup. This pre-migration run is separate from the
  subsequent B04 Cloud acceptance and post-migration regression above.

## B03 - 2026-10-09

- Added verified Supabase SSR cookie sessions, signup/login/logout Server Actions,
  PKCE callback, self-only profile sync and `/api/v1/me`.
- Added owner-only staff provisioning and role/activation APIs with safe duplicate
  email handling, guarded transactional membership writes and failure recovery.
- Added the minimum Next.js runtime/configuration absent from this checkout,
  pinned dependencies and focused Node/API/SQL/Cloud test tooling.
- Applied the reviewed forward migration to Cloud with explicit user approval;
  no seeds/roles were pushed. Cloud lint reports no schema errors.
- Passed 43 frontend auth/API tests, 81 existing Cloud RLS regressions, 5 production
  HTTP smoke checks, 75 native SQL tests, typechecks, lint and production build.
  The new real Cloud session/staff suite passed 12/12 with successful cleanup.
- Corrected Cloud test cleanup to skip a session already revoked by its logout
  assertion, which now also verifies zero remaining Auth sessions.
- Preserved existing RLS/write-denial boundaries and the user's generated-types
  modification; no business workflow, shop creation or UI feature was added.

## B02 - 2026-10-09

- Verified real Supabase Cloud Auth/REST tenant isolation with 81 passing tests
  covering every exposed table, grants, private helpers and blocked mutations.
- Added guarded, repeatable Cloud test identities and tenant fixtures with
  session cleanup, hidden test shops and deactivated non-owner staff.
- Preserved Cloud-generated types during default native verification.
- Documented Cloud migration status, security evidence and rerun commands.
- No schema changes, dependencies, UI, APIs or workflow operations were added.

## B01 - 2026-10-09

- Adopted the user's frontend/backend directory layout.
- Added versioned PostgreSQL schema, tenant constraints, read policies, safe public
  projections, private authorization helpers and disposable local seed fixtures.
- Added pinned Supabase CLI tooling, database verification and type generation.
- Kept B00 and all application/workflow phases unimplemented.
