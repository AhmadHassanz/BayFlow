'use client';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Membership } from '@/lib/contracts/auth';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { buildReviewPayload, latestEstimate, reviewDraft, reviewPreview, type ReviewDraft, type ReviewRow } from '@/lib/booking/estimate-review';
import { moneyPkr } from '@/lib/format';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { EstimateSnapshotView } from './EstimateLedger';
import { bookingActionInput } from '@/lib/contracts/booking-actions';

export function AdvisorEstimateReview({ booking, bookingId, shopId, role, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId: string; role: Membership['role']; returnTo: string; refresh: () => void;
}) {
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [intent, setIntent] = useState<JobIntent | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const rowNumber = useRef(0);
  const latest = booking ? latestEstimate(booking) : null;
  const authorized = (role === 'OWNER' || role === 'SA') && booking?.shopId === shopId;
  const mode = authorized && booking?.status === 'ESTIMATE_REVIEW' && latest?.state === 'REVIEW' ? 'SEND_ESTIMATE'
    : authorized && booking?.status === 'ESTIMATE_REJECTED' && latest?.state === 'REJECTED' ? 'REVISE_ESTIMATE' : null;
  const stale = !!draft && !!booking && (booking.stateVersion !== draft.version || latest?.id !== draft.source.id || !mode);
  const total = draft ? reviewPreview(draft.rows) : null;
  function begin() {
    if (!booking || !latest || !mode || intent) return;
    setDraft(reviewDraft(booking, latest)); setError(''); setMessage('');
  }
  function update(key: string, patch: Partial<ReviewRow>) {
    setDraft(current => current ? { ...current, rows: current.rows.map(row => row.key === key ? { ...row, ...patch } : row) } : null);
    setError('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!booking || !draft || !mode || stale || intent) return;
    try {
      const payload = buildReviewPayload(draft);
      const input = bookingActionInput.parse({ action: mode, expectedVersion: draft.version, idempotencyKey: crypto.randomUUID(), payload });
      if (JSON.stringify(input).length > 16384) throw new Error('Shorten the notes or descriptions: the request exceeds 16,384 characters.');
      setError(''); setMessage('');
      setIntent({ input, title: mode === 'SEND_ESTIMATE' ? 'Send estimate to customer' : 'Create revised estimate',
        summary: mode === 'SEND_ESTIMATE'
          ? `Send revision ${draft.source.revisionNo} with ${payload.items.length} items? Preview: ${moneyPkr(Number(total))}. Sending freezes the server-calculated snapshot and requests the customer’s decision.`
          : `Create a new revision from declined revision ${draft.source.revisionNo}? Preview: ${moneyPkr(Number(total))}. The previous revision stays on record. Review the saved new revision before sending it.`,
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the estimate fields.'); }
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {booking && mode && latest && <section className="advisor-estimate-review" aria-label="Advisor estimate review"><p className="eyebrow">Advisor review · Revision {latest.revisionNo}</p>
      <h2>{mode === 'REVISE_ESTIMATE' ? 'Revise the declined estimate.' : 'Check the scope. Send the estimate.'}</h2>
      <p>{mode === 'REVISE_ESTIMATE' ? 'Create a new review revision while preserving the customer’s declined snapshot.' : 'Review the recorded diagnosis and itemized source before sending a fixed snapshot to the customer.'}</p>
      <EstimateSnapshotView estimate={draft && !stale ? draft.source : latest} label="Review source" />
      {!draft && <button className="button" onClick={begin}>Review and edit estimate</button>}
      {draft && <form className="estimate-editor advisor-review-editor" onSubmit={submit} noValidate>
        {stale && <p className="form-error" role="alert">The server record changed. Your draft was kept, but it cannot be submitted. Reset to the latest server revision before continuing.</p>}
        <div className="review-draft-heading"><h3>Advisor edits</h3><button type="button" className="text-button" disabled={!!intent} onClick={begin}>Reset to server revision</button></div>
        <fieldset disabled={!!intent || stale}><legend className="sr-only">Editable estimate revision</legend>
          <p className="fine-print">Unsaved edits stay in this tab through record refresh; page reload clears them. Recorded PART identities stay attached. Adjust descriptions, quantities and prices, remove lines or add labour.</p>
          <label htmlFor="advisor-diagnosis">Diagnosis notes</label><textarea id="advisor-diagnosis" minLength={3} maxLength={4000} value={draft.diagnosis} onChange={event => { setDraft({ ...draft, diagnosis: event.target.value }); setError(''); }} required />
          <ol className="estimate-rows">{draft.rows.map((row, index) => <li key={row.key}><div className="estimate-row-title"><strong>Item {String(index + 1).padStart(2, '0')} · {row.kind === 'PART' ? 'Part' : 'Labour'}</strong>
            <button className="text-button" type="button" disabled={draft.rows.length === 1} aria-label={`Remove review item ${index + 1}`} onClick={() => { setDraft({ ...draft, rows: draft.rows.filter(item => item.key !== row.key) }); setError(''); }}>Remove item</button></div>
            <div className="estimate-row-fields"><label className="estimate-description">Review item {index + 1} description<input maxLength={500} value={row.description} onChange={event => update(row.key, { description: event.target.value })} required /></label>
              <label>Review item {index + 1} quantity<input inputMode="numeric" pattern="[0-9]*" value={row.quantity} onChange={event => update(row.key, { quantity: event.target.value })} required /></label>
              <label>Review item {index + 1} unit price (PKR)<input inputMode="numeric" pattern="[0-9]*" value={row.price} onChange={event => update(row.key, { price: event.target.value })} required /></label>
              <div className="estimate-line-preview"><span>Line preview</span><strong>{reviewPreview([row]) === null ? 'Enter whole numbers' : reviewPreview([row])! > 2147483647n ? 'Over server limit' : moneyPkr(Number(reviewPreview([row])))}</strong></div></div>
          </li>)}</ol>
          <button type="button" className="button button-outline" disabled={draft.rows.length >= 100} onClick={() => {
            const key = `new-labour-${++rowNumber.current}`;
            setDraft({ ...draft, rows: [...draft.rows, { key, kind: 'LABOUR', partId: null, description: '', quantity: '1', price: '' }] }); setError('');
          }}>Add labour item</button>
          <div className="estimate-total"><div><p className="eyebrow">Advisor estimate preview · PKR</p><p>The server calculates the saved total.</p></div><strong aria-live="polite">{total === null ? 'Incomplete' : total > 2147483647n ? 'Over server limit' : moneyPkr(Number(total))}</strong></div>
          {error && <p className="form-error" role="alert">{error}</p>}<button className="button" type="submit">{mode === 'SEND_ESTIMATE' ? 'Send estimate to customer' : 'Create revised estimate'}</button>
        </fieldset></form>}
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={shopId} returnTo={returnTo} close={() => setIntent(null)} refresh={refresh}
      succeeded={text => { setMessage(text); setDraft(null); }} />}
  </>;
}
