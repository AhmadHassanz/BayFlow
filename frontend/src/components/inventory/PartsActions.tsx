'use client';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { procurementRows, selectedPartQuantities } from '@/lib/booking/parts-desk';
import { bookingActionInput } from '@/lib/contracts/booking-actions';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { recordDate } from '@/lib/format';
import { InventoryLedger } from './InventoryLedger';

type PartsIntent = JobIntent & { before: Record<string, number> };
export function PartsActions({ booking, bookingId, shopId, actorId, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId: string; actorId: string; returnTo: string; refresh: () => void;
}) {
  const [intent, setIntent] = useState<PartsIntent | null>(null);
  const [orderQuantities, setOrderQuantities] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<Record<string, Record<string, string>>>({});
  const [supplier, setSupplier] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [before, setBefore] = useState<Record<string, number> | null>(null);
  const assigned = booking?.shopId === shopId && booking.partsUserId === actorId;
  const rows = booking && assigned ? procurementRows(booking) : null;
  const stage = !!booking && ['PARTS_PENDING', 'PARTS_ORDERED', 'PARTS_READY'].includes(booking.status);
  const sufficient = !!rows && rows.every(row => row.quantityOnHand >= row.quantityRequired);
  function choose(action: string, payload: object, title: string, summary: string) {
    if (!booking || !assigned || !rows || intent) return;
    try {
      const input = bookingActionInput.parse({ action, payload, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() });
      setError(''); setMessage('');
      setIntent({ input, title, summary, before: Object.fromEntries(rows.map(row => [row.partId, row.quantityOnHand])) });
    } catch { setError('Check the submitted quantities and supplier details.'); }
  }
  function order(event: FormEvent) {
    event.preventDefault();
    if (!rows || !stage || intent) return;
    try {
      const items = selectedPartQuantities(orderQuantities, new Map(rows.map(row => [row.partId, row.uncovered])));
      choose('ORDER_PARTS', { items, supplierName: supplier.trim() || null }, 'Order missing parts', `Create a purchase order for ${items.length} part${items.length === 1 ? '' : 's'}? Ordering does not add stock. Delivered quantities must be received separately.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check order quantities.'); }
  }
  function receive(event: FormEvent, orderId: string) {
    event.preventDefault();
    const purchaseOrder = booking?.purchaseOrders.find(item => item.id === orderId);
    if (!purchaseOrder || !stage || intent) return;
    try {
      const items = selectedPartQuantities(receipts[orderId] ?? {}, new Map(purchaseOrder.items.map(item => [item.partId, item.quantityOrdered - item.quantityReceived])));
      choose('RECEIVE_PARTS', { purchaseOrderId: orderId, items }, 'Receive delivered parts', `Record only the delivered quantities for purchase order ${orderId.slice(0, 8)}? Stock increases by these receipt deltas. Partial delivery can leave this job waiting for parts.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check received quantities.'); }
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {booking && assigned && <section className="job-actions parts-actions" aria-label="Parts preparation"><p className="eyebrow">Assigned parts work · Version {booking.stateVersion}</p><h2>Prepare. Receive. Allocate.</h2>
      {!rows ? <p className="form-error" role="alert">The approved estimate and parts requirements could not be verified. Refresh this record before preparing parts.</p>
        : <>{rows.length ? <ScrollableTable label="Approved parts requirements table"><table className="queue-table required-parts"><caption className="sr-only">Approved required parts, current stock and quantities still needed</caption><thead><tr><th scope="col">Approved part</th><th scope="col">Required</th><th scope="col">On hand</th><th scope="col">Allocated</th><th scope="col">Shortage</th><th scope="col">On order</th></tr></thead><tbody>{rows.map(row => <tr key={row.partId} className={row.shortageQuantity ? 'part-shortage' : ''}><td><strong>{row.name}</strong><span className="reference-caption">{row.partId.slice(0, 8)}</span>{before?.[row.partId] !== undefined && <span className="stock-snapshot">Before saved action: {before[row.partId]} · Current server stock: {row.quantityOnHand}</span>}</td><td>{row.quantityRequired}</td><td>{row.quantityOnHand}</td><td>{row.quantityAllocated}</td><td>{row.shortageQuantity ? `${row.shortageQuantity} short` : 'No shortage'}</td><td>{row.outstanding}</td></tr>)}</tbody></table></ScrollableTable>
          : <p className="fine-print">The approved estimate is labour-only. Record readiness and allocate to release the job into repair; no stock is deducted.</p>}
          {stage && <div className="parts-readiness"><p className="fine-print">Readiness checks availability without reserving stock. Allocation rechecks stock and deducts the approved quantities atomically.</p>
            {booking.status !== 'PARTS_READY' && <button className="button" disabled={!!intent || !sufficient} onClick={() => choose('MARK_PARTS_READY', {}, 'Mark parts ready', 'Confirm the required parts are available for this visit? Stock is checked on the server and remains on the shelf until allocation.')}>Mark parts ready</button>}
            {booking.status === 'PARTS_READY' && <button className="button" disabled={!!intent || !sufficient} onClick={() => choose('ALLOCATE_PARTS', {}, 'Allocate parts and release to repair', 'Allocate all approved required parts to this job? The server rechecks stock, deducts it once and releases the assigned technician to repair.')}>Allocate parts and release to repair</button>}
            {!sufficient && <p className="shortage-note">Required stock is still missing. Receive or order the uncovered shortage before allocation.</p>}
          </div>}
          {stage && rows.some(row => row.uncovered > 0) && <form className="parts-order-form" onSubmit={order} noValidate><fieldset disabled={!!intent}><legend>Purchase the uncovered shortage</legend><p className="fine-print">Maximums subtract current stock and undelivered quantities already ordered for this job. Leave a line blank to omit it.</p>
            <label htmlFor="parts-supplier">Supplier name (optional)</label><input id="parts-supplier" maxLength={200} value={supplier} onChange={event => { setSupplier(event.target.value); setError(''); }} />
            {rows.filter(row => row.uncovered > 0).map(row => <label key={row.partId}>Order quantity · {row.name}<span className="field-hint">Uncovered: {row.uncovered}</span><input inputMode="numeric" pattern="[0-9]*" aria-label={`Order quantity ${row.name}`} value={orderQuantities[row.partId] ?? ''} onChange={event => { setOrderQuantities({ ...orderQuantities, [row.partId]: event.target.value }); setError(''); }} /></label>)}
            <button className="button" type="submit">Order missing parts</button></fieldset></form>}
          <div className="purchase-orders"><h3>Purchase orders on record</h3>{booking.purchaseOrders.length ? booking.purchaseOrders.map(purchaseOrder => <article key={purchaseOrder.id} aria-label={`Purchase order ${purchaseOrder.id.slice(0, 8)}`}><p className="eyebrow">Order {purchaseOrder.id.slice(0, 8)} · {purchaseOrder.status.replaceAll('_', ' ')}</p><p>{purchaseOrder.supplierName || 'No supplier name recorded'} · {recordDate(purchaseOrder.orderedAt)} PKT</p>
            <form onSubmit={event => receive(event, purchaseOrder.id)} noValidate><fieldset disabled={!!intent || !stage}><legend className="sr-only">Receive this purchase order</legend>{purchaseOrder.items.map(item => <div className="receipt-line" key={item.id}><div><strong>{rows.find(row => row.partId === item.partId)?.name || item.partId}</strong><p>Ordered {item.quantityOrdered} · Received {item.quantityReceived} · Remaining {item.quantityOrdered - item.quantityReceived}</p></div>
              {stage && item.quantityReceived < item.quantityOrdered && <label>Delivered now<input inputMode="numeric" pattern="[0-9]*" aria-label={`Delivered now ${purchaseOrder.id.slice(0, 8)} ${item.partId.slice(0, 8)}`} value={receipts[purchaseOrder.id]?.[item.partId] ?? ''} onChange={event => { setReceipts({ ...receipts, [purchaseOrder.id]: { ...receipts[purchaseOrder.id], [item.partId]: event.target.value } }); setError(''); }} /></label>}</div>)}
              {stage && purchaseOrder.items.some(item => item.quantityReceived < item.quantityOrdered) && <button className="button button-outline" type="submit">Receive this delivery</button>}</fieldset></form>
          </article>) : <p className="fine-print">No purchase orders were created for this visit.</p>}</div>
          <details className="parts-stock-reference"><summary>Inspect workshop SKU and stock ledger</summary><InventoryLedger shopId={shopId} /></details>
        </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={shopId} returnTo={returnTo} close={() => setIntent(null)} refresh={refresh}
      succeeded={text => { setBefore(intent.before); setMessage(text); setOrderQuantities({}); setReceipts({}); setSupplier(''); }} />}
  </>;
}
