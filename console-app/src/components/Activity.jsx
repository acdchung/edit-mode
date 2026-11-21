import { ACTIVITY } from '../data.js';
import './Activity.css';

export default function Activity() {
  return (
    <section className="activity card">
      <div className="card-head">
        <h2 className="card-title">Activity</h2>
      </div>
      <ol className="activity-list">
        {ACTIVITY.map((a) => (
          <li key={a.what} className="activity-item">
            <span className="activity-dot" />
            <div className="activity-body">
              <span className="activity-who">{a.who}</span> {a.what}
              <div className="activity-when">{a.when}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
