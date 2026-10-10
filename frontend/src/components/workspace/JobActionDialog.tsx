'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { BookingReadError } from '@/lib/api/booking';
import { jobActionFailure, submitJobAction } from '@/lib/api/job-actions';
import type { BookingActionInput } from '@/lib/contracts/booking-actions';

export type JobIntent = { input: BookingActionInput; title: string; summary: string };
export function JobActionDialog({ intent, bookingId, shopId, returnTo, close, refresh, succeeded, reloadLabel = 'Reload record', formatFailure = jobActionFailure }: {
  intent: JobIntent; bookingId: string; shopId: string; returnTo: string;
  close: () => void; refresh: () => void; succeeded: (message: string) => void;
  reloadLabel?: string; formatFailure?: (error: unknown) => string;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const uncertain = error !== undefined && (!(error instanceof BookingReadError) || error.status >= 500);
  const retryable = error === undefined || uncertain || (error instanceof BookingReadError &&
    (error.code === 'BOOKING_CONFLICT' || error.status === 429));
  async function execute() {
    if (lock.current) return;
    if (!retryable) { close(); refresh(); return; }
    lock.current = true; setBusy(true);
    try {
      await submitJobAction(bookingId, shopId, intent.input);
      succeeded(`Change saved: ${intent.title}.`);
      close(); refresh();
    } catch (failure) { setError(failure); }
    finally { lock.current = false; setBusy(false); }
  }
  return <ConfirmDialog title={intent.title} busy={busy} error={error === undefined ? undefined : formatFailure(error)}
    confirmLabel={!retryable ? reloadLabel : error !== undefined ? 'Retry same request' : 'Confirm change'}
    cancelDisabled={uncertain} onConfirm={() => void execute()} onCancel={() => { close(); if (error !== undefined) refresh(); }}>
    <p>{intent.summary}</p><p className="fine-print">The workshop will validate version {intent.input.expectedVersion} and record this action in the timeline.</p>
    {error instanceof BookingReadError && error.status === 401 && <Link className="button button-outline" href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in</Link>}
  </ConfirmDialog>;
}
