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
- QC claim locks booking and only succeeds if unclaimed `QC_PENDING`; competing QC gets HTTP 409.
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
