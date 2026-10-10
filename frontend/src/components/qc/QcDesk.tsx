'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { getQcQueue, getShopBookings } from '@/lib/api/workspace';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { EmptyState, LoadingSkeleton } from '@/components/shared/feedback';
import { StatusChip } from '@/components/workspace/BookingRecord';

export function QcDesk({ shopId, actorId }: { shopId: string; actorId: string }) {
  const [tab, setTab] = useState<'queue' | 'claimed'>('queue');
  const [page, setPage] = useState(1);
  const load = useCallback(async (signal: AbortSignal) => {
    const result = tab === 'queue' ? await getQcQueue(shopId, page, signal)
      : await getShopBookings({ shopId, page, assignee: 'mine', status: 'QC_IN_PROGRESS' }, signal);
    if (result.items.some(item => item.shopId !== shopId || (tab === 'queue'
      ? item.status !== 'QC_PENDING' || item.qcClaimedBy !== null : item.status !== 'QC_IN_PROGRESS' || item.qcClaimedBy !== actorId)))
      throw new Error('Unexpected QC queue response.');
    return result;
  }, [shopId, actorId, tab, page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  return <section aria-label="Quality inspection desk"><div className="ledger-tabs"><button aria-pressed={tab === 'queue'} onClick={() => { retry(); setTab('queue'); setPage(1); }}>Unclaimed QC queue</button><button aria-pressed={tab === 'claimed'} onClick={() => { retry(); setTab('claimed'); setPage(1); }}>My claimed inspections</button><button className="text-button" onClick={retry}>Refresh quality desk</button></div>
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading quality inspections…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo={`/shops/${shopId}/qc`} />
      : <>{state.data.items.length ? <ul className="qc-queue-list">{state.data.items.map(item => <li key={item.id}><div><p className="eyebrow">Visit {item.id.slice(0, 8)}</p><h2>{item.symptomNotes || 'Workshop visit'}</h2><StatusChip status={item.status} /></div><Link className="button button-outline" href={`/shops/${shopId}/bookings/${item.id}`}>{tab === 'queue' ? 'Review and claim' : 'Continue inspection'}</Link></li>)}</ul>
        : <EmptyState title={tab === 'queue' ? 'No unclaimed quality checks.' : 'No inspections claimed by you.'}>Refresh the desk to see the latest eligible work.</EmptyState>}
        <div className="queue-pagination"><button className="button button-outline button-small" disabled={page === 1} onClick={() => { retry(); setPage(page - 1); }}>Previous inspections</button><span>Page {page}</span><button className="button button-outline button-small" disabled={state.data.items.length < 50 || page === 99999} onClick={() => { retry(); setPage(page + 1); }}>Next inspections</button></div></>}
  </section>;
}
