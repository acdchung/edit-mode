import { CaretRight } from '@phosphor-icons/react';
import './Button.css';

// A pill link-button. `variant`: primary (filled) or secondary (text with arrow).
export default function Button({ href = '#', variant = 'primary', children }) {
  return (
    <a href={href} className={`button button--${variant}`}>
      <span className="button-label">{children}</span>
      <CaretRight className="button-arrow" size={12} weight="bold" />
    </a>
  );
}
