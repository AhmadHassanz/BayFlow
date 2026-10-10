# R00 Final Release Readiness

## Status

R00 is **PASSED**. Commit `03539b5` is deployed at
`https://bay-flow-delta.vercel.app`. The final production smoke passed all five
checks, including the live Supabase-backed `/api/v1/health` route.

## Release scope

The blueprint does not define a literal R00 work order. The repository ledger
names R00 as final release readiness. This gate therefore uses only the existing
blueprint section 15 release checklist, its final DONE definition and the frozen
A01-A21 acceptance matrix. No optional feature is added.

## Changes

- Added public `GET /api/v1/health`. It returns healthy only after a bounded query
  to the public Supabase projection and exposes no project or credential details.
  Database failure returns a correlated safe 503.
- Extended the exact-host production smoke to require the live health endpoint;
  the expected count is now five checks.
- Added the endpoint to the API contract and two focused health tests.
- Completed the README with a six-minute judge script, security guarantees,
  network-flakiness guidance and known limitations.

## Acceptance evidence

| ID | Release evidence |
| --- | --- |
| A01 | B04 native tests verify first and second owner shops with isolated ownership; owner UI lists both demo shops. |
| A02 | B11 provisioned every staff role; I04 authenticated all six roles on the public deployment. |
| A03 | I01 and I04 created real PENDING bookings visible to the advisor. |
| A04 | F13/I04 symptom-only booking persisted concern and vehicle details through technician inspection. |
| A05 | B05/I03 parallel capacity tests permit exactly capacity and return conflicts to losers. |
| A06 | B06 and I02 verify assignment; unassigned technician reads/actions are denied. |
| A07 | B07 validates trusted itemized totals; advisor editing was exercised in F13/I04. |
| A08 | B07/I02 verify only the owning customer can view and approve a sent estimate. |
| A09 | F13/I04 reject, revise and resend while preserving the rejected revision. |
| A10 | B08 verifies in-stock readiness and exactly-once allocation/stock deduction. |
| A11 | F13/I04 create a shortage, order it and receive two partial deliveries before readiness. |
| A12 | B08/I03 repeated-key receipt races increase stock exactly once. |
| A13 | B09/I03 concurrent QC claim tests produce one claimant and one open run. |
| A14 | F13/I04 fail QC, show the issue, repair, resubmit and pass a later run. |
| A15 | F13/I04 notify ready and complete pickup with immutable history. |
| A16 | I02 and I04 deny foreign-shop and foreign-customer URLs without side effects. |
| A17 | I02 rejects forged status/actor/shop and stale or invalid workflow input without mutation. |
| A18 | B06 verifies valid pre-repair cancellation and capacity release. |
| A19 | B06/B08 reject cancellation after repair begins without reversing consumed stock. |
| A20 | I04 loads every seeded role at 375px on Vercel with no page errors or horizontal overflow. |
| A21 | Repository audit reports zero findings; env files remain ignored; README/env/deployment docs are present. Final evidence commit remains required. |

## Verified release gates

- Public Vercel journey: complete booking-to-COMPLETED flow in 3.1 minutes.
- Six-role mobile public gate: passed in 1.0 minute.
- B12 hardened production smoke: 4/4 passed before the health-route addition.
- R00 health tests: 2/2 passed.
- Frontend final local gate: 368/368 tests across 39 files; typecheck and lint
  passed; production build generated 16/16 pages including `/api/v1/health`.
- Native PostgreSQL: 144/144 passed.
- Cloud RLS/grants: 81/81 passed.
- All 16 migrations match Cloud; dry-run empty; Cloud lint clean.
- Repository audit: zero findings; local credential files ignored.

## Final deployment gate

The user committed, pushed and redeployed the release candidate as `03539b5`.
The final command was run from `frontend/`:

```powershell
$env:BAYFLOW_PRODUCTION_URL='https://bay-flow-delta.vercel.app'
npm run test:smoke:production
```

Final output:

```json
{"origin":"https://bay-flow-delta.vercel.app","checks":5,"status":"passed"}
```

The live route returned the healthy envelope. The smoke also reconfirmed the
landing page, directory, safe invalid-input correlation, unauthenticated denial
and B12 response-security headers. Local `main` and `origin/main` both resolved to
`03539b5` before this final evidence-only update. The repository audit inspected
335 candidates, 335 indexed blobs, three ignored local env files and 1062 reachable
history objects with zero findings.

## Risks and limitations

- Formal B00 and F00 ledger rows remain NOT_STARTED under the user's historical
  amendment. Their minimum runtime obligations were implemented incrementally and
  verified by later backend/frontend phases; R00 does not retroactively relabel
  those phases.
- Direct Vercel runtime-log inspection remains an operator step.
- Safari and Firefox are not automated.
- Existing development-tool advisories remain outside the release scope; no
  last-minute dependency upgrade was attempted.
- No Cloud reset, reseed, migration application or generated-type rewrite occurred.
- This final PASSED evidence update was made after deployment and remains local
  until the user commits it; the deployed application code itself is verified.

## Release decision

BayFlow is release-ready for the hackathon demo. The required deployed lifecycle,
authorization boundaries, transaction invariants, documentation, demo identities,
mobile role access and operational smoke checks have machine-verifiable evidence.
