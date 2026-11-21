import { CaretRight, CaretDown, DownloadSimple, FileText, WarningCircle, CalendarBlank, ArrowsLeftRight, Globe } from '@phosphor-icons/react';
import { RUN } from '../data.js';
import './RunHeader.css';

const TABS = ['Overview', 'People', 'Exceptions', 'Payslips', 'History'];

export default function RunHeader() {
  return (
    <header className="run-header">
      <div className="run-crumbs">
        <a href="#">Pay runs</a>
        <CaretRight size={12} />
        <span>November 2026</span>
      </div>
      <div className="run-title-row">
        <div className="run-title-block">
          <div className="run-title-line">
            <h1 className="run-title">{RUN.name}</h1>
            <span className="run-status dot-label"><span className="dot dot--review" />In review</span>
          </div>
          <p className="run-sub">
            {RUN.people} people in {RUN.countries} countries · Pays {RUN.payDate} · <span className="run-cutoff">{RUN.cutoff}</span>
          </p>
        </div>
        <div className="run-actions">
          <button className="btn"><DownloadSimple size={15} />Export</button>
          <button className="btn"><FileText size={15} />Preview payslips</button>
          <button className="btn btn--primary" aria-disabled="true" title={`Resolve the ${RUN.blocking} blocking issues first`}>Approve run</button>
        </div>
      </div>
      <nav className="run-tabs">
        {TABS.map((t, i) => (
          <a key={t} href="#" className={`run-tab${i === 0 ? ' is-active' : ''}`}>{t}</a>
        ))}
      </nav>
      <div className="run-filters">
        <button className="chip"><CalendarBlank size={14} />November 2026<CaretDown size={12} /></button>
        <button className="chip"><ArrowsLeftRight size={14} />Compare to October</button>
        <button className="chip"><Globe size={14} />All countries<CaretDown size={12} /></button>
        <span className="run-blocked"><WarningCircle size={15} weight="fill" />{RUN.blocking} issues block approval</span>
        <span className="run-updated">Updated 10:42</span>
      </div>
    </header>
  );
}
