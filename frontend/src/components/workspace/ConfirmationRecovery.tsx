'use client';
import { useState } from 'react';
import { resendConfirmation } from '@/lib/auth/actions';

export function ConfirmationRecovery({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await resendConfirmation({ email }, next);
      setMessage(result.error ?? 'If that account is awaiting confirmation, a new email has been sent. Use only the newest link.');
    } catch { setMessage('We could not request another email. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className="confirmation-note" onSubmit={event => { void submit(event); }}><h3>That confirmation link is no longer valid.</h3><p>It may have expired or already been opened. Request a fresh email and use only its newest link.</p><label htmlFor="confirmation-email">Account email</label><input id="confirmation-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /><button className="button button-small" disabled={busy}>{busy ? 'Sending…' : 'Send new confirmation email'}</button>{message && <p role="status">{message}</p>}</form>;
}
