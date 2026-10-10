# API Contract

This document freezes the implemented `/api/v1` contract. The S00 baseline had no
routes; the phase-specific sections below record the routes added since then.

## Uniform HTTP Behavior

Success:

```json
{ "data": {}, "error": null }
```

Failure:

```json
{ "data": null, "error": { "code": "CODE", "message": "Message", "details": {} } }
```

Status codes:

| Code | Meaning |
| --- | --- |
| 200/201 | Success |
| 400 | Invalid input |
| 401 | No session |
| 403 | Forbidden |
| 404 | Resource hidden or not found |
| 409 | Stale version, slot conflict, claim conflict |
| 422 | Domain rule failure |
| 500 | Unexpected failure |

Rules:

- Every route uses `/api/v1`.
- JSON is camelCase at the API boundary.
- DB snake_case is mapped only in repository/service layers.
- Zod parses every mutation and list query string.
- Pagination defaults cap at 50.
- Mutations return authoritative server state.
- Rate-limit auth-adjacent, booking, and staff-creation endpoints as feasible.
- Log safe request IDs only; never passwords or raw secrets.

## B12 Production Error and Deployment Boundary

Every failed `/api/v1` response includes one opaque UUID correlation value in
`error.details.requestId` and the identical `X-Request-Id` response header. Vercel
logs record only that ID plus the numeric status and stable error code; raw thrown
objects, database messages, request bodies, passwords, tokens and stack traces are
not logged or returned. Known domain errors retain their reviewed messages.
Unexpected failures remain the generic `500 INTERNAL_ERROR` response.

All application responses set `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
Permissions Policy disabling camera, microphone and geolocation. B12 adds no CORS
allowlist: mutations continue to require the exact same-origin `Origin` header.
Client resource requests keep their 15-second abort behavior; the complete public
judge workflow is allowed a separate 20-minute end-to-end test budget.

The production smoke command requires an exact approved HTTPS hostname and checks
the landing page, public directory envelope, safe invalid-query response,
unauthenticated private route, security headers and request correlation. It never
accepts credentials and performs no database writes.

## Endpoint Inventory

| Method + route | Inputs / output | Authorization |
| --- | --- | --- |
| `GET /api/v1/health` | `{ status: "ok" }` after a bounded public database query | Public |
| `GET /api/v1/shops` | `?city=&q=&page=`; public-safe shops | Public |
| `GET /api/v1/shops/by-slug/[slug]` | Public shop by slug; services/hours | Public |
| `GET /api/v1/shops/[shopId]` | Public shop/services/hours | Public |
| `GET /api/v1/shops/[shopId]/slots` | `?date=YYYY-MM-DD`; `startsAt`, `capacityRemaining` | Public |
| `POST /api/v1/owner/shops` | name, city, address, phone, hours, capacity | Authenticated owner |
| `GET /api/v1/owner/shops` | `?page=`; owned shops with authoritative booking counts | Authenticated owner identity |
| `GET /api/v1/owner/shops/[id]` | Owned shop with authoritative booking counts | Owner of shop |
| `PATCH /api/v1/owner/shops/[id]` | Allowed shop settings only | Owner of shop |
| `GET /api/v1/shops/[id]/team` | `?page=` owner team; `?scope=technicians|parts&page=` assignment choices | Owner for full team; owner/advisor for scoped active choices |
| `POST /api/v1/shops/[id]/team` | email/name/role -> created staff credential/invite | Owner of shop; admin key server-only |
| `PATCH /api/v1/shops/[id]/team/[memberId]` | Edit role or deactivate membership | Owner of shop |
| `GET /api/v1/shops/[id]/services` | Catalog list | Public safe |
| `POST /api/v1/shops/[id]/services` | Catalog create | Owner |
| `PATCH /api/v1/shops/[id]/services/[serviceId]` | Edit or soft-deactivate service | Owner of shop |
| `GET /api/v1/me` | Current verified user and memberships | Authenticated |
| `POST /api/v1/bookings` | shopId, slotId, serviceIds, vehicle fields, notes | Authenticated customer; transactional |
| `GET /api/v1/me/bookings` | Customer bookings, status, pending action | Owning customer |
| `GET /api/v1/shops/[id]/bookings` | `?status=&assignee=&page=` | Shop membership and role scope |
| `GET /api/v1/bookings/[id]` | Booking, allowed actions, history, estimate data | Owner/customer/authorized shop role |
| `POST /api/v1/bookings/[id]/actions` | action, payload, expectedVersion, idempotencyKey | State machine actor guard |
| `GET /api/v1/bookings/[id]/estimate-catalog` | `?page=`; active same-shop part identity, SKU and name | Assigned technician |
| `GET /api/v1/shops/[id]/inventory` | Part SKU, stock, cost | Parts/owner; tech required summary only |
| `POST /api/v1/shops/[id]/inventory` | Add/update parts catalog | Parts or owner |
| `POST /api/v1/bookings/[id]/purchase-orders` | Missing parts items | Assigned parts person |
| `POST /api/v1/purchase-orders/[id]/receive` | Items with received deltas | Assigned parts person; transactional |
| `POST /api/v1/bookings/[id]/allocate-parts` | expectedVersion, idempotencyKey | Assigned parts person; transactional |
| `GET /api/v1/shops/[id]/qc-queue` | Available unclaimed jobs | QC in shop |
| `GET /api/v1/notifications` | `?unread=true&limit=`; own notifications | Authenticated |
| `POST /api/v1/notifications/[id]/read` | Mark own notification read | Notification owner |

## Booking Payload

```json
{
  "shopId": "uuid",
  "slotId": "uuid",
  "serviceIds": ["uuid"],
  "symptomNotes": "Brake squeaks and car vibrates. Not sure why.",
  "vehicle": {
    "registrationPlate": "LEA-1234",
    "make": "Honda",
    "model": "Civic",
    "year": 2016,
    "color": null,
    "mileageKm": null
  },
  "idempotencyKey": "uuid"
}
```

Customer name/email/password are handled by Supabase Auth before booking mutation. Passwords are never transmitted to booking RPCs or stored in application tables. Existing emails must sign in; do not recreate or overwrite accounts.

## Action Payload Pattern

```json
{
  "action": "ASSIGN_TECHNICIAN",
  "expectedVersion": 2,
  "payload": { "technicianUserId": "uuid" },
  "idempotencyKey": "uuid"
}
```

Conflict response:

```json
{
  "data": null,
  "error": {
    "code": "STATE_CONFLICT",
    "message": "Reload this booking."
  }
}
```

## Notification Events

Emit in-app notifications on:

- New booking for shop SA.
- Technician assignment.
- Estimate submission for SA.
- Estimate sent to customer.
- Customer decision for SA.
- Parts availability/orders for parts staff and technician.
- QC queued/failed for QC and technician.
- Ready-for-pickup for customer.

Realtime is optional. Polling/refetch on focus is the safe baseline. Notification creation belongs to successful business operations, not optimistic UI.

## B10 Notifications Boundary

B10 implements `GET /api/v1/notifications` and `POST /api/v1/notifications/[id]/read`. The list route returns only the authenticated user's visible notifications with optional `unread=true` and `limit` capped at 50, plus `unreadCount`. The read route is same-origin only and marks exactly one own visible notification read through a guarded RPC. Direct notification table writes remain denied to ordinary users.

## Open Questions

- Rate limit mechanism is not chosen until B00/B03.
- Concrete response DTOs will be typed in later backend phases.

## B03 Auth and Team Contract

Implemented surfaces: `GET /api/v1/me`, `POST /api/v1/shops/[id]/team`,
`PATCH /api/v1/shops/[id]/team/[memberId]`, and `/auth/callback`.
Signup/login/logout use exported Next.js Server Actions in
`frontend/src/lib/auth/actions.ts`; no extra auth API URLs or UI are added.

`/me` returns `{ user: { id, email, fullName, phone }, memberships }` inside the
standard success envelope. Memberships contain `{ id, shopId, userId, role, active }`
and include only the verified user's active memberships. Auth metadata, passwords,
tokens and other people's memberships are excluded. Missing/invalid sessions get
401. Private responses are not cached.

Staff creation accepts exactly `{ email, fullName, role, initialPassword }`.
Allowed roles are `SA`, `TECHNICIAN`, `PARTS`, `QC`. Passwords are 12-128 characters;
names are nonblank up to 120 characters. Creation returns 201 and the authoritative
membership, never a password. The owner supplies and communicates the initial
password outside the API response. Existing email returns 409 `EMAIL_EXISTS` and
never resets credentials. Staff cannot create their own membership, and owner A
cannot manage shop B. Ownership is checked on both server and SQL operation.

Membership patch accepts `{ role?, active? }` with at least one field; it returns
the committed membership. OWNER membership, user ID and shop ID are immutable
through this contract. False deactivates only that membership. Missing member
within an owned shop returns 404; unauthorized actor/shop returns 403.

Both team mutations require a same-origin `Origin` header. Staff creation has a
best-effort per-process bound of 10 requests/minute per owner (429 `RATE_LIMITED`).
Cross-service provisioning failures return 500 `STAFF_PROVISIONING_INCOMPLETE`
when operator recovery may be needed; retained new accounts remain banned until
membership attachment succeeds and activation is confirmed.

`/auth/callback?code=...&next=...` exchanges a PKCE code, synchronizes the profile,
and redirects only to a local path, defaulting to `/api/v1/me` while UI is absent.
Invalid, consumed, or expired links redirect to the login recovery view with the
sanitized local destination preserved. The recovery form may call the signup
confirmation resend Server Action; its response is deliberately generic to avoid
revealing whether an email is registered. Public signup accepts only name/email/password;
it never establishes a shop role. Shop creation remains B04.

### MT01 account intent and onboarding amendment

Public account choice is limited to customer signup and owner signup. The Auth
payload remains name/email/password; `type`, `role`, `shopId`, owner ID, and
membership are not accepted as authoritative signup fields. A sanitized
`next=/owner/onboarding` may preserve owner intent through login, email
confirmation, and callback, but the destination grants no database permission.

Employee role choices are login-only. `SA`, `TECHNICIAN`, `PARTS`, and `QC`
accounts continue to be created through the owner-only team operation. A public
caller cannot turn a new or existing Auth identity into staff by changing query
parameters, metadata, or a request body.

Authenticated destination resolution uses current active memberships. Owners go
to `/owner`; a single staff membership goes to its scoped workspace; multiple
staff memberships require an explicit chooser; a membership-free owner-onboarding
request goes to `/owner/onboarding`; other membership-free identities go to
`/customer`. Users with both customer activity and memberships retain an explicit
personal-workspace link.

### MT04 deterministic employee workspace resolution

`/workspace` is the authenticated chooser for an identity with more than one
active non-owner membership. It renders only memberships returned by the verified
server identity projection and only shop labels readable through the user's RLS
client. Each choice is derived from the authoritative membership role and shop ID;
the browser cannot select an arbitrary role or tenant. Missing shop metadata fails
closed rather than rendering a partial or guessed choice.

The destination algorithm is order-independent: any active OWNER membership goes
to `/owner`, exactly one active staff membership goes directly to its scoped
workspace, more than one active staff membership goes to `/workspace`, and no
active membership goes to `/customer`. Existing explicit safe booking/customer
return paths remain unchanged. Staff workspaces expose both the verified switcher
and the personal customer ledger, so operational access does not replace customer
access.

## B04 Shop, Catalog and Availability Contract

B04 implements the public directory, detail by ID/slug, services and slots routes,
plus owner shop creation/settings and service create/edit. The service-member
PATCH completes the blueprint's service CRUD scope. Shops/services are removed
from publication with `active: false`; no hard-delete endpoint is provided.

`POST /owner/shops` accepts exactly `{ name, city, address, phone, workingHours,
timezone?, slotDurationMinutes?, slotCapacity?, active? }` beneath `/api/v1`.
Defaults: `Asia/Karachi`, 60 minutes, capacity 1, published. The verified identity
becomes the authoritative owner with an active OWNER membership atomically.
No submitted owner/user/role/slug is accepted. Slug is generated from the name and
the shop UUID, is immutable, and allows duplicate business names safely. A public
identity may create its first shop; a staff identity cannot self-promote. An
already-authoritative owner may create further shops, including when legitimately
holding another role elsewhere. Deactivated staff cannot bypass this restriction.

MT01 amends the onboarding use of this operation: shops created through owner
onboarding must submit `active:false`; the product must not rely on the historical
published default. A later implementation phase may change the endpoint default
to unpublished after updating compatibility tests. No new shop endpoint is
authorized by MT01.

Changing `active` from false to true is a launch operation. The guarded database
mutation must verify valid working hours, at least one active service, the active
authoritative OWNER membership, and active same-shop `SA`, `TECHNICIAN`, `PARTS`,
and `QC` memberships. Failure returns 409 `SHOP_NOT_READY` with a safe list of
missing readiness categories; it must not expose user IDs, emails, credentials,
or private membership records. Deactivation remains owner-authorized and does not
delete catalog, slots, memberships, bookings, or history.

MT03 implements this boundary with migration
`20261010130000_mt03_shop_publication_readiness.sql`. PostgreSQL SQLSTATE `BF001`
maps to HTTP 409 `SHOP_NOT_READY`; the response gives a safe completion message
without membership identities. New application-created shops default to
`active:false`. The existing shop, service, and team endpoints remain the only
mutations used by the onboarding flow; no parallel organization API is added.

`PATCH /owner/shops/[id]` accepts a nonempty subset of those same settings.
OWNER membership and ownership are rechecked under SQL locks. All mutations
require a same-origin Origin header and return the committed DTO. Creation is 201,
editing is 200, missing identity 401, unauthorized ownership 403, bad input 400.
Settings conflicting with future non-cancelled bookings return 409
`SCHEDULE_CONFLICT` without changing configuration or slots.

Working hours use the established seed shape:

```json
{ "mon": [["09:00", "12:00"], ["13:00", "18:00"]], "sun": [] }
```

Only `mon`..`sun` keys, at most four ordered non-overlapping intervals per day,
strict 24-hour `HH:MM` and opening before closing are accepted. Missing keys and
empty arrays mean closed. Overnight intervals are rejected. Shop name is 1-120,
city 1-80, address 1-500 characters, trimmed; phone is 7-30 characters with digits,
optional leading plus and common spacing/separators. Slot duration is 15-240
integer minutes; capacity is 1-100. The database validates recognized timezone
names. SQL repeats validation even if a caller bypasses the HTTP handlers.

Shop DTO: `{ id, slug, name, city, address, phone, workingHours, timezone,
slotDurationMinutes, slotCapacity, logoUrl }`; owner mutation DTO also has `active`.
Owner IDs, memberships and fabricated ratings are excluded from public DTOs.
Detail adds `services: { items, page, pageSize, total }` with its first catalog page.

Directory query accepts only `city`, `q`, `page`. City is a case-insensitive exact
match; q is a literal case-insensitive name substring (wildcards are escaped).
Page is a positive decimal integer, default 1, maximum 99999. Directory and service
list return `{ items, page, pageSize: 50, total }`, ordered by name then ID. Services
accept only `page`. Missing/unpublished shops return 404 for detail/services/slots.
Malformed UUIDs/slugs, unknown or duplicate query parameters return 400.

Service create accepts `{ name, description?, durationMinutes, basePricePkr?,
active? }`; edit accepts a nonempty subset. Description defaults to empty (max
2000), price to null, active to true. Duration is 1-1440 integer minutes; price is
null or whole PKR 0-999999999. Service DTO: `{ id, shopId, name, description,
durationMinutes, basePricePkr }`, plus `active` for mutations. Existing services
and their booking references survive soft deactivation. A foreign service ID in
an owned shop returns 404; editing another owner's shop returns 403.

Slot reads require `?date=YYYY-MM-DD`, a real date within today through day 13 in
the shop timezone. Outside that horizon returns 400 `DATE_OUT_OF_RANGE`. Results
are ordered and contain `{ id, shopId, startsAt, endsAt, capacity,
capacityRemaining }`; instants are UTC. Closed days return `[]`; full slots remain
visible with zero remaining capacity. Remaining capacity is
`max(0, capacity - count(bookings where status != CANCELLED))`, including COMPLETED
per the frozen booking rule. No customer or booking identifier is exposed.

Owner setup saves regenerate the 14-day horizon, preserve matching slot IDs,
exclude elapsed times, lunch/closed periods and incomplete final intervals, and
skip timezone gaps or intervals whose elapsed length changes during DST. Public
reads never write. Refresh the horizon by resaving current owner settings; no
background scheduler is introduced. Referenced appointment times survive settings
changes. If a cancelled booking retains a slot with an incompatible end time,
that slot is hidden rather than rewritten or offered as a new appointment.
Public capacity is advisory: B05 must lock the slot and recheck publication,
current schedule and capacity atomically before booking.

All B04 responses use no-store. Public reads use a session-free anonymous client
against audited views; owner writes use verified user-scoped clients. B04 has no
UI or booking mutation. Cloud migration application remains explicitly approved
per migration; see [B04 evidence](../backend/docs/b04-catalog-verification.md).

## F01 Public Directory Integration

The public home consumes the existing `GET /api/v1/shops` and per-shop
`GET /api/v1/shops/[id]/services?page=1` routes through a browser-only typed client.
Responses are validated against the B04 public DTOs and success envelope, fetched
with no-store, and rendered without local catalog fixtures. City remains an exact
case-insensitive match; name is a literal substring. Submitting either filter
resets pagination to page 1; clearing restores the unfiltered directory. Result
counts and pagination come from the server. Cards show up to three returned service
names and the authoritative remaining service count, without downloading later
service pages. A services failure does not hide a successfully loaded workshop.

Loading, no results, network/server failure, forbidden and unavailable workshop
responses have explicit states. Failed requests can be retried; requests time out
after 15 seconds and are cancelled when superseded or unmounted. Raw server errors
are never displayed. This integration adds no API route, write or auth surface.

Following the user's 2026-10-10 delegation to choose the prerequisite order and
resolve the CTA conflict, F01 uses working index anchors and `tel:` links derived
from each shop's API phone. “Call to arrange a visit” initiates the device dialer;
it does not create a booking. Online profile/booking links wait for F02/F03 so no
unfinished route is advertised. Seed fixture phone numbers are not verified
operational phone lines.

## B05 Booking Creation Contract

### F02/F03 frontend integration (2026-10-10)

Public `/shops/[slug]` and `/book/[shopId]` server pages validate identifiers and
load the same anonymous `shopDetail` service/projection used by the B04 GET
handlers. This avoids a server-to-itself HTTP call and does not introduce another
backend or expose base tables. Unpublished/missing shops invoke Next not-found;
other read failures reach a safe retry boundary. Client service pagination and
date availability use the existing `/api/v1/shops/[id]/services` and `/slots`
handlers with DTO validation, no-store and bounded requests. Public profile CTAs
carry the authoritative shop ID plus optional `service`, `date` and `slot` hints;
the wizard validates those hints and checks the service/slot relationship again.

The F03 wizard has five steps: concern, appointment, vehicle, account, review.
It uses React Hook Form and the existing Zod booking/vehicle contracts. Customers
can select up to 50 services or provide meaningful symptoms, without mandatory
images or a diagnosis. Prices displayed from the catalog are guides, not trusted
estimate totals and are never sent in a booking mutation. Appointments are shown
in the workshop timezone, using its 14-local-day horizon and remaining capacity.

The account step uses the existing login/signup/logout Server Actions and
`GET /api/v1/me`. Signup now accepts an optional **second action argument**
`next?: string`, sanitized with the existing `safeNext`, for the email confirmation
callback. The original strict signup payload and default callback behavior remain
unchanged; no role/actor input or auth endpoint was added. Existing emails are
directed to sign in, never overwritten. Confirmation-dependent signup never
submits a booking until a verified session exists. F04's standalone auth pages,
dashboard, timeline and account routing are not part of this implementation.

Versioned per-shop local drafts contain form values, step, save time, an optional
actor-bound pending booking request and an optional authoritative creation receipt.
Passwords, tokens, Auth sessions and account form fields are excluded. Drafts stay
on this device until cleared; the UI explains that vehicle details and symptoms
are included. Corrupt, unknown-version and cross-shop drafts are ignored. URL hints
cannot modify an uncertain pending request. Normal drafts with elapsed dates are
returned to the current date horizon. A selected service from a later catalog page
is recovered from the existing paginated services route.

Before a fresh `POST /api/v1/bookings`, the wizard re-verifies `/me`, rechecks the
slot for guidance, validates the full B05 payload and durably saves one UUID request
key plus the exact actor-bound payload. SQL remains the authoritative capacity and
authorization check. Double clicks are blocked. A network loss, malformed success
response or server failure leaves the pending intent locked to its original key;
reloads and retries replay that exact request without rechecking slot capacity,
because a successful original booking may itself have filled the slot. A changed
actor cannot replay it. Authoritative slot/vehicle/validation failures allow
correction; 401 returns to inline authentication. Uncertain intents cannot be
cleared or silently changed into a second booking.

Creation/replay responses navigate to `/book/[shopId]?booking=[bookingId]`.
That F03 confirmation uses the existing guarded `GET /api/v1/bookings/[id]`;
it never fabricates a booking or trusts the local receipt for private data. Signed
out visitors authenticate inline, and 403/404 responses expose no booking details.
This keeps the successful flow usable before F04's customer workspace exists.
No new SQL migration, API route, booking status or RLS policy was needed.

`POST /api/v1/bookings` implements the frozen Booking Payload above. Auth is
verified with `getUser()` and the operation uses the user's JWT. No Admin client
is involved. Same-origin Origin is required; missing/cross-origin requests get
403. A missing/invalid same-origin session gets 401. Strict input validation
rejects customer/role/status/capacity/password fields and arbitrary vehicle IDs.
Service IDs are required as an array (0-50 distinct UUIDs); notes default to empty,
trimmed with a 4000-character maximum. When no service is selected, meaningful
notes require at least 10 characters including at least five letters/digits.

Vehicle plate is trimmed and uppercased, 2-20 ASCII letters/digits/spaces/hyphens,
starting with a letter/digit. Make/model are trimmed 1-80 characters; year is an
integer 1886-9999, matching the database's frozen range. Color defaults to null
or is trimmed 1-40 characters. mileageKm defaults to null or is an integer
0-2147483647, mapped to the existing `vehicles.mileage` column. An exact own
plate/details match reuses the saved vehicle without updating it. A changed
detail for an existing own plate returns 409 VEHICLE_CONFLICT. A foreign plate
does not identify another customer's asset for reuse. Duplicate legacy own plates
resolve deterministically by created_at then ID; only an exact detail match is
accepted. No vehicle-edit or vehicle-ID payload is added.

Creation returns 201 with `{ id, shopId, customerId, vehicleId, slotId, status,
stateVersion, symptomNotes, serviceIds, createdAt }` in the normal data envelope.
Status is PENDING and version is 0 on creation; all values come from committed
database state. A successful replay returns 200 and the current booking state,
even if that original slot is now full or the shop is unpublished. No duplicate
vehicle, service relation, history, notification or receipt is created.

Idempotency keys are UUIDs scoped to the verified actor and CREATE_BOOKING.
Canonical payload comparison normalizes UUID casing, service order, trimmed text,
plate casing and omitted nullable vehicle defaults. All remaining differences
conflict with 409 IDEMPOTENCY_CONFLICT. Failed operations create no receipt and
may retry the same key. Use a new key for a changed booking intent. Receipts retain
validated vehicle/symptom data privately and have no automatic expiration.

Shop publication, slot/shop relationship, current hours/grid, local horizon,
elapsed time and capacity are rechecked under SQL locks. Missing/unpublished shop
or missing/foreign slot returns safe 404 NOT_FOUND. Full, elapsed, closed,
out-of-horizon or configuration-mismatched slots return 409 SLOT_CONFLICT.
Inactive/missing/foreign services and invalid fields return 400 INVALID_INPUT.
Serialization/deadlock/lock conflicts return 409 BOOKING_CONFLICT and permit
retry with the same key. Other database failures return a safe 500. Responses
are private/no-store and omit SQL details. A bounded per-process limiter allows
30 requests/minute per identity and returns 429 RATE_LIMITED; distributed limits
and limits on direct RPC callers are not claimed.

All business effects are one SQL transaction, including profile/vehicle creation,
booking, service relations, history, active-SA notices and receipt. No separate
reservation count or intermediate booking status is introduced. B06 read lists,
detail/actions and UI remain unimplemented. The B05 Cloud migration/test gate
passed after user-run application.

## B06 Booking Actions and Reads

B06 implements `GET /api/v1/me/bookings`, `GET /api/v1/shops/[id]/bookings`,
`GET /api/v1/bookings/[id]` and `POST /api/v1/bookings/[id]/actions`.
Read responses are private/no-store and return only authorized booking DTOs with
camelCase fields. Shop booking list accepts only `status`, `assignee=all|mine|unassigned`
and `page`; it returns `{ items, page, pageSize: 50 }`.

Action requests follow the frozen action payload pattern. Supported actions are:

- `CONFIRM_BOOKING`: empty payload, `PENDING -> CONFIRMED`, same-shop OWNER/SA.
- `ASSIGN_TECHNICIAN`: `{ technicianUserId }`, `CONFIRMED -> ASSIGNED`,
  same-shop OWNER/SA, target must be an active same-shop TECHNICIAN.
- `START_INSPECTION`: empty payload, `ASSIGNED -> INSPECTING`, assigned
  technician only.
- `CANCEL_BOOKING`: `{ reason }`, pre-repair nonterminal states to `CANCELLED`,
  owning customer or same-shop OWNER/SA.

Every action requires same-origin POST, verified session, expectedVersion and
idempotencyKey. Successful new actions return 201 with authoritative booking
detail; replay returns 200. Stale version returns 409 `STATE_CONFLICT`; changed
idempotency payload returns 409 `IDEMPOTENCY_CONFLICT`; illegal state returns
422 `ACTION_NOT_ALLOWED`; hidden/foreign resources return 404 and forbidden
visible actions return 403.

## B07 Estimate Actions

B07 extends the same `POST /api/v1/bookings/[id]/actions` surface and booking
detail DTO. Detail responses include `estimates[]`; each estimate includes
`revisionNo`, `state`, `diagnosisNote`, `subtotalPkr`, timestamps and immutable
`items[]` with server-computed `lineTotalPkr`.

Supported B07 actions are:

- `SUBMIT_ESTIMATE`: `{ diagnosisNote, items }`, `INSPECTING -> ESTIMATE_REVIEW`, assigned technician only. Creates revision 1 in `REVIEW`.
- `SEND_ESTIMATE`: `{ diagnosisNote, items }`, `ESTIMATE_REVIEW -> AWAITING_CUSTOMER`, same-shop OWNER/SA. Replaces the editable review draft and freezes it as `SENT`.
- `APPROVE_ESTIMATE`: empty payload, `AWAITING_CUSTOMER -> ESTIMATE_APPROVED`, owning customer only. Marks the latest sent revision `APPROVED`.
- `REJECT_ESTIMATE`: optional `{ reason }`, `AWAITING_CUSTOMER -> ESTIMATE_REJECTED`, owning customer only. Marks the latest sent revision `REJECTED`.
- `REVISE_ESTIMATE`: `{ diagnosisNote, items }`, `ESTIMATE_REJECTED -> ESTIMATE_REVIEW`, same-shop OWNER/SA. Creates revision `latest + 1` in `REVIEW`.

Estimate payloads accept 1-100 items. `PART` lines require an existing same-shop
`inventory_parts.id`, including zero-stock SKUs. `LABOUR` lines must not carry a
part ID. The client never supplies subtotal or line totals; the database computes
line totals and subtotal inside the transaction. Sent, approved and rejected
versions are never mutated silently; only the current review draft can be edited
while sending.

## B08 Parts Workflow

B08 implements the inventory, purchase-order, receipt and allocation endpoints
already listed above. These use verified cookie sessions, private/no-store
responses and same-origin mutation checks. Booking mutations delegate to the
same `apply_booking_action` RPC as B06/B07 and return authoritative booking detail
(201 new intent, 200 replay). They share the actor/key receipt namespace, so a
retry through either the dedicated endpoint or `/actions` has identical effects.

Added `/actions` names and payloads:

- `ASSIGN_PARTS`: `{ partsUserId }`; OWNER/SA assigns an active same-shop PARTS
  member, ESTIMATE_APPROVED -> PARTS_PENDING.
- `MARK_PARTS_READY`: `{}`; assigned parts person checks stock, PARTS_PENDING or
  PARTS_ORDERED -> PARTS_READY. Readiness does not reserve or deduct stock.
- `ORDER_PARTS`: `{ supplierName?, items: [{ partId, quantity }] }`; assigned
  parts person orders missing quantities. PARTS_PENDING -> PARTS_ORDERED;
  additional uncovered shortages may be ordered in PARTS_ORDERED. If another
  job consumes a READY job's stock, a shortage order stays PARTS_READY and is
  audited without a new status or reservation.
- `RECEIVE_PARTS`: `{ purchaseOrderId, items: [{ partId, quantity }] }`; positive
  received deltas, assigned parts person, PARTS_ORDERED/PARTS_READY only. Partial
  receipt remains PARTS_ORDERED until all required stock is available, then
  PARTS_READY. A receipt on an already READY job is a same-state audit event.
- `ALLOCATE_PARTS`: `{}`; assigned parts person, PARTS_READY -> IN_REPAIR,
  complete allocation of server-derived approved quantities only.

`POST /bookings/[id]/purchase-orders` accepts exactly `{ expectedVersion,
idempotencyKey, supplierName?, items }`. `POST /purchase-orders/[id]/receive`
accepts `{ expectedVersion, idempotencyKey, items }`; the route resolves the
order's booking through user-scoped RLS, then SQL checks the binding again.
`POST /bookings/[id]/allocate-parts` accepts `{ expectedVersion, idempotencyKey }`.
No authoritative actor, tenant, stock balance or allocation quantity is accepted.
All paths are under `/api/v1`.

Order and receipt items contain 1-100 distinct UUID parts and positive integer
quantities up to 999999999. Ordering is capped to approved aggregate requirement
minus current stock minus outstanding quantities in this booking's orders; only
required same-shop parts qualify. Supplier is nullable, trimmed, up to 200
characters. Receipt deltas cannot exceed the remaining ordered quantity.
Items are canonicalized by UUID order for idempotency comparison. Same-state
orders/receipts write history and receipts without incrementing stateVersion;
state changes increment it once. Invalid input returns 400, overdelivery or
overordering 422, and missing/foreign orders or parts 404. Insufficient current
stock at readiness/allocation returns 409 `STOCK_CONFLICT` with no partial effects.
All other B06 version, replay, authorization and transaction errors still apply.

`GET /shops/[id]/inventory?page=1` is OWNER/PARTS only and returns `{ items, page,
pageSize: 50, total }`, ordered by SKU then ID, including inactive catalog items.
Unknown/duplicate query keys and nondecimal pages are rejected. Each inventory
item is `{ id, shopId, sku, name, quantityOnHand, reorderLevel, unitCostPkr, active }`.
Technician/SA required stock summaries come through authorized booking detail,
without private unit costs or suppliers.

`POST /shops/[id]/inventory` creates (201) or updates by optional `id` (200), with
exactly `{ id?, sku, name, unitCostPkr, reorderLevel?, active?, quantityOnHand? }`.
SKU is trimmed 1-80 characters; name 1-200. All numbers are nonnegative integers
up to 999999999. Opening quantity defaults to zero and is accepted only for a new
SKU; edits reject quantityOnHand. Reorder defaults to zero; active defaults true
on creation and is preserved if omitted on edit. Duplicate SKU is 409 SKU_EXISTS.
Existing stock changes only via audited parts operations; catalog saves have no
booking idempotency receipt. A duplicate create cannot increase existing stock.

Booking detail adds `requiredParts[]` for authorized OWNER/SA/PARTS/TECHNICIAN
staff (partId, quantityRequired, quantityOnHand, quantityAllocated, shortageQuantity),
`purchaseOrders[]` for OWNER/PARTS only (order identity/status/supplier/timestamps
and items with quantityOrdered/quantityReceived), and `partAllocations[]`
(id, partId, quantity, allocatedBy, allocatedAt, releasedAt). Customers receive
empty requiredParts/purchaseOrders arrays and retain their approved estimate
snapshot, timeline and own allocation records. Booking lists retain their existing
compact shape. B08 adds no UI, unlinked replenishment orders, manual stock
adjustments, supplier integration or PO cancellation status. Outstanding orders
on cancelled or in-repair jobs remain audit records; receiving through B08 is
limited to the parts stages above.

## B09 Repair, QC and Pickup

B09 extends `POST /api/v1/bookings/[id]/actions` and implements
`GET /api/v1/shops/[id]/qc-queue?page=1`. The queue is QC-only and returns
unclaimed `QC_PENDING` booking list items with `{ items, page, pageSize: 50 }`.
Unknown or duplicate query keys are rejected.

Added action names and payloads:

- `COMPLETE_REPAIR`: `{ notes }`; assigned active technician only, `IN_REPAIR -> QC_PENDING`. Notes are trimmed, 3-2000 characters. Open QC issues for the booking are resolved when repair is resubmitted.
- `CLAIM_QC`: `{}`; active same-shop QC only, `QC_PENDING -> QC_IN_PROGRESS`. First claimant wins; claimed jobs are hidden from other QC users by RLS/read guards.
- `PASS_QC`: `{ checklist?, notes? }`; claiming QC only, `QC_IN_PROGRESS -> READY_FOR_PICKUP`. Checklist is a JSON object; notes trim to max 2000 characters.
- `FAIL_QC`: `{ checklist?, notes?, title, description }`; claiming QC only, `QC_IN_PROGRESS -> IN_REPAIR`. Title is 1-200 characters and description is 1-2000. A linked QC issue is created atomically.
- `NOTIFY_READY`: `{}`; OWNER/SA only, same-state `READY_FOR_PICKUP`, one idempotent customer notification per action key.
- `COMPLETE_PICKUP`: `{}`; owning customer or OWNER/SA only, `READY_FOR_PICKUP -> COMPLETED`, with server `completedAt`.

Booking detail adds `qcRuns[]` and `qcIssues[]` for authorized actors. Existing
role-scoped read guards still apply; a QC user who loses visibility after passing
or failing sees empty detail arrays through the returned projection, while audit
rows remain in the database. B09 adds no payment, invoice, customer survey or UI.

## F04 customer workspace integration (2026-10-10)

`/login` and `/signup` use the existing same-origin Supabase SSR Server Actions.
A sanitized `next` preserves booking resumption and is passed through signup email
confirmation; missing/unsafe UI destinations resolve to `/customer`. The legacy
callback fallback `/api/v1/me` remains unchanged for other API consumers.
Customer page entry verifies Auth with `getUser`, synchronizes the profile and
reads the same active membership projection as `/api/v1/me`. Cookie refresh covers
customer, auth entry and booking pages. No token or credential enters UI props.

The ledger reads GET `/api/v1/me/bookings`, detail reads GET `/api/v1/bookings/[id]`,
and the separate summary reads GET `/api/v1/notifications?unread=true&limit=3`.
All are same-origin, no-store, abortable and schema validated. API ownership/RLS
remains authoritative; the customer UI additionally suppresses mismatched actor
records. No shop names, vehicle labels or appointment times are fabricated when
absent from booking DTOs. Creation timestamps are explicitly labelled as recorded,
not appointment times, and displayed in PKT. Completed/cancelled visits are history;
timelines sort actual API events chronologically. Next-owner copy is descriptive,
not an authorization decision. Estimate summaries contain only returned snapshots;
approval/rejection and pickup actions remain later frontend phases.

## F05 workspace integration (2026-10-10)

Scope amendment: the user explicitly chose the authenticated shell and shared
read-only detail, deferring action controls to F07 onward. `bookingDetailOutput`
does not return allowed actions. This phase adds no speculative permission DTO,
mutation button, database migration or API endpoint.

Staff pages verify Auth and active per-shop memberships on the server using the
same projection as GET `/api/v1/me`. Shop header/switcher metadata is selected
from existing `shops(id,name,city,timezone)` with the authenticated RLS client,
restricted to those memberships. Inactive, foreign-user or absent memberships
never create navigation options. The schema permits one membership role per
user/shop; switching selects a real shop/membership, never impersonates a role.
The owner entry `/owner` requires an active OWNER membership. Its switcher may
also show that user's actual staff memberships in other shops. Owner metrics,
shop creation, settings and team controls remain F06.

Nested routes reuse the existing `[slug]` filesystem parameter (Next.js forbids
siblings with different dynamic parameter names). Public `/shops/[slug]` remains
a slug-based profile; `/shops/[slug]/advisor|technician|parts|qc|bookings/[id]`
requires the dynamic value to be a UUID shop ID. Wrong role/shop pages return a
safe unavailable/not-found view before requesting shop metadata. Default sign-in
without a requested return path follows the MT04 destination algorithm, including
`/workspace` for multiple active staff memberships. Explicit safe customer or
booking return paths are preserved. Session refresh covers all private routes.

Role landing views use GET `/api/v1/shops/[id]/bookings?page=N&assignee=all`.
Its SQL already restricts technicians/parts to assigned work and QC to unclaimed
QC work plus claimed jobs. F05 QC therefore uses this combined role-scoped list,
not the narrower unclaimed-only `/qc-queue` endpoint. Pagination follows the
existing 50-row contract; no total count is invented. Shared detail uses GET
`/api/v1/bookings/[id]` plus an additional shop-ID check. RLS/RPC access remains
authoritative if memberships change after rendering. All reads handle session
expiry, forbidden/not-found, network failure, retry, loading and empty states.

## F06 owner control center (2026-10-10)

The user explicitly approved adding the private GET contracts needed for F06 to
existing routes. No migrations, tables, columns, RLS policies or write grants changed.

| GET route | Output | Authorization |
| --- | --- | --- |
| `/api/v1/owner/shops?page=N` | `{ items: [{ shop, counts }], page, pageSize: 50, total }` | Verified Auth; query restricted to authoritative `owner_user_id`, with user-scoped RLS |
| `/api/v1/owner/shops/[id]` | `{ shop, counts }` | Existing `requireOwner`: actual owner ID plus active OWNER membership |
| `/api/v1/shops/[id]/team?page=N` | `{ items: [{ id, shopId, userId, role, active, fullName }], page, pageSize: 50, total }` | Existing `requireOwner`; includes inactive memberships |
| `/api/v1/shops/[id]/services?scope=owner&page=N` | `{ items: [serviceOutput], page, pageSize: 50, total }` | Existing `requireOwner`; includes inactive services |

Owner `shop` uses existing `shopOutput` including publication state. `counts` has
four nonnegative integers: `pending` (PENDING), `inProgress` (all statuses except
PENDING, READY_FOR_PICKUP, COMPLETED and CANCELLED), `readyForPickup`
(READY_FOR_PICKUP) and `completed` (COMPLETED, all time). Counts use exact HEAD
queries scoped to each shop; they never derive totals from a truncated booking
page. Separate queries are informational observations, not a transactional
workflow snapshot. Counts are per shop, not an invented aggregate over all pages.
A count failure is an error, never a fabricated zero. The index exposes only owned
shops; an identity with none receives an empty list. Private detail requires both
ownership and membership checks before selecting settings/counts.

Owner lists use deterministic ordering and the existing positive page range
1..99999, capped at 50 rows. Duplicate/unknown query fields are rejected.
`scope=owner` is the only private service scope; ordinary GET services remains
public-safe and excludes unpublished records as before. Read responses use
private/no-store and Vary Cookie. Read services use the user-scoped client, never
the Admin client. Team profile projection is `full_name` only; Auth emails,
passwords and metadata are not fetched. Owner membership cannot be edited through
the existing staff PATCH contract.

Frontend `/owner` now renders real summaries and shop links, with a first-shop
empty state for identities without active memberships. Active staff-only identities
remain denied from this owner page. `/owner/shops/new` requires verified Auth;
the existing creation SQL decides first-owner eligibility and prevents staff or
inactive-staff self-promotion. No client-supplied owner ID, role or slug is sent.
`/shops/[slug]/settings` requires a UUID shop ID and verified OWNER membership on
the server, then loads the guarded private GET. The dynamic parameter name reuses
the existing public profile route; public slug profiles are unchanged.

Settings sections: Operations (details/publication and counts), Team, Services,
Hours (split-shift hours/timezone/duration/capacity). Writes use the existing
POST/PATCH endpoints and schemas. Service removal means `active:false` and remains
reactivatable. Public directory/profile reads already fetch fresh data; the next
fetch reflects the committed catalog. Hours saves use the existing atomic slot
refresh and SCHEDULE_CONFLICT guards; the UI never inserts appointments itself.

Mutations have a 20-second abort bound, same-origin credentials, no automatic
retry and authoritative DTO validation. Visible pending locks prevent repeated
submits. Network/5xx/invalid-response uncertainty blocks another shop/service/staff
creation in that mounted form and directs the user to inspect records/operator
state. These POST endpoints do not have idempotency keys: reloading/navigating
away clears the form lock, so checking uncertain results remains necessary.
Membership/configuration PATCH retries update the same named record.

Staff creation sends the owner-supplied initial password only to the existing
same-origin team endpoint. Optional generation uses browser crypto. Successful
creation shows those supplied credentials in memory, masked by default, with
explicit reveal/copy and private-sharing caution. They are never returned by the
API, persisted in local/session storage or included in roster reads. Closing the
section/dismissing them clears the display. Duplicate email does not reset an
account. STAFF_PROVISIONING_INCOMPLETE requires operator review rather than a
blind retry; uncertain staff creation clears the form's password.

The local app env currently has public configuration only. Live staff creation
requires exactly one server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY,
configured privately. No Admin key was fetched, printed, embedded or committed by
F06. Automated tests mock Auth/transport; no Cloud account was created in this phase.

## F07 advisor desk integration (2026-10-10)

The user approved `GET /api/v1/shops/[id]/team?scope=technicians&page=N`.
This scope requires verified Auth and active same-shop OWNER/SA membership, uses
the existing membership/profile RLS policies, and returns only active same-shop
TECHNICIAN choices: `{ items: [{ userId, fullName }], page, pageSize: 50, total }`.
Name is nullable; the user ID remains the assignment identity. Results order by
user ID. No scope retains F06's owner-only full roster including inactive members.
Unknown/duplicate query keys, invalid scope and invalid pages return 400. No Auth
email, password, Admin client, schema change or policy change is involved.

Advisor inbox filters use the existing single-status booking list API. New jobs,
estimate work and pickup work select a default stage and offer their related
stages in a labelled selector. Filtering resets pagination; refresh/focus reads
the live ledger. There are no invented total counts or later-phase write controls.

Shared staff detail offers CONFIRM_BOOKING, ASSIGN_TECHNICIAN and CANCEL_BOOKING
according to documented role/status/history affordances. It does not invent an
allowedActions field; SQL still verifies every actor, state and prerequisite.
Cancellation is hidden after any recorded IN_REPAIR entry. Actions require a
confirmation dialog and the existing expectedVersion/idempotencyKey contract.
Each dialog retains an immutable intent through retries. Pending requests lock
duplicate submission; uncertain network/5xx/invalid responses lock dismissal and
permit only same-intent replay. Definite state/access/input errors offer an
authoritative reload. A successful response is ID/shop checked and followed by
GET detail; no local status advance is used. Intent locks are in memory only;
navigation/reload discards them and reads current server state/version. All F07
actions are guarded version-changing transitions. F09 sends and F11 pickup writes
remain deferred; real history and read-only estimates remain visible.

## F08 technician workbench integration (2026-10-10)

The user approved these narrow read additions before implementation:

- `GET /api/v1/bookings/[id]/estimate-catalog?page=N` returns
  `{ items: [{ id, sku, name }], page, pageSize: 50, total }`. Verified cookie Auth
  delegates to `public.list_estimate_catalog({ bookingId, page })`. Its private
  definer checks assignment plus an active same-shop TECHNICIAN membership and
  derives the shop from the booking. Missing/foreign/unassigned/wrong-role jobs
  are hidden with 404; expired HTTP Auth is 401. Direct anonymous/missing-subject
  execution is denied. Active catalog items order by SKU then ID, include
  zero-stock items, and omit stock balance, cost, reorder level and suppliers.
  Clients cannot supply actor or shop IDs. API query keys/pages are strict.
- `GET /api/v1/bookings/[id]` now adds nullable `customer: { fullName, phone }`
  and `vehicle: { registrationPlate, make, model, year, color, mileageKm }`.
  The existing guarded get_booking RPC authorizes the booking first. User-scoped
  profile/vehicle queries then bind to that booking's exact customer/vehicle IDs;
  vehicle additionally filters customer_id. Missing or RLS-hidden context is
  null, while a query error fails the read rather than inventing context. No Auth
  email or unavailable contact field is added. Booking lists remain compact;
  existing SQL action responses omit this context and client parsing defaults it
  to null until the authoritative GET after mutation.

Migration `20261010110000_f08_estimate_catalog.sql` adds only a narrow invoker RPC
and guarded private definer. It changes no RLS policy, table, column, status or
write grant. Authenticated EXECUTE applies only to these guarded functions, with
empty search paths and qualified references. It was verified using the disposable
native PostgreSQL harness. Cloud is still applied through 20261010100000; the
catalog endpoint requires separate forward Cloud application of this migration.
The additive `database.f08.ts` type overlay preserves database.types.ts.

Technician list requests `assignee=mine`; detail and list additionally reject
unexpected shop/assignment DTOs before rendering. Technician controls require the
verified actor's assignment and documented statuses: START_INSPECTION from
ASSIGNED, SUBMIT_ESTIMATE from INSPECTING, COMPLETE_REPAIR from IN_REPAIR.
No customer decision, advisor estimate send, parts mutation or QC inspector
control is added. Real QC issues show open/resolved state and timestamps; repair
notes are 3–2000 characters, and server resubmission resolves open issues.

Estimate drafts contain 1–100 PART/LABOUR rows. PART identities are selected from
the guarded catalog, including later pages; unit prices are manually entered
whole PKR, never populated from private inventory costs. Quantity is positive and
price nonnegative, each at most 999999999. Diagnosis/descriptions reuse the
existing estimate schema. BigInt previews reject fractional/blank/exponent/negative
inputs and totals above the existing SQL limit 2147483647. The UI also checks the
existing 16384-character action request limit. The submitted payload never includes
lineTotalPkr or subtotalPkr. Saved itemized lines and totals come from the server.

Forms/repair actions reuse F07's immutable version/key dialog and uncertainty
locks. Editor drafts survive mounted focus/manual record refresh; tab reload or
navigation clears them. They do not persist diagnosis/prices as authoritative
state. Catalog selection moves keyboard focus into its region and returns focus
to its trigger on selection/close. Pending estimate intents disable the editor.

## F09 estimate review and customer decision (2026-10-10)

F09 integrates the existing B07 actions and booking detail contract. No endpoint,
DTO field, database migration, policy or write grant is added in this phase.

- OWNER/SA review is available only for the latest REVIEW revision in
  ESTIMATE_REVIEW. It shows the server source separately from unsaved advisor
  diagnosis/item edits. Existing PART identities remain attached; descriptions,
  quantities and prices can change, lines can be removed and LABOUR added. F09
  does not expand technician-only catalog access or accept manually typed part IDs.
- SEND_ESTIMATE submits diagnosis/items with expectedVersion and idempotencyKey.
  The existing SQL computes the total and freezes the current revision as SENT,
  moves to AWAITING_CUSTOMER and creates the customer's pending notification.
- The personal booking record renders the latest sent/decided itemized snapshot,
  whole-PKR server line/subtotals, revision number and created/sent/decision
  timestamps. Previous sent/decided revisions remain expandable. Unsent REVIEW/
  DRAFT rows are suppressed on the customer surface even if an unexpected read
  returns them; their presence as a newer revision also prevents a stale decision.
- APPROVE_ESTIMATE and REJECT_ESTIMATE are offered only to the owning customer
  in AWAITING_CUSTOMER with a complete latest SENT revision. Approval submits `{}`;
  rejection submits an optional trimmed reason up to 500 characters. The modal
  names the exact revision and server total. Approval authorizes repair and does
  not collect payment. No advisor/technician customer-decision controls are added.
- For the latest REJECTED revision in ESTIMATE_REJECTED, OWNER/SA can edit a
  copy and call REVISE_ESTIMATE. SQL preserves the declined snapshot and creates
  revision_no + 1 in REVIEW. A separate review/send action is required on the
  saved new revision. Existing history displays the decision reason/action trail.

Each intent reuses the F07 immutable key/version confirmation, pending duplicate
lock, uncertainty replay and authoritative GET. Customer decisions never submit
a revision ID, actor ID or amount: SQL resolves the latest revision while holding
the booking lock and checks its expectedVersion. Every booking read additionally
rejects mismatched snapshot booking/shop bindings and duplicate revision numbers.

Advisor drafts reuse the estimate schema, whole-number input rules, exact BigInt
previews, SQL total ceiling and 16384-character request bound. Submitted payloads
omit lineTotalPkr/subtotalPkr. Source snapshots are never updated locally. Drafts
survive mounted record refresh, but a changed server version/revision disables
submission until explicit reset to the latest server source; page reload clears
unsaved edits. UI status/timestamps/totals come from the follow-up GET.

F08's 20261010110000 catalog migration remains pending on Cloud. F09 uses existing
recorded PART identities and B07 actions and introduces no additional rollout
requirement. Live creation of new technician PART estimates still needs that F08
rollout; browser/Cloud workflow acceptance is separate from automated F09 checks.

## F10 parts desk and approved-estimate handoff (2026-10-10)

The user approved `GET /api/v1/shops/[id]/team?scope=parts&page=N`, using the
same active OWNER/SA guard and existing RLS as technician choices. It returns
`{ items: [{ userId, fullName }], page, pageSize: 50, total }`, active same-shop
PARTS members only, ordered by user ID. No scope keeps the owner-only full roster.
Other scopes/query keys and duplicates are rejected. No email/password/Admin
client, migration, policy or direct write privilege is added. ASSIGN_PARTS now
appears in advisor detail at ESTIMATE_APPROVED and uses the existing named action.

The parts desk reads role-scoped bookings with assignee=mine and exposes a separate
paginated inventory ledger with real SKU/name/on-hand/reorder/cost/active values.
Unexpected assignment/shop DTOs are rejected. Preparation detail requires the
verified PARTS actor's assignment, an approved latest estimate and matching server
required quantities/PO shop/booking bindings. Names come from the approved estimate
snapshot; SKU/private cost reference is the existing inventory read.

ORDER_PARTS, RECEIVE_PARTS, MARK_PARTS_READY and ALLOCATE_PARTS use the shared
actions endpoint and existing payloads, version/key confirmation and uncertainty
locks. Order limits are previews of requirement minus current stock minus this
job's undelivered order quantities; the SQL check remains authoritative. Receipt
fields are explicit delivered-now deltas bounded by ordered-minus-received;
blank/zero rows are omitted, positive whole quantities are required. Only parts
stages offer procurement/receipt writes; outstanding order records remain visible
after repair but cannot be received through this scope.

Readiness/allocate buttons require sufficient current stock, including the existing
labour-only flow. Allocation appears only in PARTS_READY and never updates stock
locally. A STOCK_CONFLICT offers reload and missing-stock recovery. Every successful
action refetches detail; form quantities clear after a confirmed result, including
same-state partial receipt. The stock comparison labels an actual read snapshot
before the saved action and the current authoritative server stock; it does not
attribute concurrent stock changes solely to this action. Inventory re-reads when
the refreshed detail remounts its stock reference.

## F11 quality inspection and pickup integration (2026-10-10)

F11 uses the existing B09 reads/actions and introduces no endpoint, DTO field,
database migration or RLS/write-grant change. QC desk separates the existing
unclaimed qc-queue read from `bookings?status=QC_IN_PROGRESS&assignee=mine` for the
inspector's own claims. Client projections also verify shop, expected status and
claim identity before displaying work. QC detail is limited to unclaimed
QC_PENDING or this actor's QC_IN_PROGRESS; unrelated states/claims are suppressed.

CLAIM_QC requires explicit confirmation. Only the claimant with a matching single
open QC run can record a decision. A checklist starts with no result selected;
the inspector enters check names and explicitly records passed/failed results.
These operator-named boolean keys use the existing JSON checklist contract rather
than an invented universal check rubric. The UI accepts 1–50 distinct names up to
80 characters, caps notes/title/description using existing bounds and the request
size limit, and requires every recorded check to pass before exposing a valid
PASS_QC intent. FAIL_QC requires written issue title/description. Fields are tied
to the open run ID; a changed run requires a fresh checklist. There is no default
pass, owner QC override, direct status change or skip-QC action.

The existing COMPLETE_REPAIR resubmission resolves open issues and queues another
run. QC decision acknowledgements return the inspector to the quality desk instead
of refetching a detail they no longer have permission to read. Read-only QC records
show actual run outcome/checklist/notes/timestamps and open/resolved issues for
authorized roles. Technician issue feedback remains in its rework panel, without
duplicating the same issue in the adjacent history view.

OWNER/SA can NOTIFY_READY at READY_FOR_PICKUP; actual NOTIFY_READY history suppresses
repeat notice buttons after refresh/reload. The owning customer or OWNER/SA can
COMPLETE_PICKUP only at READY_FOR_PICKUP, with terminal-action confirmation.
Completion/stock/timestamps always come from authoritative reads, with no payment
collection. Other roles, pre-QC stages and terminal bookings have no pickup action.
All F11 mutations retain the shared immutable version/key dialog, pending lock and
uncertain-result retry behavior. Loss of a QC decision response can be followed by
404 on replay because the inspector has lost visibility; the safe recovery is to
return to the desk, not infer an unverified success or weaken access guards.

### F11 claim-response resolution

On 2026-10-10 the user authorized the agent to choose the best F11 resolution.
Preserve B09's existing P0002/HTTP 404 once another inspector's claim hides the
job; retain HTTP 409 for stale visible requests. This explicitly amends the
blueprint/docs03 409-only expectation. The UI handles both with generic changed/
unavailable queue-refresh guidance, without revealing the other inspector's job.
No error translation, SQL change or RLS weakening is needed; native B09 tests
and the already verified F11 UI remain unchanged.

## F12 notifications and accessible application states (2026-10-10)

F12 adds no endpoint/schema/RLS change. The bell uses existing GET /me and
GET /notifications?unread=false|true&limit=20 with verified recipient checks.
Staff/owner server identity is an additional expected-user constraint; customer
layout resolves identity client-side so server deep-link sign-in guards remain
unchanged. Unexpected account/recipient responses suppress the entire feed/count.

Visible tabs poll every 25 seconds and refetch on focus. Hidden tabs skip polling;
effect cleanup aborts reads/removes listeners and timers. Background refresh keeps
the last successful count/list in place; auth/read errors suppress stale data.
Recipient identity is rechecked before each feed read. Lists are the existing
latest-20 prefix, with an unread filter; no invented pagination or older-page API.
Every returned notification type/title/message is shown, without hardcoded type
filters. Booking links derive from actual active memberships or the personal
booking route, never notification text or untrusted arbitrary URLs.

POST /notifications/[id]/read remains the idempotent B10 read marker. Pending locks
prevent duplicate clicks; the response must match notification/recipient and have
a readAt timestamp. Counts/read badges change only after a fresh GET, not through
local subtraction. Unknown/network/5xx responses offer safe refresh/retry; read
markers can be repeated without duplicating business effects. A shared browser
event refreshes the customer summary after a marker; the summary uses the same
recipient-checked polling hook and displays at most three unread entries.

The bell is a native labelled modal with conservative focus, Escape dismissal,
focus restoration, explicit All / Unread filters and safe 401/403/network states.
It appears in customer, owner overview and staff shells. Mobile navigation does
not trap keyboard events from an open modal. Scrollable table regions have labels,
Tab focus and visible narrow-screen guidance; confirmation dialogs have bounded
height and internal scroll. Form error text is associated with auth fields and
customer errors no longer introduce nested main landmarks. Success copy no longer
keeps saying "loading" after a completed refresh. No credentials, read-marker
optimism, payment reporting or production mock notification is introduced.

## I01 Contract Sync and Real Data Cutover (2026-10-10)

All production public, customer, owner, advisor, technician, parts and QC reads
use typed clients under `frontend/src/lib/api`. Components do not carry alternate
endpoint spellings or response schemas. Public catalog reads use `shops.ts`;
booking identity/create/detail use `booking.ts`; owner management uses `owner.ts`;
workflow mutations and scoped assignment choices use `job-actions.ts`; notification
reads/markers use `notifications.ts`; and authenticated booking queues, QC queue,
inventory and estimate catalog reads use `workspace.ts`.

The canonical action endpoint remains
`POST /api/v1/bookings/[id]/actions` with exactly these discriminators:
`CONFIRM_BOOKING`, `ASSIGN_TECHNICIAN`, `START_INSPECTION`, `CANCEL_BOOKING`,
`SUBMIT_ESTIMATE`, `SEND_ESTIMATE`, `APPROVE_ESTIMATE`, `REJECT_ESTIMATE`,
`REVISE_ESTIMATE`, `ASSIGN_PARTS`, `MARK_PARTS_READY`, `ORDER_PARTS`,
`RECEIVE_PARTS`, `ALLOCATE_PARTS`, `COMPLETE_REPAIR`, `CLAIM_QC`, `PASS_QC`,
`FAIL_QC`, `NOTIFY_READY`, and `COMPLETE_PICKUP`. The three B08 convenience
routes for purchase order creation, receipt and allocation delegate to the same
guarded action service and use the same action names; they are not alternate
state machines.

Production source contains no mock record arrays, demo identities or hardcoded
success fallback records. Display-only constants such as status copy and QC check
labels are not records and never replace failed API data. API failures remain
explicit error states. Database snake_case is translated to camelCase only in
server query/service mapping before shared output schemas validate the response.
