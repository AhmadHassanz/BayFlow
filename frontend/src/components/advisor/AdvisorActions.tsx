'use client';
import { useState } from 'react';
import { advisorActions, type JobRecord } from '@/lib/booking/advisor-actions';
import type { Membership } from '@/lib/contracts/auth';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { PartsAssignment } from '@/components/inventory/PartsAssignment';
import { AssignmentPicker } from '@/components/shared/AssignmentPicker';

export function AdvisorActions({ booking, bookingId, shopId, role, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId: string; role: Membership['role']; returnTo: string; refresh: () => void;
}) {
  const [intent, setIntent] = useState<JobIntent | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const actions = booking ? advisorActions(booking, role) : [];
  function choose(action: 'CONFIRM_BOOKING' | 'ASSIGN_TECHNICIAN' | 'CANCEL_BOOKING' | 'ASSIGN_PARTS', payload: object, title: string, summary: string) {
    if (!booking || intent) return;
    setMessage('');
    // Each confirmed intent owns one immutable key and version, including retries.
    setIntent({ input: { action, payload, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() } as JobIntent['input'], title, summary });
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {booking && <section className="job-actions" aria-label="Advisor actions"><div className="action-heading"><p className="eyebrow">Service desk · Version {booking.stateVersion}</p><h2>Move the visit forward.</h2></div>
      {actions.includes('CONFIRM_BOOKING') && <div className="action-row"><div><h3>Confirm this visit</h3><p>Accept the booking before assigning a technician.</p></div><button className="button" disabled={!!intent} onClick={() => choose('CONFIRM_BOOKING', {}, 'Confirm booking', 'Accept this booking into the workshop ledger?')}>Confirm booking</button></div>}
      {actions.includes('ASSIGN_TECHNICIAN') && <div className="action-row"><div><h3>Assign the inspection</h3><p>Only active technicians in this workshop are listed.</p></div><AssignmentPicker kind="TECHNICIAN" shopId={shopId} returnTo={returnTo} select={(id, label) => choose('ASSIGN_TECHNICIAN', { technicianUserId: id }, 'Assign technician', `Assign this visit to ${label}?`)} /></div>}
      {actions.includes('ASSIGN_PARTS') && <div className="action-row"><div><h3>Assign parts preparation</h3><p>The approved estimate is ready for a same-shop parts person.</p></div><PartsAssignment shopId={shopId} returnTo={returnTo} select={(id, label) => choose('ASSIGN_PARTS', { partsUserId: id }, 'Assign parts person', `Assign approved parts preparation to ${label}?`)} /></div>}
      {actions.includes('CANCEL_BOOKING') && <details className="cancel-booking"><summary>Cancel this visit</summary><p>Available before repair starts. A reason is recorded in the visit history.</p><label htmlFor="cancel-reason">Cancellation reason</label><textarea id="cancel-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
        <button className="button button-outline danger-button" disabled={!!intent || reason.trim().length < 3} onClick={() => choose('CANCEL_BOOKING', { reason: reason.trim() }, 'Cancel booking', `Cancel this visit? Reason: ${reason.trim()}`)}>Cancel booking</button></details>}
      {!actions.length && <p className="fine-print">There are no confirm, assignment or cancellation actions at this stage. Follow the recorded next step above.</p>}
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={shopId} returnTo={returnTo}
      close={() => setIntent(null)} refresh={refresh} succeeded={setMessage} />}
  </>;
}
