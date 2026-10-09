'use client';
import { PublicHeader } from '@/components/public/PublicHeader';
import { InlineError } from '@/components/shared/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <><PublicHeader /><main className="container route-feedback"><p className="eyebrow">Your visit is worth a second try</p><h1>Let’s reconnect.</h1><InlineError message="We could not prepare this booking. Your saved draft remains on this device. Retry when you are connected." onRetry={reset} /></main></>;
}
