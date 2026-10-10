# F12 verification — 2026-10-10 (Asia/Karachi)

F11 was closed first after the user explicitly delegated its claim-response
decision: preserve audited B09 hidden 404 and stale-visible 409, with safe queue
refresh for both. This amends docs/03 without SQL/RLS changes or needless test
repetition. F12 then implemented notifications and accessibility only, before F13.
Base HEAD 97b2054; prior unstaged work preserved; no commit/push.

## Changes

Real notification bell in customer/owner/staff shells; current-recipient validation
via existing /me and /notifications, unread count, all/unread latest-20 prefix,
all returned types, safe actual-membership booking links, 25-second visible-tab
polling, focus refresh and listener/abort cleanup. Native modal has labelled
controls, Escape close/focus restoration and pending read-marker locks. Mark-read
uses existing idempotent POST; count/read state comes only from a subsequent GET.
Unknown outcomes permit refresh/retry; foreign/account-change data is suppressed.
The customer unread summary shares the recipient-checked polling hook and refresh
event, showing at most three items. No endpoint, DTO, migration or grant changed.

Labelled focusable table-scroll regions, mobile hints/wrapping controls, bounded
dialogs, light-brass sidebar focus, reduced-motion skeleton rule, linked auth
error descriptions, customer skip navigation and non-nested error landmark.
Success acknowledgements no longer claim a refresh is still loading indefinitely.
Loading/read failures/401/403/empty/pending/success states retain real data semantics.

## Actual checks

```text
npm test -- --maxWorkers=4 src/test/notification-bell.test.tsx src/test/customer-workspace.test.tsx src/test/staff-workspace.test.tsx
Test Files 3 passed (3)
Tests      33 passed (33)
npm test -- --maxWorkers=4
Test Files 37 passed (37)
Tests      364 passed (364)
npm run typecheck       frontend and backend         exit 0
npm run lint            frontend                     exit 0, no warnings
npm run build           frontend                     exit 0
Compiled successfully; Generated static pages (15/15)
git diff --check                                      exit 0
node backend/scripts/check-repository.mjs --history
candidateFiles 311; indexedBlobs 237; historyObjects 929; findings []
git check-ignore frontend/.env.local backend/.env.b11-demo.local
both printed (ignored)
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
git diff --name-only --cached
empty output
```

The final build followed the skip-link/error-landmark edit. Functional polling,
modal/read marker/table changes were already covered by the full suite. Nine new
tests cover real unread data/destination/modal focus, duplicate read locks and
server count refresh, 25-second cadence/hidden-tab pause/focus/cleanup, unread
query and all minimum returned types, foreign recipient/count suppression,
deep-link session expiry/network retry, uncertain marker without local count
subtraction, marker identity checks/membership links and focusable table region.
The old unread-summary test now includes verified /me and the shared limit-20
contract rather than a separate limit-3 feed. No assertion/timeout was weakened.

Computed relative-luminance contrasts: body/paper 10.81, muted/paper 5.48,
teal/paper 4.68, danger/paper 4.66, sidebar focus/petrol 7.11. Normal text pairs
exceed 4.5:1; the focus indicator exceeds 3:1. This is a source-token check,
not a browser geometry/visual acceptance claim.

## Limits and next phase

No frontend server/browser, Cloud mutation or real Auth/email round trip ran.
Native B10 read-marker/recipient/RLS tests were passed in the unchanged prior
141-test native suite; no SQL change justified repeating them here. Polling
rechecks /me before each feed and caps to 20 rows; B10 has no older-page contract.
Background errors hide stale data, while a successful refresh retains the prior
snapshot until replacement. F08 catalog forward rollout remains pending on Cloud.
Protected types/credential files remain untouched and ignored.

F12 is PASSED at its automated local gate. Next is F13. The user was asked whether
F13 may use headless browser/server QA despite the earlier no-server/browser
instruction. The user subsequently approved that QA and the F08 forward migration;
F13 records the actual browser and Cloud outcomes separately.
