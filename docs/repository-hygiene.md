# Repository cleanup and secret audit

Audit date: 2026-10-10, Asia/Karachi. Feature work is paused; no new frontend phase
or backend workflow was implemented during this cleanup.

## Changes

- Moved the application env template from the repository root to
  `frontend/.env.example`; updated setup instructions. It contains empty key/URL
  placeholders and a localhost site origin, with optional admin keys clearly
  marked server-only.
- Removed six redundant `.gitkeep` files from the populated frontend tree and
  the unused frontend end-to-end-test placeholder. The public asset placeholder
  remains because that directory is intentionally empty until assets are added.
- Expanded `.gitignore` for deployment/cache state, private key formats, local
  credential files, env variants, temp/editor files, database copies and reports.
  SQL migrations and seed source remain included; blanket `*.sql` ignoring would
  lose the schema and was deliberately avoided.
- Replaced the stale B06 README with the current repository layout, setup,
  checks, migration/seed guidance and a pre-push audit command.
- Added dependency-free `backend/scripts/check-repository.mjs` and focused native
  tests. The script scans current candidates, the Git index independently, env
  templates, and optionally reachable history, without printing matched values.

Database definitions, migrations, database tests and tools belong to `backend/`.
Next.js API Route Handlers, SSR auth and their server-only services remain in
`frontend/` as part of the single Next.js app. Moving those into a separate server
would change the architecture, not just clean folders. Imported database type
overlays, lockfiles, tests, contracts and verification evidence were retained.

## Environment and credential findings

Three env files were found and inspected with values redacted from output:

| File | Result |
| --- | --- |
| `frontend/.env.example` | Empty placeholders; localhost origin; safe to commit |
| `frontend/.env.local` | Public Supabase URL/key and local site origin only; ignored, untouched |
| `backend/.env.b11-demo.local` | Demo project identifier and private demo password; ignored, untouched |

No actual admin/service key was present in the inspected local env files. Neither
actual local env file is tracked. The current demo password was not found in Git
candidate text, indexed blobs or reachable historical blobs. Recognizable
privileged Supabase/GitHub tokens, service-role JWTs, private-key headers and remote
credential URLs were also checked. Initial URL findings were verified to be
loopback-only disposable database test code, not live remote credentials.

All 15 SQL migrations were included in the candidate/history scan. They contain
schema/RLS/function source, not real database rows or deployed account secrets.
They should be versioned. `seed.sql` contains intentional disposable local test
identities/passwords, distinct from B11 Cloud demo credentials. Never apply that
seed to Cloud. Uploading migration source to Git does not execute it.

The three retained F01 PNGs were visually inspected: they show the public landing
page/demo catalog, with no credentials or private account screens. There were no
non-runtime source/evidence files larger than 1 MiB in the inventory.

## Checks

```powershell
node --test backend/tests/repository-hygiene.test.mjs
node backend/scripts/check-repository.mjs --history
```

Final audit of the cleaned tree/index/history: 244 candidate paths, 161 indexed
blobs, 3 env files, 734 reachable Git objects; zero findings.
The index remains unstaged; deleted tracked paths still
appear there until the user stages the cleanup.

Ignore checks passed for both local env files, Supabase link/cache state, Next
output, local PostgreSQL data, Vercel state, private key files and compressed SQL
copies. Inclusion checks passed for the env template, a migration, seed source and
the frontend lockfile. Six audit unit tests passed; backend TypeScript passed.
Frontend: 231/231 tests across 23 files passed; typecheck and lint exited 0.
`git diff --check` exited 0. No frontend server or browser was started, no package
was installed/upgraded, and the SQL harness was not rerun for this file-only
cleanup. An initial root-level npm typecheck was invalid because this repository
has package files only in frontend/backend; the corrected checks in both package
directories passed.

The existing generated `frontend/src/lib/supabase/database.types.ts` diff remains
unchanged, with diff hash `db6a4d34dcd3f24e0197f7d79abe521f97158c7b`.
It was not regenerated, staged or overwritten. Existing feature work was preserved.

## Limits and remaining local directories

Automatic approval review rejected empty-directory deletion commands. Empty root
`src/`, `public/`, `e2e/` and the now-empty frontend `e2e/` may remain on disk; they
contain no files and Git does not upload empty directories. No alternate deletion
method was used after that rejection. Build/dependency caches were kept locally
and excluded from Git, rather than destroying useful installed dependencies.

No commit, push, Cloud operation, credential rotation or Git history rewrite was
performed. The scanner checks known patterns and exact current local secrets;
it cannot guarantee absence of every unknown credential format, deleted remote
ref or encoded/binary secret. A final staged diff review remains appropriate.
