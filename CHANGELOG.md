# Changelog

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
