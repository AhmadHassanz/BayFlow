# Changelog

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
