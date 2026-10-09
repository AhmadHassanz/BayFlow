'use client';
import { useCallback } from 'react';
import { getBookingReceipt, BookingReadError } from '@/lib/api/booking';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { statusInfo } from '@/lib/booking/status';
import { moneyPkr } from '@/lib/format';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from './AccessFeedback';

export function StatusChip({ status }: { status: keyof typeof statusInfo }) { return <span className={`booking-status status-${status.toLowerCase()}`}>{statusInfo[status].label}</span>; }
export function recordDate(value: string) {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(value));
}
export function BookingRecord({ id, customerId, shopId, returnTo }: { id: string; customerId?: string; shopId?: string; returnTo: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await getBookingReceipt(id, signal);
    if ((customerId && data.customerId !== customerId) || (shopId && data.shopId !== shopId)) throw new BookingReadError(404, 'NOT_FOUND');
    return data;
  }, [id, customerId, shopId]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  if (state.kind === 'loading') return <LoadingSkeleton label="Loading booking history…" />;
  if (state.kind === 'error') return <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} />;
  const booking = state.data;
  const info = statusInfo[booking.status];
  const history = [...booking.history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  return <><div className="record-topline"><StatusChip status={booking.status} /><button className="text-button" onClick={retry}>Refresh record ↻</button></div><div className="record-grid"><section><div className="next-step"><p className="eyebrow">Next step · {info.owner}</p><h2>{info.label}</h2><p>{info.next}</p></div><div className="ledger-section"><p className="eyebrow">The original concern</p><p className="concern-text">{booking.symptomNotes || 'No additional symptoms were reported.'}</p><dl className="record-metadata"><div><dt>Booking reference</dt><dd>{booking.id}</dd></div><div><dt>Recorded</dt><dd>{recordDate(booking.createdAt)} · PKT</dd></div>{booking.completedAt && <div><dt>Completed</dt><dd>{recordDate(booking.completedAt)} · PKT</dd></div>}</dl></div><div className="ledger-section"><p className="eyebrow">Estimate record</p>{booking.estimates.length ? <><h2>On your record</h2>{booking.estimates.map(estimate => <div className="estimate-summary" key={estimate.id}><div><strong>Revision {estimate.revisionNo}</strong><span>{estimate.state.replaceAll('_', ' ')}</span></div><p>{estimate.diagnosisNote}</p><strong>{moneyPkr(estimate.subtotalPkr)}</strong></div>)}<p className="fine-print">Contact the workshop to review or discuss this estimate.</p></> : <EmptyState title="No estimate yet">An estimate will appear here when it is available to your account.</EmptyState>}</div></section><aside className="timeline-panel"><p className="eyebrow">Visit timeline</p><h2>The work, recorded.</h2>{history.length ? <ol className="booking-timeline">{history.map(entry => <li key={entry.id}><time dateTime={entry.createdAt}>{recordDate(entry.createdAt)} · PKT</time><h3>{statusInfo[entry.toStatus].label}</h3><p>{entry.action.toLowerCase().replaceAll('_', ' ')}</p>{entry.note && <p className="timeline-note">{entry.note}</p>}</li>)}</ol> : <EmptyState title="No events yet">Your workshop’s recorded progress will appear here.</EmptyState>}</aside></div></>;
}
