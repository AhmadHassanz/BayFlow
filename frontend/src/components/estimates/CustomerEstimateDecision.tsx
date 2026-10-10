'use client';
import { useState } from 'react';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { customerCanDecide, latestEstimate } from '@/lib/booking/estimate-review';
import { moneyPkr } from '@/lib/format';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { bookingActionInput } from '@/lib/contracts/booking-actions';

export function CustomerEstimateDecision({ booking, bookingId, customerId, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; customerId: string; returnTo: string; refresh: () => void;
}) {
  const [intent, setIntent] = useState<(JobIntent & { shopId: string }) | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canDecide = booking && customerCanDecide(booking, customerId);
  const latest = booking ? latestEstimate(booking) : null;
  function choose(action: 'APPROVE_ESTIMATE' | 'REJECT_ESTIMATE') {
    if (!booking || !canDecide || !latest || intent) return;
    if (action === 'REJECT_ESTIMATE' && reason.trim().length > 500) { setError('Use at most 500 characters for the reason.'); return; }
    setError('');
    setMessage('');
    const input = bookingActionInput.parse(action === 'APPROVE_ESTIMATE'
      ? { action, payload: {}, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() }
      : { action, payload: reason.trim() ? { reason: reason.trim() } : {}, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() });
    setIntent({ input, shopId: booking.shopId,
      title: action === 'APPROVE_ESTIMATE' ? 'Approve estimate' : 'Decline estimate',
      summary: action === 'APPROVE_ESTIMATE'
        ? `Authorize the work in revision ${latest.revisionNo} for ${moneyPkr(latest.subtotalPkr)}? Approval gives the workshop permission to repair. No payment is collected.`
        : `Decline revision ${latest.revisionNo} for ${moneyPkr(latest.subtotalPkr)}? The advisor will review your decision.${reason.trim() ? ` Reason: ${reason.trim()}` : ''}`,
    });
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {canDecide && latest && <section className="customer-estimate-decision" aria-label="Estimate decision"><p className="eyebrow">Your decision · Revision {latest.revisionNo}</p>
      <h2>Review the work. Choose the next step.</h2><p>Review the recorded parts, labour and total below. Approval authorizes this repair; no payment is collected.</p>
      <div className="estimate-decision-actions"><button className="button" disabled={!!intent} onClick={() => choose('APPROVE_ESTIMATE')}>Approve estimate · {moneyPkr(latest.subtotalPkr)}</button></div>
      <details className="estimate-decline"><summary>Decline this estimate</summary><label htmlFor="estimate-decline-reason">Reason for declining (optional)</label><textarea id="estimate-decline-reason" maxLength={500} value={reason} disabled={!!intent} onChange={event => { setReason(event.target.value); setError(''); }} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-outline danger-button" disabled={!!intent} onClick={() => choose('REJECT_ESTIMATE')}>Decline estimate</button></details>
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={intent.shopId} returnTo={returnTo} close={() => setIntent(null)} refresh={refresh} succeeded={setMessage} />}
  </>;
}
