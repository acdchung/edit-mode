export default function Hero() {
  return (
    <header className="hero">
      <p className="eyebrow">Summit Guides</p>
      <h1 className="hero-title">Climb something new this weekend</h1>
      <p className="hero-body">Hand-picked multi-pitch routes with local guides.</p>
      <button className="btn cta-primary" onClick={() => alert('CTA clicked!')}>
        Get started
      </button>
    </header>
  );
}
