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
| B06 | NOT_STARTED | N/A | N/A | N/A | Requires B05 |
| B07 | NOT_STARTED | N/A | N/A | N/A | Requires B06 |
| B08 | NOT_STARTED | N/A | N/A | N/A | Requires B07 |
| B09 | NOT_STARTED | N/A | N/A | N/A | Requires B08 |
| B10 | NOT_STARTED | N/A | N/A | N/A | Requires B09 |
| B11 | NOT_STARTED | N/A | N/A | N/A | Requires B10 |
| B12 | NOT_STARTED | N/A | N/A | N/A | Requires B11 + F13 |
| F00 | NOT_STARTED | N/A | N/A | N/A | Requires B00 |
| F01 | NOT_STARTED | N/A | N/A | N/A | Requires F00 + B04 |
| F02 | NOT_STARTED | N/A | N/A | N/A | Requires F01 + B04 |
| F03 | NOT_STARTED | N/A | N/A | N/A | Requires B05 + F02 |
| F04 | NOT_STARTED | N/A | N/A | N/A | Requires B05 + B06 + F03 |
| F05 | NOT_STARTED | N/A | N/A | N/A | Requires B03 + B06 + F00 |
| F06 | NOT_STARTED | N/A | N/A | N/A | Requires B04 + B03 + F05 |
| F07 | NOT_STARTED | N/A | N/A | N/A | Requires B06 + F05 |
| F08 | NOT_STARTED | N/A | N/A | N/A | Requires B07 + F07 |
| F09 | NOT_STARTED | N/A | N/A | N/A | Requires B07 + F04 + F07 |
| F10 | NOT_STARTED | N/A | N/A | N/A | Requires B08 + F05 |
| F11 | NOT_STARTED | N/A | N/A | N/A | Requires B09 + F08 + F09 |
| F12 | NOT_STARTED | N/A | N/A | N/A | Requires B10 + F11 |
| F13 | NOT_STARTED | N/A | N/A | N/A | Requires F12 + B11 |
| I01 | NOT_STARTED | N/A | N/A | N/A | Requires B06 + F08 |
| I02 | NOT_STARTED | N/A | N/A | N/A | Requires B10 + F11 |
| I03 | NOT_STARTED | N/A | N/A | N/A | Requires B10 + F12 |
| I04 | NOT_STARTED | N/A | N/A | N/A | Requires I01 + I02 + I03 + F13 |
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
