import { BY_COUNTRY } from '../data.js';
import './PayByCountry.css';

// Gross pay by country (USD): thin horizontal bars, one series, value at the tip.
const fmt = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);

export default function PayByCountry() {
  const max = Math.max(...BY_COUNTRY.map((c) => c.usd));
  return (
    <section className="country card">
      <div className="card-head">
        <h2 className="card-title">Gross pay by country</h2>
        <span className="card-meta">USD, at locked rates</span>
      </div>
      <div className="country-list" role="table" aria-label="Gross pay by country, USD">
        {BY_COUNTRY.map((c) => (
          <div key={c.country} className={`country-row${c.country.includes('other') ? ' is-other' : ''}`} role="row" title={`${c.country}: $${c.usd.toLocaleString('en-US')}`}>
            <span className="country-name" role="cell">{c.country}</span>
            <span className="country-track" role="cell">
              <span className="country-bar" style={{ width: `${(c.usd / max) * 100}%` }} />
              <span className="country-value">{fmt(c.usd)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
