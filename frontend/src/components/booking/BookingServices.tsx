'use client';
import { useCallback, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { getShopServices, catalogMessage, type PublicService, type ShopDetail } from '@/lib/api/shops';
import { moneyPkr } from '@/lib/format';
import type { BookingFormValues } from '@/lib/booking/draft';

export function BookingServices({ shop, form, selected, onCatalog, catalog }: { shop: ShopDetail; form: UseFormReturn<BookingFormValues>; selected: string[]; onCatalog: (services: PublicService[]) => void; catalog: PublicService[] }) {
  const services = catalog;
  const page = Math.max(1, Math.ceil(catalog.length / shop.services.pageSize));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadMore = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const next = await getShopServices(shop.id, AbortSignal.timeout(15000), page + 1);
      const all = [...new Map([...services, ...next.items].map(service => [service.id, service])).values()];
      onCatalog(all);
    } catch (error) { setError(catalogMessage(error)); }
    finally { setBusy(false); }
  }, [shop.id, page, services, onCatalog]);
  function toggle(serviceId: string) {
    const current = form.getValues('serviceIds');
    form.setValue('serviceIds', current.includes(serviceId) ? current.filter(id => id !== serviceId) : [...current, serviceId], { shouldDirty: true });
  }
  return <><fieldset className="form-fieldset"><legend className="field-legend">Select services <span className="field-hint">Choose what you need, or describe the concern below.</span></legend><div className="booking-service-list">{services.map(service => <label className={`booking-service ${selected.includes(service.id) ? 'is-selected' : ''}`} key={service.id}><input type="checkbox" checked={selected.includes(service.id)} disabled={!selected.includes(service.id) && selected.length >= 50} onChange={() => toggle(service.id)} /><span><strong>{service.name}</strong>{service.description && <span className="choice-description">{service.description}</span>}<small>{service.durationMinutes} min · {service.basePricePkr === null ? 'Price after inspection' : `${moneyPkr(service.basePricePkr)} guide price`}</small></span><span className="choice-check" aria-hidden="true">{selected.includes(service.id) ? '✓' : '+'}</span></label>)}</div>
      {selected.some(id => !services.some(service => service.id === id)) && <p className="form-error" role="alert">A previously selected service is not on this catalog page. Load more services, or <button className="text-button" type="button" onClick={() => form.setValue('serviceIds', selected.filter(id => services.some(service => service.id === id)))}>clear unavailable selections</button>.</p>}
      {!services.length && <p className="section-description">No services are listed yet. Tell the team what is happening with your car below.</p>}
      {page * shop.services.pageSize < shop.services.total && <button className="text-button" type="button" onClick={loadMore} disabled={busy}>{busy ? 'Loading services…' : 'Show more services'}</button>}{error && <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={loadMore}>Retry services</button></p>}
      <label className="symptoms-choice"><input type="checkbox" {...form.register('notSure')} /><span><strong>Not sure what needs fixing?</strong><small>Describe what you hear, see or feel. No diagnosis needed.</small></span></label></fieldset>
    <div className="field symptoms-field"><label htmlFor="symptoms">What are you noticing? <span className="field-hint">Required when no service is selected</span></label><textarea id="symptoms" maxLength={4000} placeholder="Tell us when it happens and what feels different…" {...form.register('symptomNotes')} /><span className="field-hint">A clear description helps the workshop prepare. At least 10 characters if you are booking by symptoms.</span></div></>;
}
