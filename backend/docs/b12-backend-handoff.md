# B12 Backend Deployment and Operations Handoff

## Scope and architecture

BayFlow has one Next.js application in `frontend/`. Its Route Handlers are the
HTTP API. `backend/` contains Supabase migrations, disposable verification tools
and demo provisioning; it is not a second application server.

The production database is Supabase Cloud. Never run a destructive reset or the
local `seed.sql` against Cloud. Apply only reviewed forward migrations.

## Install

Use a Node version accepted by each package's `engines` field. Node 24 is verified.

```powershell
Set-Location D:\BAYFLOW\frontend
npm ci --ignore-scripts
Set-Location D:\BAYFLOW\backend
npm ci
```

Copy `frontend/.env.example` to ignored `frontend/.env.local` for local work.
Never commit real environment values.

## Environment

Vercel production requires:

- `NEXT_PUBLIC_SUPABASE_URL`: Cloud project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable browser key.
- `NEXT_PUBLIC_SITE_URL`: exact canonical HTTPS Vercel origin.
- `SUPABASE_SECRET_KEY`: optional server-only staff provisioning key.

The legacy `SUPABASE_SERVICE_ROLE_KEY` may replace the secret key, but the app
rejects configuring both. No admin key may use a `NEXT_PUBLIC_` prefix.

Supabase Auth must use the canonical origin as Site URL and allow the exact
`<origin>/auth/callback` redirect. Redeploy after any Vercel environment change.

## Migration

Link the CLI only to the intended project, then inspect before applying:

```powershell
Set-Location D:\BAYFLOW\backend
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npm run db:lint
```

If and only if a reviewed forward migration is listed, apply it without seeds or
roles, then repeat the list, dry-run and lint checks. Never use a Cloud reset.

At the B12 checkpoint, all 16 local migrations through
`20261010110000_f08_estimate_catalog.sql` match Cloud and the dry-run is empty.

## Disposable demo

Cloud demo provisioning is intentionally separate from SQL seed files. Keep the
private B11 password in ignored `backend/.env.b11-demo.local`, set the explicit
provisioning guards required by `scripts/provision-cloud-demo.mjs`, and run:

```powershell
npm run db:demo:cloud
```

The provisioner is idempotent for its known nonproduction marker and does not wipe
unrelated users. Do not expose its password or an admin key in logs, screenshots,
Git, browser variables or application authorization.

## Verification

```powershell
Set-Location D:\BAYFLOW\backend
npm run typecheck
npm run db:verify:postgres
$env:BAYFLOW_TEST_PROJECT_REF='tlqvlsrmxueuuzxyltej'
npm run db:test:cloud

Set-Location D:\BAYFLOW\frontend
npm test -- --maxWorkers=4
npm run typecheck
npm run lint
npm run build
$env:BAYFLOW_PRODUCTION_URL='https://bay-flow-delta.vercel.app'
npm run test:smoke:production
```

Cloud integration suites create and deactivate isolated fixtures and retain audit
records. Run write suites only with explicit authorization. The production smoke
is read-only and accepts no credential.

## Operational errors and logs

API failures return stable envelopes and an opaque request ID in both the body and
`X-Request-Id`. Search Vercel logs using that ID. Logs deliberately omit thrown
objects, request bodies, raw database messages, credentials and stack traces.

HTTP 400 indicates invalid input, 401 no session, 403 forbidden, 404 hidden or
missing, 409 a stale/conflicting state, 422 a domain rule failure and 500 an
unexpected failure. Do not weaken RLS or expose hidden records to diagnose one.

## Release boundary

Before release, confirm the Git deployment contains the reviewed B12 source, the
Vercel production deployment is Ready, the production smoke passes with correlation
IDs and security headers, all demo roles authenticate, and the repository audit has
zero findings. R00 owns the final release decision.
