# MT04 Deterministic Employee Routing Verification

## Scope

MT04 completes employee login destination selection. It does not add or change
database schema, RLS, grants, authentication metadata, roles, or Cloud data.

## Changes

- Default sign-in uses verified active memberships from `/api/v1/me`.
- An owner membership routes to `/owner` regardless of membership row order.
- Exactly one staff membership routes directly to that shop and role workspace.
- Multiple staff memberships route to authenticated `/workspace`, where the user
  explicitly chooses a verified shop and role.
- No active membership routes to the personal customer ledger.
- The chooser fails closed if RLS-readable shop labels do not cover every active
  membership; it never fabricates a tenant label or route.
- Multi-membership staff can reopen the chooser from the staff shell. Every staff
  workspace retains access to the personal ledger.
- Session refresh middleware now covers `/workspace`.

## Verification

- Focused workspace/auth tests: 41/41 passed.
- Full frontend suite: 377/377 passed across 40 files with `--maxWorkers=2`.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; 18/18 static pages generated and `/workspace` appears
  in the production route inventory.
- `git diff --check`: exit 0.

No Cloud database was reset or changed.

## Remaining work

- Live employee credential creation and login depend on applying the pending MT03
  migration to Cloud with explicit approval and configuring the existing
  server-only admin key.
- MT05 remains responsible for exact-project, marker-based production fixture
  cleanup with a mandatory dry-run. It must not broadly delete or reset Cloud.
