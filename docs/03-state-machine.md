# Booking State Machine

Do not change these status names without explicit approval. Do not add `CHECKED_IN`, `DIAGNOSING`, `PAID`, or `INVOICED` as core states.

## Statuses

- `PENDING`
- `CONFIRMED`
- `ASSIGNED`
- `INSPECTING`
- `ESTIMATE_REVIEW`
- `AWAITING_CUSTOMER`
- `ESTIMATE_APPROVED`
- `ESTIMATE_REJECTED`
- `PARTS_PENDING`
- `PARTS_ORDERED`
- `PARTS_READY`
- `IN_REPAIR`
- `QC_PENDING`
- `QC_IN_PROGRESS`
- `READY_FOR_PICKUP`
- `COMPLETED`
- `CANCELLED`

## Exact Transitions

| Current status | Actor + action | Next status / mandatory guard |
| --- | --- | --- |
| `PENDING` | SA: confirm | `CONFIRMED`; shop SA or owner authorized; no duplicate confirm |
| `CONFIRMED` | SA: assign technician | `ASSIGNED`; technician active in same shop |
| `ASSIGNED` | Assigned tech: start inspection | `INSPECTING`; only assigned technician |
| `INSPECTING` | Assigned tech: submit estimate | `ESTIMATE_REVIEW`; valid itemized estimate and labour/parts |
| `ESTIMATE_REVIEW` | SA: review/edit/send | `AWAITING_CUSTOMER`; fixed revision snapshot and timestamp |
| `AWAITING_CUSTOMER` | Owning customer: approve | `ESTIMATE_APPROVED`; latest `SENT` revision only; timestamp |
| `AWAITING_CUSTOMER` | Owning customer: reject | `ESTIMATE_REJECTED`; latest revision marked rejected |
| `ESTIMATE_REJECTED` | SA: revise/request revision | `ESTIMATE_REVIEW`; new revision, then resend |
| `ESTIMATE_REJECTED` | SA: cancel | `CANCELLED`; record reason |
| `ESTIMATE_APPROVED` | SA: assign parts person | `PARTS_PENDING`; parts person active in same shop |
| `PARTS_PENDING` | Assigned parts: order missing | `PARTS_ORDERED`; at least one shortage order item |
| `PARTS_PENDING` | Assigned parts: parts in stock | `PARTS_READY`; verified sufficient quantities |
| `PARTS_ORDERED` | Assigned parts: receive partial | Stays `PARTS_ORDERED`; receive quantity atomically; update PO status |
| `PARTS_ORDERED` | Assigned parts: all items available | `PARTS_READY`; after receipt stock satisfies job |
| `PARTS_READY` | Assigned parts: allocate | `IN_REPAIR`; deduct once atomically; require complete allocation |
| `IN_REPAIR` | Assigned tech: send to QC | `QC_PENDING`; include notes after repair |
| `QC_PENDING` | Any QC: claim job | `QC_IN_PROGRESS`; atomic first-claimer wins |
| `QC_IN_PROGRESS` | Claiming QC: pass | `READY_FOR_PICKUP`; QC record passed |
| `QC_IN_PROGRESS` | Claiming QC: fail | `IN_REPAIR`; QC issue required; same assigned technician |
| `READY_FOR_PICKUP` | SA: notify ready | Stays `READY_FOR_PICKUP`; create one customer notification idempotently |
| `READY_FOR_PICKUP` | Customer or SA: confirm pickup | `COMPLETED`; pickup recorded; final |
| Any pre-`IN_REPAIR` nonfinal state | Customer or SA: cancel | `CANCELLED`; reason required; release pre-repair reservations |
| `COMPLETED` / `CANCELLED` | Nobody | Terminal; no future state change |

## Special Rules

- Every state mutation is a named action.
- Route/RPC checks current state, actor role, shop membership, assignment, expected version, and domain prerequisites.
- Technician never approves estimates.
- SA never pretends to be customer.
- Staff visibility is not permission to trigger transitions.
- Estimate rejection creates `revision_no + 1`; do not mutate a sent/decided version.
- Slot booking locks `appointment_slots`, recounts non-cancelled bookings, and inserts only if capacity remains.
- Parts receipt updates `quantity_received` and `quantity_on_hand` in one transaction.
- Parts allocation validates per-part quantity, decrements stock once, writes allocations, and moves to `IN_REPAIR`.
- Cancellation is allowed only strictly before first `IN_REPAIR`.
- QC claim locks booking and only succeeds if unclaimed `QC_PENDING`. A stale visible request gets HTTP 409; once another inspector claims it, the losing actor's now-hidden job returns HTTP 404. The UI handles both with quality-desk refresh guidance (user-authorized F11 resolution, 2026-10-10).
- QC failure creates linked issue before transition back to `IN_REPAIR`.
- Booking history is inserted atomically with each status change.
- Same-state operations such as ready notification and receiving parts have audit entries or event records.
- `booking.state_version` increments on state changes; stale clients receive HTTP 409 and reload.

## Core Steps and Side Branches

Core 15-stage demonstration:

1. Customer creates booking in `PENDING`.
2. SA confirms to `CONFIRMED`.
3. SA assigns technician to `ASSIGNED`.
4. Technician starts inspection to `INSPECTING`.
5. Technician submits estimate to `ESTIMATE_REVIEW`.
6. SA sends estimate to `AWAITING_CUSTOMER`.
7. Customer approves to `ESTIMATE_APPROVED`.
8. SA assigns parts person to `PARTS_PENDING`.
9. Parts order or stock decision leads to `PARTS_ORDERED` or `PARTS_READY`.
10. Parts receipt can stay `PARTS_ORDERED` until complete.
11. Parts allocation moves to `IN_REPAIR`.
12. Technician sends to `QC_PENDING`.
13. QC claims to `QC_IN_PROGRESS`.
14. QC passes to `READY_FOR_PICKUP`.
15. Customer or SA confirms pickup to `COMPLETED`.

Required side branches:

- Customer rejects estimate: `AWAITING_CUSTOMER -> ESTIMATE_REJECTED -> ESTIMATE_REVIEW`.
- SA cancels from rejected estimate or pre-repair state: `CANCELLED`.
- Customer/SA cancels before `IN_REPAIR`: `CANCELLED`.
- QC fails: `QC_IN_PROGRESS -> IN_REPAIR -> QC_PENDING -> QC_IN_PROGRESS -> READY_FOR_PICKUP`.
- Ready notification is same-state and idempotent.
- Terminal statuses are immutable.

## B05 Creation Boundary

Creation is the audited CREATE_BOOKING action from null to PENDING with version
0. It inserts history, active same-shop SA notifications and an actor-scoped
idempotency receipt in the same transaction. Same-key retries return the current
owning booking without another creation event or version increment. The shop is
locked before the slot so owner schedule saves and bookings serialize consistently.
No confirm, cancel, assign or other B06 action endpoint is implemented by B05.

## B06 Implemented Boundary

B06 implements the first shared action mechanism for `CONFIRM_BOOKING`,
`ASSIGN_TECHNICIAN`, `START_INSPECTION` and `CANCEL_BOOKING`. Each action checks
the current state, expected version, actor role or technician assignment, writes
history, increments `state_version` and records an actor-scoped idempotency
receipt in the same transaction. It also adds role-scoped booking list/detail
reads needed by the later shop dashboards.

B07 implements the estimate portion of the same shared action mechanism.
Assigned technicians submit `INSPECTING -> ESTIMATE_REVIEW`, OWNER/SA users send
the reviewed estimate to `AWAITING_CUSTOMER`, and only the owning customer can
approve or reject it. Rejection preserves the sent version and OWNER/SA revision
creates `revision_no + 1` back in `ESTIMATE_REVIEW`. Technician approval and
foreign customer decisions are denied by the RPC. Parts, repair, QC and pickup
remain later phases.

## B08 Implemented Boundary

B08 implements ASSIGN_PARTS, MARK_PARTS_READY, ORDER_PARTS, RECEIVE_PARTS and
ALLOCATE_PARTS through the shared guarded action mechanism. Approved estimate
PART lines are aggregated by part ID. A labour-only estimate still follows the
parts assignment/readiness steps and enters IN_REPAIR without allocation rows.

Readiness is an availability check, not a reservation. Allocation locks all
required inventory rows, rechecks stock and deducts the complete requirement
exactly once. A competing job can consume stock after readiness; allocation
then returns STOCK_CONFLICT atomically. The assigned parts person may order the
new uncovered shortage while staying PARTS_READY, receive it and retry allocation.
Additional shortage orders in PARTS_ORDERED and receipts in PARTS_READY are also
same-state audited operations. No new booking or purchase-order status is added.

PO creation does not increase stock. Partial receipt increments inventory and
quantity_received once; PO state is PARTIALLY_RECEIVED or RECEIVED independently
of booking availability. Receipt moves PARTS_ORDERED to PARTS_READY only when
every required part is available. Same-state activity writes history and an
idempotency receipt but does not increment state_version. State transitions do.

Cancellation releases pre-repair reservations exactly once; it does not undo
already received physical stock or remove purchase orders. It also checks that
history has never reached IN_REPAIR. Repair, QC and pickup remain B09.

## B09 Implemented Boundary

B09 implements `COMPLETE_REPAIR`, `CLAIM_QC`, `PASS_QC`, `FAIL_QC`,
`NOTIFY_READY` and `COMPLETE_PICKUP` through the shared guarded action mechanism.
The assigned technician sends `IN_REPAIR` jobs to the unclaimed QC queue. Active
QC staff claim queued jobs atomically; the claimant alone can pass or fail.

QC failure creates a linked issue and returns the same booking to `IN_REPAIR`
without changing the technician assignment. The next `COMPLETE_REPAIR` resolves
open issues for that booking and queues it for another QC claim. QC pass moves
to `READY_FOR_PICKUP`; OWNER/SA ready notification is same-state and idempotent;
customer or OWNER/SA pickup completion moves to terminal `COMPLETED` and sets
`completed_at`. No new status is introduced.

## I03 Race and Edge Case Rehearsal

I03 verifies state transitions under actual concurrent PostgreSQL transactions,
not sequential requests or UI timing. Slot creation locks capacity so eight
parallel customers against capacity two produce exactly two bookings and six
conflicts. Same-key booking retries produce one complete operation. Competing
parts allocations serialize on stock; the loser receives `STOCK_CONFLICT` with
no allocation or deduction.

Parallel duplicate estimate approval and receipt requests reuse one idempotency
key. Both callers receive authoritative results, exactly one is a replay, and the
database contains one action receipt/history event; approval occurs once and stock
is added once. Two QC inspectors claiming the same queued booking produce exactly
one claimant and one open QC run. The losing claim is safely hidden with 404 or,
when still visible but stale, rejected with 409 according to the F11 amendment.

A live two-session stale-tab rehearsal confirms the HTTP/UI boundary: one advisor
confirmation commits with 201, the competing stale request receives 409
`STATE_CONFLICT`, and the losing dialog directs the user to reload. Reload shows
the authoritative status, one state-version increment and one history event. No
sleep-based coordination or UI-only lock is treated as a database invariant.




