# MT06 Multi-tenant Acceptance Gate

## Plan

Align the reviewed publication guard with Cloud, prove fixture-free public state,
and run the complete database and frontend regression gates for onboarding,
publication, role routing, tenant selection, isolation, and booking workflows.

## Cloud changes and checks

- The migration dry-run listed only
  `20261010130000_mt03_shop_publication_readiness.sql`, with no seeds or roles.
- That migration was applied without resetting Cloud.
- Local and remote history now match across all 17 migrations.
- Cloud schema lint completed without warnings.
- MT05's repeated inventory returned zero fixture rows.
- The deployed public shop API returned zero items and total zero, demonstrating
  an honest empty directory without a hardcoded fallback.

## Verification

- Disposable PostgreSQL 17 suite: 148/148 passed.
- Frontend suite: 377/377 passed across 40 files with `--maxWorkers=2`.
- Backend and frontend TypeScript: exit 0.
- Frontend lint: exit 0.
- Production build: exit 0; 18/18 static pages and all owner, customer, staff,
  and `/workspace` routes appear in the inventory.
- `git diff --check`: exit 0.

Automated coverage proves owner intent cannot grant roles, onboarding shops begin
private, incomplete shops cannot publish, required roles are enforced, staff login
routes by verified membership, multiple memberships require a choice, and staff
retain personal customer access.

## Remaining deployment risk

This phase did not deploy the working tree. A live owner signup/email confirmation,
employee provisioning, and login journey still requires deployment and the
server-only admin key in that environment. No secret is committed or exposed.
