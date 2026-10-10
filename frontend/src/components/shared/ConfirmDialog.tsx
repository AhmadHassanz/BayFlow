'use client';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function ConfirmDialog({ title, children, busy, error, onConfirm, onCancel, confirmLabel = 'Confirm change', cancelLabel = 'Keep as is', cancelDisabled = false }: { title: string; children: ReactNode; busy: boolean; error?: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; cancelLabel?: string; cancelDisabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog className="confirm-dialog" ref={dialog} aria-labelledby="confirm-title" onCancel={event => { event.preventDefault(); if (!busy && !cancelDisabled) onCancel(); }}>
    <p className="eyebrow">Confirm this change</p><h2 id="confirm-title">{title}</h2><div className="confirm-copy">{children}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="confirm-actions"><button className="button button-outline" autoFocus disabled={busy || cancelDisabled} onClick={onCancel}>{cancelLabel}</button><button className="button" disabled={busy} onClick={onConfirm}>{busy ? 'Saving…' : confirmLabel}</button></div>
  </dialog>;
}
