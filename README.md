# BayFlow - Garage Operations, Without the Guesswork

BayFlow is a multi-tenant auto repair workflow platform for customers, garage owners, service advisors, technicians, parts staff, and QC inspectors.

**Phase B06: Cloud verified; B07 not started.**
B01-B06 are verified in Cloud. B06 adds the staff/customer booking action engine
for confirmation, technician assignment, inspection start, cancellation and
role-scoped booking reads. UI and B07 estimate work remain outside this phase. See
[B06 evidence](backend/docs/b06-actions-verification.md),
[B05 evidence](backend/docs/b05-booking-verification.md),
[B04 evidence](backend/docs/b04-catalog-verification.md) and
[B03 evidence](backend/docs/b03-auth-verification.md).

## What problem it solves

BayFlow tracks a repair from public booking through service advisor intake, technician inspection, estimate approval or rejection, parts ordering and allocation, repair, mandatory QC, pickup, and completion.

## Customer / Owner / SA / Technician / Parts / QC roles

See [docs/00-project-contract.md](docs/00-project-contract.md) for role boundaries and [docs/03-state-machine.md](docs/03-state-machine.md) for legal actions.

## Technology and architecture

Planned stack:

- Next.js App Router with React and TypeScript strict.
- Supabase Cloud Auth, Postgres, RLS, and transactional Postgres functions.
- Same-origin `/api/v1/*` Route Handlers with Zod validation and typed JSON envelopes.
- Vercel deployment.

## Prerequisites and exact versions

Node.js >=22 (verified with 24.15.0). Backend development dependencies are pinned:
Supabase CLI 2.120.0, PostgreSQL test runtime 17.10.0-beta.17, `pg` 8.16.3,
TypeScript 5.9.3. See `backend/package.json` and `backend/package-lock.json`.
Application dependencies are pinned in `frontend/package.json` and its lockfile.
Docker is not used.

## Installation

For the B03 application runtime:

```powershell
Set-Location frontend
npm ci --ignore-scripts
# Copy ../.env.example to .env.local and configure the linked project's keys.
npm run dev
```

```powershell
Set-Location backend
npm ci
npm run db:reset
npm run typecheck
```

`db:reset` starts a disposable native PostgreSQL 17 instance, runs the official
Supabase CLI reset/migrations/seed, checks constraints and RLS, preserves types,
checks migration reapplication, and shuts the instance down. Its database URL is
always generated locally; it cannot reset a Cloud database. No Docker is needed.

## Environment variables

The environment contract is documented in [docs/00-project-contract.md](docs/00-project-contract.md).
Copy root `.env.example` to `frontend/.env.local`. Set the public Supabase URL/key,
site origin, and exactly one server-only Admin key. Allowlist the exact auth
callback URL in Cloud; never expose an Admin key through `NEXT_PUBLIC_*`.

## Supabase migration and seed instructions

All application DDL lives in `backend/supabase/migrations/`. The CLI-generated
configuration and disposable seed are `backend/supabase/config.toml` and
`backend/supabase/seed.sql`. The B01 foundation migrations create 18 tables,
five enums, same-tenant FKs, indexes, constraints, safe triggers, six private
read helpers, 18 read policies and three public catalog views.

See [backend database guide](backend/docs/database-foundation.md) for the ERD,
Cloud linking/review/push commands, RLS decisions, and full fixture account list.
Cloud project `tlqvlsrmxueuuzxyltej` is linked with B01-B05 migrations applied.
Never reset Cloud or include the local seed in a Cloud push. Future migrations
require review before application.
The additional B03 migration `20261009100642_b03_auth_and_team.sql` is applied
locally and in Cloud. Cloud lint reports no schema errors.
B04 migration `20261009121005_b04_public_catalog_and_slots.sql` is applied in
Cloud after explicit approval. Cloud lint, 7/7 catalog tests and 81/81
post-migration RLS regression tests passed, including fixture cleanup.
B05 migration `20261009140203_b05_transactional_booking.sql` is applied in Cloud
after user-run review/dry-run/push. Cloud lint, 9/9 booking acceptance and 81/81
RLS regression tests passed. It adds one private receipt table and the narrow
booking RPC; all 18 public tables retain their existing RLS/write-denial boundaries.
B06 migration `20261009151303_b06_booking_state_engine.sql` and follow-up
`20261009153959_b06_lint_list_my_bookings_input.sql` are applied in Cloud.
Cloud lint, B03/B04/B05/B06 acceptance and 81/81 RLS regression tests passed.
B06 adds one private action receipt table, guarded booking action/read RPCs and
no direct public table writes.

Supabase CLI generated [database types](frontend/src/lib/supabase/database.types.ts)
from the linked Cloud schema. Run
`npm run db:types` from `backend/` to regenerate from the linked project.

## Development / lint / typecheck / test / build

`npm run db:reset` runs the complete disposable database check; `npm run typecheck`
checks generated types. `npm run db:test` targets an already running loopback
database. `npm run db:lint` targets a linked Cloud database after reviewed schema
application. Verification evidence is recorded in
[backend verification](backend/docs/verification.md).

B02 adds `npm run db:test:cloud`. Set `BAYFLOW_TEST_PROJECT_REF` to the linked
development/test project first. It creates dedicated Auth identities and tenant
fixtures; use the [B02 audit guide](backend/docs/b02-security-verification.md)
for exact commands, security results and cleanup behavior. All 81 Cloud tests
and 57 native tests pass. No Docker or additional dependencies are needed.

From `frontend/`, B03 provides `npm run dev`, `npm run build`, `npm run start`,
`npm run lint`, `npm run typecheck`, and `npm run test`. Auth UI belongs to later
frontend work. Run
`npm run db:test:cloud:b03` from `backend/` to exercise production Next.js against
real Cloud Auth. The B03 suite passed 12/12, and the existing RLS suite passed
81/81 again after migration application. Tests obtain keys in memory through the
existing CLI login/link.

B04's `npm run db:test:cloud:b04` exercises catalog/owner operations against
production Next.js without an Admin key in the application server. It requires
the approved B04 Cloud migration and a frontend production build. Owner setup
saves refresh the next 14 local calendar days; no background scheduler is added.

B05 adds `npm run db:test:cloud:b05`, guarded on its exact migration version.
It exercises real HTTP booking/retry/capacity/ownership behavior against the
linked Cloud project. Build frontend first and run all Cloud suites sequentially.
B06 adds `npm run db:test:cloud:b06`, guarded on its exact migration version.
It exercises real HTTP confirm, assign, start-inspection, cancellation and
role-scoped read behavior against the linked Cloud project.

## Demo credentials

The B01 work order explicitly includes local seed users. All addresses use
`@bayflow.example.test`, with disposable password `BayFlow-Local-2026!`.
Handles: `owner.a`, `owner.b`, `customer.a`, `customer.b`, and
`advisor.a`/`technician.a`/`parts.a`/`qc.a` (also `.b` and `.c` for other shops).
Owner A owns Lahore Auto Care and Northside Garage; owner B owns City Motors.
These are native test fixtures, not provisioned Cloud accounts. Separate B02
Cloud identities use random per-run passwords and are not demo logins.
No workflow records are seeded in B01.

## Live Vercel deployment and Supabase configuration

Not configured in S00. B00 creates the deployable skeleton; B12 hardens deployment instructions.

## Full booking lifecycle + QC loop demonstration

Target demo: booking -> assignment -> inspection -> estimate -> approval/rejection -> parts -> repair -> QC fail/fix/pass -> pickup -> completed. See [docs/05-progress-ledger.md](docs/05-progress-ledger.md) for phase gates.

## Security: RLS, authorization, transaction guarantees

Customers and vehicles are global. All other tenant data carries `shop_id` (the
shop row uses its own `id`). Composite FKs prevent cross-shop child references
and cross-customer vehicle assignment. Active membership plus job assignment
limits staff reads. Customers read their own jobs and sent estimate snapshots.
Anonymous users see audited catalog views, never private base tables. Ordinary
users have no direct write grants. History is append-only.

Security contracts remain in [docs/01-schema-and-rls.md](docs/01-schema-and-rls.md),
[docs/02-api-contract.md](docs/02-api-contract.md), and
[docs/03-state-machine.md](docs/03-state-machine.md).

## Known limitations and optional features

B01 verifies PostgreSQL behavior using minimal platform Auth/role fixtures.
B02 additionally verifies real Cloud sign-in, REST authorization and SQL lint.
Test identities and immutable audit fixtures remain in Cloud; test shops are
hidden and test staff deactivated after the run. Distributed Auth/staff
provisioning failures can require operator recovery; see the B03 guide. Workflow
non-booking idempotency beyond B06 and remaining workflow RPCs belong to later
phases. B04, B05 and B06 Cloud acceptance passed.
Vercel/browser integration remains a separate gate.
Referenced cancelled appointments can keep a changed slot start unavailable;
the B04 guide records schedule preservation and horizon-refresh behavior.
Booking receipts retain canonical private payloads without automatic expiration;
HTTP booking throttling is per-process. Booking creation never edits saved
vehicles; conflicting details for an existing own plate return 409. See docs/02.

```text
frontend/
  src/{app,components,server,test}/
  src/lib/supabase/database.types.ts
  public/
  e2e/
backend/
  supabase/{config.toml,seed.sql,migrations/,tests/}
  docs/{database-foundation.md,verification.md,b02-security-verification.md,b03-auth-verification.md,b04-catalog-verification.md,b05-booking-verification.md}
  scripts/{generate-types.mjs,verify-postgres.mjs}
  tests/{helpers.mjs,foundation.test.mjs,tenant-context.test.mjs}
  package.json
  package-lock.json
  tsconfig.json
docs/00-05
AGENTS.md
CHANGELOG.md
```
