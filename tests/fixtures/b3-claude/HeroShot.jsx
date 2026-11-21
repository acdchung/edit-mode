import { House, UsersThree, CurrencyCircleDollar, Heartbeat, ChartBar, Lock } from '@phosphor-icons/react';
import './HeroShot.css';

// The hero's product shot: a payroll run in a browser window that runs off the
// page's right edge, and Lucía's payslip straddling its lower-left corner.
// Real words only on the run, three people and the payslip; bars elsewhere.
// Everything real stays inside the visible crop; only filler runs off the edge.

const NAV = [
  [House, 'Home'],
  [UsersThree, 'People'],
  [CurrencyCircleDollar, 'Payroll'],
  [Heartbeat, 'Benefits'],
  [ChartBar, 'Reports'],
];

const PEOPLE = [
  { initials: 'KW', tone: 'blue', name: 'Kenji Watanabe', country: 'Japan', amount: '¥612,400' },
  { initials: 'LF', tone: 'coral', name: 'Lucía Ferreira', country: 'Portugal', amount: '€4,812.50', selected: true },
  { initials: 'AO', tone: 'green', name: 'Amara Okafor', country: 'Nigeria', amount: '₦3,940,000' },
];
const FILLER = [[72, 40], [58, 52], [80, 44]];

export default function HeroShot() {
  return (
    <div className="shot">
      <div className="shot-window">
        <div className="shot-chrome">
          <span className="shot-dot" /><span className="shot-dot" /><span className="shot-dot" />
          <span className="shot-url"><Lock size={10} weight="fill" />app.payloom.com/payroll</span>
        </div>
        <div className="shot-body">
          <aside className="shot-sidebar">
            {NAV.map(([Icon, label]) => (
              <div key={label} className={`shot-nav${label === 'Payroll' ? ' is-active' : ''}`}>
                <Icon size={14} weight="fill" />
                <span>{label}</span>
              </div>
            ))}
          </aside>
          <div className="shot-main">
            <div className="shot-head">
              <div className="shot-title">November payroll</div>
              <span className="shot-status">Ready to approve</span>
            </div>
            <div className="shot-total">
              <div className="shot-total-label">Total to pay</div>
              <div className="shot-total-value">$184,320.00</div>
              <div className="shot-total-meta">42 people · 9 currencies · pays Nov 28</div>
            </div>
            <div className="shot-list">
              {PEOPLE.map((p) => (
                <div key={p.name} className={`shot-row${p.selected ? ' is-selected' : ''}`}>
                  <span className={`shot-avatar shot-avatar--${p.tone}`}>{p.initials}</span>
                  <span className="shot-name">{p.name}</span>
                  <span className="shot-country">{p.country}</span>
                  <span className="shot-amount">{p.amount}</span>
                </div>
              ))}
              {FILLER.map(([a, b], i) => (
                <div key={i} className="shot-row">
                  <span className="shot-avatar shot-avatar--empty" />
                  <span className="shot-bar" style={{ width: a * 1.4 }} />
                  <span className="shot-bar shot-bar--faint shot-country" style={{ width: b }} />
                  <span className="shot-bar shot-bar--right" style={{ width: b + 12 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="payslip">
        <div className="payslip-net">
          <span>Net pay</span>
          <span className="payslip-net-value">€4,812.50</span>
        </div>
        <div className="payslip-header">
          <div className="payslip-kicker">Payslip · November</div>
          <div className="payslip-who">
            <span className="shot-avatar shot-avatar--coral payslip-avatar">LF</span>
            <div>
              <div className="payslip-name">Lucía F.</div>
              <div className="payslip-place">Lisbon, Portugal</div>
            </div>
          </div>
        </div>
        <div className="payslip-lines">
          <div className="payslip-line"><span className="shot-bar" style={{ width: 64 }} /><span className="shot-bar shot-bar--faint" style={{ width: 52 }} /></div>
          <div className="payslip-line"><span className="shot-bar" style={{ width: 82 }} /><span className="shot-bar shot-bar--faint" style={{ width: 44 }} /></div>
        </div>
      </div>
    </div>
  );
}
