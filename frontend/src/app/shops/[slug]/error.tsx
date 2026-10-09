'use client';
import { PublicHeader } from '@/components/public/PublicHeader';
import { InlineError } from '@/components/shared/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <><PublicHeader /><main className="container route-feedback"><p className="eyebrow">A pause at the service desk</p><h1>Let’s try that again.</h1><InlineError message="The workshop could not be loaded. Please check your connection and retry." onRetry={reset} /></main></>;
}
