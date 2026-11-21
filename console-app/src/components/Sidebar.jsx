import { House, UsersThree, CurrencyCircleDollar, Heartbeat, ChartBar, ShieldCheck, Gear, CaretUpDown } from '@phosphor-icons/react';
import './Sidebar.css';

const NAV = [
  [House, 'Home'],
  [UsersThree, 'People'],
  [CurrencyCircleDollar, 'Payroll'],
  [Heartbeat, 'Benefits'],
  [ShieldCheck, 'Compliance'],
  [ChartBar, 'Reports'],
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">payloom</div>
      <button className="sidebar-org">
        <span className="sidebar-org-mark">AR</span>
        <span className="sidebar-org-name">Acme Robotics</span>
        <CaretUpDown size={14} />
      </button>
      <div className="sidebar-nav">
        {NAV.map(([Icon, label]) => (
          <a key={label} href="#" className={`sidebar-link${label === 'Payroll' ? ' is-active' : ''}`}>
            <Icon size={18} weight={label === 'Payroll' ? 'fill' : 'regular'} />
            <span>{label}</span>
          </a>
        ))}
      </div>
      <div className="sidebar-foot">
        <a href="#" className="sidebar-link">
          <Gear size={18} />
          <span>Settings</span>
        </a>
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
