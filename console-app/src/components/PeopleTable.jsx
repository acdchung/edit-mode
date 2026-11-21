import { MagnifyingGlass, CheckCircle, Clock, WarningCircle, Eye, DotsThree, ArrowUp } from '@phosphor-icons/react';
import { PEOPLE, FILTERS } from '../data.js';
import './PeopleTable.css';

// Status: always an icon and a label, never colour alone.
const STATUS = {
  approved: [CheckCircle, 'Approved'],
  pending: [Clock, 'Pending'],
  review: [Eye, 'Review'],
  flagged: [WarningCircle, 'Flagged'],
};

const initials = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

export default function PeopleTable() {
  return (
    <section className="card people">
      <div className="people-toolbar">
        <div className="people-filters">
          {FILTERS.map((f) => (
            <button key={f.label} className={`people-filter${f.active ? ' is-active' : ''}`}>
              {f.label}
              <span className="people-filter-count">{f.count}</span>
            </button>
          ))}
        </div>
        <label className="people-search">
          <MagnifyingGlass size={15} />
          <input placeholder="Search people" />
        </label>
      </div>
      <table className="people-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th className="num">Gross pay</th>
            <th className="num">Net pay</th>
            <th className="num">vs October</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {PEOPLE.map((p) => {
            const [Icon, label] = STATUS[p.status];
            return (
              <tr key={p.name} className={p.status === 'flagged' ? 'is-flagged' : ''}>
                <td>
                  <div className="person">
                    <span className="person-avatar">{initials(p.name)}</span>
                    <div>
                      <div className="person-name">{p.name}</div>
                      <div className="person-role">{p.role}</div>
                    </div>
                  </div>
                </td>
                <td><span className="country-code">{p.code}</span></td>
                <td className="num">{p.gross}</td>
                <td className="num">{p.net}</td>
                <td className="num">
                  {p.change == null ? (
                    <span className="change-note">{p.note}</span>
                  ) : p.change === 0 ? (
                    <span className="change-flat">—</span>
                  ) : (
                    <span className={`change-up${p.change >= 20 ? ' is-big' : ''}`}><ArrowUp size={11} weight="bold" />{p.change.toFixed(1)}%</span>
                  )}
                </td>
                <td>
                  <span className={`status status--${p.status}`}><Icon size={14} weight="fill" />{label}</span>
                </td>
                <td className="row-actions"><button className="icon-btn" aria-label={`More for ${p.name}`}><DotsThree size={18} weight="bold" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="people-foot">Showing 16 of 412</div>
    </section>
  );
}
