# BayFlow — Garage operations, without the guesswork

BayFlow follows a vehicle repair from customer booking through inspection,
estimates, parts, repair, quality control and collection. It supports customers,
owners, service advisors, technicians, parts staff and QC inspectors.

Backend phases B01–B11, frontend phases F01–F13 and integration phases I01–I04
are implemented. See [the progress ledger](docs/05-progress-ledger.md) for each
gate and its limitations.

## Live demo

The production application is available at
[bay-flow-delta.vercel.app](https://bay-flow-delta.vercel.app). I04 verified the
complete public-to-completion workflow on this deployment in clean browser
contexts, including estimate rejection and revision, partial parts receipt, QC
failure and rework, final QC pass, ready notification and customer pickup.

The disposable demonstration identities are:

- `demo-customer.a@bayflow.example.test`
- `demo-owner.a@bayflow.example.test`
- `demo-advisor.a@bayflow.example.test`
- `demo-technician.a@bayflow.example.test`
- `demo-parts.a@bayflow.example.test`
- `demo-qc.a@bayflow.example.test`

Their shared private password is intentionally not stored in Git or this README.
Use the privately retained B11 demo credential when presenting the judge script.

## Six minute judge script

1. Open the live homepage in a private window, show the real workshop directory,
   choose Lahore Auto Care and create a symptom-only booking as Customer A.
2. Sign in as the service advisor in a second private context, confirm the visit
   and assign Technician A.
3. As Technician A, start inspection and submit an itemized estimate with real
   catalog parts and labour.
4. As the advisor, review and send it. As Customer A, decline it once. Revise and
   resend as the advisor, then approve it as the customer.
5. Assign Parts A, create an order for the shortage, receive it in two deliveries,
   allocate stock and release the vehicle to repair.
6. Complete repair as Technician A. Claim and fail QC as QC A, record the issue,
   repair and resubmit as Technician A, then claim and pass the second inspection.
7. Notify ready as the advisor and confirm pickup as Customer A. Reload the final
   record and show `COMPLETED`, both estimate revisions, the QC failure/pass loop
   and immutable timeline.
8. If time allows, show a foreign customer or foreign-shop URL returning an
   unavailable response without exposing data.

Prepare the six disposable accounts in separate private contexts before judging.
If the venue network fails, use the retained I04 screenshots only as supporting
evidence and state clearly that they are a recording of a previously successful
live run, not a substitute for a functioning deployment.

## Security and transaction guarantees

- Supabase RLS scopes customers and active shop memberships to authorized records.
- Ordinary authenticated users cannot directly update workflow state, stock,
  history, estimates, QC records or notifications.
- Transactional PostgreSQL functions lock and recheck actor, tenant, assignment,
  state version and idempotency keys before committing multi-row actions.
- Estimate revisions and booking history remain immutable audit records.
- Public responses use safe projections; API errors return stable messages and an
  opaque request ID rather than raw database exceptions or stack traces.
- Admin keys remain server-only and are used only for guarded staff provisioning.

## Known limitations

- Notifications show the latest 20 records and use polling/focus refresh rather
  than realtime delivery.
- Rate limiting is process-local and is not a distributed abuse-control service.
- Staff account creation requires one privately configured server-only Supabase
  admin key.
- Email delivery depends on Supabase Auth configuration; the core demo uses
  pre-provisioned disposable accounts.
- No payment gateway, invoice PDF, SMS, voice agent, public reviews or mandatory
  customer image upload is included.
- Chromium is the automated browser gate. Safari and Firefox remain manual smoke
  options.

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

## Production deployment

Create the Vercel project from this repository with `frontend/` as its root and
the Next.js framework preset. Configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the exact canonical HTTPS origin in
`NEXT_PUBLIC_SITE_URL`. Configure exactly one server-only admin key only when staff
provisioning is required: prefer `SUPABASE_SECRET_KEY`, or use the legacy
`SUPABASE_SERVICE_ROLE_KEY`, never both and never with a `NEXT_PUBLIC_` prefix.

In Supabase Auth URL Configuration, set the production Site URL to the canonical
origin and allow the exact `<origin>/auth/callback` URL. Environment changes apply
only to a new Vercel deployment. After deploying, run the read-only production
smoke check from `frontend/`:

```powershell
$env:BAYFLOW_PRODUCTION_URL='https://bay-flow-delta.vercel.app'
npm run test:smoke:production
```

The complete installation, migration, disposable demo and verification handoff is
in [the B12 backend handoff](backend/docs/b12-backend-handoff.md).

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

### Marked Cloud demo cleanup

`backend/scripts/cleanup-cloud-demo.mjs` removes only the B11 demo fixture set. It
requires `BAYFLOW_CLEANUP_PROJECT_REF` to exactly match the linked project and is
dry-run by default:

```powershell
cd backend
$env:BAYFLOW_CLEANUP_PROJECT_REF = '<exact-project-ref>'
npm run db:demo:cleanup
```

Execution additionally requires `--execute` and a project-specific confirmation.
The script rejects deterministic-ID collisions and marked-user dependencies
outside the three fixture shops. It never resets Cloud or matches display names.

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
