# MT03 Owner Onboarding and Publication Verification

## Scope

MT03 replaces the temporary owner setup handoff with a resumable four-step flow:
workshop details and hours, services and guide prices, employee accounts, and a
readiness review followed by publication. It adds one publication-readiness
migration. It does not apply migrations to Cloud or remove existing fixtures.

## Changes

- New workshops created by the application default to unpublished.
- `/owner/onboarding` resumes the first owned workshop or an explicitly selected
  owned workshop and rejects foreign IDs and staff-only identities.
- The onboarding UI reuses the established guarded shop, service, and team APIs.
- Owners configure real weekly working windows, timezone, appointment duration,
  capacity, active services and optional whole-PKR guide prices.
- Owners create the four required employee account types through the existing
  server-admin provisioning boundary. Credentials retain the existing one-time
  display behavior.
- Launch readiness displays hours, service, Service Advisor, Technician, Parts
  Person and Quality Control requirements.
- Publishing sends only `{ active: true }`; PostgreSQL recomputes readiness from
  authoritative rows in the same write transaction.
- SQLSTATE `BF001` maps to safe HTTP 409 `SHOP_NOT_READY` guidance.

## Database verification

The disposable native PostgreSQL 17 harness applied the complete migration chain,
including `20261010130000_mt03_shop_publication_readiness.sql`, loaded disposable
seed fixtures and passed 145/145 tests. The MT03 test proves that publication is
rejected before services and roles exist, remains rejected with only a service,
and succeeds only after all required active same-shop memberships exist. Existing
booking, inventory, estimate, QC and concurrency suites passed. A second migration
application was a no-op.

No Cloud database was reset or changed.

## Frontend verification

- Focused owner/workspace/catalog tests: 38/38 passed.
- Full frontend suite: 373/373 passed across 40 files with `--maxWorkers=2`.
- Three pre-existing interaction files that timed out during an over-contended
  parallel lint/typecheck/test invocation passed 34/34 in an isolated rerun.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; 17/17 static pages generated and
  `/owner/onboarding` remains in the route inventory.
- `git diff --check`: exit 0.

## Remaining work

- The migration must be reviewed and explicitly approved before Cloud application.
- Live owner signup, service setup, four-role provisioning and publication require
  Cloud acceptance after migration application and a configured server-only admin
  key.
- MT04 remains responsible for deterministic multi-membership selection and the
  complete employee login-routing experience.
- MT05 remains responsible for marked production demo-fixture cleanup.
