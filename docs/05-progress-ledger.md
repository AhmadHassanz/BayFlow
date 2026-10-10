# Progress Ledger

This ledger tracks phase status, verification, migration IDs, and open issues. Update it at the end of every phase.

## Ledger Schema

| Field | Recorded value |
| --- | --- |
| Phase | `S00`, `B00`-`B12`, `F00`-`F13`, `I01`-`I04`, `R00` |
| State | `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `PASSED` |
| Git SHA + timestamp | Checkpoint commit and decision record |
| Database migration IDs | Applied migration filenames and remote status |
| Actual verification | Commands, return codes, manual browser steps |
| Open issue | One-line reproduction, owner, severity, follow-up phase |

## Phase Map

| Wave | Order / milestone | Checkpoint |
| --- | --- | --- |
| Foundation | `S00 -> B00 -> F00 -> B01 -> B02 -> B03` | Cloud connected, auth + RLS tested, coherent design tokens |
| Discovery | `B04 -> F01 -> F02` | Directory, shop page, slots from database |
| Booking | `B05 -> F03 -> F04` | Customer registers/logs in, books, sees real booking |
| Work queue | `B06 -> F05 -> F06 -> F07 -> F08` | Owner creates shop/staff; advisor assigns; tech inspects |
| Estimates | `B07 -> F09` | Approval and rejection/revision work |
| Procurement | `B08 -> F10` | Order, partial receipt, allocation changes stock |
| Quality | `B09 -> F11` | QC fail -> mechanic repair -> QC pass -> pickup |
| Finish | `B10 -> F12 -> B11 -> F13 -> I01-I04 -> B12 -> R00` | Audit, notifications, tests, deploy, judge demo |

## Phase Status

| Phase | State | Git SHA + timestamp | Migration IDs | Verification | Open issue |
| --- | --- | --- | --- | --- | --- |
| S00 | PASSED | HEAD after S00 commit, 2026-10-09 Asia/Karachi | N/A | Created `AGENTS.md`, docs/00-05, README outline, repo skeleton; verified no app/package/API code exists | None |
| B00 | NOT_STARTED | N/A | N/A | N/A | Requires explicit user instruction |
| B01 | PASSED | 8fd5f93, 2026-10-09 Asia/Karachi | 20261009090000, 20261009090100, 20261009090200; local and Cloud applied | Official CLI reset + seed; 57 SQL/RLS tests pass; Cloud CLI types and lint; typecheck; no-op second migration application | B00 still absent; Docker declined by user |
| B02 | PASSED | HEAD at B02 checkpoint, 2026-10-09 Asia/Karachi | No new migration; three Cloud versions verified | 81 real Cloud Auth/REST tests; 57 native tests; Cloud lint and typecheck exit 0; see backend/docs/b02-security-verification.md | Dedicated Cloud fixture records retained; B00 remains absent; future workflows untested |
| B03 | PASSED | Implementation 466e6cd; HEAD at Cloud verification checkpoint, 2026-10-09 Asia/Karachi | 20261009100642 local and Cloud applied with explicit user approval; no seeds/roles | 75/75 native SQL; 43/43 auth/API; 12/12 real Cloud auth/team; 81/81 post-migration Cloud RLS; 5/5 production HTTP smoke; both typechecks, frontend lint/build and Cloud lint exit 0; see backend/docs/b03-auth-verification.md | Email-link browser round trip/deployment config remain integration checks; partial provisioning may require operator recovery; user types change preserved |
| B04 | PASSED | Implementation 2037518; HEAD at Cloud verification checkpoint, 2026-10-09 Asia/Karachi | 20261009121005 local verified and Cloud applied with explicit approval; no seeds/roles | 88/88 native verification; 69/69 frontend; 13/13 production HTTP smoke; 7/7 real Cloud catalog; 81/81 post-migration Cloud RLS; Cloud lint and fresh dry-run exit 0; earlier frontend lint, both typechecks and production build exit 0; see backend/docs/b04-catalog-verification.md | Horizon refresh on owner saves; referenced cancelled appointments retained; Vercel/browser integration separate; user types change preserved |
| B05 | PASSED | Implementation 70fdf4a; HEAD at Cloud verification checkpoint, 2026-10-09 Asia/Karachi; B04 dependency checkpoint 40f1fc0 | 20261009140203 native verified and Cloud applied by user after dry-run; no seeds/roles | 104/104 native; 110/110 frontend; 15/15 production HTTP smoke; lint/build and both typechecks exit 0; Cloud lint passed; B03 auth 12/12, B04 catalog 7/7, B05 booking 9/9, post-migration Cloud RLS 81/81; see backend/docs/b05-booking-verification.md | Receipt retention and per-process limiter documented; no UI/B06 transitions; user types change preserved |
| B06 | PASSED | Implementation 121a737; Cloud verification checkpoint, 2026-10-09 Asia/Karachi; B05 dependency checkpoint 29d2377 | 20261009151303 and 20261009153959 native verified and Cloud applied by user; no seeds/roles | 110/110 native; 122/122 frontend; 20/20 production HTTP smoke; frontend lint/build and both typechecks exit 0; Cloud lint passed; B03 auth 12/12, B04 catalog 7/7, B05 booking 9/9, B06 actions 5/5, post-migration Cloud RLS 81/81; see backend/docs/b06-actions-verification.md | No B07 estimate work or UI; retained owner memberships from prior Cloud acceptance shops documented; user types change preserved |
| B07 | PASSED | 3ffd7d4, 2026-10-09 Asia/Karachi; supplied continuation checkpoint | 20261009161442 and 20261009163309 local/Cloud applied | Prior B07 verification: native 113/113, action contract 13/13, both typechecks/build, Cloud lint; B07 1/1, B06 5/5, RLS 81/81; see backend/docs/b07-estimate-verification.md | User types change preserved |
| B08 | PASSED | HEAD at B08 checkpoint, 2026-10-09 Asia/Karachi; B07 dependency 3ffd7d4 | 20261009180000 and 20261009180100 local/Cloud applied by agent after project verification; local/remote match, final dry-run up to date, no seeds/roles | Native 124/124 incl stock/retry races and rollback, frontend 137/137, lint/build and both typechecks exit 0; Cloud lint clean; final B08 3/3, B07 1/1, B06 5/5, RLS 81/81; see backend/docs/b08-parts-verification.md | No B09/UI; only booking-linked parts-stage receiving; catalog edits preserve stock; user types change preserved |
| B09 | PASSED | HEAD at B09 checkpoint, 2026-10-10 Asia/Karachi | 20261009190000 and 20261009190100 local/Cloud applied by agent after project verification | Native verification passed, frontend 139/139, lint/build and both typechecks exit 0; Cloud B09/B08/B07/B06/RLS passed; see backend/docs/b09-repair-qc-verification.md | No B10/UI; QC queue has no frontend dashboard; user types change preserved |
| B10 | PASSED | HEAD at B10 checkpoint, 2026-10-10 Asia/Karachi | 20261010100000 local/Cloud applied by agent after project verification | Native 129/129, frontend 142/142, lint/build and both typechecks exit 0; Cloud lint clean; final B10 1/1, B09 1/1, B08 3/3, B07 1/1, B06 5/5, RLS 81/81; see backend/docs/b10-notifications-verification.md | No B10 UI; notification pagination is limit-only; user types change preserved |
| B11 | PASSED | HEAD at B11 checkpoint, 2026-10-10 Asia/Karachi | No new migration; Cloud demo data provisioned with `bayflow-demo-b11-v1` marker | Native 131/131, B11 static 2/2, backend typecheck exit 0; Cloud demo users 16/16 sign-in verified; Cloud lint clean; final dry-run up to date; post-demo RLS 81/81 and B10 1/1; see backend/docs/b11-demo-provisioning-verification.md | No workflow booking prefilled; demo password is local-only ignored file; user types change preserved |
| B12 | BLOCKED | Local implementation on deployment base 6daef42, 2026-10-10 Asia/Karachi | All 16 migrations match Cloud through 20261010110000; dry-run empty; no schema/RLS/grant change | Local 366/366 frontend, 144/144 native, Cloud RLS/grants 81/81, both typechecks/lint/build, Cloud lint clean; baseline live API 4/4; hardened live smoke intentionally fails because Vercel still serves pre-B12 build; see docs/verification/b12/README.md | Commit/push and Vercel redeploy required, then rerun hardened production smoke; R00 not started |
| F00 | NOT_STARTED | N/A | N/A | N/A | Requires B00 |
| F01 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; backend dependency 1128cbe | None; Cloud read-only | 150/150 tests, typecheck/lint/build exit 0; production browser verified Cloud shops/services, city filter 3 -> 2, empty/clear, 1440px/375px layouts and focus; see docs/verification/f01/README.md | Minimum F00-style public foundation included under user amendment; full F00/B00 remain open; temporary call CTA superseded by F02 profile navigation |
| F02 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi | None | 160/160 frontend tests at F02 gate; typecheck/lint/build exit 0; profile/availability DOM tests; final combined suite 195/195; see docs/verification/f02/README.md | Booking destinations completed in authorized F03; manual visual review deferred at user request |
| F03 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi | None | 195/195 frontend tests across 20 files; typecheck/lint/build exit 0; known-service and symptoms flows, inline auth, durable draft, lost-response replay after reload, double-submit/slot/storage/account guards; see docs/verification/f03/README.md | User waived browser/start-server checks; real Cloud booking/email round trip remains manual integration verification; F04 dashboard deferred |
| F04 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi | None | 208/208 tests across 21 files; typecheck/lint/build exit 0; see docs/verification/f04/README.md | Browser and Cloud email round trip deferred at user request; estimates read-only until F09 |
| F05 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi | User approved read-only detail; allowed-action controls deferred to F07 onward | 231/231 tests across 23 files; typecheck/lint/build/diff-check exit 0; see docs/verification/f05/README.md | Minimum shared shell foundation only; full F00 and F06 owner management remain deferred; no browser/Cloud mutation run |
| F06 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | User approved owner-only GET read contracts; no migration/RLS changes | 260/260 tests across 26 files with maxWorkers=4; frontend/backend typechecks, frontend lint/build and diff check exit 0; secret audit zero findings; see docs/verification/f06/README.md | Automated implementation gate; browser/Cloud CRUD not run; live staff creation requires a privately configured server-only admin key; no F07 actions |
| F07 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | Approved technician-choice read; no SQL/RLS changes | 277/277 tests across 28 files with maxWorkers=4; frontend/backend typechecks, frontend lint/build, diff check exit 0; audit zero findings; see docs/verification/f07/README.md | Browser/Cloud workflows not run; uncertain intent lock is mounted-memory only; F09/F11 controls deferred |
| F08 | PASSED | Local implementation checkpoint, 2026-10-10 Asia/Karachi; base 97b2054; after verified F07 | 20261010110000 native verified; Cloud pending | 302/302 frontend tests across 30 files with maxWorkers=4; 141/141 native tests; frontend/backend typechecks, frontend lint/build/diff check exit 0; secret audit zero findings; see docs/verification/f08/README.md | Catalog RPC must be forward-applied to Cloud before live PART selection; browser/Cloud acceptance not run; mounted drafts clear on tab reload; F09+ untouched |
| F09 | PASSED | Local implementation checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | No F09 migration; existing B07 actions; F08 Cloud catalog still pending | 325/325 frontend tests across 32 files with maxWorkers=4; 23/23 focused F09 and 12/12 isolated wizard; 141/141 native SQL; both typechecks, frontend lint/build/diff check exit 0; audit zero findings; see docs/verification/f09/README.md | Automated local gate only; no browser/Cloud workflow run; advisor retains recorded PART identities; mounted drafts clear on reload; F10+ untouched |
| F10 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054; before F11 edits | Approved parts-choice GET scope; no new migration/RLS change | 342/342 frontend tests across 34 files; 141/141 native SQL; both typechecks, lint/build/diff check exit 0; audit zero findings; see docs/verification/f10/README.md | No browser/Cloud tests; mounted forms only; F08 Cloud catalog still pending; QC claim-response amendment requested for F11 |
| F11 | PASSED | Local implementation checkpoint, 2026-10-10 Asia/Karachi; base 97b2054; after verified F10 | User authorized preserving hidden 404/stale-visible 409; no new migration/RLS change | 355/355 frontend tests across 36 files; both typechecks/lint/build/diff check exit 0; audit zero findings; unchanged B09 native tests passed in F10's 141-test run; see docs/verification/f11/README.md | Original automated gate; F13 now verifies live QC fail/rework/pass and pickup |
| F12 | PASSED | Local implementation checkpoint, 2026-10-10 Asia/Karachi; base 97b2054; after resolved F11 | Existing B10 reads/marker only; no schema/RLS changes | 364/364 tests across 37 files; both typechecks, lint/build/diff check exit 0; audit zero findings; see docs/verification/f12/README.md | Latest-20 notifications only; subsequent F13 headless QA approved; F08 Cloud migration applied |
| F13 | PASSED | 2026-10-10; base 97b2054; F12 + B11 verified | Approved F08 forward migration applied; no reset/seed | 12/12 live viewport E2E; final 9/9 stricter visual repeat; 364/364 unit tests; both typechecks/lint/production build exit 0; see docs/verification/f13/README.md | Chromium 375/768/1440; four completed QA records retained; existing dev advisories; integration/deployment remain separate |
| I01 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | No migration; existing Cloud schema unchanged | Typed URL/action inventory; focused 32/32 and 21/21; full 364/364 with maxWorkers=4; both typechecks/lint/build; live two-session booking/confirm/assign hard-reload gate 1/1; audit clean; see docs/verification/i01/README.md | Two disposable I01 QA records retained (one pending after selector-only failed run, one assigned after pass); unbounded Vitest worker timing documented; no deployment; I02 next |
| I02 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | No migration/RLS/grant change; Cloud schema remains through 20261010110000 | Cloud RLS 81/81; Cloud action/estimate/parts/QC 10/10; production-boundary security E2E 1/1; native PostgreSQL 141/141; frontend 364/364; both typechecks/lint/build; see docs/verification/i02/README.md | F08 schema allowlist test corrected; marked Cloud fixtures deactivated/hidden but retained for audit; no deployment; I03 next |
| I03 | PASSED | Working-tree checkpoint, 2026-10-10 Asia/Karachi; base 97b2054 | No migration/RLS/grant/state change; Cloud schema unchanged | Native PostgreSQL 144/144 including parallel approval/receipt/QC plus capacity/stock races; Cloud booking 9/9; live two-session stale-tab 201/409 recovery 1/1; frontend 364/364; both typechecks/lint/build; see docs/verification/i03/README.md | One retained I01 QA booking advanced PENDING -> CONFIRMED; marked Cloud fixtures deactivated/hidden; no deployment; I04 next |
| I04 | PASSED | Public deployment checkpoint 6daef42, 2026-10-10 Asia/Karachi | No migration/RLS/grant change; existing B11 Cloud data only | Vercel HTTP 200; public six-role full journey 1/1 in 3.1m; public mobile role/isolation gate 1/1 in 1.0m; 364/364 frontend tests; both typechecks/lint/build; screenshots visually inspected; see docs/verification/i04/README.md | One first-attempt QA booking retained at READY_FOR_PICKUP after the original 180s harness timeout; one completed I04 booking retained; deployment at bay-flow-delta.vercel.app; B12 next |
| R00 | NOT_STARTED | N/A | N/A | N/A | Final release readiness phase |

## Acceptance Matrix

| ID | Test procedure | Expected outcome |
| --- | --- | --- |
| A01 | Owner signs up, creates shop and second shop | One owner, two isolated teams/services/slots and shop switcher |
| A02 | Owner creates each role; staff logs in | No staff public signup; correct scoped dashboard |
| A03 | Customer books known service at valid slot | Booking `PENDING` and in SA inbox |
| A04 | Customer selects Not sure + details | Can book; tech sees symptoms and vehicle |
| A05 | Two users submit capacity-1 slot concurrently | Exactly one succeeds; loser sees 409 |
| A06 | SA confirms/assigns; unassigned mechanic tries inspection | Assigned tech succeeds; other mechanic denied |
| A07 | Technician enters 6500 + 900 + 5200 + 4000 lines | Estimate total 16600; SA can adjust labour |
| A08 | SA sends; different customer attempts approval | Only owning customer sees/approves estimate |
| A09 | Customer rejects; SA revises and re-sends | New revision and history; old version unchanged |
| A10 | Approved estimate; parts in stock | `PARTS_PENDING -> PARTS_READY`, stock decremented on allocate |
| A11 | Required part absent; PO then partial receive | `PARTS_ORDERED` holds until fully available; correct stock delta |
| A12 | Receive same PO line twice with repeated key | No duplicate stock increase |
| A13 | Two QC inspectors claim same job | Only first succeeds; second 409; one QC run |
| A14 | QC fails; technician fixes; QC passes | Issue visible; repair loop returns to ready |
| A15 | SA notifies customer; customer confirms collection | Ready notification; `COMPLETED`; history recorded |
| A16 | Shop A staff guesses Shop B URL/ID | 403/404; no data or side effect |
| A17 | Client spoofs completed status, actor, stale version | No illegal transition; 403/409/422 |
| A18 | Customer cancels valid pre-repair booking | `CANCELLED`; capacity restored; no leftover reservations |
| A19 | User attempts cancellation after `IN_REPAIR` | Rejected; no reversal of consumed parts |
| A20 | Every role loads deployment from mobile private tab | No dead end; no unhandled error; demo login clear |
| A21 | Review repo after deploy | README, `.env.example`, clean commits, no secret committed |
