import Hero from './components/Hero.jsx';
import Card from './components/Card.jsx';

const routes = [
  { name: 'Moonlight Arête', grade: '5.9', length: '240 m' },
  { name: 'Granite Staircase', grade: '5.7', length: '120 m' },
  { name: 'The Long Traverse', grade: '5.10a', length: '410 m', featured: true },
];

export default function App() {
  return (
    <main className="page">
      <Hero />
      <section className="routes">
        <h2 className="section-title">Popular routes</h2>
        <div className="card-grid">
          {routes.map((r) => (
            <Card key={r.name} {...r} />
          ))}
        </div>
      </section>
      <form className="signup" onSubmit={(e) => { e.preventDefault(); alert('Submitted!'); }}>
        <input className="signup-input" placeholder="you@example.com" />
        <button className="btn">Join the list</button>
      </form>
    </main>
  );
}
