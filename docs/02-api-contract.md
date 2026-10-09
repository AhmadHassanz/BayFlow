# API Contract

No API routes are implemented in S00. This document freezes the future `/api/v1` contract.

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

## Endpoint Inventory

| Method + route | Inputs / output | Authorization |
| --- | --- | --- |
| `GET /api/v1/shops` | `?city=&q=&page=`; public-safe shops | Public |
| `GET /api/v1/shops/by-slug/[slug]` | Public shop by slug; services/hours | Public |
| `GET /api/v1/shops/[shopId]` | Public shop/services/hours | Public |
| `GET /api/v1/shops/[shopId]/slots` | `?date=YYYY-MM-DD`; `startsAt`, `capacityRemaining` | Public |
| `POST /api/v1/owner/shops` | name, city, address, phone, hours, capacity | Authenticated owner |
| `PATCH /api/v1/owner/shops/[id]` | Allowed shop settings only | Owner of shop |
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
Invalid/expired links return 400. Public signup accepts only name/email/password;
it never establishes a shop role. Shop creation remains B04.

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

## B05 Booking Creation Contract

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


