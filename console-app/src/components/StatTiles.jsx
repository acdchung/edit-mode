import { RUN } from '../data.js';
import './StatTiles.css';

const TILES = [
  { label: 'Total to pay', value: RUN.total, note: RUN.totalDelta },
  { label: 'People', value: RUN.people, note: RUN.peopleDelta },
  { label: 'Countries', value: RUN.countries, note: RUN.countriesNote },
  { label: 'Needs review', value: RUN.review, note: RUN.reviewNote, alert: true },
];

export default function StatTiles() {
  return (
    <div className="stats">
      {TILES.map((t) => (
        <div key={t.label} className={`stat card${t.alert ? ' stat--alert' : ''}`}>
          <div className="stat-label">{t.label}</div>
          <div className="stat-value">{t.value}</div>
          <div className="stat-note">{t.note}</div>
        </div>
      ))}
    </div>
  );
}
