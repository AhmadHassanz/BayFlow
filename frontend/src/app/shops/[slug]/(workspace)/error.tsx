'use client';
import { InlineError } from '@/components/shared/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="container customer-main"><InlineError message="We could not open this workshop workspace. Check your connection and try again." onRetry={reset} /></main>; }
