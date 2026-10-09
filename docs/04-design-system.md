# Design System Contract

No UI code is implemented in S00. This document freezes the visual direction for F00 and later frontend phases.

## Direction

BayFlow uses an original "Workshop Ledger" design language: editorial structure, numbered sections, thin rules, confident typography, and workbench/service-desk cues. HackScout is visual inspiration only; do not copy its identity, content, colors, labels, assets, or layout verbatim.

## Tokens

| Token | Specification |
| --- | --- |
| Background / paper | `#F7F5EF` warm off-white; avoid pure beige everywhere |
| Primary ink | `#18353B` deep petrol for headings, nav, dark surfaces |
| Body ink | `#263B40` muted technical charcoal |
| Brand accent | `#157B73` calibrated teal for primary actions only |
| Secondary accent | `#C29B5B` restrained brass for numbering/highlights |
| Border | `#D8DFDB` thin rules and subtle separators |
| Danger / success | `#B34F49` / `#247755`; never color-only status |
| Typography | Fraunces for hero/editorial headers; Manrope for UI/body; tabular numbers for totals |
| Radius | 4-10px typical; no pill-everything; no glassmorphism |
| Spacing | 8px modular scale; 1120-1240px public max width; roomy public sections, compact data tables |

## Layout Rules

- Public pages: slim nav, numbered eyebrow label, elegant headline, one decisive CTA, real licensed garage/service imagery only, index-like shop cards with city and service chips.
- Booking: desktop stepper, compact mobile progress, summary rail, max 5 steps, required fields marked, clear date/slot availability.
- POS: fixed left sidebar desktop, collapsible mobile nav, owner shop switcher, role label, notification bell, table/list first, max 4 KPI tiles.
- Work item detail: customer, car, reported symptoms, exact status, legal actions for current actor, full activity log.
- Inventory: availability and shortage counts; receiving is explicit quantity form; PO creation does not increase stock.
- QC: queue left, claimed job detail center, pass/fail controls with recorded issue; fail requires title and description.
- Accessibility: 44px touch targets, visible focus rings, labels, semantic tables, error messages, status text, responsive overflow.

## Shared Components Required

- `AppShell`
- `PublicHeader`
- `PageHeading`
- `BookingStep`
- `StatusChip`
- `RoleBadge`
- `BookingTimeline`
- `Money`
- `DataTable`
- `EmptyState`
- `ConfirmDialog`
- `InlineError`
- `LoadingSkeleton`
- `NotificationBell`

## Anti-Slop Rules

- No diagonal purple/blue gradients.
- No emoji as navigation icons.
- No fake logos, fake metrics, fake ratings, fake testimonials, or lorem ipsum in demos.
- Use realistic seeded data: Lahore Auto Care, City Motors, Northside Garage; sensible service names, registration plates, and PKR estimates.
- Show loading, empty, network-error, stale-version, permission-denied, and save-success states on major views.
- Counts must come from database data.
- Avoid excessive rounded cards; prefer thin separators and numbered sections.
- No decorative charts that distract from resolving jobs.

## Route Inventory

| URL | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Brand landing, browse shops, search city |
| `/shops/[slug]` | Public | Shop details, services, book CTA |
| `/book/[shopId]` | Customer | Wizard with persisted draft and live slots |
| `/login`, `/signup` | Public | Shared auth with role-aware redirects |
| `/customer` | Customer | Bookings overview and status timeline |
| `/customer/bookings/[id]` | Customer | Estimate decision, history, pickup |
| `/owner` | Owner | Multi-shop overview and shop switcher |
| `/owner/shops/new` | Owner | Create shop setup |
| `/shops/[shopId]/settings` | Owner | Services, slots, hours, team |
| `/shops/[shopId]/advisor` | Advisor | All job inbox and actions |
| `/shops/[shopId]/technician` | Technician | Assigned jobs and work orders |
| `/shops/[shopId]/parts` | Parts | Inventory, orders, allocation |
| `/shops/[shopId]/qc` | QC | Shared queue and claim |
| `/shops/[shopId]/bookings/[id]` | Authorized staff | Job details, role-specific controls, log |
| `/forbidden`, `/not-found` | All | Helpful access/invalid route guidance |

## Frontend Guardrails

### F01 implementation boundary (2026-10-10)

F01 includes only its required F00-style foundation: self-hosted Fraunces/Manrope
via Next.js fonts, global CSS tokens, responsive public layout, PublicHeader,
buttons/labelled inputs, EmptyState, InlineError and LoadingSkeleton. F00 remains
NOT_STARTED as a full phase; private shells, status components, tables and the
other workflow primitives are deferred until their phases. No B00 completion is
implied. The public hero uses typography and a service-desk note rather than
unlicensed or fabricated workshop imagery. The directory is a ruled index with
one-column mobile entries; all public navigation resolves within `/` or invokes
the shop phone's device dialer until F02/F03 exist.

Desktop 1440px and mobile 375px screenshots and actual checks are recorded in
[F01 verification](verification/f01/README.md).

### F02/F03 implementation boundary (2026-10-10)

The directory now links to workshop profiles. Profiles use an editorial heading,
ruled service catalog, a brass-edged information rail, configured split-shift hours
and a clear available/full appointment grid. Prices are labelled as guide prices;
null prices and unavailable customer reviews have explicit neutral copy.

The booking page extends the same paper/petrol/teal/brass tokens with a five-step
desktop progress ledger, a compact mobile progress line, accessible service choices,
appointment controls, labelled vehicle/account fields, editable review sections
and a petrol summary rail. The rail becomes a normal stacked section on small
screens. Field errors have text and focus moves to the invalid vehicle field;
step changes focus the step heading. The confirmation shows the actual booking
reference/status rather than an optimistic success animation.

The user explicitly requested building/testing without starting the website or
opening a browser. F02/F03 use automated DOM interactions, strict TypeScript,
lint and production builds. No new screenshot or real-browser visual approval is
claimed. See [F02 verification](verification/f02/README.md) and
[F03 verification](verification/f03/README.md).

- Frontend may use documented typed stubs before a matching backend phase only when explicitly allowed.
- Replace stubs with real API fetches at integration gates.
- UI that only changes local status labels is a failed phase.
- Hide unauthorized navigation for usability, but always handle 403/404 from backend.

### F04/F05 implementation boundary (2026-10-10)

Customer pages use a ruled visit ledger, current/history selectors, restrained
status chips, a petrol next-step panel and chronological event rail. Signup and
login use an editorial petrol story panel beside labelled paper forms. Read-only
estimate summaries and unread updates use actual API DTOs.

The operations shell uses a petrol desktop sidebar, verified shop/role selector,
shop header, breadcrumbs, dense ruled booking table and responsive navigation.
Mobile menu supports toggle, backdrop, Escape dismissal, focus return and bounded
Tab navigation. Wide tables scroll inside their own labelled region. Owner entry
is a workshop switcher only; unimplemented settings/workflow links are omitted.
Staff action controls are deferred by explicit user amendment because the current
API does not return allowed actions. No locally simulated booking transition exists.

The full F00 phase remains deferred; these are the minimum shared primitives
needed for the authorized phases. Automated DOM, security-guard, TypeScript, lint
and production-build gates ran. Browser visual checks and live Cloud/email round
trips were not run, following the user's no-preview instruction.
