import Link from 'next/link';
import { workspaceIdentity } from '@/server/queries/workspace';
import { NewShop } from '@/components/owner/NewShop';
export const metadata = { title: 'Create workshop | BayFlow' };
export default async function NewShopPage() {
  await workspaceIdentity('/owner/shops/new');
  return <main className="container customer-main"><Link className="text-button" href="/owner">← Your workshops</Link><div className="workspace-heading"><div><p className="eyebrow">Owner setup · A new chapter</p><h1>Make room for<br />your next workshop.</h1><p>Start with the essentials. Set its services and team after your workshop is created.</p></div></div><div className="owner-setup-layout"><NewShop /><aside className="owner-note"><p className="eyebrow">Before you open</p><h2>A workshop of its own.</h2><p>Each workshop has its own team, services and appointments. Existing staff memberships never transfer automatically.</p><p>Your account becomes the owner when creation succeeds. Staff accounts cannot promote themselves by creating a workshop.</p></aside></div></main>;
}
