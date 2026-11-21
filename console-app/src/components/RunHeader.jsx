import { CaretRight, DownloadSimple, FileText, Clock } from '@phosphor-icons/react';
import { RUN } from '../data.js';
import './RunHeader.css';

export default function RunHeader() {
  return (
    <header className="run-header">
      <div className="run-crumbs">
        <a href="#">Payroll</a>
        <CaretRight size={12} />
        <a href="#">Runs</a>
        <CaretRight size={12} />
        <span>November 2026</span>
      </div>
      <div className="run-title-row">
        <div className="run-title-block">
          <div className="run-title-line">
            <h1 className="run-title">{RUN.name}</h1>
            <span className="run-status">In review</span>
          </div>
          <p className="run-sub">
            {RUN.company} · Pays {RUN.payDate} ·{' '}
            <span className="run-cutoff"><Clock size={13} weight="bold" />{RUN.cutoff}</span>
          </p>
        </div>
        <div className="run-actions">
          <button className="btn"><DownloadSimple size={15} />Export</button>
          <button className="btn"><FileText size={15} />Preview payslips</button>
          <button className="btn btn--primary">Approve run</button>
        </div>
      </div>
    </header>
  );
}
