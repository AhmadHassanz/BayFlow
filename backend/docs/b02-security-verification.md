# B02 Cloud Security Verification

Completed 2026-10-09 against Supabase Cloud project
`tlqvlsrmxueuuzxyltej` (PostgreSQL 17.11), using pinned Supabase CLI 2.120.0.
The blueprint's B02 scope is authorization verification, not workflow development.
B01 already supplied the required policies, grants and private read helpers;
this audit required no schema change or additional migration.

## Results

| Gate | Actual result |
| --- | --- |
| `npm run db:test:cloud` | 81 tests passed, zero failed; real Auth and PostgREST |
| `npm run db:verify:postgres` | 57 tests passed; reset, seed and no-op migration reapplication |
| `npm run db:lint` | Exit 0; no schema errors in extensions, private or public |
| `npm run typecheck` | Exit 0 |
| Cloud migration ledger | All three B01 versions applied; checked by Cloud suite |
| Independent post-run cleanup query | 3 retained shops, 16 accounts; 0 active shops, 0 active non-owner staff, 0 Auth sessions |

An initial Cloud run passed 79/80: a timestamp assertion compared `Z` with
`+00:00` text rather than equivalent instants. The assertion was corrected and
the suite expanded with live membership revocation; the subsequent 81/81 run
passed. An overlapping CLI lint attempt failed temporary-role authentication;
the standalone retry passed. Run Cloud CLI verification sequentially.

## Coverage And Read Boundaries

All 18 exposed application tables have RLS, one SELECT policy, and no ordinary
client write grants/policies. Tests audit those catalog facts and attempt real
INSERT, PATCH and DELETE against every table, checking denial and unchanged data.

| Tables | Verified authenticated boundary |
| --- | --- |
| `profiles`, `vehicles` | Own identity/vehicle or authorized staff job context; roster rules for OWNER/SA |
| `shops`, `services`, `appointment_slots` | Active same-shop membership for private base rows |
| `shop_memberships` | Own active membership or same-shop OWNER/SA roster |
| `bookings`, `booking_services` | Owning customer; same-shop OWNER/SA; assigned technician/parts; QC queue or own claim |
| `estimates`, `estimate_items` | Authorized booking; customer/PARTS/QC cannot read unsent drafts |
| `inventory_parts`, `purchase_orders`, `purchase_order_items` | Active same-shop OWNER/PARTS only |
| `part_allocations`, `qc_runs`, `qc_issues`, `booking_history` | Authorized booking context |
| `notifications` | Recipient plus authorized tenant/customer context |

Tests cover two isolated staff teams, an owner with two shops, customers with
bookings across shops, guessed foreign IDs, unassigned staff, inactive staff,
QC claim separation, and all booking child tables. Removing membership blocks
reads with the already-issued access token; restoring it restores assigned reads.
User-editable metadata cannot spoof membership or roles, even after token refresh.

Anonymous reads are restricted to the three audited published projections;
private base-table reads fail. Private schema access and helper RPC calls fail
through the Data API. All ten private functions have fixed empty search paths;
only the six intended predicates grant authenticated execution. Matching-shop
foreign keys are audited alongside the 57 native SQL regression tests.

Ordinary writes remain denied, including legitimate owners. Future narrowly
authorized workflow operations are not implemented or certified by this suite.
Service-role credentials are used only for fixture Auth administration, never
for ordinary-user authorization assertions.

## Rerun Without Docker

From the repository root in PowerShell, after CLI login and project linking:

```powershell
Set-Location backend
npm ci
$env:BAYFLOW_TEST_PROJECT_REF = 'tlqvlsrmxueuuzxyltej'
npm run db:test:cloud
npm run db:lint
npm run db:verify:postgres
npm run typecheck
```

The explicit project reference must match the CLI's ignored local link file.
Use a dedicated development/test project, not production: this suite intentionally
creates Auth accounts and database fixtures. It never resets Cloud, modifies
schema, disables RLS/triggers, or imports the local SQL seed into Cloud.
CLI project keys are captured in memory without printing or storing them.
Passwords are randomly generated per run; tokens remain in memory.

## Fixture Identities And Lifecycle

Sixteen accounts use `b02-<handle>@bayflow.example.test`:

```text
owner-a, owner-b, customer-a, customer-b, advisor-a, advisor-b,
technician-a, technician-b, unassigned-a, parts-a, parts-b,
qc-a, qc-b, qc-other-a, inactive-a, outsider
```

Existing accounts must carry the Admin-only `bayflow-b02-rls-v1` fixture marker
before their passwords can be rotated. They have no shared demo password.
Three deterministic shops use slugs `b02-isolation-shop-1` through `-3` and
UUIDs prefixed `b0200000`. Owner A owns shops 1 and 3; owner B owns shop 2.
Fixtures populate all 18 tables, including five bookings and sent/draft estimates,
solely to exercise authorization. These are not workflow executions or B11 demos.

On completion (including ordinary test failures), cleanup hides the three shops,
deactivates non-owner test memberships, and globally signs out fixture sessions.
Owner memberships remain active to preserve the enforced owner invariant.
Auth identities and audit records are retained; deleting immutable business
history or disabling its protection would defeat the security contract.
Global logout invalidates refresh sessions, not already-issued JWTs before expiry.
Only fixture accounts receive these tokens; staff membership deactivation is
independently verified. Reruns reuse the marked identities and deterministic data.
Cleanup errors fail the run and must be investigated before using that project.

## Files And Next Review

```text
backend/
  docs/b02-security-verification.md
  supabase/tests/
    cloud-rls.test.mjs
    support/cloud-client.mjs
    support/cloud-fixtures.mjs
```

No dependencies were added. `db:test:cloud` is the new package command.
Native verification now preserves the existing Cloud-generated database types;
explicit local regeneration remains available with
`node scripts/verify-postgres.mjs --generate-types`. Use `npm run db:types` for
the linked Cloud source of truth. No migration or Supabase configuration changed.

B02 is complete. B03 has not started. B00 application/auth infrastructure remains
unimplemented and needs explicit scheduling before dependent application work.
Review future RPC grants, actor checks and transaction boundaries independently;
this phase does not validate booking, stock, estimate or QC transitions.
