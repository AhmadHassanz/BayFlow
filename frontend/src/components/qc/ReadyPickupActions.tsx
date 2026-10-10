'use client';
import { useState } from 'react';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import type { Membership } from '@/lib/contracts/auth';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { recordDate } from '@/lib/format';

export function ReadyPickupActions({ booking, bookingId, shopId, customerId, role, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId?: string; customerId?: string; role?: Membership['role']; returnTo: string; refresh: () => void;
}) {
  const [intent, setIntent] = useState<(JobIntent & { shopId: string }) | null>(null);
  const [message, setMessage] = useState('');
  const advisor = (role === 'OWNER' || role === 'SA') && booking?.shopId === shopId;
  const customer = !!customerId && booking?.customerId === customerId;
  const ready = !!booking && booking.status === 'READY_FOR_PICKUP' && (advisor || customer);
  const notice = booking?.history.filter(event => event.action === 'NOTIFY_READY').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  function choose(action: 'NOTIFY_READY' | 'COMPLETE_PICKUP') {
    if (!booking || !ready || intent || (action === 'NOTIFY_READY' && (!advisor || notice))) return;
    setMessage('');
    setIntent({ shopId: booking.shopId, input: { action, payload: {}, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() },
      title: action === 'NOTIFY_READY' ? 'Notify customer ready' : 'Confirm vehicle pickup',
      summary: action === 'NOTIFY_READY' ? 'Send the customer an in-app notice that this vehicle is ready for collection?'
        : 'Confirm that the vehicle has been collected? This completes the visit and makes its workflow final. No payment is collected here.',
    });
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {ready && <section className="job-actions pickup-actions" aria-label="Ready and pickup"><p className="eyebrow">Quality passed · Collection</p><h2>Ready for the handover.</h2><p>Arrange collection and record pickup once the vehicle has been collected.</p>
      {notice && <p className="ready-notice-record">Ready notice recorded · <time dateTime={notice.createdAt}>{recordDate(notice.createdAt)} PKT</time></p>}
      <div className="pickup-buttons">{advisor && !notice && <button className="button button-outline" disabled={!!intent} onClick={() => choose('NOTIFY_READY')}>Notify customer ready</button>}
        <button className="button" disabled={!!intent} onClick={() => choose('COMPLETE_PICKUP')}>Confirm vehicle pickup</button></div>
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={intent.shopId} returnTo={returnTo} close={() => setIntent(null)} refresh={refresh} succeeded={setMessage} />}
  </>;
}
