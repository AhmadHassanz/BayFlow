# B12 API Hardening Deployment Verification

## Status

B12 is **PASSED**. Commit `14a8622` is deployed at
`https://bay-flow-delta.vercel.app`, and the hardened production smoke confirms
that the live site serves B12's request correlation and security headers.

## Plan

1. Audit validators, action grants, error boundaries, environment configuration,
   migration drift and deployment behavior.
2. Add safe request correlation and baseline response security headers.
3. Add a read-only, exact-host production smoke command.
4. Document installation, migration, demo, testing and operational recovery.
5. Run native, Cloud, frontend, build and repository-safety gates.
6. Deploy the reviewed source and rerun the hardened production smoke.

## Changes

- API failures now generate one UUID request ID, return it in
  `error.details.requestId` and `X-Request-Id`, and log only the ID, status and
  stable code. Raw exception objects, database messages, bodies and secrets are
  excluded.
- Added `nosniff`, frame denial, strict-origin referrer policy and disabled
  camera/microphone/geolocation permissions to all Next.js responses.
- Added `npm run test:smoke:production`, restricted to the exact approved HTTPS
  deployment. It performs read-only landing, directory, invalid-input and
  unauthenticated-route checks and verifies the B12 headers/correlation contract.
- Added focused API failure tests and updated three existing strict envelope tests
  for the additive request-ID detail.
- Clarified the production site-origin environment value and added the complete
  backend operations handoff.
- Added no dependency, migration, RLS/grant, API route, status or data-model change.

## Actual Verification

### Local and native

- Focused request hardening: **2/2 passed**.
- Full frontend suite: **366/366 passed** across 38 files.
- Native disposable PostgreSQL: **144/144 passed**. The CLI's “remote reset” label
  referred to the disposable loopback harness; Cloud was not reset.
- Frontend and backend typechecks: passed.
- Frontend lint: passed.
- Production build: passed; 15/15 static pages generated.

### Cloud database

- Migration list: all 16 local versions match all 16 remote versions through
  `20261010110000`.
- `supabase db push --linked --dry-run`: up to date; no migrations, seeds or roles.
- Linked schema lint at warning level: no findings.
- Cloud RLS/grant suite: the first invocation omitted its required explicit project
  guard and failed before connection. The corrected guarded invocation passed
  **81/81** and deactivated/hidden its fixtures afterward.

### Public deployment

Before the smoke script was strengthened, the existing deployment passed four
availability/envelope checks: HTTPS landing, public directory, safe invalid input
and unauthenticated private route.

After adding the B12 header and correlation assertions, the same production URL
first failed while Vercel still served pre-B12 commit `6daef42` because
`X-Content-Type-Options` was absent. After the user committed, pushed and
redeployed commit `14a8622`, the exact hardened smoke command passed **4/4**.

The live check now confirms:

- HTTPS landing content;
- public directory success envelope and no-store behavior;
- safe invalid-query response with matching UUID in `error.details.requestId` and
  `X-Request-Id`;
- safe unauthenticated private-route response;
- `nosniff`, frame denial, strict-origin referrer policy and disabled
  camera/microphone/geolocation permissions.

Final command:

```powershell
$env:BAYFLOW_PRODUCTION_URL='https://bay-flow-delta.vercel.app'
npm run test:smoke:production
```

Output: `{"origin":"https://bay-flow-delta.vercel.app","checks":4,"status":"passed"}`.

## Risks and Limitations

- The agent did not have direct access to the Vercel runtime-log interface. Live
  correlation behavior is verified, while an operator should still search a
  returned request ID in Vercel logs during release rehearsal.
- Existing development-tool advisories remain unchanged; no last-minute dependency
  upgrade was attempted.
- Cloud fixtures and the I04 QA records remain retained/deactivated as documented.
- No Cloud reset, reseed, migration application or generated-type rewrite occurred.
  The user committed, pushed and redeployed B12 as commit `14a8622`.

## Next Phase

R00 is the exact next phase. It was not started here.
