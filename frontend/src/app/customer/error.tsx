'use client';
import { InlineError } from '@/components/shared/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="container customer-main"><InlineError message="We could not open your ledger. Check your connection and try again." onRetry={reset} /></main>; }
