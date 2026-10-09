import Link from 'next/link';
import type { ShopDetail } from '@/lib/api/shops';
import { ServiceCatalog } from './ServiceCatalog';
import { SlotAvailability } from './SlotAvailability';

const weekdays = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;

export function ShopProfile({ shop }: { shop: ShopDetail }) {
  return <>
    <section className="profile-hero container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/#workshops">Workshops</Link><span aria-hidden="true">/</span><span>{shop.city}</span></nav><div className="profile-title-row"><div><p className="eyebrow"><span>01</span> / Your next workshop</p><h1>{shop.name}</h1><p className="profile-address">{shop.address}<span aria-hidden="true"> · </span>{shop.city}</p></div><div className="profile-hero-cta"><Link className="button" href={`/book/${shop.id}`}>Book a visit <span aria-hidden="true">↗</span></Link><span className="fine-print">Choose a service, or describe the symptoms.</span></div></div></section>
    <div className="profile-layout container"><div className="profile-main"><section aria-labelledby="services-heading"><div className="section-heading"><div><p className="eyebrow"><span>02</span> / On the service desk</p><h2 id="services-heading">The work, laid out.</h2></div><span className="catalog-count">{shop.services.total} listed {shop.services.total === 1 ? 'service' : 'services'}</span></div><p className="section-description">Start with a service or tell the team what feels different. Final repair work is estimated after inspection.</p><ServiceCatalog shopId={shop.id} initial={shop.services} /></section><SlotAvailability shop={shop} /></div>
      <aside className="workshop-rail" aria-label="Workshop information"><div className="rail-heading"><p className="eyebrow">The workshop particulars</p><span aria-hidden="true">↗</span></div><section><h2>Find the service desk.</h2><p>{shop.address}<br />{shop.city}</p><a className="text-button" href={`tel:${shop.phone.replace(/[^+\d]/g, '')}`}>{shop.phone}</a></section><section><h3>Opening hours</h3><p className="fine-print">{shop.timezone}</p><dl className="hours-list">{weekdays.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{shop.workingHours[key]?.length ? shop.workingHours[key]!.map(([open, close]) => `${open}–${close}`).join(' / ') : 'Closed'}</dd></div>)}</dl></section><section className="review-note"><h3>A note on reviews</h3><p>Customer reviews are not available. Explore the listed services or speak directly with the workshop.</p></section></aside>
    </div>
  </>;
}
