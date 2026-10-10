# I04 Full Judge Simulation Verification

## Status

I04 is **BLOCKED** at deployment preflight. No application, database, or deployment
change was made. The phase cannot pass from localhost because its contract requires
the complete judge script on a public deployment and explicitly forbids declaring
release readiness from a localhost-only demo.

## Plan

1. Confirm the I01, I02, I03, and F13 prerequisites.
2. Resolve the configured application origin and deployment access without exposing
   credentials.
3. On a clean private browser against the public deployment, create a new booking
   and execute the appendix journey through the customer, advisor, technician,
   parts, and QC roles, including estimate rejection/resend and QC fail/resubmit.
4. Record timings and screenshots, verify each role's scoped landing page and the
   customer's final completed state, fix only the highest-priority reproducible
   issue, and rerun affected assertions.
5. Update the README demo section and phase ledger only after the public run.

## Preflight Evidence

The progress ledger records I01, I02, I03, and F13 as PASSED, so the functional
prerequisites are present.

The deployment preflight was performed without printing any URL, key, token, or
password. It found:

- `frontend/.env.local` defines `NEXT_PUBLIC_SITE_URL`, but the parsed URI is HTTP
  loopback.
- Neither the repository root nor `frontend/` contains a `.vercel/project.json`
  project link.
- No `vercel` executable is available.
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are absent from the
  current process environment.
- Repository documentation consistently records that prior browser verification
  used an isolated loopback production server and that no Vercel deployment has
  occurred.

These facts leave no public target on which to execute the required I04 script.
Downloading a CLI or inventing a deployment target would not provide the missing
account authorization and is outside this phase.

## Commands and Outputs

```powershell
Get-Command vercel -ErrorAction SilentlyContinue
Test-Path .vercel/project.json
Test-Path frontend/.vercel/project.json
```

Output: no Vercel executable; both project-link checks returned `False`.

The environment preflight parsed only presence and origin properties, not secret
values. Output:

```text
SiteUrlConfigured: True
SiteUrlIsLoopback: True
SiteScheme: http
VercelTokenPresent: False
VercelOrgPresent: False
VercelProjectPresent: False
RootVercelLink: False
FrontendVercelLink: False
```

No judge-flow tests were run because a localhost run cannot meet the I04 exit gate.
No test result is claimed.

## Required Unblock

Provide or configure a public Vercel deployment of `frontend/` with the required
production environment variables and Supabase Auth redirect allowlist, then make
the public URL available as `NEXT_PUBLIC_SITE_URL`. Deployment credentials should
be configured privately in the environment or through an existing Vercel project
link; they must not be pasted into chat or committed.

Once available, resume I04 rather than starting B12 or R00.

## Risks and Limits

- The existing localhost and Supabase Cloud checks do not prove deployment routing,
  cookies, redirects, environment configuration, or clean-browser behavior on the
  public origin.
- No screenshots or 20-minute timing record exist for a public deployment.
- The README demo section remains unchanged because there is no verified live URL
  or completed public judge run to document.
- No Cloud reset, reseed, migration, deployment, commit, stage, or push occurred.

## Next Phase

I04 remains the active blocked phase. B12 is next only after I04 passes.
