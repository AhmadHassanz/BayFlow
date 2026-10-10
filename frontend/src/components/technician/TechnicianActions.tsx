'use client';
import { useRef, useState } from 'react';
import type { JobRecord } from '@/lib/booking/advisor-actions';
import { buildEstimatePayload, estimatePreview, type EstimateRow } from '@/lib/booking/estimate-editor';
import { moneyPkr } from '@/lib/format';
import { JobActionDialog, type JobIntent } from '@/components/workspace/JobActionDialog';
import { CatalogPicker } from './CatalogPicker';
import { recordDate } from '@/components/workspace/BookingRecord';

const emptyRow = (key: string, kind: EstimateRow['kind']): EstimateRow => ({ key, kind, part: null, description: '', quantity: '1', price: '' });
export function TechnicianActions({ booking, bookingId, shopId, actorId, returnTo, refresh }: {
  booking: JobRecord | null; bookingId: string; shopId: string; actorId: string; returnTo: string; refresh: () => void;
}) {
  // Draft state stays mounted through authoritative refresh; it is never stored truth.
  const [diagnosis, setDiagnosis] = useState('');
  const [rows, setRows] = useState<EstimateRow[]>([emptyRow('first', 'LABOUR')]);
  const rowNumber = useRef(0);
  const [catalogRow, setCatalogRow] = useState<string | null>(null);
  const [repairNotes, setRepairNotes] = useState('');
  const [intent, setIntent] = useState<JobIntent | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const preview = estimatePreview(rows);
  const assigned = booking?.technicianUserId === actorId && booking.shopId === shopId;
  const openIssues = booking?.qcIssues.filter(issue => !issue.resolvedAt) ?? [];
  function update(key: string, values: Partial<EstimateRow>) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...values } : row)); setError('');
  }
  function choose(input: JobIntent['input'], title: string, summary: string) {
    if (!booking || !assigned || intent) return;
    if (JSON.stringify(input).length > 16384) {
      setError('This estimate exceeds the API request limit of 16,384 characters. Shorten the notes or item descriptions before submitting.'); return;
    }
    setMessage(''); setError(''); setIntent({ input, title, summary });
  }
  function submitEstimate(event: React.FormEvent) {
    event.preventDefault();
    if (!booking || !assigned || intent) return;
    try {
      const payload = buildEstimatePayload(diagnosis, rows);
      choose({ action: 'SUBMIT_ESTIMATE', expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID(), payload },
        'Submit estimate for review', `Submit ${payload.items.length} item${payload.items.length === 1 ? '' : 's'} for advisor review? Preview: ${moneyPkr(Number(preview))}. The server will calculate the saved total.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the estimate fields.'); }
  }
  return <>
    {message && <p className="action-success" role="status">{message}</p>}
    {booking && assigned && <section className="job-actions technician-actions" aria-label="Technician actions"><div className="action-heading"><p className="eyebrow">Assigned work · Version {booking.stateVersion}</p><h2>Your next workshop step.</h2></div>
      {booking.status === 'ASSIGNED' && <div className="action-row"><div><h3>Inspect the vehicle</h3><p>Read the reported concern and inspect the vehicle before preparing the diagnosis.</p></div>
        <button className="button" disabled={!!intent} onClick={() => choose({ action: 'START_INSPECTION', payload: {}, expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID() }, 'Start inspection', 'Record that you are starting the physical inspection?')}>Start inspection</button></div>}
      {booking.status === 'INSPECTING' && <form className="estimate-editor" onSubmit={submitEstimate} noValidate>
        <fieldset disabled={!!intent}><legend>Diagnosis and itemized estimate</legend><p className="fine-print" id="estimate-guidance">Whole integer PKR only. This draft stays in this tab until submitted; reloading the page clears it. The server calculates the saved total.</p>
          <label htmlFor="diagnosis-note">Diagnosis notes</label><textarea id="diagnosis-note" minLength={3} maxLength={4000} value={diagnosis} onChange={event => { setDiagnosis(event.target.value); setError(''); }} aria-describedby="estimate-guidance" required />
          <div className="estimate-item-heading"><h3>Work and materials</h3><span>{rows.length} / 100 items</span></div>
          <ol className="estimate-rows">{rows.map((row, index) => <li key={row.key}><div className="estimate-row-title"><strong>Item {String(index + 1).padStart(2, '0')}</strong>
            <button type="button" className="text-button" disabled={rows.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => { setRows(current => current.filter(item => item.key !== row.key)); if (catalogRow === row.key) setCatalogRow(null); setError(''); }}>Remove item</button></div>
            <div className="estimate-row-fields"><label>Item {index + 1} kind<select value={row.kind} onChange={event => update(row.key, { kind: event.target.value as EstimateRow['kind'], part: null, description: '' })}><option value="LABOUR">Labour</option><option value="PART">Part</option></select></label>
              {row.kind === 'PART' && <div className="estimate-part"><span>Workshop catalog part</span><button id={`catalog-trigger-${row.key}`} type="button" className="button button-outline" aria-label={`Select part for item ${index + 1}`} onClick={() => setCatalogRow(row.key)}>{row.part ? `${row.part.sku} · ${row.part.name}` : 'Choose catalog part'}</button></div>}
              <label className="estimate-description">Item {index + 1} description<input maxLength={500} value={row.description} onChange={event => update(row.key, { description: event.target.value })} required /></label>
              <label>Item {index + 1} quantity<input inputMode="numeric" pattern="[0-9]*" value={row.quantity} onChange={event => update(row.key, { quantity: event.target.value })} required /></label>
              <label>Item {index + 1} unit price (PKR)<input inputMode="numeric" pattern="[0-9]*" value={row.price} onChange={event => update(row.key, { price: event.target.value })} required /></label>
              <div className="estimate-line-preview"><span>Line preview</span><strong>{estimatePreview([row]) === null ? 'Enter whole numbers' : estimatePreview([row])! > 2147483647n ? 'Over server limit' : moneyPkr(Number(estimatePreview([row])))}</strong></div>
            </div></li>)}</ol>
          {catalogRow && <CatalogPicker key={catalogRow} bookingId={bookingId} returnTo={returnTo} close={() => { document.getElementById(`catalog-trigger-${catalogRow}`)?.focus(); setCatalogRow(null); }} select={part => {
            update(catalogRow, { part, description: part.name }); document.getElementById(`catalog-trigger-${catalogRow}`)?.focus(); setCatalogRow(null);
          }} />}
          <div className="estimate-add"><button type="button" className="button button-outline" disabled={rows.length >= 100} onClick={() => { setRows(current => [...current, emptyRow(`row-${++rowNumber.current}`, 'PART')]); setError(''); }}>Add part</button>
            <button type="button" className="button button-outline" disabled={rows.length >= 100} onClick={() => { setRows(current => [...current, emptyRow(`row-${++rowNumber.current}`, 'LABOUR')]); setError(''); }}>Add labour</button></div>
          <div className="estimate-total"><div><p className="eyebrow">Estimate preview · PKR</p><p>Server totals are authoritative after submission.</p></div><strong aria-live="polite">{preview === null ? 'Incomplete' : preview > 2147483647n ? 'Over server limit' : moneyPkr(Number(preview))}</strong></div>
          {error && <p className="form-error" role="alert">{error}</p>}<button className="button" type="submit">Submit estimate for review</button>
        </fieldset></form>}
      {booking.qcIssues.length > 0 && <div className="qc-rework" aria-label="Quality check issues"><p className="eyebrow">Quality feedback · {openIssues.length} open</p><h3>Recorded inspection issues</h3><ul>{booking.qcIssues.map(issue => <li key={issue.id}><strong>{issue.title}</strong><p>{issue.description}</p><time dateTime={issue.createdAt}>{recordDate(issue.createdAt)} · PKT</time><span>{issue.resolvedAt ? 'Resolved on resubmission' : 'Needs repair before resubmission'}</span></li>)}</ul></div>}
      {booking.status === 'IN_REPAIR' && <div className="repair-editor"><h3>{openIssues.length ? 'Fix and resubmit for QC' : 'Record completed repair'}</h3><p className="fine-print">Document the repair and checks performed. Submitting queues the visit for an independent quality inspection{openIssues.length ? ' and resolves its open issues' : ''}.</p>
        <label htmlFor="repair-notes">Repair notes</label><textarea id="repair-notes" minLength={3} maxLength={2000} value={repairNotes} onChange={event => setRepairNotes(event.target.value)} disabled={!!intent} />
        <button className="button" disabled={!!intent || repairNotes.trim().length < 3} onClick={() => choose({ action: 'COMPLETE_REPAIR', expectedVersion: booking.stateVersion, idempotencyKey: crypto.randomUUID(), payload: { notes: repairNotes.trim() } },
          openIssues.length ? 'Resubmit repair for QC' : 'Complete repair and send to QC', `Record this repair and queue an independent quality check? Notes: ${repairNotes.trim()}`)}>{openIssues.length ? 'Resubmit repair for QC' : 'Complete repair and send to QC'}</button></div>}
      {!['ASSIGNED', 'INSPECTING', 'IN_REPAIR'].includes(booking.status) && <p className="fine-print">No technician action is available at this stage. The timeline shows who takes the next step.</p>}
    </section>}
    {intent && <JobActionDialog intent={intent} bookingId={bookingId} shopId={shopId} returnTo={returnTo} close={() => setIntent(null)} refresh={refresh} succeeded={setMessage} />}
  </>;
}
