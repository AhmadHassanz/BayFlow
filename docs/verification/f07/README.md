# F07 verification — 2026-10-10 (Asia/Karachi)

Completed and verified F07 before editing F08. Base HEAD 97b2054; existing
unstaged F06 changes preserved. No commit/push, Cloud change, frontend server or
browser was performed. The user approved the narrow technician-choice GET scope
after inspection found that the full team roster was owner-only.

## Changes

Advisor inbox stage filters, shared staff confirm/assign/cancel controls, active
same-shop technician paging, native confirmation dialogs, pending locks,
same-intent replay, actionable conflicts, authoritative refetch and real history.
Choice reads use existing membership/profile RLS with an active OWNER/SA guard;
owner roster and staff mutations keep their original guards. No SQL migration,
allowedActions DTO, later workflow control or production fixture was introduced.

## Actual automated output

```text
npm test -- --maxWorkers=4
Test Files 28 passed (28)
Tests      277 passed (277)

npm run typecheck   frontend exit 0; backend exit 0
npm run lint        frontend exit 0
npm run build       frontend exit 0
Compiled successfully; Generated static pages (15/15)
git diff --check    exit 0
node backend/scripts/check-repository.mjs --history
candidateFiles 267; indexedBlobs 237; historyObjects 816; findings []
git check-ignore frontend/.env.local backend/.env.b11-demo.local
both paths printed, ignored
git diff --numstat -- frontend/src/lib/supabase/database.types.ts
empty output
```

Seventeen new tests verify active tenant/role guards before reads, safe projections,
bounded paging, owner roster preservation, invalid/duplicate scope rejection,
401/403 and failed-count behavior; inbox API filters; confirmation, duplicate-click
lock, real assignment ID, reason validation/dismissal; persistence through remount;
same-body uncertain replay; 401/403/404/409/422 guidance and GET reload; terminal,
other-role, prior-repair and foreign-shop action suppression. The initial focused
run found a test query matching several legitimate "Visit confirmed" elements;
the history assertion was made specific to the recorded note, and the full suite
passed. No timeout or assertion was weakened.

## Limits and next phase

DOM/API tests mock explicit test-only data and transport; no real Cloud workflow
or visual acceptance is claimed. Native SQL was not rerun for a read-only API
addition without SQL changes. The server remains authoritative for affordances.
Uncertain intents retain their payload/version/key while mounted; reload discards
the intent and reads the current version. Success is shown separately from the
subsequent GET, which can fail and offers retry. Generated database types and
private env files were not written/staged. Next: authorized F08.
