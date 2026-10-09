import Link from 'next/link';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
export default function NotFound() {
  return <><PublicHeader /><main className="container route-feedback"><p className="eyebrow"><span>404</span> / A different turn</p><h1>This page is off the map.</h1><p className="section-description">The workshop or page you are looking for may be unavailable. Find another workshop to get moving.</p><Link className="button" href="/#workshops">Explore workshops <span aria-hidden="true">↗</span></Link></main><PublicFooter /></>;
}
