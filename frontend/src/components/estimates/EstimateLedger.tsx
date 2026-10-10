import { ScrollableTable } from '@/components/shared/ScrollableTable';
import type { EstimateSnapshot } from '@/lib/booking/estimate-review';
import { moneyPkr, recordDate } from '@/lib/format';

export function EstimateSnapshotView({ estimate, label = 'Recorded estimate' }: { estimate: EstimateSnapshot; label?: string }) {
  return <article className="estimate-snapshot" aria-label={`${label} revision ${estimate.revisionNo}`}>
    <div className="estimate-snapshot-heading"><h4>Revision {estimate.revisionNo}</h4><span className="role-badge">{estimate.state}</span></div>
    <p className="estimate-diagnosis">{estimate.diagnosisNote}</p>
    <ScrollableTable label="Recorded estimate item table"><table className="queue-table estimate-snapshot-table"><caption className="sr-only">{label} revision {estimate.revisionNo} itemized amounts in whole PKR</caption>
      <thead><tr><th scope="col">Work / material</th><th scope="col">Qty</th><th scope="col">Unit · PKR</th><th scope="col">Line · PKR</th></tr></thead>
      <tbody>{estimate.items.map(item => <tr key={item.id}><td><span className="reference-caption">{item.kind === 'PART' ? 'Part' : 'Labour'}</span><strong>{item.descriptionSnapshot}</strong></td>
        <td>{item.quantity}</td><td>{moneyPkr(item.unitPricePkr)}</td><td>{moneyPkr(item.lineTotalPkr)}</td></tr>)}</tbody></table></ScrollableTable>
    {!estimate.items.length && <p className="fine-print">No itemized lines were returned for this revision.</p>}
    <div className="estimate-snapshot-total"><span>Recorded server total</span><strong>{moneyPkr(estimate.subtotalPkr)}</strong></div>
    <dl className="estimate-dates"><div><dt>Created · PKT</dt><dd><time dateTime={estimate.createdAt}>{recordDate(estimate.createdAt)}</time></dd></div>
      {estimate.sentAt && <div><dt>Sent · PKT</dt><dd><time dateTime={estimate.sentAt}>{recordDate(estimate.sentAt)}</time></dd></div>}
      {estimate.decidedAt && <div><dt>{estimate.state === 'APPROVED' ? 'Approved' : estimate.state === 'REJECTED' ? 'Declined' : 'Decision recorded'} · PKT</dt><dd><time dateTime={estimate.decidedAt}>{recordDate(estimate.decidedAt)}</time></dd></div>}
    </dl>
  </article>;
}
export function EstimateLedger({ estimates, customer = false }: { estimates: EstimateSnapshot[]; customer?: boolean }) {
  const visible = [...estimates].filter(estimate => !customer || ['SENT', 'APPROVED', 'REJECTED'].includes(estimate.state)).sort((a, b) => b.revisionNo - a.revisionNo);
  return <div className="estimate-ledger">{visible.map((estimate, index) => <div key={estimate.id}>
    {index === 0 ? <EstimateSnapshotView estimate={estimate} /> : <details className="prior-estimate"><summary>Previous revision {estimate.revisionNo} · {estimate.state}</summary><EstimateSnapshotView estimate={estimate} /></details>}
  </div>)}{!visible.length && <p className="fine-print">No sent estimate is available yet.</p>}</div>;
}
