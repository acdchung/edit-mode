import { ArrowUp } from '@phosphor-icons/react';
import { RUN } from '../data.js';
import './StatTiles.css';

const TILES = [
  { label: 'Total to pay', value: RUN.total, delta: '3.1%', note: 'vs October' },
  { label: 'People', value: RUN.people, delta: '5', note: '9 joined, 4 left' },
  { label: 'Countries', value: RUN.countries, note: '9 currencies' },
  { label: 'Needs review', value: RUN.review, note: RUN.reviewNote, alert: true },
];

export default function StatTiles() {
  return (
    <div className="stats card">
      {TILES.map((t) => (
        <div key={t.label} className={`stat${t.alert ? ' stat--alert' : ''}`}>
          <div className="stat-label">{t.label}</div>
          <div className="stat-value">{t.value}</div>
          <div className="stat-foot">
            {t.delta && <span className="delta"><ArrowUp size={10} weight="bold" />{t.delta}</span>}
            <span className="stat-note">{t.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
