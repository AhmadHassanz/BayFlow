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
