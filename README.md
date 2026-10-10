# BayFlow — Garage operations, without the guesswork

BayFlow follows a vehicle repair from customer booking through inspection,
estimates, parts, repair, quality control and collection. It supports customers,
owners, service advisors, technicians, parts staff and QC inspectors.

Backend phases B01–B11 are implemented. Frontend F01–F06 is implemented; F06 adds
owner shop setup, summaries, settings, services and team management. Shared booking
details remain read-only until the workflow phases. See [the progress ledger](docs/05-progress-ledger.md)
for individual gates and limitations; browser/Cloud checks are separate from
automated frontend checks.

## Repository layout

```text
frontend/                       Next.js application (UI and its server runtime)
  .env.example                  Empty, safe application environment template
  src/app/                      App Router pages and /api/v1 Route Handlers
  src/components/               Public, booking, shared and workspace UI
  src/lib/                      Contracts, API clients, auth and Supabase clients
  src/server/                   Server-only permissions, queries and services
  src/test/                     Frontend and Route Handler tests
  public/                       Public assets
backend/                        Supabase database and verification tooling
  supabase/migrations/          Versioned schema, RLS and transactional SQL
  supabase/seed.sql             Disposable local test fixtures
  supabase/tests/               Explicit Cloud integration suites
  scripts/                      Database, demo and repository-audit tools
  tests/                        Native database and tooling tests
  docs/                         Cross-project contracts and frontend evidence
docs/                           Cross-project contracts and frontend evidence
AGENTS.md                       Contributor scope and project guardrails
CHANGELOG.md                    Recorded project changes
```

There is one application server: Next.js. Its API Route Handlers and server-only
services stay in `frontend/` because they are compiled and deployed with that app.
`backend/` contains the Supabase schema/tooling, not a second Express/FastAPI server.
Tests, migrations, lockfiles, generated database types and verification evidence
are intentional source artifacts. Type overlays are still imported and must not
be deleted simply because their filenames refer to earlier phases.

## Setup

Use Node.js compatible with the engines in each package (Node 24 was verified).
Dependencies are pinned by the two package lockfiles. Docker is not required.

```powershell
Set-Location frontend
npm ci --ignore-scripts
Copy-Item .env.example .env.local
# Fill .env.local locally; never commit it.
# Start the app manually when needed:
npm run dev
```

Configure the public Supabase URL, publishable key and site origin. These public
variables may enter the browser bundle; never place an admin key/password there.
The optional `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) is only
for server-side staff account provisioning. Use exactly one, server-only, when
that feature is needed. Configure the matching `/auth/callback` URL in Supabase.

Supabase CLI login/link state is local and ignored. Existing local demo credentials
live in ignored `backend/.env.b11-demo.local`. Preserve that file privately; do not
paste it into issues, screenshots, documentation or Git. The provisioning tool
loads that file explicitly; no backend env template with real credentials is needed.

## Verification

From `frontend/`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

From `backend/`:

```powershell
npm ci
npm run typecheck
node --test tests/repository-hygiene.test.mjs
# Optional full SQL verification; disposable native loopback PostgreSQL only:
npm run db:verify:postgres
```

The SQL harness creates its own disposable local cluster, applies migrations and
local seed fixtures, runs tests and shuts down. It does not reset Cloud or overwrite
generated types unless type generation is explicitly requested. Cloud integration
suites are separate, create fixtures and must be run deliberately against an
authorized test project. See [backend setup](backend/docs/database-foundation.md)
and [verification notes](backend/docs/verification.md).

## Migrations and seed

Commit `backend/supabase/migrations/*.sql`: they are the reproducible schema,
authorization policies and workflow functions. The repository audit found no
live credentials in the current migration files. Publishing SQL source does not
apply it to a database. Applying a migration is a separate reviewed operation.

Keep `config.toml` and `seed.sql` as source too. The seed contains intentionally
public, disposable test identities/passwords; never use those accounts or
passwords for real Cloud users. Never include the local seed in a Cloud push and
never reset Cloud. Database dumps, CLI caches and local PostgreSQL data stay ignored.
The B11 Cloud demo uses separate private credentials.

## Before pushing

From the repository root:

```powershell
node backend/scripts/check-repository.mjs --history
git diff --check
git status --short
git diff --cached --stat
```

The audit checks tracked/untracked push candidates, env templates, actual local
secret matches and recognizable privileged credentials. `--history` also scans
objects reachable from local Git refs. Output contains only file locations and
finding categories. A nonzero exit means review is needed. It is a useful local
check, not proof that every possible secret format is absent.

`.gitignore` excludes local env files, keys, deployment state, dependencies,
build outputs, logs, reports and database copies. It does not remove already
committed secrets or protect force-added files. Review the staged diff before
committing; enable repository secret scanning where available. If a real secret
was previously committed, revoke/rotate it before addressing history.

See [the cleanup and security audit](docs/repository-hygiene.md) for the current
findings and deliberate exclusions. No cleanup operation commits, pushes, changes
Cloud state or rotates credentials automatically.

## Opt-in F13 headless QA

From `frontend/`, `npm run test:e2e:list` lists tests without launching a server.
Install Chromium with `npx playwright install chromium` when needed. Set
`BAYFLOW_E2E_START_SERVER=1` to build an isolated `.next-f13` production server at
`http://localhost:3104` and run `npm run test:e2e -- visual.spec.ts`.
Authenticated checks use the private ignored B11 demo credentials file.

The full journey additionally requires `BAYFLOW_E2E_DEMO_WRITES=1` and
`BAYFLOW_E2E_PARTS=1`. It leaves real completed bookings, orders, notifications
and stock movements in the known demo project, and saves unchanged owner Hours
settings to refresh availability. Run only with authorization for those writes.
No Cloud reset/seed or deployment occurs. Screenshots are ignored under
`frontend/test-results`; see [F13 evidence](docs/verification/f13/README.md).
