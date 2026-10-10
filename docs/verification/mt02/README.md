# MT02 Account Intent and Routing Verification

## Scope

MT02 implements only account-intent navigation and the owner onboarding entry.
It does not add a database migration, change RLS, alter Cloud data, remove demo
fixtures, or implement the full owner setup wizard reserved for MT03.

## Implemented behavior

- Public signup offers Customer and Workshop owner paths.
- Owner signup always carries the sanitized `/owner/onboarding` destination.
- Staff role values are login hints only; `OWNER` is not an employee role hint.
- Auth signup still sends only full-name display metadata and never sends role,
  account type, shop ID, owner ID, or membership authority to Supabase Auth.
- A membership-free authenticated identity may open `/owner/onboarding`.
- An existing owner is redirected from onboarding to `/owner`.
- An existing non-owner staff identity is denied the owner onboarding entry.
- The onboarding entry clearly hands off to existing first-shop creation; MT03
  will replace this handoff with the guided details, hours, services, team, and
  launch flow.

## Verification

- Focused Vitest auth/workspace suite: 40/40 passed.
- Full frontend Vitest suite: 372/372 passed across 40 files.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; 17/17 static pages generated and the route inventory
  includes dynamic `/owner/onboarding`.
- `git diff --check`: exit 0.
- No `frontend/package.json` or `frontend/package-lock.json` diff.
- Legacy public `type=garage`, owner role-selection signup, and
  `GarageRoleChoice` references were removed from application auth surfaces.

## Environment note

An initial verification command accidentally invoked pnpm against this npm
project and started rebuilding `node_modules`. It was stopped, pnpm/npm caches
were pruned to recover disk space, and dependencies were restored with `npm ci`
from the unchanged committed lockfile. No dependency version or manifest changed.
`npm ci` reported five existing high-severity audit findings; MT02 did not run an
unscoped dependency upgrade or `npm audit fix`.

## Remaining work

- MT03 must build the resumable owner setup flow and guarded publication-readiness
  behavior.
- A membership-free owner who later signs in through a generic `/login` URL has no
  durable role claim and therefore remains a customer unless they use the explicit
  owner onboarding path. This is intentional: URL intent may guide navigation but
  cannot establish authorization.
