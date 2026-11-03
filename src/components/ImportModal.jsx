import React, { useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field } from './ui.jsx';
import { navigate } from './layout.jsx';
import { fmtDate, PALETTE } from '../lib/format.js';

const lc = (s) => String(s || '').trim().toLowerCase();

/** Upload Master data + Task Plan from a "WBS & Workload" Excel workbook. */
export default function ImportModal({ onClose }) {
  const { data, actions } = useStore();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [codes, setCodes] = useState([]);
  const [spaceMode, setSpaceMode] = useState('new');
  const [spaceName, setSpaceName] = useState('');
  const [spaceId, setSpaceId] = useState(data.spaces[0]?.id || '');
  const [projectMode, setProjectMode] = useState('replace');
  const [updateResources, setUpdateResources] = useState(true);
  const [showWarn, setShowWarn] = useState(false);
  const [done, setDone] = useState(null);

  const pick = async () => {
    setError(null);
    setBusy(true);
    try {
      const p = await window.mauproject.files.pickImportXlsx();
      if (!p) return;
      setPlan(p);
      setCodes(p.projects.filter((x) => x.tasks.length).map((x) => x.code));
      setSpaceName(p.source.replace(/\.(xlsx|xlsm|xls)$/i, '').replace(/[_]+/g, ' ').trim());
      const existingSpace = data.spaces.find((s) => lc(s.name) === lc(p.source.replace(/\.(xlsx|xlsm|xls)$/i, '')));
      if (existingSpace) { setSpaceMode('existing'); setSpaceId(existingSpace.id); }
    } catch (e) {
      setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };

  const existingByCode = useMemo(() => new Map(data.projects.map((p) => [lc(p.code), p])), [data.projects]);
  const existingRes = useMemo(() => new Set(data.resources.map((r) => lc(r.name))), [data.resources]);

  const run = async () => {
    if (!codes.length) return actions.toast('Pilih minimal satu proyek', 'warn');
    if (spaceMode === 'new' && !spaceName.trim()) return actions.toast('Isi nama space', 'warn');
    setBusy(true);
    try {
      const res = await actions.importPlan(plan, {
        codes, projectMode, updateResources, spaceMode, spaceName: spaceName.trim(), spaceId: Number(spaceId) || null, palette: PALETTE,
      });
      setDone(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Upload selesai" onClose={onClose} footer={<>
        <button className="btn" onClick={onClose}>Tutup</button>
        <button className="btn primary" onClick={() => { onClose(); navigate(done.spaceId ? `space/${done.spaceId}/dashboard` : 'projects'); }}>Buka {done.spaceId ? 'space' : 'proyek'}</button>
      </>}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <CheckCircle2 size={28} style={{ color: 'var(--ok)', flex: 'none' }} />
          <div className="col" style={{ gap: 4 }}>
            <b>{plan.source} berhasil diimpor.</b>
            <span>{done.projectsCreated} proyek baru, {done.projectsUpdated} proyek diperbarui</span>
            <span>{done.tasks} aktivitas dengan {done.assignments} penugasan PIC</span>
            <span>{done.resourcesCreated} resource baru, {done.resourcesUpdated} resource diperbarui</span>
            <span>{done.holidays} hari libur ditambahkan</span>
            <span className="faint small mt8">Jadwal, Gantt, workload dan dashboard sudah dihitung ulang.</span>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Upload WBS & Workload (Excel)" onClose={onClose} wide footer={plan ? <>
      <button className="btn" onClick={() => setPlan(null)}>Pilih file lain</button>
      <button className="btn primary" disabled={busy} onClick={run}><Upload size={14} />{busy ? 'Mengimpor…' : `Import ${codes.length} proyek`}</button>
    </> : <button className="btn" onClick={onClose}>Batal</button>}>
      {!plan ? (
        <div className="col" style={{ gap: 14 }}>
          <div className="small muted" style={{ lineHeight: 1.55 }}>
            Upload file Excel template <b>Resource Mapping / WBS-Workload</b> (seperti <i>BTN WBS-Workload Oct.xlsx</i>) atau file hasil ekspor MauProject.
            Yang dibaca:
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              <li><b>Master</b> — daftar proyek (kode, nama, versi/PM) dan resource (nama, peran, kapasitas jam/hari, tarif)</li>
              <li><b>Hari Libur</b> — tanggal libur & cuti bersama</li>
              <li><b>Task Plan</b> — blok WBS per proyek: Aktivitas, PIC, Mulai, Selesai, Jam/Hari, % Selesai, Status</li>
            </ul>
          </div>
          <div className="dash-add" style={{ minHeight: 130, flexDirection: 'column' }} onClick={busy ? undefined : pick}>
            <FileSpreadsheet size={28} />
            {busy ? 'Membaca file…' : 'Pilih file Excel (.xlsx)…'}
          </div>
          {error && <div className="row small" style={{ color: 'var(--danger)' }}><AlertTriangle size={14} />{error}</div>}
        </div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <FileSpreadsheet size={16} style={{ color: '#107c41' }} /><b>{plan.source}</b>
            <span className="tag">{plan.stats.projects} proyek</span>
            <span className="tag">{plan.stats.tasks} aktivitas</span>
            <span className="tag">{plan.stats.resources} resource</span>
            <span className="tag">{plan.stats.holidays} hari libur</span>
            {plan.period && <span className="tag">periode mulai {fmtDate(plan.period)}</span>}
          </div>

          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Proyek ({codes.length}/{plan.projects.length} dipilih)</div>
            <div className="card" style={{ maxHeight: 240, overflow: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={codes.length === plan.projects.length} onChange={(e) => setCodes(e.target.checked ? plan.projects.map((p) => p.code) : [])} /></th>
                  <th>Kode / Nama</th><th>Versi / PM</th><th className="num">Aktivitas</th><th>Periode</th><th>Di MauProject</th>
                </tr></thead>
                <tbody>
                  {plan.projects.map((p) => {
                    const ex = existingByCode.get(lc(p.code));
                    return (
                      <tr key={p.code}>
                        <td><input type="checkbox" checked={codes.includes(p.code)} onChange={() => setCodes((c) => (c.includes(p.code) ? c.filter((x) => x !== p.code) : [...c, p.code]))} /></td>
                        <td><b>{p.code}</b>{p.name !== p.code && <div className="faint tiny">{p.name}</div>}</td>
                        <td className="small">{p.version || p.manager || '—'}</td>
                        <td className="num">{p.tasks.length || <span className="faint">0</span>}</td>
                        <td className="small nowrap">{p.start ? fmtDate(p.start, { short: true }) : '—'} – {p.finish ? fmtDate(p.finish, { short: true }) : '—'}</td>
                        <td>{ex
                          ? <span className="tag" style={{ background: '#fef3c7', color: '#92400e' }}>{projectMode === 'replace' ? 'diperbarui' : 'dibuat salinan'}</span>
                          : <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>baru</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid2">
            <Field label="Masukkan proyek ke space">
              <select className="input" value={spaceMode} onChange={(e) => setSpaceMode(e.target.value)}>
                <option value="new">Space baru</option>
                {data.spaces.length > 0 && <option value="existing">Space yang sudah ada</option>}
                <option value="none">Tanpa space (pertahankan yang lama)</option>
              </select>
            </Field>
            {spaceMode === 'new' && <Field label="Nama space baru"><input className="input" value={spaceName} onChange={(e) => setSpaceName(e.target.value)} /></Field>}
            {spaceMode === 'existing' && (
              <Field label="Space">
                <select className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                  {data.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
            {spaceMode === 'none' && <div />}
            <Field label="Jika kode proyek sudah ada">
              <select className="input" value={projectMode} onChange={(e) => setProjectMode(e.target.value)}>
                <option value="replace">Perbarui proyek & ganti task plan-nya</option>
                <option value="new">Buat sebagai proyek baru</option>
              </select>
            </Field>
            <Field label="Resource (Master)">
              <label className="row small" style={{ height: 32 }}>
                <input type="checkbox" checked={updateResources} onChange={(e) => setUpdateResources(e.target.checked)} />
                Perbarui peran & kapasitas anggota tim yang sudah ada
              </label>
            </Field>
          </div>

          <div className="small muted">
            Resource: <b>{plan.resources.filter((r) => !existingRes.has(lc(r.name))).length}</b> baru, <b>{plan.resources.filter((r) => existingRes.has(lc(r.name))).length}</b> sudah ada ·
            Jam/Hari dikonversi menjadi alokasi % berdasarkan kapasitas PIC · aktivitas dengan beberapa PIC digabung menjadi satu task.
          </div>

          {plan.warnings.length > 0 && (
            <div>
              <div className="row small" style={{ cursor: 'pointer', color: '#b45309' }} onClick={() => setShowWarn(!showWarn)}>
                {showWarn ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<AlertTriangle size={14} />{plan.warnings.length} catatan dari file
              </div>
              {showWarn && <ul className="small muted" style={{ margin: '6px 0 0 18px', maxHeight: 140, overflow: 'auto' }}>{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </div>
          )}
          {error && <div className="row small" style={{ color: 'var(--danger)' }}><AlertTriangle size={14} />{error}</div>}
        </div>
      )}
    </Modal>
  );
}
