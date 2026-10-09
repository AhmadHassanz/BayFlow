import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { ShopProfile } from '@/components/public/ShopProfile';
import { loadPublicShop } from '@/server/queries/public-shop';

export const dynamic = 'force-dynamic';
export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const shop = await loadPublicShop((await params).slug, true);
  return <><a className="skip-link" href="#main">Skip to content</a><PublicHeader /><main id="main"><ShopProfile shop={shop} /></main><PublicFooter /></>;
}
