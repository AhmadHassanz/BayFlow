# F13 verification — 2026-10-10 (Asia/Karachi)

Plan: close F12 first, consolidate repeated controls, then run the blueprint's
375/768/1440 critical paths against real B11 demo records and a production build.
User explicitly approved headless QA and the F08 forward migration. Base HEAD
97b2054; existing changes preserved; no commit or push.

## Changes

Shared scoped AssignmentPicker replaces duplicated technician/parts selectors.
Saved itemized estimates use the common record ledger. Exact Playwright 1.64.0
development dependency adds its two runtime packages; no existing dependency
version changed. E2E is opt-in, headless, loopback only, with one worker and no
retries. Private credentials stay in the ignored B11 file; auth errors are
sanitized, and automatic trace/video/failure screenshots are disabled.

The QA server builds into ignored .next-f13 at localhost:3104 with the matching
site origin, preserving strict same-origin auth. Existing development server is
not reused or stopped. Generated QA output is excluded from lint and Git.

Actual B11 availability had one Sunday slot while Sunday was closed. The journey
uses the existing owner Hours form to save unchanged settings and refresh the
audited 14-day schedule; no direct SQL data writes, reset or reseed occurs.
The approved F08 migration was the only pending migration. Forward push applied
it with seeds/roles empty, next dry-run was up to date, and Cloud lint was clean.

Screenshot review found clipped absolute screen-reader table text contributing
to root overflow after real rows loaded. The scroll region now establishes its
own positioning context. Overflow QA waits for network/fonts and checks both
body and root widths, rather than measuring an early empty/loading state.

## Actual checks so far

```text
Desktop initial visual suite: 3 passed
Desktop full PART journey: 1 passed (1.8m)
Full viewport suite: 12 passed (7.3m)
Frontend unit rerun: 37 files passed, 364 tests passed (39.24s)
Backend typecheck: exit 0
Frontend typecheck/lint: exit 0
Isolated production build: compiled successfully, 15/15 static pages, exit 0
Repository audit: candidateFiles 319, indexedBlobs 237, historyObjects 965,
                  findings []
```

The unit run concurrent with a production build timed out in one existing wizard
test (363 passed); the unchanged full suite passed on rerun without that build
load. Assertions/timeouts were not weakened. One subsequent QA server build
failed to start; an explicit isolated build then passed. Final visual rerun after
the containment fix and stricter loaded-state checks passed 9/9 in 2.9m.
Corrected technician screenshot width is exactly 375 (previously 467).
Landing, wizard and every role were visually reviewed across all three widths.
Normal production build after restoring pre-QA tsconfig/next-env snapshots passed
(15/15 static pages); final frontend typecheck and lint exited 0. Protected
generated database types and private environment files are unchanged. Read-only
Cloud verification reports four COMPLETED QA bookings and no unfinished booking.
Final repository audit: candidateFiles 320, indexedBlobs 237, historyObjects 965,
findings []; diff check exit 0. Index has no staged changes. Credential files,
screenshots and .next-f13 output are ignored; QA port 3104 is no longer listening.

The journey covers actual booking, assignment, inspection, real PART catalog,
advisor price edits, customer rejection/revision/approval, scoped parts handoff,
ordering and two partial receipts, allocation, repair, QC fail/rework/pass, ready
notice and customer pickup persisted after reload. Foreign customer and foreign
shop deep links are denied. Visual tests cover landing, wizard, all six role
workspaces, keyboard signup validation and network failure/retry. No positive
response is mocked. Screenshots are ignored under frontend/test-results.

## Limits and next phase

QA bookings, purchase orders, notifications and inventory movements remain in
the demo project as real workflow history. No demo users were created or seeded.
This is Chromium QA, not every browser or exhaustive assistive-technology testing.
Existing five high development dependency advisories remain; no unrelated
upgrade was made. Latest-20 notification scope remains the B10 contract.
No deployment, email delivery, staff credential provisioning or destructive
Cloud operation is claimed. F00/B00 and I01–I04/B12/R00 remain separate scope.
