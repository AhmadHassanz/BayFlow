import { shopWorkspace } from '@/server/queries/workspace';
import { StaffShell } from '@/components/workspace/StaffShell';
import { ShopSettings } from '@/components/owner/ShopSettings';
export const metadata = { title: 'Workshop settings | BayFlow' };
export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await shopWorkspace(slug, `/shops/${slug}/settings`, 'settings');
  return <StaffShell {...context}><ShopSettings key={slug} shopId={slug} /></StaffShell>;
}
