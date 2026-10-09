# B11 Cloud Demo Provisioning

## Scope and plan

Implement only B11: provision disposable Cloud demo identities and baseline demo
shop data after B10. Do not import `supabase/seed.sql` into Cloud, do not reset
Cloud, and do not print or commit the demo password. Use the linked Cloud project
`tlqvlsrmxueuuzxyltej` and Auth Admin tooling.

## Changes

- Added `backend/scripts/provision-cloud-demo.mjs` and package script
  `npm run db:demo:cloud`.
- The provisioning script:
  - requires `BAYFLOW_DEMO_PASSWORD` for real provisioning;
  - optionally checks `BAYFLOW_DEMO_PROJECT_REF` against the linked project;
  - refuses to reuse existing unmarked demo emails;
  - creates or updates 16 marked demo Auth identities;
  - verifies every demo identity can sign in;
  - upserts profiles, three shops, owner/staff memberships, three services,
    three future appointment slots, three inventory parts and two customer
    vehicles;
  - prints counts and account emails, but never prints the password.
- Added static B11 tests that reject hardcoded demo passwords, Cloud seed imports
  and missing sign-in verification safeguards.
- Generated a local ignored credential file at `backend/.env.b11-demo.local` so
  the demo password is available to the operator without appearing in Git or chat.

Demo account emails created on Cloud:

- `demo-owner.a@bayflow.example.test`, `demo-owner.b@bayflow.example.test`
- `demo-customer.a@bayflow.example.test`, `demo-customer.b@bayflow.example.test`
- `demo-advisor.a@bayflow.example.test`, `demo-technician.a@bayflow.example.test`, `demo-parts.a@bayflow.example.test`, `demo-qc.a@bayflow.example.test`
- `demo-advisor.b@bayflow.example.test`, `demo-technician.b@bayflow.example.test`, `demo-parts.b@bayflow.example.test`, `demo-qc.b@bayflow.example.test`
- `demo-advisor.c@bayflow.example.test`, `demo-technician.c@bayflow.example.test`, `demo-parts.c@bayflow.example.test`, `demo-qc.c@bayflow.example.test`

## Verification

Local verification:

- `node --check scripts/provision-cloud-demo.mjs`: exit 0.
- `node --test --test-concurrency=1 tests/demo-provisioning.test.mjs`: 2/2 passed.
- Backend `npm run typecheck`: exit 0.
- `npm run db:demo:cloud -- --dry-run`: exit 0; printed only project ref,
  marker, account emails and shop slugs.
- Final `npm run db:verify:postgres`: 131/131 passed; final no-op migration
  check returned `applied: []`.

Cloud verification on `tlqvlsrmxueuuzxyltej`:

- `npm run db:demo:cloud`: exit 0 after local ignored env was set; output:
  users 16, shops 3, memberships 15, services 3, future slots 3, inventory
  parts 3, vehicles 2, `loginVerified: 16`, password not printed.
- Reran `npm run db:demo:cloud` after writing `backend/.env.b11-demo.local`;
  output again confirmed users 16, shops 3, memberships 15, services 3, future
  slots 3, inventory parts 3, vehicles 2, `loginVerified: 16`, password not
  printed.
- `npm run db:lint`: no schema warnings.
- `npx --no-install supabase db push --linked --dry-run --include-all`: remote
  database up to date; no migrations, seeds or roles pending.
- `npx --no-install supabase migration list --linked`: local and remote match
  through `20261010100000`.
- Post-demo `npm run db:test:cloud`: 81/81 passed, duration 135231.9772 ms.
- Post-demo `npm run db:test:cloud:b10`: 1/1 passed, duration 61731.1035 ms.

## Risks and limits

- B11 provisions baseline demo identities/catalog data only. It does not prefill a
  workflow booking, estimate, order, QC run or notification.
- Demo credentials are local-only in an ignored env file. Do not commit or paste
  the password into chat.
- Future demo walkthrough phases still need frontend pages and/or end-to-end
  workflow setup before a judge can complete the full path from UI.
