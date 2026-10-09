# F03 verification — 2026-10-10 (Asia/Karachi)

F03 began after the F02 automated gate passed. Scope is the booking wizard and
its necessary inline authentication/confirmation, not the F04 customer workspace.
The user explicitly requested code/build tests without running the website or
opening a preview.

## Changes

- `/book/[shopId]` validates the shop and renders five steps: concern, appointment,
  vehicle, account, review. React Hook Form manages fields; existing Zod contracts
  validate vehicle data and the submitted B05 payload.
- Real public service and availability APIs supply choices and guide prices.
  Profile hints carry selected service/date/slot IDs; later service pages are
  recovered when necessary. Full slots cannot be selected. Availability is
  rechecked before a new mutation; SQL remains the atomic authority.
- Versioned per-shop local drafts preserve fields/step across reload and auth.
  Only booking fields, pending request data and a returned receipt are persisted;
  account passwords/tokens/sessions are excluded. Storage failure blocks a new
  mutation before its retry key could be lost. The UI explains on-device storage.
- Existing auth Server Actions provide inline login/signup/logout. Signup gained
  an optional sanitized second argument for the email-confirmation return path;
  the existing strict signup payload/default behavior did not change.
- A pending intent records the verified actor, exact payload and UUID key before
  POST. Uncertain results lock the intent; reload/retry reuses it even when the
  slot appears full. Server-confirmed correction failures permit editing. Actor
  changes, session expiration and double clicks are handled explicitly.
- Successful POST navigates to the same booking route with `?booking=<id>`.
  Its confirmation is read from guarded GET booking detail, with sign-in and
  forbidden/not-found handling. The customer dashboard remains F04.
- Workshop Ledger styling includes desktop/mobile progress, service choices,
  date/slot grid, a petrol summary rail, field errors and a detailed review.

## Actual final outputs

Commands run from `D:\BAYFLOW\frontend`:

```text
npm run test
Test Files 20 passed (20)
Tests 195 passed (195)
exit 0

npm run typecheck
tsc --noEmit
exit 0

npm run lint
eslint .
exit 0

npm run build
Compiled successfully in 7.3s
Finished TypeScript in 10.4s
Generating static pages (10/10)
Routes include dynamic /book/[shopId] and /shops/[slug]
exit 0

git diff --check
exit 0
```

The final 195 tests include all existing backend/API contract tests and 45 tests
added after F01. New coverage includes:

- Full five-step known-service flow through a validated authoritative response.
- Symptom-only flow through inline login; no mutation before authentication.
- Concern/vehicle validation, focused invalid fields and full-slot controls.
- Draft reload/step recovery, corrupt/versioned/cross-shop draft rejection,
  normalized payloads, optional mileage zero and invalid numeric syntax.
- Signup confirmation pending state, duplicate-email guidance, invalid signup
  rejection and safe email callback return paths.
- Lost mutation response followed by unmount/reload and a byte-identical retry
  payload, while the slot now reports full; request actor/key remains unchanged.
- Double submission, fresh capacity failure, server slot conflict, storage failure,
  pending actor mismatch and signed-out review recovery without posting.
- Later-page service preselection and guarded confirmation 401/403/404 handling.
- API response validation, 200 replay/201 creation, safe errors and rejecting a
  response for the wrong shop/slot.

All test fixture data stays under `src/test/`; runtime components call the existing
services/APIs. No Cloud booking creation, email round trip or new browser render
was performed or claimed for this frontend phase. Prior B05 SQL/Cloud acceptance
remains backend evidence, not a substitute for a new live UI acceptance run.

## Remaining integration checks and risks

- Manually inspect desktop/mobile appearance and run a real Cloud known-service
  and symptom booking. Confirm the email link returns in the same browser with
  the intended Supabase redirect allowlist and `NEXT_PUBLIC_SITE_URL` origin.
- Browser storage is required to durably save the pending request before POST.
  An uncertain pending request stays locked until its original actor safely
  resolves it; deleting site storage manually can remove that retry protection.
- No F04 dashboard or standalone login/signup pages were added. F03 confirmation
  remains within the booking route and reads authoritative guarded booking data.
- `npm audit --json` reported five high-severity dev-tool dependency findings
  through the existing eslint-config-next/fast-glob/micromatch/braces chain. Those
  packages/versions already exist in HEAD's lockfile; no upgrade or forced audit
  fix was applied outside this phase. New dependencies are pinned.
- The unrelated generated `database.types.ts` diff remains unchanged (diff hash
  `db6a4d34dcd3f24e0197f7d79abe521f97158c7b`) and was not staged or overwritten.
- No migration, Cloud reset, RLS modification, admin-secret exposure or extra
  backend application was introduced.

Next authorized-by-ledger phase: F04, customer auth/tracking workspace. It is not
started by this work order.
