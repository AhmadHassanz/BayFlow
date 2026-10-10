'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { getOwnerShops } from '@/lib/api/owner';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import type { OwnerShop } from '@/lib/contracts/owner';
import { Pagination } from './Pagination';

export function ShopCounts({ counts }: { counts: OwnerShop['counts'] }) {
  return <dl className="owner-counts">{([['pending', 'New requests'], ['inProgress', 'In progress'], ['readyForPickup', 'Ready for collection'], ['completed', 'Completed · all time']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{counts[key]}</dd></div>)}</dl>;
}
export function OwnerOverview() {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => getOwnerShops(page, signal), [page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  return <section><div className="queue-toolbar"><p className="eyebrow">Owned workshops · live records</p><button className="text-button" onClick={retry}>Refresh ↻</button></div>
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading workshop summaries…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo="/owner" /> : <>
      {state.data.items.length ? <ol className="owned-workshops">{state.data.items.map(({ shop, counts }, index) => <li key={shop.id}><div className="owned-workshop-title"><span className="ledger-index">{String((page - 1) * 50 + index + 1).padStart(2, '0')}</span><div><p className="eyebrow">{shop.city} · {shop.active ? 'Published' : 'Unpublished'}</p><h2>{shop.name}</h2><p>{shop.address}</p></div><Link className="button button-outline button-small" href={`/shops/${shop.id}/settings`}>Manage workshop ↗</Link></div><ShopCounts counts={counts} /><div className="owned-workshop-links"><Link href={`/shops/${shop.id}/advisor`}>Open booking ledger ↗</Link>{shop.active && <Link href={`/shops/${shop.slug}`}>View public profile ↗</Link>}</div></li>)}</ol> : <EmptyState title="Your first workshop starts here.">Create a workshop to set its hours, services and team. Each workshop keeps its own records.</EmptyState>}
      <Pagination page={page} total={state.data.total} onPage={value => { retry(); setPage(value); }} />
    </>}
  </section>;
}
