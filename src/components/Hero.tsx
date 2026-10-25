import Link from "next/link";

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-stage" aria-hidden="true">
        <span className="hero-glow" />
        <span className="hero-beam" />
        <span className="hero-floor" />
      </div>
      <div className="hero-inner">
        <p className="hero-eyebrow">Independent sellers. Clear prices.</p>
        <h1 id="hero-title" className="hero-title">
          <span className="hero-line"><span className="hero-line-in hero-red">Find</span></span>
          <span className="hero-line"><span className="hero-line-in hero-white">what you need</span></span>
        </h1>
        <span className="hero-rule" aria-hidden="true" />
        <p className="hero-sub">
          Search products from independent sellers. Every shop is reviewed by our team before it goes live.
        </p>
        <Link href="/register" className="hero-cta">
          Start selling
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
      <span className="hero-scroll" aria-hidden="true" />
    </section>
  );
}
