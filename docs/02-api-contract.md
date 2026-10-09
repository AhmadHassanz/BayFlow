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
