import { List } from '@phosphor-icons/react';
import Button from './Button.jsx';
import './Nav.css';

const LINKS = ['Product', 'Pricing', 'Customers', 'Docs'];

export default function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a href="#" className="nav-logo">payloom</a>
        <nav className="nav-links">
          {LINKS.map((label) => (
            <a key={label} href="#" className="nav-link">{label}</a>
          ))}
        </nav>
        <div className="nav-actions">
          <a href="#" className="nav-signin">Sign in</a>
          <Button>Start now</Button>
          <button className="nav-menu" aria-label="Menu"><List size={20} /></button>
        </div>
      </div>
    </header>
  );
}
