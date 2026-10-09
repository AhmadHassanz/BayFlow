# BayFlow - Garage Operations, Without the Guesswork

BayFlow is a multi-tenant auto repair workflow platform for customers, garage owners, service advisors, technicians, parts staff, and QC inspectors.

**Phase B02: Cloud security verification complete.** PostgreSQL schema, RLS,
generated database types and real Auth/REST isolation tests are implemented. Application pages, APIs and workflows
have not been built. B00 remains unimplemented; B01 was explicitly requested next.

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
No application dependencies are installed. Docker is not used.

## Installation

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

The future environment contract is documented in [docs/00-project-contract.md](docs/00-project-contract.md). `.env.example` is expected in B00/B12 when the app skeleton exists.

## Supabase migration and seed instructions

All application DDL lives in `backend/supabase/migrations/`. The CLI-generated
configuration and disposable seed are `backend/supabase/config.toml` and
`backend/supabase/seed.sql`. The three migrations create 18 tables, five enums,
same-tenant FKs, indexes, constraints, safe triggers, six private read helpers,
18 read policies and three public catalog views.

See [backend database guide](backend/docs/database-foundation.md) for the ERD,
Cloud linking/review/push commands, RLS decisions, and full fixture account list.
Cloud project `tlqvlsrmxueuuzxyltej` is linked with all three migrations applied.
Never reset Cloud or include the local seed in a Cloud push. Future migrations
require review before application.

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

Next.js dev/build/lint/E2E commands will be added in their authorized phases.

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
hidden and test staff deactivated after the run. The Next.js scaffold is still
absent. Workflow RPCs, idempotency and transition guards belong to later phases.
B03 and all later phases remain unstarted.

```text
frontend/
  src/{app,components,server,test}/
  src/lib/supabase/database.types.ts
  public/
  e2e/
backend/
  supabase/{config.toml,seed.sql,migrations/,tests/}
  docs/{database-foundation.md,verification.md,b02-security-verification.md}
  scripts/{generate-types.mjs,verify-postgres.mjs}
  tests/{helpers.mjs,foundation.test.mjs,tenant-context.test.mjs}
  package.json
  package-lock.json
  tsconfig.json
docs/00-05
AGENTS.md
CHANGELOG.md
```
