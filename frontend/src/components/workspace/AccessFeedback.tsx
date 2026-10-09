'use client';
import Link from 'next/link';
import { BookingReadError } from '@/lib/api/booking';
import { InlineError } from '@/components/shared/feedback';

export function AccessFeedback({ error, retry, returnTo }: { error: unknown; retry: () => void; returnTo: string }) {
  if (error instanceof BookingReadError && error.status === 401) return <div className="empty-state"><h3>Sign in to continue.</h3><p>Your session has expired. Sign in again to return here.</p><Link className="button button-small" href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in</Link></div>;
  if (error instanceof BookingReadError && [403, 404].includes(error.status)) return <div className="empty-state" role="alert"><h3>Record unavailable.</h3><p>This record is unavailable for your account. Check your account or contact the workshop.</p></div>;
  return <InlineError message="We could not load this record. Check your connection and try again." onRetry={retry} />;
}
