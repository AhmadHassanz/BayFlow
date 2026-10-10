# F08 estimate catalog database verification

Date: 2026-10-10, Asia/Karachi. User approved the minimal catalog RPC and context
read contracts after the F07/F08 inspection. F07 passed its tests/typechecks/lint/
build before any F08 implementation. This is supporting database work for F08,
not a new backend server or later workflow phase.

## Migration and access

`20261010110000_f08_estimate_catalog.sql` is additive. Public invoker delegates to
private definer with empty search_path and qualified references. Exact assigned
technician plus active same-shop TECHNICIAN membership is mandatory. The booking
determines the shop; no caller-selected actor/tenant is accepted. Projection:
active part ID, SKU, name, deterministic 50-row pages and total. Zero-stock parts
remain visible. Base inventory RLS and all table/write privileges stay unchanged.
No Admin client/key is involved; no generated types file was changed.

## Actual verification

```text
npm run db:verify:postgres
PostgreSQL 17: applying migrations with Supabase CLI to disposable loopback database.
Applying migration 20261010110000_f08_estimate_catalog.sql...
tests 141
pass 141
fail 0
cancelled 0
skipped 0
Second migration application: applied []
PostgreSQL verification complete.   exit 0
```

The CLI labels explicit URLs "remote" in its reset output. The harness created a
fresh database under backend/.test-data and bound it to 127.0.0.1:55432. It never
connected to or reset Supabase Cloud. Disposable fixtures/cluster were cleaned by
the existing harness; no --generate-types flag was used.

Four new native tests cover zero-stock inclusion, inactive exclusion, exact safe
projection, unchanged direct inventory denial, wrong-role/unassigned/foreign/hidden
bookings, revoked technician membership, missing identity/anonymous grants,
tenant/actor spoof fields, UUID/page validation, deterministic paging and empty
last page, invoker/definer flags and empty search paths. Existing action, estimate,
repair/QC, tenant and concurrent stock/booking tests also passed.

## Approved Cloud application — F13

The user explicitly approved forward application to linked demo project
tlqvlsrmxueuuzxyltej and headless QA. The linked reference and read-only migration
list were checked first. `db push --linked --dry-run` reported only
20261010110000; `db push --linked` applied it, with seeds and roles empty.
The subsequent dry-run reported upToDate true and migrations []; linked schema
lint reported "No schema errors" with results []. No Cloud reset or reseed ran.
Live catalog/workflow acceptance is tracked in F13 evidence separately.
Rollout uses an additive RPC type overlay; protected generated types are unchanged.
