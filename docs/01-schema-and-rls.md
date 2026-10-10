# Schema and RLS Contract

The B01 work order implements this contract in `backend/supabase/migrations/`.
See [database foundation](../backend/docs/database-foundation.md) for the ERD,
grants, seed identities, and exact CLI commands. The user explicitly included
foundation RLS and seed data in B01. B02 verified these policies through real
Cloud Auth/REST without requiring schema changes; see the
[B02 security audit](../backend/docs/b02-security-verification.md).

## I02 Tenant and Role Attack Rehearsal

I02 reran the complete Cloud isolation matrix after the F08 catalog migration,
using 16 real disposable Auth identities across three isolated fixture shops.
Foreign shop/customer reads returned no rows or safe 403/404 responses; unassigned,
inactive and wrong-role staff could not read protected jobs or children. User
metadata could not forge membership. Direct authenticated REST writes to all 18
application tables were denied, including attempted booking status, inventory and
estimate changes, and verified snapshots remained unchanged afterward.

Route Handler attacks also denied unauthenticated actions, foreign customer
approval, wrong-role/stale/wrong-state transitions, unassigned technician reads,
foreign-shop advisor reads and non-claiming QC decisions. Strict action parsing
rejected fabricated `nextStatus`, `role` and `shopId` fields before workflow code;
the target booking's status, version and history remained unchanged. Authorized
booking, estimate, parts, repair and QC counterparts still passed. No migration,
RLS policy, grant or application authorization code changed in I02.

The Cloud RLS audit now recognizes the already-approved
`20261010110000_f08_estimate_catalog.sql` migration and its guarded private
`list_estimate_catalog_impl` helper in the exact migration/function allowlists.
This is a test-contract correction to the applied schema, not a privilege change.
See [I02 verification](verification/i02/README.md).

## Global Rules

- All primary keys are UUID unless explicitly justified later.
- All timestamps are `timestamptz` in UTC; display in Asia/Karachi or shop timezone.
- All money is whole integer PKR.
- Critical workflow writes happen through vetted transactional RPCs, not arbitrary client updates.
- History is append-only.
- Staff and services are soft-deactivated, not deleted.
- Bookings with history are not deleted.
- A shop is the tenant and organization boundary; do not add a parallel
  `organizations` table for owner onboarding.
- Account-type and requested-role query values are navigation hints, never stored
  authority. Shop authorization continues to come only from ownership and active
  `shop_memberships` rows.

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
- Publishing a shop must be rejected unless current database state proves at
  least one valid working window, one active service, an active OWNER membership
  for the authoritative owner, and active same-shop `SA`, `TECHNICIAN`, `PARTS`,
  and `QC` memberships.
- Owner-onboarding shop creation must explicitly create an unpublished shop.
  Public projections continue to exclude all unpublished shops without weakening
  base-table RLS.

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
- Publication readiness is checked inside the guarded shop mutation transaction.
  A client-computed readiness flag or checklist is never trusted.
- Staff Auth provisioning remains server-admin-only and membership attachment
  remains owner-authorized. Public signup cannot create staff memberships.

## MT01 Onboarding Data Decision

MT01 adds no table, column, enum, role, or status. Resumable setup uses existing
authoritative state:

- no owner membership means the first shop has not been created;
- an owned shop with `active = false` is an unpublished setup in progress;
- `working_hours`, `services`, and `shop_memberships` supply readiness facts;
- a shop with `active = true` is published only after the guarded readiness check
  succeeds.

This avoids duplicating tenancy or storing a client-controlled onboarding state.
If later implementation proves that operational closure and publication must be
represented independently, that is a schema-contract change requiring explicit
approval rather than overloading a newly invented value in MT01.

## MT03 Publication Readiness Enforcement

Migration `20261010130000_mt03_shop_publication_readiness.sql` adds a private
`BEFORE UPDATE OF active` trigger on `shops`. A false-to-true publication attempt
is rejected with SQLSTATE `BF001` unless current database state has a nonempty
working window, an active service, the active authoritative OWNER membership,
and active same-shop `SA`, `TECHNICIAN`, `PARTS`, and `QC` memberships. The trigger
uses only authoritative rows and exposes no client-executable helper privilege.

Owner-onboarding creation explicitly sends `active:false`; public views therefore
hide the workshop throughout setup. Existing published shops and disposable seed
fixtures are unchanged by migration application. Deactivation remains permitted,
and reactivation must satisfy the same readiness invariant.

## Open Questions

- Enums are `shop_role`, `booking_status`, `estimate_state`, `estimate_item_kind`,
  and `purchase_order_status`; Customer is global identity, not a shop role.
- Generated types live in `frontend/src/lib/supabase/database.types.ts` and are
  emitted by the Supabase CLI from applied PostgreSQL schema.
- B06-B08 implement guarded membership/role checks, workflow locks, sent estimate
  snapshots and exactly-once allocation/release. Non-booking receipts remain future work.
- `estimate_items` and `purchase_order_items` include `shop_id` to support composite
  FKs and tenant policies; `booking_services` has its own UUID primary key.
- Safe public views deliberately bypass base-table RLS via audited projections;
  anonymous users have no base-table grants. Draft estimates are staff-only.
- All ordinary client table writes are denied. B10 adds narrowly reviewed
  notification read markers through guarded RPCs only.

## B03 Narrow Auth/Team Operations

Migration `20261009100642_b03_auth_and_team.sql` adds self-only `sync_profile`,
owner-only `add_staff_membership`, and owner-only `edit_staff_membership`.
Public wrappers are SECURITY INVOKER; guarded elevated implementations remain
private with empty search paths. Authenticated EXECUTE grants cover only the
wrappers and their guarded implementations; the nested owner authorizer is not
client-executable. No table privileges or RLS policies change.

Profile name is display-only Auth metadata. Staff attachment requires Admin-only
markers binding the newly created Auth identity to the verified shop owner and
exact shop, and refuses existing memberships. Role/activation changes cannot
alter OWNER records or move membership identity/tenant. Owner rows and memberships
are locked throughout writes. Cloud application remains approval-gated; see
[B03 verification](../backend/docs/b03-auth-verification.md) for status and recovery.

## B04 Owner Catalog and Public Capacity

Migration `20261009121005_b04_public_catalog_and_slots.sql` adds authenticated
SECURITY INVOKER `save_shop` and `save_service`, backed by private guarded
SECURITY DEFINER implementations. Shop creation synchronizes the verified profile
and inserts shop plus OWNER membership in one transaction. Edits lock/recheck
authoritative ownership; staff cannot self-promote. Pure validation/grid/DTO
helpers have no ordinary-user EXECUTE grants. No tables, statuses, RLS policies or
base-table grants change.

The existing public slot view gains `capacity_remaining` and `local_date`.
It filters active shops, future instants, current configured working periods and
the next 14 local calendar days. Capacity is the clamped aggregate of
non-cancelled bookings; no underlying booking/customer fields are projected.
Anonymous callers retain only SELECT on public projections. Owner settings saves
generate deterministic slots with the existing unique `(shop_id,starts_at)` key,
preserve referenced records and reject changes invalidating non-cancelled future
appointments. See [B04 evidence](../backend/docs/b04-catalog-verification.md).

## B05 Atomic Booking Creation

Migration `20261009140203_b05_transactional_booking.sql` adds public SECURITY
INVOKER `create_booking(input jsonb)` and private guarded SECURITY DEFINER
`create_booking_impl`, both authenticated-only. A private DTO helper has no
ordinary-user EXECUTE. All search paths are empty and references qualified.
No public table, status, base-table grant or RLS read policy changes.

`private.booking_receipts` is the dedicated CREATE_BOOKING receipt namespace.
Its primary key is `(customer_id, idempotency_key)`; it stores the canonical
validated payload, unique booking FK and `created_at`. The action is implicit in
this booking-only table, satisfying uniqueness by actor/action/key. RLS is
enabled with no policies and all ordinary-user table privileges revoked. It is
outside the exposed API schemas. Receipts and business effects commit together;
failed intents leave no receipt. No automatic receipt expiration is implemented.

The operation requires READ COMMITTED and locks the Auth identity, then shop
FOR SHARE, then appointment slot FOR UPDATE. The shop lock follows B04's
shop-before-slot order and freezes publication, schedule, services and staff
changes. After lock acquisition it uses the current clock to recheck the local
14-day horizon, configured grid, duration/capacity and all non-CANCELLED bookings.
It validates active same-shop services before any business insert. The identity
lock serializes same-actor retries and own-vehicle lookup/creation; different
customers contend on the authoritative slot lock.

Only actor-owned vehicles with an uppercased/trimmed matching plate are eligible
for reuse, and their make/model/year/color/mileage must exactly match the
validated details. Existing records are never updated by this operation. A plate
belonging to another customer does not establish ownership; a separate actor-owned
vehicle can be created. The frozen payload accepts vehicle fields, not vehicle
IDs. New vehicles synchronize the actor's profile within the same transaction.

The operation inserts PENDING/state_version 0, selected booking_services, one
CREATE_BOOKING history event and one NEW_BOOKING notice per active same-shop SA,
then the receipt. A same-key/same-payload retry returns the current owning
booking state before schedule/capacity checks; a changed payload conflicts.
See [B05 evidence](../backend/docs/b05-booking-verification.md). Cloud application
and acceptance passed; no B06 transitions are added.

## B06 Booking State Engine

Migration `20261009151303_b06_booking_state_engine.sql` adds guarded booking
action/read RPCs and one private `booking_action_receipts` table. Public tables,
status names and direct table write denial remain unchanged. Action receipts are
scoped by actor/idempotency key and store canonical action payload plus the
resulting booking version; ordinary users have no table privileges.

`public.apply_booking_action(input jsonb)` accepts only named B06 actions:
`CONFIRM_BOOKING`, `ASSIGN_TECHNICIAN`, `START_INSPECTION` and `CANCEL_BOOKING`.
The private implementation locks the verified Auth identity and target booking,
checks current state, expected version, actor role or assignment, and then writes
status, version, history, notifications and receipt atomically. No generic
`setStatus` operation exists.

`public.get_booking`, `public.list_my_bookings` and `public.list_shop_bookings`
return guarded projections for authorized customers and shop roles. Customers see
their own jobs; OWNER/SA see shop jobs; technicians see assigned jobs. Unassigned
or inactive staff receive hidden/not-found behavior. See
[B06 evidence](../backend/docs/b06-actions-verification.md). B06 and B07 Cloud
application and acceptance have passed; see the B07 verification notes.

## B08 Parts and Inventory Operations

`20261009180000_b08_parts_workflow.sql` extends the existing private action
receipt allowlist and booking action implementation. It uses the B01 inventory,
purchase-order, order-item and allocation tables. No table, status, RLS policy
or direct table write grant is added. The existing public invoker action wrapper
continues to call its guarded private definer implementation.
`20261009180100_b08_lint_parts_payload.sql` is a forward correction for normalizer
volatility/JSON initialization and the same-state shortage-order notification.

Approved estimate requirements aggregate PART lines by part ID. The action
locks the actor identity, booking, actor/target memberships and required inventory
rows in UUID order. Parts transactions require READ COMMITTED so stock is checked
again after lock acquisition. Assigned active same-shop PARTS staff alone can
order, receive, mark readiness or allocate; OWNER/SA can only assign the parts
person. Existing approved SKUs remain usable after catalog soft deactivation.

Ordering changes no stock and cannot exceed the job's uncovered shortage after
existing unreceived order quantities. Receiving increments both order-item
received quantities and inventory atomically. Allocation verifies every required
part, deducts stock, creates one allocation per part and enters IN_REPAIR in the
same transaction. Labour-only jobs create no allocation rows. Cancellation
releases any pre-repair reservation once, and refuses jobs whose history already
contains IN_REPAIR. B08 itself creates allocations only when repair starts.

Inventory RPCs `save_inventory_part` and `list_inventory` are authenticated-only
invoker wrappers over guarded private definers. Only OWNER/PARTS can use them.
New SKUs may specify opening stock; catalog updates cannot overwrite stock.
SKU uniqueness protects repeated creates. Helpers have no client EXECUTE grants.
An additive `database.b08.ts` RPC type overlay preserves the user's generated
types file. See [B08 verification](../backend/docs/b08-parts-verification.md).

## B09 Repair, QC and Pickup Operations

`20261009190000_b09_repair_qc_pickup.sql` extends the shared guarded booking
action receipt namespace with repair, QC and pickup actions. Forward migration
`20261009190100_b09_qc_queue_payload_keys.sql` makes the QC queue helper accept
the payload key casing used by the Supabase client. B09 uses the existing
`qc_runs`, `qc_issues`, `notifications`, `booking_history` and booking assignment
columns. No table, role, status, RLS policy or direct table write grant is added.

Assigned active technicians alone can complete repair from `IN_REPAIR` into
`QC_PENDING`. Active same-shop QC users can list the unclaimed QC queue and the
first QC claimant atomically moves a job to `QC_IN_PROGRESS`. Only the claiming
QC user can pass or fail that run. Passing closes the run and moves the booking
to `READY_FOR_PICKUP`; failing closes the run, writes one issue, clears the QC
claim and returns the job to the same assigned technician in `IN_REPAIR`.
Completing repair again resolves open issues for that booking before requeueing QC.

OWNER/SA users can send the same-state ready-for-pickup notice from
`READY_FOR_PICKUP`; it is idempotent through the existing action receipt and does
not increment `state_version`. The owning customer or OWNER/SA can complete pickup,
which sets `COMPLETED` and `completed_at`.

## F08 Minimal Estimate Catalog Read

The user approved a booking-scoped technician catalog read. Forward migration
`20261010110000_f08_estimate_catalog.sql` adds public invoker
`list_estimate_catalog(input jsonb)` and its guarded private definer, with empty
search paths and authenticated-only EXECUTE grants. The function derives shop
from the booking and requires both exact technician assignment and an active
TECHNICIAN membership in that shop. It returns active part IDs, SKU and name only,
with deterministic 50-row pages and a total. Zero-stock items remain choices.
No costs, stock writes, policy changes, tables or columns are added; direct
inventory reads remain OWNER/PARTS only. Existing RLS-protected profile/vehicle
reads assemble nullable booking context after the get_booking guard succeeds.
Native tests verify role/tenant/revocation denial, spoofed inputs, zero stock,
paging and narrow function privileges. Cloud application is pending; see
[F08 database verification](../backend/docs/f08-estimate-catalog-verification.md).
