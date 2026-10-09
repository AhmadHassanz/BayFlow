import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authDestination, identityHome } from '@/lib/workspace';
import { workspaceIdentity } from '@/server/queries/workspace';
import { AuthForm } from './AuthForm';

export async function AuthPage({ mode, searchParams }: { mode: 'login' | 'signup'; searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next ?? null;
  const next = authDestination(requested);
  const roleRedirect = !requested || (next === '/customer' && requested !== '/customer');
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (!error && data.user) redirect(roleRedirect ? identityHome(await workspaceIdentity('/login')) : next);
  return <main className="auth-layout"><aside className="auth-story"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><div><p className="eyebrow">The workshop ledger</p><h1>Every visit.<br />A clearer picture.</h1><p>From your first booking to the final quality check, keep your vehicle’s story in one place.</p></div><p className="eyebrow">Care, recorded.</p></aside><section className="auth-content"><Link className="text-button" href="/">← Back to BayFlow</Link><p className="eyebrow">Your account</p><h2>{mode === 'signup' ? 'Start your ledger.' : 'Welcome back.'}</h2><p className="section-description">{mode === 'signup' ? 'One account for your bookings and repair history.' : 'Sign in to follow your visit and see what happens next.'}</p><AuthForm mode={mode} next={next} roleRedirect={roleRedirect} /></section></main>;
}
