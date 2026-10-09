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
