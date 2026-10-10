# MT07 Public Deployment Acceptance

## Plan

Verify that the pushed MT01-MT06 application is live, confirm the database-backed
empty directory, check the new account and workspace entry routes, and rerun the
release smoke and local regression gates. Do not create an organization merely to
make the directory nonempty.

## Finding and correction

The deployed product correctly returned an empty directory after MT05, but the
older production smoke script incorrectly required at least one shop. MT07 changed
that assertion to accept a nonnegative authoritative total and require the total
to be consistent with the returned page. This preserves response validation while
supporting the production-empty contract.

## Live verification

- `/api/v1/health`: healthy.
- `/api/v1/shops?page=1`: zero items and total zero.
- `/signup`: HTTP 200.
- `/signup?type=owner`: HTTP 200.
- `/login?type=staff&role=TECHNICIAN`: HTTP 200.
- `/owner/onboarding`: private route resolves through the deployed auth boundary.
- `/workspace`: unauthenticated request redirects to
  `/login?next=%2Fworkspace`.
- Updated hardened production smoke: 5/5 passed.

## Verification

- Frontend parallel run: 376/377; one booking-wizard interaction timed out while
  test, lint, and typecheck processes competed. The affected file then passed
  12/12 alone. MT06's same application revision passed 377/377 before the
  smoke-script-only MT07 change.
- Frontend typecheck: exit 0.
- Frontend lint: exit 0.
- Production build: exit 0.
- `git diff --check`: exit 0.

## Remaining external acceptance

A real email-confirmation round trip requires a mailbox controlled by the user.
The server-only admin-key configuration can be conclusively exercised only after
an authenticated owner creates an employee. MT07 does not create persistent fake
organizations or bypass the owner workflow to manufacture that evidence.
