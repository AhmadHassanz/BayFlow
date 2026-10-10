'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEstimateCatalog } from '@/lib/api/workspace';
import { type CatalogPart } from '@/lib/contracts/technician';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { LoadingSkeleton, EmptyState } from '@/components/shared/feedback';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';

export function CatalogPicker({ bookingId, returnTo, select, close }: { bookingId: string; returnTo: string;
  select: (part: CatalogPart) => void; close: () => void }) {
  const [page, setPage] = useState(1);
  const region = useRef<HTMLElement>(null);
  useEffect(() => { region.current?.focus(); }, []);
  const load = useCallback((signal: AbortSignal) => getEstimateCatalog(bookingId, page, signal), [bookingId, page]);
  const { state, retry } = useRemoteResource(load);
  return <section ref={region} tabIndex={-1} className="catalog-picker" aria-label="Workshop part catalog"><div className="queue-toolbar"><h3>Workshop part catalog</h3>
    <button type="button" className="text-button" onClick={close}>Close catalog</button></div>
    <p className="fine-print">Active parts in this workshop, including zero-stock items. Stock is checked during parts preparation after approval.</p>
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading workshop catalog…" /> : state.kind === 'error'
      ? <AccessFeedback error={state.error} retry={retry} returnTo={returnTo} />
      : <>{state.data.items.length ? <ul className="catalog-choices">{state.data.items.map(part => <li key={part.id}><div><strong>{part.name}</strong><span>{part.sku}</span></div>
        <button type="button" className="button button-outline button-small" onClick={() => select(part)} aria-label={`Select ${part.name}`}>Select part</button></li>)}</ul>
        : <EmptyState title="No catalog items">{page > 1 ? 'No more items on this page.' : 'The owner or parts desk needs to add an active catalog item. Labour-only estimates can still be submitted.'}</EmptyState>}
        <div className="queue-pagination"><button type="button" className="text-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous parts</button>
          <span>Page {page}</span><button type="button" className="text-button" disabled={page * 50 >= state.data.total} onClick={() => setPage(page + 1)}>Next parts</button></div></>}
  </section>;
}
