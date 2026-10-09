'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/auth/actions';

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function leave() {
    setBusy(true); setError('');
    try { const result = await logout(); if (result.error) setError(result.error); else { router.replace('/login'); router.refresh(); } }
    catch { setError('Unable to sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div><button className="text-button" disabled={busy} onClick={leave}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="form-error">{error}</p>}</div>;
}
