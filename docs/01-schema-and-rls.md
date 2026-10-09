# Schema and RLS Contract

The B01 work order implements this contract in `backend/supabase/migrations/`.
See [database foundation](../backend/docs/database-foundation.md) for the ERD,
grants, seed identities, and exact CLI commands. The user explicitly included
foundation RLS and seed data in B01. B02 verified these policies through real
Cloud Auth/REST without requiring schema changes; see the
[B02 security audit](../backend/docs/b02-security-verification.md).

## Global Rules

- All primary keys are UUID unless explicitly justified later.
- All timestamps are `timestamptz` in UTC; display in Asia/Karachi or shop timezone.
- All money is whole integer PKR.
- Critical workflow writes happen through vetted transactional RPCs, not arbitrary client updates.
- History is append-only.
- Staff and services are soft-deactivated, not deleted.
- Bookings with history are not deleted.

## Identity, Shops, Catalog, Slots

| Table | Required columns / invariants |
| --- | --- |
| `profiles` | `id = auth.users.id`, `full_name`, nullable `phone`, `created_at`; no raw passwords |
| `shops` | `id`, `owner_user_id`, unique `slug`, `name`, `city`, `address`, `phone`, `working_hours` JSON, `timezone`, `slot_duration_minutes`, `slot_capacity`, `active`, nullable `logo_url` |
| `shop_memberships` | `id`, `shop_id`, `user_id`, role enum `OWNER/SA/TECHNICIAN/PARTS/QC`, `active`, unique `(shop_id,user_id)`; owner is a membership too |
| `services` | `id`, `shop_id`, `name`, `description`, `duration_minutes`, nullable `base_price_pkr`, `active` |
| `appointment_slots` | `id`, `shop_id`, `starts_at`, `ends_at`, `capacity > 0`, unique `(shop_id,starts_at)` |
| `vehicles` | `id`, `customer_id`, `registration_plate`, `make`, `model`, `year`, nullable `color`, nullable `mileage` |
| `bookings` | `id`, `shop_id`, `customer_id`, `vehicle_id`, `slot_id`, `status`, nullable `technician_user_id`, nullable `parts_user_id`, nullable `qc_claimed_by`, `state_version default 0`, `notes`, `created_at`, nullable `completed_at` |
| `booking_services` | `booking_id`, `service_id`, `shop_id`; service must belong to booking shop; unique booking/service pair |

## Repair, Purchasing, Audit, Notifications

| Table | Required columns / invariants |
| --- | --- |
| `estimates` | `id`, `booking_id`, `shop_id`, `revision_no`, state `DRAFT/REVIEW/SENT/APPROVED/REJECTED`, `diagnosis_note`, `subtotal_pkr`, nullable `sent_at`, nullable `decided_at`, unique `(booking_id,revision_no)` |
| `estimate_items` | `id`, `estimate_id`, kind `PART/LABOUR`; `part_id` required for `PART` and null for `LABOUR`; `description_snapshot`, `quantity > 0`, `unit_price_pkr >= 0`, DB-computed `line_total_pkr` |
| `inventory_parts` | `id`, `shop_id`, shop-unique `sku`, `name`, `quantity_on_hand >= 0`, `reorder_level >= 0`, `unit_cost_pkr >= 0`, `active` |
| `purchase_orders` | `id`, `shop_id`, nullable `booking_id`, `created_by`, status `ORDERED/PARTIALLY_RECEIVED/RECEIVED`, optional `supplier_name`, `ordered_at`, nullable `received_at` |
| `purchase_order_items` | `id`, `purchase_order_id`, `part_id`, `quantity_ordered > 0`, `quantity_received >= 0 and <= ordered`, unique order/part |
| `part_allocations` | `id`, `booking_id`, `shop_id`, `part_id`, `quantity > 0`, `allocated_by`, `allocated_at`, nullable `released_at`; prevent double allocation/release |
| `qc_runs` | `id`, `booking_id`, `shop_id`, `inspector_user_id`, `started_at`, nullable `finished_at`, nullable `passed`, `checklist` JSON, `notes` |
| `qc_issues` | `id`, `booking_id`, `shop_id`, `qc_run_id`, `reported_by`, required `title`, required `description`, `created_at`, nullable `resolved_at` |
| `booking_history` | `id`, `booking_id`, `shop_id`, `actor_user_id`, `from_status`, `to_status`, `action`, `note`, `created_at` |
| `notifications` | `id`, `user_id`, nullable `shop_id`, nullable `booking_id`, `type`, `title`, `message`, nullable `read_at`, `created_at` |

## Mandatory Constraints and Indexes

- Composite FKs or DB guards enforce matching shop between booking, service, slot, estimate, inventory, allocation, and purchase order.
- A booking cannot reference a vehicle owned by another customer.
- Index bookings by `(shop_id, status, created_at)`, `(customer_id, created_at)`, `(technician_user_id, status)`.
- Index slots by `(shop_id, starts_at)`.
- Index history by `(booking_id, created_at)`.
- Index notifications by `(user_id, read_at)`.
- Require nonnegative quantities/prices and positive line quantities.
- Estimate totals are computed from trusted line items; never trust client total.
- DB-enforce active membership and valid role checks during transitions.

## RLS / Grants Matrix

| Data class | Anon | Customer | Shop staff / owner |
| --- | --- | --- | --- |
| Published shops, public services, available slots | Read public safe columns | Read | Read permitted |
| Profiles and vehicles | None | Own only | Minimal customer details for their shop jobs |
| Bookings and booking services | None | Own only | SA all in shop; TECH assigned; PARTS assigned/needed; QC queue; owner all |
| Estimates and estimate items | None | Own booking only | Authorized shop members by job context |
| Inventory and purchasing | None | No direct private inventory | PARTS and OWNER full shop read; other roles required-part summary only |
| History and notifications | None | Own booking history and own alerts | History for authorized jobs; user sees own alerts |
| Critical workflow writes | Deny | Vetted RPC only | Vetted RPC only; no arbitrary status/stock update |

## Function Privilege Model

- Route Handlers use verified cookie sessions and user-scoped Supabase calls.
- Public API-exposed RPCs are `SECURITY INVOKER` and granted only to authenticated users.
- Complex elevated transactions live in an unexposed private schema as `SECURITY DEFINER`, with empty `search_path` and fully qualified object names.
- Every function rechecks `auth.uid()`, shop membership, actor assignment, current state, expected version, and data validity.
- No direct UPDATE permissions on booking status or stock tables.

## Open Questions

- Enums are `shop_role`, `booking_status`, `estimate_state`, `estimate_item_kind`,
  and `purchase_order_status`; Customer is global identity, not a shop role.
- Generated types live in `frontend/src/lib/supabase/database.types.ts` and are
  emitted by the Supabase CLI from applied PostgreSQL schema.
- Active membership/role validation on transitions, idempotency receipts, locking,
  sent-estimate immutability and exactly-once release remain future RPC work.
- `estimate_items` and `purchase_order_items` include `shop_id` to support composite
  FKs and tenant policies; `booking_services` has its own UUID primary key.
- Safe public views deliberately bypass base-table RLS via audited projections;
  anonymous users have no base-table grants. Draft estimates are staff-only.
- All ordinary client writes are denied in B01, including profile edits and
  notification read markers. Later phases must add narrowly reviewed operations.
