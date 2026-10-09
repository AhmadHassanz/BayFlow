# B01 Verification Evidence

For B04's owner/catalog migration and availability checks, see
[B04 verification](b04-catalog-verification.md).
For B03's current auth/team migration, application checks and approval-gated
Cloud session tests, see [B03 verification](b03-auth-verification.md).

Historical B01 evidence follows. The user subsequently applied the migrations
to Cloud and regenerated types. B02 now passes real Auth/REST checks and Cloud
lint; see [current B02 evidence](b02-security-verification.md). Native verification
now preserves Cloud types unless `--generate-types` is explicitly requested.

Verified on 2026-10-09 using Windows, Node.js 24.15.0, Supabase CLI 2.120.0,
and disposable native PostgreSQL 17.10. Docker is neither installed nor required
for this verification. No Cloud project was linked or modified.

## Executed

`npx --no-install supabase init`, from `backend/`, exit 0:

```text
Finished supabase init.
```

`npm run db:reset`, from `backend/`, exit 0. Internally the script creates its own
fresh loopback database and executes the official CLI:

```text
supabase db reset --db-url <generated-127.0.0.1-url> --yes
Applying migration 20261009090000_identity_and_catalog.sql...
Applying migration 20261009090100_workflow_relations.sql...
Applying migration 20261009090200_tenant_read_policies.sql...
Seeding data from supabase/seed.sql...
tests 57
pass 57
fail 0
supabase gen types --lang typescript --schema public --db-url <same-loopback-url>
Generated frontend/src/lib/supabase/database.types.ts using Supabase CLI.
supabase migration up --db-url <same-loopback-url>
{"applied":[],"message":"Migrations applied"}
```

The CLI labels explicit `--db-url` targets as remote even for 127.0.0.1. The script
does not read a Cloud URL and cannot reset the linked project. Credentials are
random per cluster and never printed in this evidence file.

The cluster uses minimal Auth table/role fixtures to execute relational SQL and
RLS with the same session-subject predicate. These are not a running Supabase Auth
service and do not prove sign-in or REST behavior. All application DDL is applied
from the actual versioned Supabase migrations; the seed is loaded by the CLI.

Coverage includes every table's RLS/privilege metadata, all role/status values,
public projections, 16 seeded identities, staff/customer/multi-shop owner reads,
every booking child table's tenant scope, missing JWT subject, inactive membership,
QC claim visibility, private inventory/purchasing, blocked direct writes,
cross-shop/customer FKs, checks/uniqueness, generated totals, deferred subtotal,
receipt bounds, open allocation/QC uniqueness, immutable history, owner membership,
repeatable seed, and identity-collision rejection. Fixtures roll back after each
test; no workflow RPC is implemented or claimed as tested.

`npm run typecheck`, from `backend/`, exit 0:

```text
> tsc --noEmit
```

`git diff --check`, exit 0. `npm install` audited the pinned dependency set and
reported zero vulnerabilities. The disposable PostgreSQL process shuts down at
the end of verification; no development server or database is left running.

## Not Run

- Cloud migration application, migration comparison and Cloud-generated types:
  no linked project or credentials; remote application requires SQL review.
- `npm run db:lint` against Cloud: no linked project. The native PostgreSQL bundle
  does not supply Supabase's `plpgsql_check` extension.
- Real Supabase Auth sign-in and PostgREST attacks: require a disposable Cloud
  project under the user's chosen Docker-free workflow.
- Next.js build, lint and browser tests: application infrastructure is not part
  of this work order and B00 remains unimplemented.

B01's fresh PostgreSQL migration/constraint/type gate passes. B02 remains
unstarted and should review Cloud grants/policies and test real Auth/REST before
any workflow development. No later phase is implemented.
