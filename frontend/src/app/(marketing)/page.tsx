import Link from 'next/link';
import { PublicHeader } from '@/components/public/PublicHeader';
import { ShopDirectory } from '@/components/public/ShopDirectory';

export default function HomePage() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <PublicHeader />
    <main id="main">
      <section className="hero container" aria-labelledby="hero-heading"><div className="hero-copy"><p className="eyebrow"><span>01</span> / A clearer road ahead</p><h1 id="hero-heading">Better repairs,<br /><em>fewer unknowns.</em></h1><p className="hero-description">Your car deserves more than a guess. Find a workshop, explore its services, and start with a conversation.</p><a className="button" href="#workshops">Find your workshop <span aria-hidden="true">↗</span></a><p className="hero-footnote">From the first concern to the final check.</p></div>
        <aside className="ledger-note" aria-label="Our approach"><div className="ledger-note-top"><span className="eyebrow">The BayFlow approach</span><span aria-hidden="true">↗</span></div><p className="ledger-statement">Less guesswork.<br />More clarity.<br /><em>At every turn.</em></p><div className="ledger-rule" /><p>You describe the concern.<br />The workshop takes it from there.</p><span className="ledger-note-bottom">SERVICE / CARE / CONFIDENCE</span></aside>
      </section>
      <section id="how-it-works" className="process-band" aria-labelledby="process-heading"><div className="container process-grid"><div><p className="eyebrow">The service promise</p><h2 id="process-heading">Care, with a clear process.</h2></div><div><span className="process-number">01 /</span><h3>Start with the symptoms</h3><p>You do not need a diagnosis to talk to a workshop.</p></div><div><span className="process-number">02 /</span><h3>Know what comes next</h3><p>Inspection comes before an itemized estimate and your approval.</p></div><div><span className="process-number">03 /</span><h3>Finish with a check</h3><p>Quality control comes before your car is ready for pickup.</p></div></div></section>
      <ShopDirectory />
    </main>
    <footer className="public-footer container"><Link className="wordmark" href="/">BayFlow<span className="brand-dot">.</span></Link><p>A clearer road from concern to care.</p><a className="text-button" href="#workshops">Back to the index <span aria-hidden="true">↑</span></a></footer>
  </>;
}
