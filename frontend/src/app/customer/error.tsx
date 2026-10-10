'use client';
import { InlineError } from '@/components/shared/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section aria-label="Customer workspace error"><InlineError message="We could not open your ledger. Check your connection and try again." onRetry={reset} /></section>; }
