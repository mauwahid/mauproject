import React, { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field } from './ui.jsx';
import { buildExcelModel } from '../lib/excelModel.js';
import { addMonths } from '../lib/calendar.js';
import { fmtDate } from '../lib/format.js';

/** Export the portfolio as the "WBS & Workload" Excel workbook. */
export default function ExcelExportModal({ onClose, projectIds: preset }) {
  const { data, derived, actions } = useStore();
  const thisMonth = derived.today.slice(0, 8) + '01';
  const monthOptions = useMemo(() => [...Array(18)].map((_, i) => addMonths(thisMonth, i - 6)), [thisMonth]);
  const live = data.projects.filter((p) => !p.archived && p.status !== 'cancelled');
  const [start, setStart] = useState(thisMonth);
  const [months, setMonths] = useState(4);
  const [ids, setIds] = useState(() => preset || live.map((p) => p.id));
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const monthName = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const run = async () => {
    if (!ids.length) return actions.toast('Pilih minimal satu proyek', 'warn');
    setBusy(true);
    try {
      const ordered = data.projects.filter((p) => ids.includes(p.id)).map((p) => p.id);
      const model = buildExcelModel(data, derived, { start, months, projectIds: ordered });
      const name = `MauProject WBS-Workload ${monthName(start)}.xlsx`;
      const path = await window.mauproject.files.exportXlsx(model, name);
      if (path) {
        actions.toast('Excel exported', 'success');
        window.mauproject.files.reveal(path);
        onClose();
      }
    } catch (e) {
      console.error(e);
      actions.toast(`Export failed: ${e.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export WBS & Workload (Excel)" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={run}><FileSpreadsheet size={14} />{busy ? 'Exporting…' : 'Export .xlsx'}</button>
    </>}>
      <div className="small muted mb16" style={{ lineHeight: 1.5 }}>
        Membuat workbook Excel dengan sheet <b>Petunjuk, Master, Hari Libur, Task Plan</b> (WBS + Gantt harian), <b>Ringkasan</b> dan
        <b> Resource Map</b> (jam per orang per proyek per hari). Semua angka memakai rumus Excel sehingga tetap bisa diedit.
        Biaya dalam <b>{data.settings.currency}</b>.
      </div>
      <div className="grid2">
        <Field label="Mulai periode">
          <select className="input" value={start} onChange={(e) => setStart(e.target.value)}>
            {monthOptions.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </Field>
        <Field label="Durasi timeline">
          <select className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 9, 12].map((n) => <option key={n} value={n}>{n} bulan</option>)}
          </select>
        </Field>
      </div>
      <div className="section-title">Proyek ({ids.length}/{live.length})</div>
      <div className="row mb8">
        <button className="btn sm" onClick={() => setIds(live.map((p) => p.id))}>Pilih semua</button>
        <button className="btn sm" onClick={() => setIds([])}>Kosongkan</button>
      </div>
      <div className="col" style={{ gap: 4, maxHeight: 220, overflow: 'auto' }}>
        {live.map((p) => {
          const s = derived.projectStats.get(p.id);
          return (
            <label key={p.id} className="row" style={{ padding: '4px 0' }}>
              <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
              <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
              <span className="grow">{p.name} <span className="faint small">{p.code}</span></span>
              <span className="faint small">{fmtDate(s.start, { short: true })} – {fmtDate(s.finish, { short: true })}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
