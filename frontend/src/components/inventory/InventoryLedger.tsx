'use client';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { useCallback, useState } from 'react';
import { getInventory } from '@/lib/api/workspace';
import { useRemoteResource } from '@/lib/use-remote-resource';
import { moneyPkr } from '@/lib/format';
import { AccessFeedback } from '@/components/workspace/AccessFeedback';
import { EmptyState, LoadingSkeleton } from '@/components/shared/feedback';

export function InventoryLedger({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const load = useCallback(async (signal: AbortSignal) => {
    const result = await getInventory(shopId, page, signal);
    if (result.items.some(item => item.shopId !== shopId)) throw new Error('Unexpected inventory shop.');
    return result;
  }, [shopId, page]);
  const { state, retry } = useRemoteResource(load, undefined, true);
  return <section className="inventory-ledger" aria-label="Workshop inventory"><div className="queue-toolbar"><div><p className="eyebrow">Stock ledger</p><h2>Parts on the shelf.</h2></div><button className="text-button" onClick={retry}>Refresh inventory</button></div>
    <p className="fine-print">Current workshop stock. Ordering adds no stock; receiving adds delivered quantities, and allocation deducts them.</p>
    {state.kind === 'loading' ? <LoadingSkeleton label="Loading inventory…" /> : state.kind === 'error' ? <AccessFeedback error={state.error} retry={retry} returnTo={`/shops/${shopId}/parts`} />
      : <>{state.data.items.length ? <ScrollableTable label="Workshop inventory table"><table className="queue-table inventory-table"><caption className="sr-only">Workshop inventory quantities and whole PKR unit costs</caption><thead><tr><th scope="col">SKU / part</th><th scope="col">On hand</th><th scope="col">Reorder level</th><th scope="col">Unit cost · PKR</th><th scope="col">Catalog state</th></tr></thead><tbody>{state.data.items.map(part => <tr key={part.id}><td><span className="reference-caption">{part.sku}</span><strong>{part.name}</strong></td><td>{part.quantityOnHand}<span className="reference-caption">{part.quantityOnHand <= part.reorderLevel ? 'At or below reorder level' : 'Above reorder level'}</span></td><td>{part.reorderLevel}</td><td>{moneyPkr(part.unitCostPkr)}</td><td>{part.active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></ScrollableTable>
        : <EmptyState title="No inventory records">There are no catalog items on this page.</EmptyState>}
        <div className="queue-pagination"><button className="button button-outline button-small" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous inventory</button><span>Page {page} · {state.data.total} records</span><button className="button button-outline button-small" disabled={page * 50 >= state.data.total} onClick={() => setPage(page + 1)}>Next inventory</button></div></>}
  </section>;
}
