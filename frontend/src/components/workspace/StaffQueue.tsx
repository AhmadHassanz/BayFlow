'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { workspaceRead } from '@/lib/api/workspace';
import { shopBookingListOutput } from '@/lib/contracts/booking-actions';
import type { Membership } from '@/lib/contracts/auth';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { StatusChip, recordDate } from './BookingRecord';
import { AccessFeedback } from './AccessFeedback';
import { roleSegments } from '@/lib/workspace';

export function StaffQueue({ shopId, role }: { shopId: string; role: Membership['role'] }) {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => workspaceRead(`/api/v1/shops/${shopId}/bookings?page=${page}&assignee=all`, shopBookingListOutput, signal), [shopId, page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  const returnTo = `/shops/${shopId}/${roleSegments[role]}`;
  return <section className="queue-section"><div className="queue-toolbar"><p className="eyebrow">Visible to your role · Page {page}</p><button className="text-button" onClick={retry}>Refresh ↻</button></div>{state.kind === 'loading' ? <LoadingSkeleton label="Loading workshop bookings…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} /> : <>{state.data.items.length ? <div className="queue-table-wrap"><table className="queue-table"><caption className="sr-only">Workshop bookings available to your verified role</caption><thead><tr><th scope="col">Booking / concern</th><th scope="col">Status</th><th scope="col">Recorded · PKT</th><th scope="col"><span className="sr-only">Open record</span></th></tr></thead><tbody>{state.data.items.filter(item => item.shopId === shopId).map(item => <tr key={item.id}><td><Link className="queue-concern" href={`/shops/${shopId}/bookings/${item.id}`}>{item.symptomNotes || 'Workshop visit'}</Link><span className="reference-caption">{item.id.slice(0, 8)}</span></td><td><StatusChip status={item.status} /></td><td className="queue-date">{recordDate(item.createdAt)}</td><td><Link className="ledger-open" href={`/shops/${shopId}/bookings/${item.id}`} aria-label={`Open booking ${item.id}`}>↗</Link></td></tr>)}</tbody></table></div> : <EmptyState title={page > 1 ? 'End of the ledger.' : 'A clear workbench.'}>{page > 1 ? 'There are no more records on this page.' : 'No bookings are currently visible to your role in this workshop.'}</EmptyState>}<div className="queue-pagination"><button className="button button-outline button-small" disabled={page === 1} onClick={() => { retry(); setPage(value => value - 1); }}>← Previous</button><span>Page {page}</span><button className="button button-outline button-small" disabled={state.data.items.length < state.data.pageSize || page === 99999} onClick={() => { retry(); setPage(value => value + 1); }}>Next →</button></div></>}</section>;
}
