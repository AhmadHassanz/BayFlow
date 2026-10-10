import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authDestination, identityHome, signupDestination } from '@/lib/workspace';
import { workspaceIdentity } from '@/server/queries/workspace';
import { AuthForm } from './AuthForm';
import { AccountTypeChoice, isStaffRole, staffRoles } from './AuthPath';

export async function AuthPage({ mode, searchParams }: { mode: 'login' | 'signup'; searchParams: Promise<{ next?: string; type?: string; role?: string }> }) {
  const query = await searchParams;
  const requested = query.next ?? null;
  const accountType = query.type === 'customer' || query.type === 'owner' || query.type === 'staff' ? query.type : null;
  const next = mode === 'signup' ? signupDestination(accountType, requested) : authDestination(requested);
  const staffRole = accountType === 'staff' && isStaffRole(query.role) ? query.role : null;
  const roleName = staffRoles.find(role => role.value === staffRole)?.label;
  const roleRedirect = !requested || (next === '/customer' && requested !== '/customer');
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (!error && data.user) redirect(roleRedirect ? identityHome(await workspaceIdentity('/login')) : next);
  const choosingType = mode === 'signup' && !accountType;
  const ownerSignup = mode === 'signup' && accountType === 'owner';
  const employeeLogin = mode === 'login' && !!staffRole;
  const heading = choosingType ? 'How will you use BayFlow?' : ownerSignup ? 'Create your owner account.' : mode === 'signup' ? 'Create your customer account.' : 'Welcome back.';
  const description = choosingType ? 'Choose one clear path to get started.' : employeeLogin ? `Sign in as ${roleName}. Your workshop owner gives you your email and first password.` : ownerSignup ? 'Create your account, then add your workshop, services, opening hours and team.' : mode === 'signup' ? 'Book visits and follow your repair in one place.' : 'Sign in to open your workspace.';
  return <main className="auth-layout"><aside className="auth-story"><Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link><div><p className="eyebrow">Simple garage care</p><h1>Book. Repair.<br />Stay informed.</h1><p>Customers and workshop teams each get a clear place to start.</p></div><p className="eyebrow">Clear at every step.</p></aside><section className="auth-content"><Link className="text-button" href="/">← Back to BayFlow</Link><p className="eyebrow">Get started</p><h2>{heading}</h2><p className="section-description">{description}</p>{choosingType ? <AccountTypeChoice next={next} /> : <AuthForm mode={mode} next={next} roleRedirect={roleRedirect} />}</section></main>;
}
