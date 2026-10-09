import Link from 'next/link';

export function PublicFooter() {
  return <footer className="public-footer container"><Link className="wordmark" href="/">BayFlow<span className="brand-dot">.</span></Link><p>A clearer road from concern to care.</p><Link className="text-button" href="/#workshops">Explore the workshops <span aria-hidden="true">↗</span></Link></footer>;
}
