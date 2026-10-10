'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { login, signup } from '@/lib/auth/actions';
import { loginInput, signupInput } from '@/lib/contracts/auth';
import { getBookingIdentity } from '@/lib/api/booking';
import { identityHome } from '@/lib/workspace';

export function AuthForm({ mode, next, roleRedirect = false }: { mode: 'login' | 'signup'; next: string; roleRedirect?: boolean }) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const { register, handleSubmit, resetField } = useForm<{ fullName: string; email: string; password: string }>();
  async function submit(fields: { fullName: string; email: string; password: string }) {
    if (lock.current) return;
    const parsed = mode === 'signup' ? signupInput.safeParse(fields) : loginInput.safeParse({ email: fields.email, password: fields.password });
    if (!parsed.success) { setError(mode === 'signup' ? 'Enter your name, a valid email and a password from 12 to 128 characters.' : 'Enter a valid email and password.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = mode === 'signup' ? await signup(parsed.data, next) : await login(parsed.data);
      if (result.error || !result.data) { setError(result.error || 'Unable to sign in. Please try again.'); return; }
      resetField('password');
      if ('requiresEmailConfirmation' in result.data && result.data.requiresEmailConfirmation) { setConfirmation(true); return; }
      if (roleRedirect) {
        const identity = await getBookingIdentity();
        if (!identity) { setError('Sign in again to open your workspace.'); return; }
        router.replace(identityHome(identity));
      } else router.replace(next);
      router.refresh();
    } catch { setError('We could not complete sign-in. Check your connection and try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (confirmation) return <div className="confirmation-note" role="status"><h2>Check your inbox.</h2><p>Follow the confirmation link to verify your account and return to BayFlow.</p><Link className="text-button" href={`/login?next=${encodeURIComponent(next)}`}>Return to sign in</Link></div>;
  return <><form onSubmit={event => { void handleSubmit(submit)(event); }} noValidate><fieldset className="form-fieldset" disabled={busy}>
    {mode === 'signup' && <div className="field"><label htmlFor="auth-name">Full name</label><input id="auth-name" autoComplete="name" maxLength={120} aria-describedby={error ? 'auth-form-error' : undefined} {...register('fullName')} /></div>}
    <div className="field"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" maxLength={254} aria-describedby={error ? 'auth-form-error' : undefined} {...register('email')} /></div>
    <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} maxLength={128} aria-describedby={[mode === 'signup' ? 'auth-password-help' : '', error ? 'auth-form-error' : ''].filter(Boolean).join(' ') || undefined} {...register('password')} />{mode === 'signup' && <span id="auth-password-help" className="field-hint">Use 12 to 128 characters.</span>}</div>
    {error && <p id="auth-form-error" className="form-error" role="alert">{error}</p>}<button className="button" type="submit">{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'} <span aria-hidden="true">↗</span></button>
  </fieldset></form><p className="auth-switch">{mode === 'signup' ? 'Already on the ledger?' : 'New to BayFlow?'} <Link href={`/${mode === 'signup' ? 'login' : 'signup'}?next=${encodeURIComponent(next)}`}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</Link></p></>;
}
