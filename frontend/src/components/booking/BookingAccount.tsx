'use client';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { login, signup, logout } from '@/lib/auth/actions';
import { loginInput, signupInput } from '@/lib/contracts/auth';
import type { BookingIdentity } from '@/lib/api/booking';

type AccountFields = { fullName: string; email: string; password: string };
export function BookingAccount({ identity, onAuthenticated, beforeAuth, returnTo }: { identity: BookingIdentity | null; onAuthenticated: () => Promise<void>; beforeAuth: () => boolean; returnTo: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { register, handleSubmit, resetField } = useForm<AccountFields>({ defaultValues: { fullName: '', email: '', password: '' } });
  async function authenticate(fields: AccountFields) {
    if (lock.current) return;
    const parsed = mode === 'login' ? loginInput.safeParse({ email: fields.email, password: fields.password }) : signupInput.safeParse(fields);
    if (!parsed.success) { setMessage(mode === 'signup' ? 'Enter your name, a valid email and a password of 12–128 characters.' : 'Enter a valid email and password.'); return; }
    if (!beforeAuth()) { setMessage('Your draft could not be saved on this device. Allow site storage and try again.'); return; }
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = mode === 'login' ? await login(parsed.data) : await signup(parsed.data, returnTo);
      if (result.error || !result.data) { setMessage(result.error || 'Unable to authenticate. Please try again.'); return; }
      resetField('password');
      if ('requiresEmailConfirmation' in result.data && result.data.requiresEmailConfirmation) {
        setConfirmation(true); return;
      }
      await onAuthenticated();
    } catch { setMessage('We could not complete sign-in. Check your connection and try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function signOut() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = await logout();
      if (result.error) setMessage(result.error); else await onAuthenticated();
    } catch { setMessage('We could not sign out. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (identity) return <section className="account-verified"><span className="status-label">Signed in</span><h3>{identity.user.fullName || 'Your customer account'}</h3><p>{identity.user.email}</p><p className="fine-print">Your booking will be linked to this verified account.</p><button className="text-button" type="button" disabled={busy} onClick={signOut}>Use a different account</button>{message && <p className="form-error" role="alert">{message}</p>}</section>;
  return <div className="account-panel"><div className="account-tabs" role="group" aria-label="Account options"><button type="button" disabled={busy} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setMessage(''); setConfirmation(false); }}>Sign in</button><button type="button" disabled={busy} aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setMessage(''); setConfirmation(false); }}>Create an account</button></div>
    {confirmation ? <div className="confirmation-note" role="status"><h3>Check your email.</h3><p>Follow the confirmation link in the same browser to return to your saved booking. Your appointment is not reserved yet.</p><button type="button" className="text-button" onClick={onAuthenticated}>I have confirmed my email</button><button type="button" className="text-button" onClick={() => { setConfirmation(false); setMode('login'); }}>Return to sign in</button></div>
      : <form onSubmit={event => { void handleSubmit(authenticate)(event); }} noValidate><fieldset disabled={busy} className="form-fieldset">{mode === 'signup' && <div className="field"><label htmlFor="account-name">Full name <span aria-hidden="true">*</span></label><input id="account-name" maxLength={120} autoComplete="name" {...register('fullName')} /></div>}<div className="field"><label htmlFor="account-email">Email address <span aria-hidden="true">*</span></label><input id="account-email" type="email" maxLength={254} autoComplete="email" {...register('email')} /></div><div className="field"><label htmlFor="account-password">Password <span aria-hidden="true">*</span></label><input id="account-password" type="password" maxLength={128} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-describedby="password-help" {...register('password')} /><span id="password-help" className="field-hint">{mode === 'signup' ? 'At least 12 characters. Your password is never saved in your booking draft.' : 'Use the password for your existing account.'}</span></div>{message && <p className="form-error" role="alert">{message}</p>}<button className="button" type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in & continue' : 'Create my account'}<span aria-hidden="true">↗</span></button></fieldset></form>}
    <p className="fine-print account-note">Already registered? Sign in to your existing account. Your vehicle and appointment draft stay here while you authenticate.</p></div>;
}
