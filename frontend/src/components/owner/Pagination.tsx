export function Pagination({ page, total, onPage, busy = false }: { page: number; total: number; onPage: (page: number) => void; busy?: boolean }) {
  return <nav className="queue-pagination" aria-label="Result pages"><button className="button button-outline button-small" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>← Previous</button><span>Page {page} · {total} records</span><button className="button button-outline button-small" disabled={busy || page * 50 >= total || page >= 99999} onClick={() => onPage(page + 1)}>Next →</button></nav>;
}
