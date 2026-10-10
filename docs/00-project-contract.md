# BayFlow Project Contract

This file freezes the product and architecture decisions for BayFlow. It is derived from `BayFlow_24_Hour_Codex_Master_Blueprint.docx` and must be kept current after each phase.

## Success Definition

On a live Vercel URL, a judge can log into seeded demo roles and complete:

booking -> assignment -> inspection -> estimate -> customer approval -> parts ordering/receiving/allocation -> repair -> QC fail/fix/pass -> pickup -> COMPLETED.

Estimate rejection, cancellation, immutable history, shop isolation, seeded roles, and multi-tenant authorization must also work.

## Required Versus Chosen

| Classification | Meaning | Examples |
| --- | --- | --- |
| BRIEF / mandatory | Direct requirement from the hackathon brief | 3 seeded shops, per-shop teams, defined booking statuses, history, RLS tenant isolation |
| DESIGN DECISION | Chosen to remove ambiguity | Next.js Route Handlers, typed service modules, transactional SQL RPCs |
| EXPLICITLY OPTIONAL | Not core-scored | In-app calling, AI front desk, PDF invoices, payment integration, emails |

## Frozen Product Decisions

| Area | Decision / invariant |
| --- | --- |
| Tenancy | Tenant is `shop`. Customers are global. Owners may own multiple shops. Membership role is per shop. |
| Auth | Supabase email/password with SSR cookie session. Authenticated actions bind to `auth.uid()`, never client-submitted user IDs. |
| Backend | Next.js same-origin `/api/v1` route handlers validate contracts; SQL functions handle multi-write atomic actions. |
| Data | Supabase Cloud Postgres with SQL migrations, RLS, least-privilege grants, and generated types. |
| Booking | Customer selects service(s) and/or symptoms, vehicle/contact info, appointment slot. No diagnosis or image required. |
| Money | Whole integer PKR amounts only. No floats, currency conversion, or payment collection. |
| QC | Mandatory QC. Any one QC inspector atomically claims a queued job. Failure creates an issue and loops to original tech. |
| UI | Original "Workshop Ledger" system: warm paper, deep petrol ink, teal, brass, dense readable role dashboards. |

## Roles and Visibility

| Role | Allowed information | Major actions |
| --- | --- | --- |
| Customer | Their own bookings across shops | Book, approve/reject estimate, track timeline, mark pickup |
| Owner | All data in owned shops | Create shops/team, service catalog, settings, shop switcher, monitor |
| Service Advisor | All bookings in assigned shop | Confirm/cancel, assign technician/parts person, send estimate, notify ready, close |
| Technician | Only jobs assigned to themselves | Inspect, draft itemized estimate, repair, review QC issues, resubmit |
| Parts Person | Inventory and parts jobs for their shop | Order, receive partial/full, allocate available parts |
| QC Inspector | Shared unclaimed QC queue in their shop | Claim one job, complete checklist, pass or create issue |

## Customer Path

1. Public directory -> search/filter city -> select garage -> view services, hours, and next available appointment.
2. Booking wizard: services/problems, including "Not sure / describe symptoms"; time slot; name/email/password if needed; vehicle plate/make/model/year; optional color/mileage/notes; review and confirm.
3. Signed-out customers authenticate or sign up before atomic booking creation. Preserve draft and never duplicate an existing email account.
4. Customer dashboard shows booking timeline and pending actions.
5. Customer approves only after SA sends a finalized estimate.
6. After QC passes, SA notifies ready for pickup; customer or SA marks pickup complete.

## Garage Path

1. Owner creates Lahore Auto Care and staff accounts. Owner login is public; employees cannot self-register.
2. Service Advisor receives PENDING job, confirms it, and assigns a mechanic.
3. Mechanic physically inspects vehicle and records diagnosis, parts, and labour in the estimate.
4. Advisor checks or revises estimate and sends it to customer.
5. Customer approves or rejects in-app.
6. After approval, advisor assigns Parts Person.
7. Parts Person inspects stock, orders missing items, receives deliveries, and allocates stock.
8. Mechanic repairs.
9. QC Inspector claims queued job, checks work, fails with issue or passes.
10. SA signals ready for pickup.
11. Customer collects car and booking ends.

## Owner Onboarding Amendment

The production onboarding flow distinguishes account intent from authorization.
Public self-registration offers only `CUSTOMER` and `OWNER` paths. The selected
path controls navigation and onboarding copy, but never creates or proves a shop
role. `SA`, `TECHNICIAN`, `PARTS`, and `QC` users cannot self-register as staff;
their Auth identities and memberships are created by an authorized owner.

A shop remains the tenant and the owner's organization boundary. BayFlow does not
add a separate organization entity: one owner identity may own several shops, and
each shop keeps an independent team, catalog, schedule, slots, bookings,
inventory, estimates, and history.

After owner Auth signup or login, an identity with no active memberships and an
explicit owner-onboarding destination must resume `/owner/onboarding`, not fall
through to `/customer`. The owner onboarding journey collects and reviews:

1. Owner name and Auth credentials.
2. Shop name, city, address, phone, timezone, and publication choice.
3. Open days, ordered non-overlapping working windows, appointment duration, and
   simultaneous booking capacity.
4. One or more services with name, description, estimated duration, and optional
   whole-PKR base price.
5. Owner-created staff accounts for `SA`, `TECHNICIAN`, `PARTS`, and `QC`, with
   initial credentials displayed only to the owner in the creation session.

The flow is resumable because Auth signup and shop/catalog/team setup cannot be a
single transaction. Creating the first shop atomically establishes the verified
identity as its owner and adds the active `OWNER` membership. Subsequent steps use
the existing guarded shop, service, and team operations.

## Publication Readiness

New owner-onboarding shops start unpublished. A shop may be published to the
customer directory only when all of the following are true:

- required contact and location fields are valid;
- at least one day has a valid working window;
- appointment duration and capacity are valid;
- at least one active service exists;
- active same-shop memberships exist for `SA`, `TECHNICIAN`, `PARTS`, and `QC`;
- the owner still owns the shop and has an active `OWNER` membership.

Publication readiness must be enforced on the server and in PostgreSQL, not only
by hiding a client button. Until ready, the owner can resume setup and preview
settings, while anonymous directory, shop-detail, service, and slot reads treat
the shop as unpublished.

## Account Destination Rules

After authentication, navigation is derived from verified active memberships and
the sanitized requested destination:

1. A requested authorized route is preserved.
2. An owner with one or more owner memberships opens `/owner`.
3. A staff-only identity with one membership opens that membership's workspace.
4. An identity with multiple staff memberships receives an explicit shop/role
   choice; array order must not choose an arbitrary tenant.
5. A verified owner-onboarding request with no memberships opens
   `/owner/onboarding`.
6. An identity with no memberships and no owner-onboarding request opens the
   customer portal.

A user may be both a global customer and a shop member. Customer capability is
not removed when a membership exists; the interface must provide an explicit
way to switch contexts. Query-string account or role values are navigation hints
only and never authorization evidence.

## Production Fixture Policy

Hardcoded or database-seeded mock garages must not populate the production
customer directory. Native PostgreSQL fixtures, automated Cloud test fixtures,
and an explicitly disposable judge/demo environment remain allowed. Production
starts empty and gains public shops only through owner onboarding.

Existing marked Cloud demo records may be removed only by a separate, explicitly
approved cleanup phase. Cleanup must verify the exact project, default to dry-run,
target only records carrying the known fixture marker or deterministic fixture
identities, account for dependent history, and never reset the Cloud database.

## Boundary Decisions

- No mandatory customer photo uploader.
- No `CHECKED_IN` status; physical arrival is implied before technician inspection.
- No mandatory payment gateway, invoice PDFs, SMS, voice agent, or realtime websockets.
- In-app bell notifications satisfy core.
- No public shop reviews; rating is neutral placeholder unless actual review data exists.
- App must work without external email providers other than Supabase Auth flow.

## Architecture

Request path:

```text
Browser / Next.js pages
  -> same-origin /api/v1/* Route Handler (Zod parse + auth + role lookup)
  -> Supabase user-scoped server client (JWT + RLS)
  -> read query OR narrowly granted Postgres RPC
  -> transaction: actor/tenant/status/version checks, rows, history, notices
  <- typed JSON response, structured error, no raw SQL exposure
```

The browser must not submit authoritative shop role, user ID, tenant ownership, estimated total, or next status as trusted facts.

## Planned Repository Shape

```text
frontend/
  src/{app,components,lib,server,test}/
  public/
  e2e/
backend/
  supabase/{migrations,seed.sql,config.toml}/
  docs/
  scripts/
  tests/
docs/
```

The user amended the layout in the B01 work order. `backend/` holds database
tooling, not a separate HTTP server. Future Route Handlers still belong to the
single Next.js app. The same work order explicitly includes foundation RLS,
read authorization helpers, and local seed identities in B01. B00 remains
unimplemented; B01 database work does not imply a completed application scaffold.

## Environment Contract

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

If the Supabase project only exposes a legacy service-role key, use `SUPABASE_SERVICE_ROLE_KEY` strictly server-side and do not use both names without need.

No direct DB password, JWT secret, service role key, or admin secret may be exposed via `NEXT_PUBLIC_*`.

## Open Questions

- Supabase project URL and publishable key are not available in S00.
- Whether the final Supabase admin key name will be `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` depends on the project.
- B03's minimum runtime versions are pinned in `frontend/package.json` and its
  lockfile; verified Node is 24.15.0. Deployment and auth redirect configuration
  still require independent verification; no B00 deployment gate is claimed here.
- The exact UI representation of a multi-membership shop/role chooser is deferred
  to implementation, but deterministic user choice is required by this contract.
- Production demo cleanup remains a separate destructive operation and requires
  an exact inventory plus explicit approval before execution.

## Do Not Change Without Explicit Approval

- Role names: `CUSTOMER`, `OWNER`, `SA`, `TECHNICIAN`, `PARTS`, `QC`.
- Booking status names in [03-state-machine](03-state-machine.md).
- API envelope shape in [02-api-contract](02-api-contract.md).
- Whole-PKR integer money model.
- Tenant isolation model.
- Mandatory QC and estimate rejection loops.
