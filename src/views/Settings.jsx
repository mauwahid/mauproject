import React, { useEffect, useState } from 'react';
import { CalendarDays, Database, Info, User, X, HardDriveDownload, FolderOpen, Coins } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar } from '../components/layout.jsx';
import { Field, BrandMark, confirmDialog } from '../components/ui.jsx';
import { BlurInput } from '../components/TaskDrawer.jsx';
import { fmtDate, fmtMoney, CURRENCIES, LOCALES } from '../lib/format.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Settings({ openModal }) {
  const { data, actions } = useStore();
  const [info, setInfo] = useState(null);
  const [hol, setHol] = useState({ date: '', name: '' });
  const [fx, setFx] = useState('16000');
  useEffect(() => { window.mauproject.db.info().then(setInfo); }, [data]);
  let wd = [1, 2, 3, 4, 5];
  try { wd = JSON.parse(data.settings.workingDays); } catch { /* default */ }

  const toggleDay = (d) => {
    const next = wd.includes(d) ? wd.filter((x) => x !== d) : [...wd, d].sort();
    if (!next.length) return actions.toast('At least one working day is required', 'warn');
    actions.setSetting('workingDays', JSON.stringify(next));
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="content" style={{ maxWidth: 920 }}>
        <div className="card">
          <div className="card-h"><User size={15} /><h3>Workspace</h3></div>
          <div className="card-b grid2">
            <Field label="Your name (shown on comments and new projects)"><BlurInput className="input" value={data.settings.userName} onCommit={(v) => actions.setSetting('userName', v)} /></Field>
          </div>
        </div>

        <div className="card mt16">
          <div className="card-h"><Coins size={15} /><h3>Currency & regional format</h3><span className="small muted">Used for budgets, cost rates, reports and Excel exports</span></div>
          <div className="card-b">
            <div className="grid2">
              <Field label="Currency">
                <select className="input" value={data.settings.currency} onChange={async (e) => {
                  const c = e.target.value;
                  await actions.setSetting('currency', c);
                  if (c === 'IDR' && data.settings.locale !== 'id-ID') await actions.setSetting('locale', 'id-ID');
                }}>
                  {CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Number & date format">
                <select className="input" value={data.settings.locale || 'en-US'} onChange={(e) => actions.setSetting('locale', e.target.value)}>
                  {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="small muted mt8">
              Preview: <b>{fmtMoney(1250000000, data.settings.currency)}</b> · rate <b>{fmtMoney(175000, data.settings.currency)}</b>/h · {fmtDate('2026-12-24')}
            </div>
            <div className="section-title">Convert existing amounts</div>
            <div className="small muted mb8">Switching currency does not change stored numbers. To convert all project budgets and team cost rates (e.g. USD → IDR), multiply them by an exchange rate:</div>
            <div className="row">
              <span className="small">× rate</span>
              <input className="input" type="number" min="0" step="any" style={{ width: 160 }} value={fx} onChange={(e) => setFx(e.target.value)} />
              <button className="btn" onClick={async () => {
                const rate = Number(fx);
                if (!(rate > 0)) return actions.toast('Enter a positive exchange rate', 'warn');
                const ok = await confirmDialog({
                  title: 'Convert all amounts?', confirmLabel: 'Convert',
                  message: `All ${data.projects.length} project budgets and ${data.resources.length} cost rates will be multiplied by ${rate.toLocaleString()}. Back up first if unsure.`,
                });
                if (!ok) return;
                await actions.convertCurrency(rate);
                actions.toast('Budgets and cost rates converted', 'success');
              }}>Convert budgets & rates</button>
            </div>
          </div>
        </div>

        <div className="card mt16">
          <div className="card-h"><CalendarDays size={15} /><h3>Working calendar</h3><span className="small muted">Drives scheduling, durations and capacity</span></div>
          <div className="card-b">
            <div className="grid2">
              <Field label="Working days">
                <div className="btn-group">
                  {DAYS.map((d, i) => <button key={d} className={`btn sm ${wd.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>)}
                </div>
              </Field>
              <Field label="Hours per working day">
                <BlurInput className="input" type="number" min="1" max="24" value={data.settings.hoursPerDay} onCommit={(v) => actions.setSetting('hoursPerDay', Math.max(1, Math.min(24, v || 8)))} />
              </Field>
            </div>
            <div className="section-title">Company holidays</div>
            <div className="row mb8">
              <input className="input" type="date" style={{ width: 170 }} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
              <input className="input" placeholder="Holiday name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
              <button className="btn primary" onClick={async () => {
                if (!hol.date) return;
                if (data.holidays.some((h) => h.date === hol.date)) return actions.toast('That date is already a holiday', 'warn');
                await actions.addHoliday({ date: hol.date, name: hol.name || 'Holiday' });
                setHol({ date: '', name: '' });
              }}>Add</button>
            </div>
            {data.holidays.map((h) => (
              <div key={h.id} className="row small" style={{ padding: '5px 0', borderBottom: '1px solid #f2f3f6' }}>
                <span style={{ width: 130 }}>{fmtDate(h.date)}</span><span className="grow">{h.name}</span>
                <button className="btn ghost sm icon" onClick={() => actions.deleteHoliday(h.id)}><X size={13} /></button>
              </div>
            ))}
            {!data.holidays.length && <div className="faint small">No holidays defined.</div>}
          </div>
        </div>

        <div className="card mt16">
          <div className="card-h"><Database size={15} /><h3>Data</h3></div>
          <div className="card-b col">
            {info && <div className="small muted">Database: <code>{info.file}</code> · {(info.size / 1024).toFixed(0)} KB</div>}
            <div className="row wrap">
              <button className="btn" onClick={async () => { const p = await window.mauproject.db.backup(); if (p) actions.toast('Backup saved', 'success'); }}><HardDriveDownload size={14} />Back up database…</button>
              {info && <button className="btn" onClick={() => window.mauproject.files.reveal(info.file)}><FolderOpen size={14} />Show in Finder</button>}
              <button className="btn" onClick={() => openModal({ type: 'import' })}>Upload WBS & Workload (Excel)…</button>
              <button className="btn" onClick={() => actions.loadSampleData()}>Load sample portfolio</button>
              <div className="grow" />
              <button className="btn danger" onClick={async () => {
                const ok = await confirmDialog({ title: 'Delete all data?', danger: true, confirmLabel: 'Delete everything', message: 'All projects, tasks, team members and holidays will be permanently deleted from mauproject.db. Back up first if you may need them.' });
                if (ok) await actions.resetAll();
              }}>Delete all data…</button>
            </div>
          </div>
        </div>

        <div className="card mt16">
          <div className="card-h"><Info size={15} /><h3>About</h3></div>
          <div className="card-b row" style={{ gap: 14 }}>
            <BrandMark size={44} />
            <div>
              <div className="bold" style={{ fontSize: 15 }}>MauProject {info ? `v${info.version}` : ''}</div>
              <div className="muted small">Project Management &amp; Engineering Resource Planning</div>
              <div className="faint tiny">{info?.appId || 'com.mauproject.desktop'}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
