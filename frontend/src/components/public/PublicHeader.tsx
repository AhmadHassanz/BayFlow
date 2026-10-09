import Link from 'next/link';

export function PublicHeader() {
  return <header className="public-header container">
    <Link className="wordmark" href="/" aria-label="BayFlow home"><span className="brand-mark" aria-hidden="true">b.</span>BayFlow</Link>
    <nav aria-label="Main navigation"><Link href="/customer">Your ledger</Link><Link className="button button-small" href="/#workshops">Find a workshop <span aria-hidden="true">↗</span></Link></nav>
  </header>;
}
