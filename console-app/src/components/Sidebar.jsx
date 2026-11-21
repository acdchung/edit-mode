import { House, Receipt, Files, Bank, ChartLineUp, UsersThree, Heartbeat, CalendarBlank, ShieldCheck, Gear, CaretUpDown, MagnifyingGlass } from '@phosphor-icons/react';
import './Sidebar.css';

const SECTIONS = [
  [null, [[House, 'Home']]],
  ['Payroll', [[Receipt, 'Pay runs', true], [Files, 'Payslips'], [Bank, 'Taxes and filings'], [ChartLineUp, 'Reports']]],
  ['People', [[UsersThree, 'Directory'], [Heartbeat, 'Benefits'], [CalendarBlank, 'Time off']]],
  ['Company', [[ShieldCheck, 'Compliance'], [Gear, 'Settings']]],
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-inner">
        <button className="sidebar-org">
          <span className="sidebar-org-mark">AR</span>
          <span className="sidebar-org-name">Acme Robotics</span>
          <CaretUpDown size={14} />
        </button>
        <label className="sidebar-search">
          <MagnifyingGlass size={15} />
          <input placeholder="Search" />
          <kbd>⌘K</kbd>
        </label>
        <div className="sidebar-nav">
          {SECTIONS.map(([title, items]) => (
            <div key={title ?? 'top'} className="sidebar-section">
              {title && <div className="sidebar-section-title">{title}</div>}
              {items.map(([Icon, label, active]) => (
                <a key={label} href="#" className={`sidebar-link${active ? ' is-active' : ''}`}>
                  <Icon size={17} weight={active ? 'fill' : 'regular'} />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="sidebar-user">
          <span className="sidebar-avatar">MS</span>
          <div>
            <div className="sidebar-user-name">Marta Silva</div>
            <div className="sidebar-user-role">Payroll lead</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
