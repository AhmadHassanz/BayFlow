import Link from 'next/link';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { BookingWizard, type BookingHints } from '@/components/booking/BookingWizard';
import { loadPublicShop } from '@/server/queries/public-shop';

export const dynamic = 'force-dynamic';
export default async function BookingPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const shop = await loadPublicShop((await params).shopId, false);
  const query = await searchParams;
  const hints: BookingHints = {};
  for (const key of ['service', 'date', 'slot', 'resume', 'booking'] as const) if (typeof query[key] === 'string') hints[key] = query[key];
  return <><a className="skip-link" href="#main">Skip to content</a><PublicHeader /><main id="main" className="container booking-page"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/#workshops">Workshops</Link><span aria-hidden="true">/</span><Link href={`/shops/${shop.slug}`}>{shop.name}</Link><span aria-hidden="true">/</span><span>Book a visit</span></nav><div className="booking-page-title"><p className="eyebrow">The appointment ledger</p><h1>A little planning.<br /><em>A clearer road ahead.</em></h1></div><BookingWizard key={`${shop.id}:${hints.booking ?? ''}`} shop={shop} hints={hints} /></main><PublicFooter /></>;
}
