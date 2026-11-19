import { ArrowRight } from '@phosphor-icons/react';
import Button from './Button.jsx';
import HeroShot from './HeroShot.jsx';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-gradient" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="hero-copy">
          <a href="#" className="hero-pill">
            <span className="hero-pill-tag">New</span>
            Pay people in 12 more countries
            <ArrowRight size={14} weight="bold" />
          </a>
          <h1 className="hero-title">Payroll for teams everywhere</h1>
          <p className="hero-lede">
            Pay your whole team, in 90 countries, in a single run. Payloom handles local taxes,
            currencies and compliance, so payday takes one click.
          </p>
          <div className="hero-actions">
            <Button>Start now</Button>
            <Button variant="secondary">Talk to sales</Button>
          </div>
          <p className="hero-trust">No setup fees · SOC 2 Type II · Cancel anytime</p>
        </div>
        <div className="hero-visual">
          <HeroShot />
        </div>
      </div>
    </section>
  );
}
