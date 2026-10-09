# B10 Notifications API and Read Markers

## Scope and plan

Implement only the B10 backend notification surface from the API contract. Use the
existing `notifications` table and RLS model, add narrow RPCs for listing a user's
own notifications and marking one own notification read, expose the contracted
Next.js route handlers, verify locally first, then migrate linked Cloud project
`tlqvlsrmxueuuzxyltej`. No Cloud reset.

## Changes

- `20261010100000_b10_notifications.sql` adds authenticated RPCs:
  - `list_notifications(input jsonb)` for own notifications with `unread` and
    `limit` filters.
  - `mark_notification_read(input jsonb)` backed by guarded private
    `mark_notification_read_impl`.
- Direct table writes remain denied; read markers go through the vetted RPC and
  recheck `auth.uid()` plus the existing notification read guard.
- Added `GET /api/v1/notifications` and
  `POST /api/v1/notifications/[id]/read` with same-origin protection for the
  mutation route.
- Added notification contracts, server service mapping, and a B10 Supabase type
  overlay without editing generated `database.types.ts`.
- Added native SQL tests, frontend route/contract tests, a Cloud B10 route test,
  and updated the Cloud RLS audited function/migration allowlist.

## Verification

Local verification:

- `npm run db:verify:postgres`: 129/129 passed; final no-op migration check
  returned `applied: []`.
- `npm test -- --run src/test/notifications.test.ts src/test/booking-actions.test.ts`:
  18/18 passed.
- Frontend full `npm test`: 142/142 passed.
- Backend `npm run typecheck`: exit 0.
- Frontend `npm run typecheck`, `npm run lint`, and `npm run build`: exit 0;
  build includes `/api/v1/notifications` and `/api/v1/notifications/[id]/read`.
- `node --check supabase/tests/cloud-notifications.test.mjs` and
  `node --check supabase/tests/cloud-rls.test.mjs`: exit 0.

Cloud verification on `tlqvlsrmxueuuzxyltej`:

- Pre-push migration list matched local/remote through B09 with only
  `20261010100000` pending.
- Dry-run showed only `20261010100000_b10_notifications.sql`; no seeds or roles.
- Cloud push applied only `20261010100000_b10_notifications.sql`; no seeds or roles.
- `npm run db:lint`: no schema warnings.
- `npm run db:test:cloud:b10`: 1/1 passed, duration 65956.0657 ms.
- `npm run db:test:cloud:b09`: 1/1 passed, duration 82560.8877 ms.
- `npm run db:test:cloud:b08`: 3/3 passed, duration 116207.4868 ms.
- `npm run db:test:cloud:b07`: 1/1 passed, duration 79989.8943 ms.
- `npm run db:test:cloud:b06`: 5/5 passed, duration 80637.7572 ms.
- `npm run db:test:cloud`: 81/81 passed, duration 139336.2845 ms.
- Final dry-run reported remote database up to date with no pending migrations,
  seeds or roles.
- Final migration list shows local and remote match through `20261010100000`.

## Risks and limits

- B10 adds API/backend notification access only; no notification bell UI is part
  of this phase.
- Notification pagination is first-page bounded by `limit` only. Cursor or
  infinite scrolling remains frontend/integration scope if needed later.
- Mark-read is idempotent for already-read notifications and does not create a
  booking history entry.
- Deployment hardening, demo seeding, and judge walkthrough data remain later
  finish phases.
