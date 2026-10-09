import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{children}</p></div>;
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="inline-error" role="alert"><p>{message}</p><button className="text-button" onClick={onRetry}>Try again <span aria-hidden="true">↗</span></button></div>;
}

export function LoadingSkeleton({ label = 'Loading workshops…' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="sr-only">{label}</span>
    {[1, 2, 3].map(index => <div key={index} className="skeleton-row" aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}
