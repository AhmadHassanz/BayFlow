# F04 verification — 2026-10-10

Implemented standalone login/signup, safe booking return paths, SSR verified
customer entry, current visits/history, detail/timeline, status/next-owner guidance,
and an independent unread notification summary. Reads use existing API DTOs; no
new database fields or endpoints. Estimate snapshots are read-only until F09.

Checkpoint before F05:

- `npm test`: 21 files passed; 208 tests passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; customer/login/signup routes dynamic.

New interaction tests cover customer filtering, history ordering, all status
guidance, empty/network/retry, 401 return paths, 403/404, foreign record suppression,
timeline ordering, real estimate DTO rendering, unread summary, login navigation
and signup confirmation. Existing auth tests verify Supabase identity/profile
sync and same-origin guards. No production server, browser, Cloud mutation or
email round trip was run; user requested code and build tests only.

The unrelated generated database.types.ts remains untouched and unstaged.
