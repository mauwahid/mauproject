/**
 * Builds the plain data model for the MauProject "WBS & Workload" Excel export
 * (rendered to .xlsx by electron/xlsx-export.js).
 */
import { addDays, addMonths, diffDays, parseDate } from './calendar.js';
import { currencyExcelFormat } from './format.js';

const MONTHS_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const monthLabel = (iso) => { const d = parseDate(iso); return `${MONTHS_SHORT_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const STATUS_MAP = { todo: 'Not Started', in_progress: 'In Progress', review: 'In Progress', blocked: 'On Hold', done: 'Done' };

export function excelStatus(task, finish, today) {
  if (task.status !== 'done' && finish < today) return 'Delayed';
  return STATUS_MAP[task.status] || 'Not Started';
}

/** Mon..Sun mask, '1' = non-working (Excel NETWORKDAYS.INTL convention). */
export function weekendMask(settings) {
  let wd = [1, 2, 3, 4, 5];
  try { wd = JSON.parse(settings.workingDays || '[1,2,3,4,5]'); } catch { /* default */ }
  return [1, 2, 3, 4, 5, 6, 0].map((d) => (wd.includes(d) ? '0' : '1')).join('');
}

/**
 * @param {object} opts { start: 'YYYY-MM-01', months: number, projectIds: number[] }
 */
export function buildExcelModel(data, derived, opts) {
  const start = opts.start;
  const end = addDays(addMonths(start, opts.months), -1);
  const today = derived.today;
  const wdCount = Math.max(1, derived.cal.workingDays.size);
  const hpdOf = (r) => Math.round(((Number(r.capacity_hours) || 0) / wdCount) * 10) / 10;

  const projects = data.projects.filter((p) => opts.projectIds.includes(p.id));
  const usedRes = new Set();

  const modelProjects = projects.map((p, pi) => {
    const sched = derived.schedules.get(p.id);
    const rows = [];
    for (const r of sched.rows) {
      const t = r.task;
      const base = {
        wbs: `${pi + 1}.${r.wbs}`, level: r.level, name: t.name, start: r.start, finish: r.finish,
        pct: Math.max(0, Math.min(1, (r.progress || 0) / 100)),
      };
      if (r.isSummary) {
        rows.push({ ...base, phase: true, pic: '', jam: null, status: r.progress >= 100 ? 'Done' : r.progress > 0 ? 'In Progress' : 'Not Started' });
        continue;
      }
      const status = excelStatus(t, r.finish, today);
      const asg = derived.asgByTask.get(t.id) || [];
      if (!asg.length || t.is_milestone) {
        const days = Math.max(1, derived.cal.workdays(r.start, r.finish));
        const est = Number(t.estimate_hours) || 0;
        rows.push({ ...base, pic: '', jam: !t.is_milestone && est ? Math.round((est / days) * 10) / 10 : null, status });
        continue;
      }
      for (const a of asg) {
        const res = derived.resById.get(a.resource_id);
        if (!res) continue;
        usedRes.add(res.id);
        rows.push({ ...base, pic: res.name, jam: Math.round(hpdOf(res) * (a.units / 100) * 10) / 10, status });
      }
    }
    return {
      code: p.code || p.name, name: p.name, pm: p.manager || '', budget: Number(p.budget) || 0,
      summary: { start: sched.start, finish: sched.finish }, rows,
    };
  });

  const resources = data.resources
    .filter((r) => r.active || usedRes.has(r.id))
    .map((r) => ({ name: r.name, role: r.role, cap: hpdOf(r), rate: Number(r.cost_rate) || 0 }));

  const currency = data.settings.currency || 'IDR';
  return {
    title: `MauProject — Resource Mapping Multi Proyek (${monthLabel(start)} – ${monthLabel(end)})`,
    periodStart: start,
    days: diffDays(start, end) + 1,
    periodLabel: `${monthLabel(start)} – ${monthLabel(end)}`,
    exportedLabel: new Date().toLocaleString('id-ID'),
    today,
    weekendMask: weekendMask(data.settings),
    holidays: data.holidays.map((h) => ({ date: h.date, name: h.name })),
    currency,
    currencyFormat: currencyExcelFormat(currency),
    projects: modelProjects,
    resources,
  };
}
