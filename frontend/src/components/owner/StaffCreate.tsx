'use client';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createStaffInput, staffRole } from '@/lib/contracts/auth';
import { roleNames } from '@/lib/workspace';
import { createOwnerStaff, ownerFailure, uncertainMutation } from '@/lib/api/owner';

type Fields = z.infer<typeof createStaffInput>;
export function StaffCreate({ shopId, onCreated }: { shopId: string; onCreated: () => void }) {
  const { register, handleSubmit, reset, setValue, setError, clearErrors, formState: { errors } } = useForm<Fields>({ defaultValues: { fullName: '', email: '', role: 'SA', initialPassword: '' } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const lock = useRef(false);
  async function submit(fields: Fields) {
    if (lock.current || uncertain) return;
    clearErrors(); setMessage('');
    const parsed = createStaffInput.safeParse(fields);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof Fields, { message: issue.message }, { shouldFocus: true });
      setMessage('Check the marked staff fields.'); return;
    }
    lock.current = true; setBusy(true);
    try {
      const result = await createOwnerStaff(shopId, parsed.data);
      if (result.shopId !== shopId || result.role !== parsed.data.role || !result.active) throw new Error('Unexpected membership');
      setCredentials({ email: parsed.data.email, password: parsed.data.initialPassword });
      reset(); onCreated();
    } catch (error) { setMessage(ownerFailure(error)); if (uncertainMutation(error)) { setUncertain(true); setValue('initialPassword', ''); } }
    finally { lock.current = false; setBusy(false); }
  }
  if (credentials) return <section className="staff-credentials" aria-labelledby="credential-title"><p className="eyebrow">Account created · Handle with care</p><h3 id="credential-title">Save these credentials privately.</h3><p>The initial password is shown only in this page session. Share it directly with this staff member; it cannot be retrieved from the team list.</p><label htmlFor="created-staff-email">Sign-in email</label><input id="created-staff-email" readOnly value={credentials.email} /><label htmlFor="created-staff-password">Initial password</label><input id="created-staff-password" readOnly type={revealed ? 'text' : 'password'} value={credentials.password} autoComplete="off" /><div className="credential-actions"><button className="text-button" onClick={() => setRevealed(value => !value)}>{revealed ? 'Hide password' : 'Show password'}</button><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`); setCopyMessage('Copied. Share privately and clear your clipboard afterwards.'); } catch { setCopyMessage('Copy is unavailable. Save the credentials privately from this page.'); } }}>Copy credentials</button><button className="button button-small" onClick={() => { setCredentials(null); setRevealed(false); setCopyMessage(''); }}>Add another staff account</button></div><p className="field-hint">Save these credentials first. Adding another account clears them from this page.</p>{copyMessage && <p role="status">{copyMessage}</p>}</section>;
  return <form className="owner-form staff-create" onSubmit={event => { void handleSubmit(submit)(event); }} noValidate><p className="eyebrow">Add a staff account</p><h3>A new pair of hands.</h3><fieldset className="form-fieldset" disabled={busy || uncertain}><div className="owner-form-grid">{(['fullName', 'email'] as const).map(key => <div className="field" key={key}><label htmlFor={`staff-${key}`}>{key === 'fullName' ? 'Full name' : 'Email address'} *</label><input id={`staff-${key}`} type={key === 'email' ? 'email' : 'text'} autoComplete="off" aria-invalid={!!errors[key]} {...register(key)} />{errors[key] && <p className="form-error">{errors[key].message}</p>}</div>)}<div className="field"><label htmlFor="staff-role">Workshop role *</label><select id="staff-role" {...register('role')}>{staffRole.options.map(role => <option key={role} value={role}>{roleNames[role]}</option>)}</select></div></div><div className="field"><label htmlFor="staff-password">Initial password *</label><input id="staff-password" type="password" autoComplete="new-password" maxLength={128} aria-invalid={!!errors.initialPassword} {...register('initialPassword')} /><span className="field-hint">12–128 characters. Never reuse your own password.</span>{errors.initialPassword && <p className="form-error">{errors.initialPassword.message}</p>}<button className="text-button" type="button" onClick={() => { const bytes = crypto.getRandomValues(new Uint8Array(24)); setValue('initialPassword', [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')); }}>Generate a secure password</button></div><button className="button" type="submit">{busy ? 'Creating account…' : 'Create staff account'} ↗</button></fieldset>{message && <p className="form-error" role="alert">{message}</p>}{uncertain && <p className="confirmation-note">Creation is paused because its result is uncertain. Refresh the team and ask the workspace operator to verify the account before submitting another request.</p>}</form>;
}
