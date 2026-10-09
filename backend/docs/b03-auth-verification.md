# B03 Auth and Owner-Authorized Team Management

## Scope and implementation

The complete master blueprint and repository contracts were read. B03 implements
email/password auth Server Actions, PKCE callback, verified cookie sessions,
profile synchronization, `GET /api/v1/me`, owner permission guards, staff creation
and membership role/activation changes. UI remains with the frontend phases;
shop/catalog creation remains B04. No booking workflow is added.

The checkout at the start contained reserved frontend directories and generated
database types, but no frontend package/runtime. After the user's instruction to
proceed, the minimum Next.js runtime/configuration needed to execute B03 was added.
This is not evidence that the separate B00 deployment gate has passed. The B00
ledger entry is preserved pending reconciliation with the user's project history.

## Files

```text
frontend/
  package.json, package-lock.json, .npmrc
  tsconfig.json, next-env.d.ts, eslint.config.mjs, vitest.config.ts
  src/proxy.ts
  src/app/layout.tsx
  src/app/auth/callback/route.ts
  src/app/api/v1/me/route.ts
  src/app/api/v1/shops/[id]/team/route.ts
  src/app/api/v1/shops/[id]/team/[memberId]/route.ts
  src/lib/{auth,api,contracts}/
  src/lib/supabase/{server,client,admin,proxy,env,database.b03}.ts
  src/test/*.test.ts
backend/
  supabase/migrations/20261009100642_b03_auth_and_team.sql
  tests/auth-team.test.mjs
  supabase/tests/cloud-auth.test.mjs
```

The preexisting user change to `database.types.ts` is untouched and excluded from
the checkpoint. `database.b03.ts` provides an explicit typed RPC overlay until the
Cloud migration is approved/applied and the operator regenerates Cloud types.

## Security and transaction boundaries

Identity verification uses `auth.getUser()` in server guards, contacting Supabase
Auth rather than trusting a parsed cookie. The Next.js 16 proxy uses verified
`getClaims()` and forwards refreshed cookies to both request and response.
Private API responses are `private, no-store`. Mutation requests require matching
Origin. Next.js Server Actions additionally enforce the configured site origin.

Signup accepts only name/email/password. Display names are copied from Auth
metadata by a self-only SQL RPC; metadata never establishes roles or tenants.
Customers and future owners use the same global Auth identity. Ownership is
established by B04 shop creation, not a signup role field. The callback exchanges
PKCE codes and permits only local return paths. No credentials or tokens are
returned in `/me`, mutation JSON, logs or profile records.

The migration adds three authenticated-only public SECURITY INVOKER wrappers:
`sync_profile`, `add_staff_membership`, `edit_staff_membership`. Their private
SECURITY DEFINER implementations use empty search paths and qualified references.
`require_team_owner` is a nested private authorizer without client EXECUTE.
Owner operations lock the authoritative shop and active OWNER membership, bind
the actor to `auth.uid()`, and reject foreign shops and protected OWNER records.
Staff roles are SA/TECHNICIAN/PARTS/QC. No tables, RLS policies, ordinary-client DML
grants, statuses or workflow operations change.

Staff provisioning spans Auth Admin and Postgres, which cannot share one database
transaction. The server checks ownership before creating a *new* Auth user,
temporarily banned, with Admin-only owner/shop provisioning markers. A user-scoped
RPC rechecks ownership and these markers, then atomically creates the profile and
membership. Only then does Admin enable the new account. Duplicate emails are
rejected; existing passwords are never reset and identities never auto-merged.

If attachment fails, cleanup deletes only a newly created identity after an Admin
query confirms that no profile exists. FK RESTRICT prevents deleting referenced
identities. An uncertain result or failed cleanup retains the banned account for
operator review. If activation fails, the committed membership is retained and the
API reports `STAFF_PROVISIONING_INCOMPLETE`; do not blindly retry the email.
Use the Supabase Dashboard to inspect that account's Admin provisioning markers,
profile and exact-shop membership. Finish activation only for an authorized,
committed membership; otherwise leave banned/deactivate the membership. No public
recovery endpoint or global password reset is provided.

Deactivation is shop-scoped, soft, and takes effect through existing RLS even for
issued access tokens. It does not ban a global identity or revoke other-shop
memberships. Assigned jobs are not reassigned by B03. Logout revokes the current
refresh session and clears its cookies; already-issued JWTs can remain valid until
expiry, as documented by Supabase. Future workflow RPCs must recheck membership.

Auth uses Supabase's upstream rate limits. Staff creation additionally has a
bounded best-effort limit of 10 requests/minute per verified owner per process.
It returns 429 after that bound. Distributed rate limiting is not claimed.

## Configuration

Copy the root `.env.example` to `frontend/.env.local`, then set the project URL,
publishable key, site origin, and exactly one server-only secret/legacy admin key.
Do not copy CLI credentials. Public environment validation rejects service-role
and secret keys. Configure Cloud Auth Site URL and allowlist the exact
`<site-origin>/auth/callback`. Local `config.toml` does not configure Cloud Auth.
Email confirmation may be enabled or disabled in Cloud: signup returns
`requiresEmailConfirmation` and sync occurs after a verified session exists.
PKCE email links must open in the browser that initiated signup.

Frontend versions are pinned in its package and lockfile. Backend dependencies
and Supabase configuration are unchanged. The Node-only test install avoids
optional browser/coverage peers through `frontend/.npmrc`. No Docker is used.
The frontend engine range matches its tools (Node 22.13+ on the 22 LTS line,
Node 24, or 26+); verification uses the existing Node 24.15.0. TypeScript strict
remains enabled. Next.js's standard `skipLibCheck` setting avoids an upstream
Next.js 16.4 declaration mismatch (`URLPatternInput`/`URLPatternOptions`) with
TypeScript 5.9 DOM declarations; application source is still typechecked.

## Verification commands and current evidence

```powershell
Set-Location D:\BAYFLOW\frontend
npm ci --ignore-scripts
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:smoke

Set-Location D:\BAYFLOW\backend
npm run db:verify:postgres
npm run typecheck
$env:BAYFLOW_TEST_PROJECT_REF = 'tlqvlsrmxueuuzxyltej'
npm run db:test:cloud
npx --no-install supabase db push --dry-run
# Only after explicit approval:
npx --no-install supabase db push
npm run db:lint
npm run db:test:cloud:b03
```

Executed native verification: exit 0, **75 tests, 75 passed, 0 failed** (57 existing
regressions plus 18 B03 SQL tests). All four migrations applied to a fresh generated
loopback database; seed passed; second application reported `applied: []`.
Default verification preserved the Cloud-generated database types.
Backend typecheck and Cloud-suite JavaScript syntax check exited 0.

Cloud link file matched `tlqvlsrmxueuuzxyltej`. Initial `migration list` failed
with an unexpected pooler connection termination. Subsequent standalone
`db push --dry-run` exited 0 and listed only the B03 migration, with `seeds: []`
and `roles: []`. The user subsequently explicitly approved application. A fresh
dry-run again listed only B03; `db push --yes` exited 0 and applied
`20261009100642_b03_auth_and_team.sql`, with no seeds or role changes.
Cloud lint exited 0: `No schema errors found` in extensions/private/public.

B03 real Cloud verification exited 0: **12 tests, 12 passed, 0 failed**,
including successful cleanup (170982 ms). Verified repeated SSR identity reads,
expired-cookie refresh with forwarded cookies, public RPC grants/anonymous denial,
staff/outsider/foreign-owner denial, all four staff roles and real initial-password
login, duplicate-email credential preservation, immediate membership deactivation,
and logout cookie clearing plus zero remaining Auth sessions.

The first Cloud run passed all 12 assertions but failed its cleanup hook. Its
logout test had revoked the outsider session before shared cleanup attempted to
log out that session again. A standalone check found zero active fixture shops,
zero B02 sessions and zero B03 sessions. The test now verifies zero sessions after
logout and removes that revoked token from cleanup inputs. The complete rerun,
including cleanup, passed. No application or migration change was needed.

Frontend unit/API tests: **5 files, 43 tests passed**, exit 0. Frontend typecheck
and ESLint each exited 0. The initial strict declaration check reported the
upstream Next.js URLPattern declaration mismatch described above; the rerun with
Next's standard setting passed. The first package resolution stalled while
fetching optional test peers; the final install uses a pinned Vite dependency and
the Node-only peer policy. The first build found a truncated native SWC binary
left by an interrupted download; its required PE section size exceeded its actual
file size. The damaged package was moved aside inside ignored `node_modules`,
reinstalled, and verified to load successfully. The following production build
passed with native Turbopack, compiling the four B03 dynamic routes and proxy.

```text
npm run build: exit 0
Compiled successfully; TypeScript finished; static page generation completed.
npm run test:smoke: exit 0
GET /api/v1/me: 401
POST /api/v1/shops/<shop>/team: 401
PATCH /api/v1/shops/<shop>/team/<member>: 401
Cross-origin POST /api/v1/shops/<shop>/team: 403
GET /auth/callback (missing code): 400
B03 production HTTP smoke: 5/5 passed
```

All five responses had no-store headers and safe error envelopes. Smoke tests use
no real credentials and perform no Cloud writes. Post-build typecheck and lint
were rerun successfully. `git diff --check` passed. The scoped checkpoint excludes
the preexisting generated-types change.

Existing Cloud RLS regression rerun: **81 tests, 81 passed, 0 failed**, exit 0.
The first attempt failed in the before-hook's initial fixture lookup due to a
Cloud CLI query connection failure, before identities or fixture rows were
changed. A standalone `select true as connection_ok` returned true; the next
sequential run passed and reported fixture cleanup complete. This is a connection
limitation, not evidence that the B03 migration has been tested in Cloud.

After approved Cloud application, the existing RLS suite was run again:
**81 tests, 81 passed, 0 failed**, exit 0 (230315 ms). It verified the B03-aware
private function allowlist, tenant isolation, all 18 tables' direct-write denial,
and matching-shop foreign keys. Cleanup confirmed hidden test shops, deactivated
staff and signed-out Auth sessions; audit fixtures remain retained.

B03 is **PASSED**. Implementation checkpoint: `466e6cd`; the subsequent Cloud
verification checkpoint records approval, migration application, test-cleanup
correction and these results. No B04 work was started.

## Cloud fixtures and acceptance gate

`db:test:cloud:b03` requires a production frontend build and the applied B03
migration. Its preflight refuses to create Auth fixtures when the migration is
absent. It obtains keys in memory using the existing CLI login/link, starts a
loopback production Next.js server, and exercises real SSR cookies, refresh,
unauthenticated denial, all four staff roles, duplicate emails, cross-shop denial,
deactivation and logout. It reuses marked B02 identities/shops, plus unique
`b03-<uuid>@bayflow.example.test` staff accounts with random unsaved passwords.
Cleanup hides the B02 shops, deactivates non-owner fixture memberships, bans
new B03 accounts, and globally logs out known fixture sessions. Audit-safe records
are retained. This is test data, not B11 demo provisioning.

The reviewed migration is approved/applied, Cloud lint passed, and the real
session/staff suite passed. B04 remains outside this work order. Email delivery
and a real browser PKCE email-link round trip remain deployment integration
checks; the callback exchange/error/redirect behavior has focused automated tests.

Implementation references:
[Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs),
[Auth Admin creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[SQL function security](https://supabase.com/docs/guides/database/functions),
[Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
