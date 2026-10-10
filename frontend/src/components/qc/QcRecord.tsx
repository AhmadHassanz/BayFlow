import type { JobRecord } from '@/lib/booking/advisor-actions';
import { recordDate } from '@/lib/format';
export function QcRecord({ booking, showIssues = true }: { booking: JobRecord; showIssues?: boolean }) {
  if (!booking.qcRuns.length && (!showIssues || !booking.qcIssues.length)) return null;
  return <section className="qc-record" aria-label="Quality inspection record"><p className="eyebrow">Quality history</p><h2>Checks and findings.</h2>
    {[...booking.qcRuns].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).map(run => <article key={run.id}><h4>{run.passed === null ? 'Inspection in progress' : run.passed ? 'Inspection passed' : 'Inspection failed'}</h4><p><time dateTime={run.startedAt}>{recordDate(run.startedAt)} PKT</time>{run.finishedAt ? ` · Finished ${recordDate(run.finishedAt)} PKT` : ''}</p>
      <dl className="qc-record-checks">{Object.entries(run.checklist).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value === true ? 'Passed' : value === false ? 'Failed' : typeof value === 'string' || typeof value === 'number' ? String(value) : 'Recorded detail'}</dd></div>)}</dl>
      {run.notes && <p className="timeline-note">{run.notes}</p>}</article>)}
    {showIssues && booking.qcIssues.map(issue => <article className="qc-record-issue" key={issue.id}><h4>{issue.title}</h4><p>{issue.description}</p><p>Reported {recordDate(issue.createdAt)} PKT · {issue.resolvedAt ? `Resolved ${recordDate(issue.resolvedAt)} PKT` : 'Open issue'}</p></article>)}
  </section>;
}
