'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { qcCanDecide, qcDecisionPayload, type QcCheck } from '@/lib/booking/qc-workbench';
import { bookingActionInput } from '@/lib/contracts/booking-actions';
import { BookingReadError } from '@/lib/api/booking';
import { jobActionFailure } from '@/lib/api/job-actions';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';

export function QcActions({ booking, bookingId, shopId, actorId, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId: string; actorId: string; returnTo: string; refresh: () => void;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<JobIntent | null>(null);
  const [checks, setChecks] = useState<QcCheck[]>([{ key: 'first', name: '', result: '' }]);
  const rowNumber = useRef(0);
  const confirmed = useRef(false);
  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [released, setReleased] = useState(false);
  const queuePath = `/shops/${shopId}/qc`;
  const sameShop = booking?.shopId === shopId;
  const canClaim = sameShop && booking?.status === 'QC_PENDING' && booking.qcClaimedBy === null;
  const canDecide = !!booking && sameShop && qcCanDecide(booking, actorId);
  const run = booking?.qcRuns.find(item => item.finishedAt === null && item.inspectorUserId === actorId);
  const stale = draftRunId !== null && run?.id !== draftRunId;
  const completeChecks = checks.length > 0 && checks.every(check => check.name.trim() && check.name.trim().length <= 80 && check.result);
  function begin() {
    if (!canDecide || !run || intent) return;
    setDraftRunId(run.id); setChecks([{ key: 'first', name: '', result: '' }]); setNotes(''); setTitle(''); setDescription(''); setError('');
  }
  function choose(action: 'CLAIM_QC' | 'PASS_QC' | 'FAIL_QC') {
    if (!booking || !sameShop || intent || released || (action === 'CLAIM_QC' ? !canClaim : !canDecide || !draftRunId || stale)) return;
    try {
      const payload = action === 'CLAIM_QC' ? {} : qcDecisionPayload(checks, notes, action === 'PASS_QC' ? 'PASS' : 'FAIL', title, description);
      const input = bookingActionInput.parse({ action, payload, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() });
      if (JSON.stringify(input).length > 16384) throw new Error('Shorten the inspection text: the request exceeds 16,384 characters.');
      confirmed.current = false; setError(''); setMessage('');
      setIntent({ input, title: action === 'CLAIM_QC' ? 'Claim quality inspection' : action === 'PASS_QC' ? 'Pass quality inspection' : 'Fail quality inspection',
        summary: action === 'CLAIM_QC' ? 'Claim this unclaimed inspection? The server allows only the first eligible claimant to proceed.'
          : action === 'PASS_QC' ? 'Record all completed checks as passed and release the vehicle for collection?'
            : `Record this QC failure and return the repair to its original technician? Issue: ${title.trim()} — ${description.trim()}`,
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the inspection fields.'); }
  }
  return <>
    <Link className="text-button" href={queuePath}>← Return to quality desk</Link>
    {message && <p className="action-success" role="status">{message}</p>}
    {booking && sameShop && !released && <section className="job-actions qc-actions" aria-label="Quality inspection"><p className="eyebrow">Independent quality check · Version {booking.stateVersion}</p><h2>Inspect before release.</h2>
      {canClaim && <><p>This inspection is unclaimed. Claim it before recording any decision.</p><button className="button" disabled={!!intent} onClick={() => choose('CLAIM_QC')}>Claim quality inspection</button></>}
      {canDecide && <>{!draftRunId ? <button className="button" onClick={begin}>Record inspection checks</button> : <>
        {stale && <p className="form-error" role="alert">The QC run changed. Start a fresh checklist for the current run.</p>}
        <button className="text-button" disabled={!!intent} onClick={begin}>Start a fresh checklist</button>
        <fieldset className="qc-check-editor" disabled={!!intent || stale}><legend>Record your checks</legend><p className="fine-print">Name each check performed and explicitly select its result. Passing is available only after every recorded check passes.</p>
          {checks.map((check, index) => <div className="qc-check-row" key={check.key}><label>Check {index + 1} name<input maxLength={80} value={check.name} onChange={event => { setChecks(current => current.map(item => item.key === check.key ? { ...item, name: event.target.value } : item)); setError(''); }} /></label>
            <label>Check {index + 1} result<select value={check.result} onChange={event => { setChecks(current => current.map(item => item.key === check.key ? { ...item, result: event.target.value as QcCheck['result'] } : item)); setError(''); }}><option value="">Not recorded</option><option value="PASS">Passed</option><option value="FAIL">Failed</option></select></label>
            <button type="button" className="text-button" disabled={checks.length === 1} aria-label={`Remove QC check ${index + 1}`} onClick={() => setChecks(current => current.filter(item => item.key !== check.key))}>Remove check</button></div>)}
          <button type="button" className="button button-outline" disabled={checks.length >= 50} onClick={() => { const key = `check-${++rowNumber.current}`; setChecks(current => [...current, { key, name: '', result: '' }]); }}>Add check</button>
          <label htmlFor="qc-notes">Inspection notes (optional)</label><textarea id="qc-notes" maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} />
          <div className="qc-failure-fields"><h3>Issue details for a failure</h3><label htmlFor="qc-issue-title">Issue title</label><input id="qc-issue-title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} />
            <label htmlFor="qc-issue-description">Issue description</label><textarea id="qc-issue-description" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></div>
          {error && <p className="form-error" role="alert">{error}</p>}<div className="qc-decision-buttons"><button className="button button-outline danger-button" type="button" disabled={!completeChecks || !title.trim() || !description.trim()} onClick={() => choose('FAIL_QC')}>Fail quality inspection</button>
            <button className="button" type="button" disabled={!completeChecks || checks.some(check => check.result !== 'PASS')} onClick={() => choose('PASS_QC')}>Pass quality inspection</button></div>
        </fieldset></>}
      </>}
      {!canClaim && !canDecide && <p className="fine-print">This inspection is no longer available to record here. Return to the quality desk and refresh its queue.</p>}
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={shopId} returnTo={returnTo} close={() => setIntent(null)}
      reloadLabel="Refresh quality desk" formatFailure={failure => failure instanceof BookingReadError && [404, 409].includes(failure.status)
        ? 'This inspection changed or is no longer available to your account. Refresh the quality desk to see eligible work.' : jobActionFailure(failure)}
      refresh={() => { if (confirmed.current && intent.input.action === 'CLAIM_QC') refresh(); else router.push(queuePath); }}
      succeeded={text => { confirmed.current = true; setMessage(text); if (intent.input.action !== 'CLAIM_QC') setReleased(true); }} />}
  </>;
}
