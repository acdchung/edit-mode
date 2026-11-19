import './LogoStrip.css';

// Made-up customers, as plain text wordmarks (no invented logo marks).
const LOGOS = [
  ['Fernhill', 'serif'],
  ['KESTREL', 'wide'],
  ['tallwood', 'round'],
  ['Oblique', 'italic'],
  ['QUARRY&CO', 'mono'],
  ['Halvorsen', 'heavy'],
];

export default function LogoStrip() {
  return (
    <section className="logos">
      <div className="container">
        <p className="logos-label">Payroll for 4,000+ teams, from first hire to IPO</p>
        <div className="logos-grid">
          {LOGOS.map(([name, style]) => (
            <span key={name} className={`logo logo--${style}`}>{name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
