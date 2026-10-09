'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { catalogMessage, getShops, getShopServices, type DirectoryFilters, type DirectoryPage, type PublicShop, type ServicesPage } from '@/lib/api/shops';
import { EmptyState, InlineError, LoadingSkeleton } from '@/components/shared/feedback';

type Resource<T> = { kind: 'loading' } | { kind: 'success'; data: T } | { kind: 'error'; message: string };

function ServiceSummary({ shopId }: { shopId: string }) {
  const [state, setState] = useState<Resource<ServicesPage>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    getShopServices(shopId, controller.signal).then(data => {
      if (active) setState({ kind: 'success', data });
    }).catch(error => {
      if (active) setState({ kind: 'error', message: catalogMessage(error) });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [shopId, attempt]);
  if (state.kind === 'loading') return <p className="service-note" role="status">Loading services…</p>;
  if (state.kind === 'error') return <InlineError message={state.message} onRetry={() => { setState({ kind: 'loading' }); setAttempt(attempt + 1); }} />;
  if (!state.data.items.length) return <p className="service-note">No services listed yet. Contact the workshop for details.</p>;
  return <ul className="service-chips" aria-label="Services">{state.data.items.slice(0, 3).map(service => <li key={service.id}>{service.name}</li>)}
    {state.data.total > 3 && <li>+{state.data.total - 3} more</li>}</ul>;
}

function ShopRow({ shop, number }: { shop: PublicShop; number: number }) {
  return <article className="shop-row" aria-label={shop.name}>
    <div className="shop-number" aria-hidden="true">{String(number).padStart(2, '0')}</div>
    <div className="shop-information"><p className="eyebrow city-label">{shop.city}</p><h3><Link className="shop-name-link" href={`/shops/${shop.slug}`}>{shop.name}</Link></h3><p className="address">{shop.address}</p><ServiceSummary shopId={shop.id} /></div>
    <div className="shop-contact"><Link className="call-link" href={`/shops/${shop.slug}`} aria-label={`View ${shop.name} and book a visit`}>Explore workshop <span aria-hidden="true">↗</span></Link><span>{shop.phone}</span></div>
  </article>;
}

function DirectoryResults({ filters, onPage, onClear }: { filters: DirectoryFilters; onPage: (page: number) => void; onClear: () => void }) {
  const [state, setState] = useState<Resource<DirectoryPage>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    getShops(filters, controller.signal).then(data => {
      if (active) setState({ kind: 'success', data });
    }).catch(error => {
      if (active) setState({ kind: 'error', message: catalogMessage(error) });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [filters, attempt]);
  if (state.kind === 'loading') return <LoadingSkeleton />;
  if (state.kind === 'error') return <InlineError message={state.message} onRetry={() => { setState({ kind: 'loading' }); setAttempt(attempt + 1); }} />;
  const { items, total, page, pageSize } = state.data;
  return <>
    <p className="result-count" role="status">{total} {total === 1 ? 'workshop' : 'workshops'} found{filters.city && ` in ${filters.city}`}</p>
    {items.length ? <div className="shop-index">{items.map((shop, index) => <ShopRow key={shop.id} shop={shop} number={(page - 1) * pageSize + index + 1} />)}</div>
      : <EmptyState title="No workshops found">{filters.city || filters.q ? 'Try another city or workshop name.' : 'Published workshops will appear here when available.'}<br /><button className="text-button" onClick={onClear}>Clear search</button></EmptyState>}
    {(page > 1 || total > pageSize) && <nav className="pagination" aria-label="Workshop pages"><button className="button button-outline" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><button className="button button-outline" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Next</button></nav>}
  </>;
}

export function ShopDirectory() {
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<DirectoryFilters>({ city: '', q: '', page: 1 });
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFilters({ city: city.trim(), q: q.trim(), page: 1 });
  }
  function clear() { setCity(''); setQ(''); setFilters({ city: '', q: '', page: 1 }); }
  return <section id="workshops" className="directory container" aria-labelledby="directory-heading">
    <div className="section-heading"><div><p className="eyebrow"><span>02</span> / The workshop index</p><h2 id="directory-heading">A good repair starts here.</h2></div><p>Find your workshop.<br />Talk through your next visit.</p></div>
    <form className="search-form" onSubmit={search} aria-label="Search workshops"><div><label htmlFor="city">City</label><input id="city" name="city" placeholder="e.g. Lahore" maxLength={80} value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" /><span className="field-hint">Enter the full city name</span></div><div><label htmlFor="workshop-name">Workshop name</label><input id="workshop-name" name="q" placeholder="Search by name" maxLength={120} value={q} onChange={event => setQ(event.target.value)} /><span className="field-hint">Optional</span></div><button className="button" type="submit">Find workshops <span aria-hidden="true">↗</span></button>{(filters.city || filters.q) && <button className="text-button clear-button" type="button" onClick={clear}>Clear</button>}</form>
    <DirectoryResults key={JSON.stringify(filters)} filters={filters} onPage={page => setFilters({ ...filters, page })} onClear={clear} />
  </section>;
}
