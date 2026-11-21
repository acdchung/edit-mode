import { CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react';
import { PROGRESS, CHECKS, RUN } from '../data.js';
import './RunProgress.css';

// One whole (everyone in the run) split into its states: a tall segmented bar.
export default function RunProgress() {
  return (
    <section className="card progress">
      <div className="card-head">
        <h2 className="card-title">Run progress</h2>
        <span className="card-meta">{RUN.people} people</span>
      </div>
      <div className="progress-body">
        <div className="progress-bar" role="img" aria-label={PROGRESS.map((p) => `${p.label} ${p.count}`).join(', ')}>
          {PROGRESS.map((p) => (
            <span key={p.key} className={`progress-part progress-part--${p.key}`} style={{ flexGrow: p.count }} title={`${p.label}: ${p.count} (${Math.round((p.count / RUN.people) * 100)}%)`}>
              {p.count / RUN.people > 0.2 ? `${Math.round((p.count / RUN.people) * 100)}%` : ''}
            </span>
          ))}
        </div>
        <div className="progress-legend">
          {PROGRESS.map((p) => (
            <span key={p.key} className="progress-key">
              <span className={`progress-dot progress-part--${p.key}`} />
              {p.label}
              <span className="progress-count">{p.count}</span>
            </span>
          ))}
        </div>
        <ul className="checks">
          {CHECKS.map((c) => (
            <li key={c.label} className={`check${c.done ? ' is-done' : ''}`}>
              {c.done ? <CheckCircle size={16} weight="fill" /> : c.label.startsWith('Tax') ? <WarningCircle size={16} weight="fill" className="check-warn" /> : <Circle size={16} />}
              <span className="check-label">{c.label}</span>
              <span className="check-note">{c.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
