import { WarningCircle, Warning } from '@phosphor-icons/react';
import { ISSUES, RUN } from '../data.js';
import './ReviewQueue.css';

export default function ReviewQueue() {
  return (
    <section className="card queue">
      <div className="card-head">
        <h2 className="card-title">Needs review</h2>
        <span className="queue-count">{RUN.review}</span>
      </div>
      <ul className="queue-list">
        {ISSUES.map((i) => (
          <li key={i.title} className={`issue issue--${i.severity}`}>
            {i.severity === 'critical' ? <WarningCircle size={18} weight="fill" className="issue-icon" /> : <Warning size={18} weight="fill" className="issue-icon" />}
            <div className="issue-body">
              <div className="issue-title">{i.title}</div>
              <div className="issue-who">{i.who} · {i.where} · {i.when}</div>
            </div>
            <button className="btn btn--small">{i.action}</button>
          </li>
        ))}
      </ul>
      <a href="#" className="queue-more">See all {RUN.review}</a>
    </section>
  );
}
