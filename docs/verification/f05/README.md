# F05 verification — 2026-10-10

F04 was implemented and verified first (208 tests; typecheck/lint/build passed).
F05 then added the Workshop Ledger operations shell, real membership switching,
owner switcher entry, role landing lists and a shared read-only booking record.

The user explicitly approved deferring action controls to F07 onward: the current
booking detail contract has no backend-returned allowed-actions field. F05 adds no
backend changes or invented fields. Full owner management/metrics remain F06;
advisor/technician/parts/QC mutation UIs remain their later frontend phases.

Final automated output:

```text
npm test
Test Files 23 passed (23)
Tests      231 passed (231)

npm run typecheck
tsc --noEmit                       exit 0

npm run lint
eslint .                           exit 0

npm run build
Compiled successfully
Finished TypeScript
Generated static pages (14/14)      exit 0

git diff --check                   exit 0
```

The production build lists dynamic `/owner`, customer/login/signup routes and
`/shops/[slug]/advisor|technician|parts|qc|bookings/[id]`; the public slug profile
remains present. Staff nested routes require the dynamic value to be a UUID.

An initial typecheck after adding the route-group layout found stale Next.js
generated dev/production route types. The production build regenerated the route
types; the subsequent standalone typecheck passed without source suppression.

Added tests cover verified identity, preserved deep-link sign-in redirects,
infrastructure errors, active memberships, foreign shop and role denial before
metadata lookup, advisor denial from owner entry, all five role home resolutions,
membership switching, permission-aware navigation, mobile Escape/focus/Tab,
actual API queue links/pagination, revoked membership, network/retry/empty, and
foreign-shop record suppression. New F04 tests also cover role-aware post-login
navigation and safe retry after failed authentication. Existing backend/API and
booking tests remain passing; no weaker RLS or mocked production data introduced.

No frontend server/browser was launched. Visual fidelity, real Cloud customer
isolation/session refresh and email confirmation round trips remain manual checks;
automated tests use explicit test-only fixtures and mocked transports.

The generated database.types.ts diff hash remains
`db6a4d34dcd3f24e0197f7d79abe521f97158c7b`, matching the pre-existing change.
Nothing was staged or committed; demo credential files were not read or printed.

Next ledger phase: F06 owner overview/shop setup/settings/team.
