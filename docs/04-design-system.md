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

### F06 owner control center (2026-10-10)

The owner index is a ruled workshop ledger with real per-shop counts, publication
state and direct manage/booking links. Creation pairs a labelled form with a petrol
setup note. Settings use Operations / Team / Services / Hours selectors; the
operations view has at most four numeric summary cells. Hours use labelled daily
windows, including closed days and split shifts. Service entries show publication,
nullable guide prices and edit controls; the roster includes inactive memberships.

Staff role/deactivation changes use a native modal dialog with a conservative
initial focus, cancel/Escape behavior and pending locks. One-time initial staff
credentials are masked, never persisted, and require explicit reveal/copy. Forms
use existing input bounds, per-field validation, text errors and success notices.
Mobile layouts stack fields/notes/counts, preserve 44px controls, and contain wide
roster overflow. Owner-only settings navigation is absent for other memberships.

No browser/server preview was started, per the user's instruction. DOM interaction,
API/service/authorization unit tests, strict typing, lint and production build are
used for this phase; live Cloud and visual approval remain separate checks.

### F07 advisor desk (2026-10-10)

The advisor inbox uses ruled All visits / New jobs / Estimate work / Pickup work
filters and a labelled stage selector. Shared records retain the real timestamped
timeline and add a teal-edged service desk section: confirm, same-shop technician
selection, and a recessed cancellation section requiring a reason. Native modal
confirmation, labelled 48px fields, pending locks, text conflict guidance and
responsive stacked action rows continue the Workshop Ledger design. There are
no dead controls for future phases and no fabricated counts. No browser was run.

### F08 technician workbench (2026-10-10)

Assigned job detail begins with a sticky petrol vehicle/customer summary, the
exact status and a clearly labelled reported concern. The estimate editor uses
numbered rows, labelled PART/LABOUR/quantity/whole-PKR fields, real catalog choices,
individual line previews and an explicit preview total. Saved server lines/totals
have a separate read-only ledger. The catalog is keyboard focusable and returns
focus to its trigger. Mobile stacks the catalog/description and keeps numeric
fields together with 48px targets. Brass QC feedback distinguishes open/resolved
issues with text; repair resubmission requires notes and confirmation. Warm paper,
thin rules and teal actions remain consistent. No browser visual approval is claimed.

### F09 estimate review and decisions (2026-10-10)

Advisor review places a read-only source ledger above labelled editable diagnosis
and item rows, with explicit whole-PKR previews and a teal send/revision action.
Customer records show exact itemized server amounts and revision/timestamp details;
older snapshots sit behind labelled disclosure controls. Approval and recessed
optional-reason decline use native confirmation with the revision and server
total. The copy distinguishes repair authorization from payment collection.
Draft-conflict guidance, conservative cancellation, disabled pending fields,
48px controls and contained table overflow support keyboard/mobile use. No browser
or visual acceptance is claimed; F10 procurement and F11 QC/pickup controls remain
outside this phase.

### F10 parts desk (2026-10-10)

Assigned jobs and Workshop inventory use separate ruled desk views. The stock
ledger shows real SKU/name, on-hand/reorder/unit-cost values and catalog state.
Preparation compares approved requirements, shelf stock, allocations, shortages
and undelivered orders with text plus restrained shortage shading. PO receipt rows
label delivered-now quantities alongside ordered/received/remaining values; narrow
screens stack inputs. Readiness/allocation copy distinguishes an availability check
from a reservation/deduction. Native confirmation, whole-quantity validation and
before/current server-stock snapshots continue the shared action system. The advisor
handoff lists active same-shop parts people, without credential exposure.

### F11 quality desk and handover (2026-10-10)

QC uses separate Unclaimed queue / My claimed inspections views, responsive ruled
job rows and explicit claim entry. The claimed view records operator-named checks
with an unrecorded default, typed issue fields in a brass warning surface, text
validation and separate Fail / Pass confirmations. Pass is unavailable while a
recorded check fails or lacks a result. History shows actual outcome, notes,
checklist results and issue resolution timestamps. After a decision the inspector
returns to the quality desk; lost-access views retain a clear queue link. The
handover panel offers advisor ready notice and customer/advisor collection
confirmation only in the authoritative ready state, with a recorded notice time
and terminal-action copy. No payment or F12 notification-polish surface is added.

### F12 notifications and accessibility (2026-10-10)

One outlined bell with a reserved count area opens a paper/brass native modal.
Updates retain actual title/message/type/read state and timestamp; explicit links
and read-marker buttons have 48px targets. Background polling retains successful
data to avoid routine skeleton shifts. Header controls wrap at narrow widths;
modal height is bounded and scrolls internally. Responsive tables use labelled
keyboard-focusable regions and visible horizontal-scroll guidance. Dialog keyboard
events bypass the mobile navigation trap; closing updates restores the trigger.
Customer skip navigation and error landmark/error-description fixes improve
keyboard and screen-reader use. Success messages are concise and stop claiming
a refresh is still in progress.

Computed contrast against warm paper: body 10.81:1, muted 5.48:1, teal 4.68:1,
danger 4.66:1. The light brass sidebar focus outline contrasts 7.11:1 against petrol.
No broad redesign, decorative reporting chart or fake unread count was added.

### F13 integration polish and viewport QA (2026-10-10)

Technician and parts assignment now share the same scoped picker while retaining
their approved role labels/contracts. Saved itemized estimates use one shared
ledger instead of duplicate technician presentation. Explicit headless Playwright
QA uses real B11 users, real API records and an isolated loopback production build
at 375, 768 and 1440 pixels. Results and screenshot review are recorded in
[F13 verification](verification/f13/README.md); no deployment is implied.
