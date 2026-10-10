# I04 Full Judge Simulation Verification

## Status

I04 is **PASSED** against the public Vercel deployment at
`https://bay-flow-delta.vercel.app`. The production journey completed in 3.1
minutes, inside the 20-minute exit gate. No localhost application server was used.

## Plan

1. Verify that the production URL responds and renders BayFlow.
2. Use fresh isolated browser contexts and the existing B11 disposable identities.
3. Create a new booking and execute the complete customer, owner, advisor,
   technician, parts and QC journey against Vercel and Supabase Cloud.
4. Include estimate rejection/revision, partial receipt, QC failure/rework/pass,
   ready notification and final pickup.
5. Verify every seeded role at a 375px viewport, tenant denial behavior, hard
   refresh persistence and visually inspect the captured screenshots.
6. Run the relevant automated regression and repository-safety gates.

## Changes

- Extended the existing Playwright helper with an explicit I04-only allowlist for
  `bay-flow-delta.vercel.app`. Localhost remains the default and any other remote
  host is rejected.
- Added a 20-minute timeout only when `BAYFLOW_I04_PUBLIC=1`; the ordinary local
  journey retains its three-minute budget.
- Updated the README with the verified live URL and non-secret demo identity list.
- No application feature, database migration, RLS policy, grant, status, API or
  production environment setting changed during this phase.

## Public Verification

### Availability

An independent HTTPS request returned status 200 and BayFlow content from the
production origin.

### Full judge journey

```powershell
$env:BAYFLOW_E2E_BASE_URL='https://bay-flow-delta.vercel.app'
$env:BAYFLOW_I04_PUBLIC='1'
$env:BAYFLOW_E2E_DEMO_WRITES='1'
$env:BAYFLOW_E2E_PARTS='1'
npm run test:e2e -- journey.spec.ts --project=desktop-1440
```

Final output: **1 passed in 3.1 minutes**.

The successful run used clean, independent browser contexts and verified:

- owner settings access and availability refresh;
- customer booking from the public flow and persistence on reload;
- advisor confirmation and technician assignment;
- technician inspection and a real itemized PART plus LABOUR estimate;
- advisor labour adjustment and estimate send;
- foreign customer deep-link denial;
- customer rejection, immutable prior revision, advisor revision and resend;
- customer approval and parts-person assignment;
- purchase order plus two partial receipts and stock allocation;
- technician repair completion;
- QC claim, failed checklist and recorded issue;
- technician rework and resubmission;
- second QC claim and pass;
- advisor ready notification;
- customer pickup and final `COMPLETED` state after reload.

The first attempt used the prior 180-second local harness budget. It reached QC
pass and then timed out while opening the advisor record. The application had not
failed; the public journey simply exceeded the local budget. Its disposable QA
booking remains at `READY_FOR_PICKUP`. The I04-only 20-minute budget was then added
and the complete fresh journey passed.

### Six-role mobile and isolation gate

```powershell
$env:BAYFLOW_E2E_BASE_URL='https://bay-flow-delta.vercel.app'
$env:BAYFLOW_I04_PUBLIC='1'
npm run test:e2e -- visual.spec.ts --project=mobile-375 --grep 'every seeded role'
```

Output: **1 passed in 1.0 minute**. Customer, owner, advisor, technician, parts and
QC identities each authenticated into a real responsive workspace. The advisor's
foreign-shop deep link remained unavailable. Page errors, unexpected console
errors and page-wide horizontal overflow were absent.

Screenshots for the six mobile workspaces plus the initial and completed customer
records were generated under the ignored `frontend/test-results/` directory and
visually inspected. The completed record showed revision 1 rejected, revision 2
approved, the failed and passed QC runs, ready notification and final completion.
No clipping, overlap, broken layout or credential exposure was observed.

## Regression and Safety Outputs

- `npm test -- --maxWorkers=4`: **364/364 passed** across 37 files.
- Frontend `npm run typecheck`: passed.
- Frontend `npm run lint`: passed.
- Frontend `npm run build`: passed; 15/15 static pages generated.
- Backend `npm run typecheck`: passed.
- `node backend/scripts/check-repository.mjs --history`: 328 candidate files,
  328 indexed blobs, three local env files, 1008 history objects, **zero findings**.
- Final `git diff --check`: passed with only Windows LF-to-CRLF notices.
- Generated `frontend/src/lib/supabase/database.types.ts`: no phase diff.
- Staged diff: empty.
- Both private env files remained ignored.

## Risks and Limitations

- The public test writes real disposable QA history to the B11 Supabase project.
  One first-attempt record remains ready for collection and one successful I04
  record remains completed. They were not deleted or rewritten.
- The six-role mobile check used Chromium. Safari and Firefox remain manual smoke
  options, not part of the I04 exit gate.
- Existing development-tool dependency advisories are unchanged and remain outside
  I04 scope.
- No Cloud reset, reseed, migration, RLS/grant change, generated-type rewrite,
  deployment mutation, commit or push was performed by I04 verification.

## Next Phase

B12 is the exact next phase. It was not started here.
