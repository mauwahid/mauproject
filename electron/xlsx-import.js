'use strict';
/**
 * MauProject — import Master data and Task Plan from a "WBS & Workload" Excel workbook
 * (the BTN Resource Mapping template, or a file exported by MauProject).
 *
 * Reads: Master (projects, resources), Hari Libur (holidays) and Task Plan (WBS blocks).
 * Returns a normalized plan plus warnings; nothing is written to the database here.
 */
const ExcelJS = require('exceljs');
const path = require('path');

// ---------- cell helpers ----------
function raw(cell) {
  let v = cell ? cell.value : null;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('formula' in v || 'sharedFormula' in v) v = null;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text) v = v.text; // hyperlink
    else if (v.error) v = null;
  }
  if (v && typeof v === 'object' && !(v instanceof Date) && 'error' in v) v = null;
  return v === undefined ? null : v;
}
const text = (cell) => { const v = raw(cell); return v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim(); };
const num = (cell) => { const v = raw(cell); if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace('%', '')); return Number.isFinite(n) ? n : null; };
function date(cell) {
  const v = raw(cell);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

/** Find the first row whose cells contain all wanted header labels. Returns {row, cols: {key: colIndex}}. */
function findHeader(ws, wanted, maxRow = 120) {
  for (let r = 1; r <= Math.min(ws.rowCount, maxRow); r++) {
    const row = ws.getRow(r);
    const cols = {};
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = norm(text(cell));
      for (const [key, labels] of Object.entries(wanted)) {
        if (cols[key] === undefined && labels.some((l) => t === l || t.startsWith(l))) cols[key] = c;
      }
    });
    const required = Object.keys(wanted).filter((k) => !k.startsWith('opt_'));
    if (required.every((k) => cols[k] !== undefined)) return { row: r, cols };
  }
  return null;
}

function sheetByName(wb, ...names) {
  for (const n of names) {
    const ws = wb.worksheets.find((w) => norm(w.name) === norm(n));
    if (ws) return ws;
  }
  return null;
}

// ---------- disciplines from role titles ----------
function disciplineFromRole(role) {
  const r = ` ${String(role || '').toLowerCase()} `;
  if (/\b(be|backend|back end)\b/.test(r)) return 'Backend';
  if (/\b(fe|frontend|front end|web)\b/.test(r)) return 'Frontend';
  if (/android/.test(r)) return 'Android';
  if (/\bios\b/.test(r)) return 'iOS';
  if (/\b(qa|test|tester|quality)\b/.test(r)) return 'QA / Test';
  if (/business analyst|\bba\b|analyst/.test(r)) return 'Business Analysis';
  if (/manager|\bpm\b|delivery|scrum/.test(r)) return 'Project Management';
  if (/devops|infra|sre/.test(r)) return 'DevOps';
  if (/design|ui|ux/.test(r)) return 'Design';
  return '';
}

const STATUS_MAP = {
  'not started': 'todo', 'belum mulai': 'todo', todo: 'todo', 'to do': 'todo',
  'in progress': 'in_progress', 'on progress': 'in_progress', progress: 'in_progress', 'sedang berjalan': 'in_progress',
  done: 'done', selesai: 'done', complete: 'done', completed: 'done',
  'on hold': 'blocked', hold: 'blocked', blocked: 'blocked',
  delayed: 'in_progress', terlambat: 'in_progress',
  review: 'review', 'in review': 'review',
};

/**
 * @returns {Promise<{ source, period, projects, resources, holidays, warnings, stats }>}
 */
async function parseWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  if (/\.xls$/i.test(file)) throw new Error('Format .xls (Excel 97–2003) belum didukung. Buka file di Excel lalu Save As .xlsx, kemudian upload lagi.');
  await wb.xlsx.readFile(file);
  const warnings = [];

  // ===== Master =====
  const master = sheetByName(wb, 'Master', 'Master Data');
  const projects = [];
  const resources = [];
  const projByRow = new Map(); // Master row -> project (for resolving formulas)
  let periodStart = null;
  if (master) {
    for (let r = 1; r <= Math.min(master.rowCount, 12); r++) {
      if (/mulai timeline|tanggal mulai/i.test(text(master.getCell(r, 2)))) periodStart = date(master.getCell(r, 3));
    }
    const ph = findHeader(master, { code: ['kode proyek', 'kode'], name: ['nama proyek'], opt_third: ['versi', 'pm', 'dm', 'manager'], opt_budget: ['anggaran', 'budget'] });
    if (ph) {
      const thirdLabel = ph.cols.opt_third ? norm(text(master.getCell(ph.row, ph.cols.opt_third))) : '';
      for (let r = ph.row + 1; r <= master.rowCount; r++) {
        const code = text(master.getCell(r, ph.cols.code));
        if (!code) { if (projects.length) break; continue; }
        if (/^(kode proyek|daftar)/i.test(code)) break;
        const third = ph.cols.opt_third ? text(master.getCell(r, ph.cols.opt_third)) : '';
        const p = {
          code, name: text(master.getCell(r, ph.cols.name)) || code,
          version: thirdLabel.startsWith('versi') ? third : '',
          manager: thirdLabel.startsWith('versi') ? '' : third,
          budget: ph.cols.opt_budget ? num(master.getCell(r, ph.cols.opt_budget)) || 0 : 0,
          tasks: [], masterRow: r,
        };
        projects.push(p);
        projByRow.set(r, p);
      }
    } else warnings.push('Sheet Master: tabel "Kode Proyek / Nama Proyek" tidak ditemukan.');

    const rh = findHeader(master, { name: ['nama'], role: ['peran', 'role', 'jabatan'], cap: ['kapasitas'], opt_rate: ['tarif', 'rate'] });
    if (rh) {
      for (let r = rh.row + 1; r <= master.rowCount; r++) {
        const name = text(master.getCell(r, rh.cols.name));
        if (!name) { if (resources.length) break; continue; }
        if (/^(daftar|status)/i.test(name)) break;
        const role = text(master.getCell(r, rh.cols.role));
        resources.push({
          name, role, capPerDay: num(master.getCell(r, rh.cols.cap)) || 8,
          rate: rh.cols.opt_rate ? num(master.getCell(r, rh.cols.opt_rate)) || 0 : 0,
          discipline: disciplineFromRole(role),
        });
      }
    } else warnings.push('Sheet Master: tabel "Nama / Peran / Kapasitas" tidak ditemukan.');
  } else warnings.push('Sheet "Master" tidak ditemukan — proyek dan resource diambil dari Task Plan.');

  // ===== Hari Libur =====
  const holidays = [];
  const hl = sheetByName(wb, 'Hari Libur', 'Holidays', 'Libur');
  if (hl) {
    const hh = findHeader(hl, { date: ['tanggal', 'date'], opt_name: ['keterangan', 'nama', 'name'] });
    if (hh) {
      for (let r = hh.row + 1; r <= hl.rowCount; r++) {
        const d = date(hl.getCell(r, hh.cols.date));
        if (d) holidays.push({ date: d, name: hh.cols.opt_name ? text(hl.getCell(r, hh.cols.opt_name)) || 'Hari Libur' : 'Hari Libur' });
      }
    }
  }

  // ===== Task Plan =====
  const tp = sheetByName(wb, 'Task Plan', 'TaskPlan', 'WBS');
  if (!tp) throw new Error('Sheet "Task Plan" tidak ditemukan di file ini.');
  const th = findHeader(tp, {
    wbs: ['wbs'], project: ['proyek', 'project'], activity: ['aktivitas', 'activity', 'task'], pic: ['pic', 'assignee'],
    start: ['mulai', 'start'], finish: ['selesai', 'finish', 'end'], opt_jam: ['jam hari', 'jam / hari', 'hours day'],
    opt_total: ['total jam', 'total hours'], opt_pct: ['% selesai', 'selesai %', 'progress', '%'], opt_status: ['status'],
  });
  if (!th) throw new Error('Header Task Plan (WBS, Proyek, Aktivitas, PIC, Mulai, Selesai) tidak ditemukan.');
  const c = th.cols;
  const byCode = new Map(projects.map((p) => [norm(p.code), p]));
  let current = null;
  let skipped = 0;

  const resolveProject = (cell, fallbackName) => {
    const v = cell.value;
    // formula like Master!$B$12 -> master row 12 (works even without cached result)
    const f = v && typeof v === 'object' && (v.formula || v.sharedFormula);
    const m = f && String(f).match(/Master!\$?[A-Z]+\$?(\d+)/i);
    if (m && projByRow.has(Number(m[1]))) return projByRow.get(Number(m[1]));
    const code = text(cell);
    if (code && byCode.has(norm(code))) return byCode.get(norm(code));
    if (code || fallbackName) {
      const p = { code: code || fallbackName, name: fallbackName || code, version: '', manager: '', budget: 0, tasks: [], fromTaskPlan: true };
      projects.push(p);
      byCode.set(norm(p.code), p);
      warnings.push(`Proyek "${p.code}" tidak ada di Master — dibuat dari Task Plan.`);
      return p;
    }
    return null;
  };

  for (let r = th.row + 1; r <= tp.rowCount; r++) {
    const row = tp.getRow(r);
    const wbs = text(row.getCell(c.wbs));
    const activity = text(row.getCell(c.activity));
    const isSummary = wbs && /^\d+$/.test(wbs);
    if (isSummary) {
      const label = activity.replace(/^(proyek|project|[\d.v]+)\s*:\s*/i, '').trim();
      current = resolveProject(row.getCell(c.project), label);
      if (current && !current.version) {
        const vm = activity.match(/^v?(\d+(?:\.\d+)+)\s*:/i);
        if (vm) current.version = vm[1];
      }
      continue;
    }
    if (!activity) continue; // blank input rows
    let proj = current;
    const pc = row.getCell(c.project);
    if (text(pc) && (!proj || norm(text(pc)) !== norm(proj.code))) proj = resolveProject(pc, '');
    if (!proj) { skipped++; continue; }
    const start = date(row.getCell(c.start));
    const finish = date(row.getCell(c.finish)) || start;
    const pic = text(row.getCell(c.pic));
    let pct = c.opt_pct ? num(row.getCell(c.opt_pct)) : null;
    if (pct != null && pct > 1) pct /= 100;
    const statusText = c.opt_status ? text(row.getCell(c.opt_status)) : '';
    const font = row.getCell(c.activity).font || {};
    proj.tasks.push({
      row: r,
      wbs: wbs || '',
      name: activity,
      level: (row.getCell(c.activity).value && typeof row.getCell(c.activity).value === 'string') ? (row.getCell(c.activity).value.match(/^\s*/)[0].length / 3 | 0) : 0,
      pic,
      start, finish,
      jam: c.opt_jam ? num(row.getCell(c.opt_jam)) : null,
      total: c.opt_total ? num(row.getCell(c.opt_total)) : null,
      pct: pct == null ? 0 : Math.max(0, Math.min(1, pct)),
      statusText,
      status: STATUS_MAP[norm(statusText)] || (pct >= 1 ? 'done' : pct > 0 ? 'in_progress' : 'todo'),
      delayed: /delay|terlambat/i.test(statusText),
      bold: !!font.bold,
    });
    if (!start) warnings.push(`Task Plan baris ${r}: "${activity}" tidak punya tanggal Mulai — akan memakai tanggal mulai proyek.`);
  }
  if (skipped) warnings.push(`${skipped} baris Task Plan dilewati karena proyeknya tidak dikenali.`);

  // resources referenced as PIC but missing in Master
  const known = new Set(resources.map((x) => norm(x.name)));
  for (const p of projects) {
    for (const t of p.tasks) {
      if (t.pic && !known.has(norm(t.pic))) {
        known.add(norm(t.pic));
        resources.push({ name: t.pic, role: '', capPerDay: 8, rate: 0, discipline: '', fromTaskPlan: true });
        warnings.push(`PIC "${t.pic}" tidak ada di daftar resource Master — akan dibuat (kapasitas 8 jam/hari).`);
      }
    }
  }

  const used = projects.filter((p) => p.tasks.length || !p.fromTaskPlan);
  for (const p of used) {
    const starts = p.tasks.map((t) => t.start).filter(Boolean).sort();
    const fins = p.tasks.map((t) => t.finish).filter(Boolean).sort();
    p.start = starts[0] || periodStart || null;
    p.finish = fins[fins.length - 1] || null;
  }

  return {
    source: path.basename(file),
    period: periodStart,
    projects: used.map(({ masterRow, ...p }) => p),
    resources,
    holidays,
    warnings: [...new Set(warnings)].slice(0, 60),
    stats: {
      projects: used.length,
      projectsWithTasks: used.filter((p) => p.tasks.length).length,
      tasks: used.reduce((s, p) => s + p.tasks.length, 0),
      resources: resources.length,
      holidays: holidays.length,
    },
  };
}

module.exports = { parseWorkbook, disciplineFromRole };
