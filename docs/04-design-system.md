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

- Frontend may use documented typed stubs before a matching backend phase only when explicitly allowed.
- Replace stubs with real API fetches at integration gates.
- UI that only changes local status labels is a failed phase.
- Hide unauthorized navigation for usability, but always handle 403/404 from backend.
