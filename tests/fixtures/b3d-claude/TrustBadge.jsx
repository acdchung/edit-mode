import './TrustBadge.css';

export default function TrustBadge({ label = 'SOC 2 Type II certified' }) {
  return (
    <div className="trust-badge">
      <span className="trust-badge-dot" aria-hidden="true" />
      <span className="trust-badge-label">{label}</span>
    </div>
  );
}
