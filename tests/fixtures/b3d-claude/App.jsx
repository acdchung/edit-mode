import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import LogoStrip from './components/LogoStrip.jsx';
import PricingCard from './components/PricingCard.jsx';

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <div className="container">
          <PricingCard />
        </div>
        <LogoStrip />
      </main>
    </>
  );
}
