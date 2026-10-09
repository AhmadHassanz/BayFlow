'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { catalogMessage, getShopServices, type ServicesPage } from '@/lib/api/shops';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { moneyPkr } from '@/lib/format';
import { EmptyState, InlineError, LoadingSkeleton } from '@/components/shared/feedback';

function ServicePage({ shopId, page, initial, setPage }: { shopId: string; page: number; initial?: ServicesPage; setPage: (page: number) => void }) {
  const load = useCallback((signal: AbortSignal) => getShopServices(shopId, signal, page), [shopId, page]);
  const { state, retry } = useRemoteResource(load, initial);
  if (state.kind === 'loading') return <LoadingSkeleton label="Loading services…" />;
  if (state.kind === 'error') return <InlineError message={catalogMessage(state.error)} onRetry={retry} />;
  const data = state.data;
  return <>
    {data.items.length ? <div className="service-ledger">{data.items.map((service, index) => <article className="service-entry" key={service.id}>
      <span className="entry-number" aria-hidden="true">{String((page - 1) * data.pageSize + index + 1).padStart(2, '0')}</span>
      <div><h3>{service.name}</h3>{service.description && <p>{service.description}</p>}<span className="service-duration">{service.durationMinutes} min · appointment duration</span></div>
      <div className="service-entry-action"><span className="guide-price">{service.basePricePkr === null ? 'Price after inspection' : moneyPkr(service.basePricePkr)}</span>{service.basePricePkr !== null && <span className="field-hint">Listed guide price</span>}<Link className="text-button" href={`/book/${shopId}?service=${service.id}`}>Book this service <span aria-hidden="true">↗</span></Link></div>
    </article>)}</div> : <EmptyState title="Tell us what you are noticing">No services are listed yet. You can still describe your symptoms when arranging a visit.</EmptyState>}
    {(page > 1 || data.total > data.pageSize) && <nav className="pagination" aria-label="Service pages"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous services</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button className="button button-outline" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next services</button></nav>}
  </>;
}

export function ServiceCatalog({ shopId, initial }: { shopId: string; initial: ServicesPage }) {
  const [page, setPage] = useState(1);
  return <ServicePage key={page} shopId={shopId} page={page} initial={page === 1 ? initial : undefined} setPage={setPage} />;
}
