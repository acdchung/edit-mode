import { CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react';
import { PROGRESS, CHECKS, RUN } from '../data.js';
import './RunProgress.css';

// One whole (everyone in the run) split into its states: a thin segmented bar,
// with the names and counts in the legend.
const pct = (n) => Math.round((n / RUN.people) * 100);

export default function RunProgress() {
  const approved = PROGRESS.find((p) => p.key === 'approved');
  return (
    <section className="card progress">
      <div className="card-head">
        <h2 className="card-title">Run progress</h2>
        <span className="card-meta">{RUN.people} people</span>
      </div>
      <div className="progress-body">
        <div className="progress-figure">
          <span className="progress-big">{pct(approved.count)}%</span>
          <span className="progress-caption">approved</span>
        </div>
        <div className="progress-bar" role="img" aria-label={PROGRESS.map((p) => `${p.label} ${p.count}`).join(', ')}>
          {PROGRESS.map((p) => (
            <span key={p.key} className={`progress-part dot--${p.key}`} style={{ flexGrow: p.count }} title={`${p.label}: ${p.count} (${pct(p.count)}%)`} />
          ))}
        </div>
        <div className="progress-legend">
          {PROGRESS.map((p) => (
            <span key={p.key} className="dot-label">
              <span className={`dot dot--${p.key}`} />
              {p.label}
              <span className="progress-count">{p.count}</span>
            </span>
          ))}
        </div>
        <ul className="checks">
          {CHECKS.map((c) => (
            <li key={c.label} className={`check${c.done ? ' is-done' : ''}`}>
              {c.done ? <CheckCircle size={16} weight="fill" className="check-icon" /> : c.label.startsWith('Tax') ? <WarningCircle size={16} weight="fill" className="check-icon check-warn" /> : <Circle size={16} className="check-icon" />}
              <span className="check-label">{c.label}</span>
              <span className="check-note">{c.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
