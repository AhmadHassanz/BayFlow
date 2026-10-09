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
- Exact Node/Next/Supabase package versions will be selected and pinned in B00.

## Do Not Change Without Explicit Approval

- Role names: `CUSTOMER`, `OWNER`, `SA`, `TECHNICIAN`, `PARTS`, `QC`.
- Booking status names in [03-state-machine](03-state-machine.md).
- API envelope shape in [02-api-contract](02-api-contract.md).
- Whole-PKR integer money model.
- Tenant isolation model.
- Mandatory QC and estimate rejection loops.
