import type { ReactNode } from 'react';
export function ScrollableTable({ label, children }: { label: string; children: ReactNode }) {
  return <><p className="table-scroll-hint">Scroll horizontally to inspect all columns.</p><div className="queue-table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div></>;
}
