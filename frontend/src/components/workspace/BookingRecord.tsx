'use client';
import { useCallback } from 'react';
import { getBookingReceipt, BookingReadError } from '@/lib/api/booking';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { statusInfo } from '@/lib/booking/status';
import { recordDate } from '@/lib/format';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from './AccessFeedback';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { estimatesBelongToBooking } from '@/lib/booking/estimate-review';
import { EstimateLedger } from '@/components/estimates/EstimateLedger';
import { CustomerEstimateDecision } from '@/components/estimates/CustomerEstimateDecision';
import { ReadyPickupActions } from '@/components/qc/ReadyPickupActions';
import { QcRecord } from '@/components/qc/QcRecord';
import { qcContextMatches } from '@/lib/booking/qc-workbench';
export { recordDate } from '@/lib/format';

export function StatusChip({ status }: { status: keyof typeof statusInfo }) { return <span className={`booking-status status-${status.toLowerCase()}`}>{statusInfo[status].label}</span>; }
export function BookingRecord({ id, customerId, shopId, returnTo }: { id: string; customerId?: string; shopId?: string; returnTo: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await getBookingReceipt(id, signal);
    if (data.id !== id || (customerId && data.customerId !== customerId) || (shopId && data.shopId !== shopId) || !estimatesBelongToBooking(data) || !qcContextMatches(data)) throw new BookingReadError(404, 'NOT_FOUND');
    return data;
  }, [id, customerId, shopId]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  return <>
    {customerId && <CustomerEstimateDecision booking={state.kind === 'success' ? state.data : null} bookingId={id} customerId={customerId} returnTo={returnTo} refresh={retry} />}
    {customerId && <ReadyPickupActions booking={state.kind === 'success' ? state.data : null} bookingId={id} customerId={customerId} returnTo={returnTo} refresh={retry} />}
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading booking history…" /> : state.kind === 'error'
      ? <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} />
      : <BookingRecordView booking={state.data} refresh={retry} customer={!!customerId} />}
  </>;
}

export function BookingRecordView({ booking, refresh, customer = false, qcIssuesAlreadyShown = false }: { booking: JobRecord; refresh: () => void; customer?: boolean; qcIssuesAlreadyShown?: boolean }) {
  const info = statusInfo[booking.status];
  const history = [...booking.history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  return <>
    <div className="record-topline"><StatusChip status={booking.status} /><button className="text-button" onClick={refresh}>Refresh record ↻</button></div>
    <div className="record-grid"><section>
      <div className="next-step"><p className="eyebrow">Next step · {info.owner}</p><h2>{info.label}</h2><p>{info.next}</p></div>
      <div className="ledger-section"><p className="eyebrow">The original concern</p><p className="concern-text">{booking.symptomNotes || 'No additional symptoms were reported.'}</p>
        <dl className="record-metadata"><div><dt>Booking reference</dt><dd>{booking.id}</dd></div><div><dt>Recorded</dt><dd>{recordDate(booking.createdAt)} · PKT</dd></div>
          {booking.completedAt && <div><dt>Completed</dt><dd>{recordDate(booking.completedAt)} · PKT</dd></div>}</dl>
      </div>
      <section className="ledger-section" aria-label="Saved itemized estimates"><p className="eyebrow">Estimate record</p>{booking.estimates.length ? <><h2>On your record</h2><EstimateLedger estimates={booking.estimates} customer={customer} /></>
        : <EmptyState title="No estimate yet">An estimate will appear here when it is available to your account.</EmptyState>}</section>
      <QcRecord booking={booking} showIssues={!qcIssuesAlreadyShown} />
    </section>
    <aside className="timeline-panel"><p className="eyebrow">Visit timeline</p><h2>The work, recorded.</h2>{history.length ? <ol className="booking-timeline">{history.map(entry => <li key={entry.id}>
      <time dateTime={entry.createdAt}>{recordDate(entry.createdAt)} · PKT</time><h3>{statusInfo[entry.toStatus].label}</h3><p>{entry.action.toLowerCase().replaceAll('_', ' ')}</p>{entry.note && <p className="timeline-note">{entry.note}</p>}
    </li>)}</ol> : <EmptyState title="No events yet">Your workshop’s recorded progress will appear here.</EmptyState>}</aside></div>
  </>;
}
