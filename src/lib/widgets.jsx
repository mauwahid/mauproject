/**
 * MauProject dashboard widgets.
 * A dashboard is a list of widget instances { id, type, w, title?, options } stored per scope
 * (space or project). Each widget type declares its options schema, default width and renderer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge, PieChart, Users, BarChart3, HeartPulse, TrendingDown, Activity, Layers, Diamond, CalendarClock,
  GanttChartSquare, Coins, StickyNote, ListChecks,
} from 'lucide-react';
import { Donut, UtilBars, StackedBars, HBars, StackedHBars, LineChart } from '../components/charts.jsx';
import { HealthPill, Progress, Avatar, StatusPill } from '../components/ui.jsx';
import { navigate } from '../components/layout.jsx';
import { computeWorkload, hoursPerDay, bucketLabel } from './analytics.js';
import { addDays, addMonths, startOfWeek, diffDays, parseDate, startOfMonth } from './calendar.js';
import {
  TASK_STATUSES, PRIORITIES, PALETTE, fmtDate, fmtMoney, fmtMoneyShort, fmtHours, fmtPct, statusOf, priorityOf,
} from './format.js';

// ---------- scope ----------
/** Everything a widget needs, limited to the projects in scope. */
export function buildScope(data, derived, projectIds, kind) {
  const ids = new Set(projectIds);
  const projects = data.projects.filter((p) => ids.has(p.id));
  const rows = [];
  for (const p of projects) for (const r of derived.schedules.get(p.id).rows) rows.push({ ...r, project: p });
  const leaves = rows.filter((r) => !r.isSummary);
  const taskIds = new Set(rows.map((r) => r.id));
  const assignments = data.assignments.filter((a) => taskIds.has(a.task_id));
  const resIds = new Set(assignments.map((a) => a.resource_id));
  const resources = data.resources.filter((r) => resIds.has(r.id) && r.active);
  return { kind, projects, rows, leaves, assignments, resources, data, derived, currency: data.settings.currency, today: derived.today };
}

/** Planned work (h) and cost for one leaf row, from assignments (fallback: estimate). */
function workOf(scope, r) {
  const { derived } = scope;
  let hours = 0, cost = 0;
  const asg = derived.asgByTask.get(r.id) || [];
  for (const a of asg) {
    const res = derived.resById.get(a.resource_id);
    if (!res) continue;
    const h = hoursPerDay(res, derived.cal) * (a.units / 100) * r.dur;
    hours += h;
    cost += h * (Number(res.cost_rate) || 0);
  }
  if (!asg.length) hours = Number(r.task.estimate_hours) || 0;
  return { hours, cost, people: asg.map((a) => derived.resById.get(a.resource_id)).filter(Boolean) };
}

function weightedProgress(leaves) {
  let w = 0, pw = 0;
  for (const r of leaves) { const k = Math.max(r.dur, 1); w += k; pw += k * r.progress; }
  return w ? Math.round(pw / w) : 0;
}

function expectedProgress(scope, rows) {
  const { cal } = scope.derived;
  let w = 0, ew = 0;
  for (const r of rows) {
    const k = Math.max(r.dur, 1);
    const total = cal.workdays(r.start, r.finish) || 1;
    const el = scope.today < r.start ? 0 : scope.today > r.finish ? total : cal.workdays(r.start, scope.today);
    w += k; ew += k * Math.min(100, (el / total) * 100);
  }
  return w ? Math.round(ew / w) : 0;
}

const Empty = ({ children }) => <div className="faint small" style={{ padding: '8px 0' }}>{children}</div>;

// ---------- KPI ----------
const KPI_METRICS = {
  progress: 'Progress vs plan',
  open_tasks: 'Open tasks',
  overdue: 'Overdue tasks',
  done_tasks: 'Completed tasks',
  forecast: 'Forecast finish',
  cost: 'Planned labor cost',
  budget_used: 'Budget consumption',
  hours_remaining: 'Remaining effort',
  utilization: 'Team utilization (4 wks)',
  critical: 'Critical-path tasks',
  milestones: 'Milestones (next 30 days)',
  projects: 'Projects & health',
  team: 'People involved',
};

function Kpi({ scope, options }) {
  const { leaves, projects, derived, today, currency } = scope;
  const m = options.metric || 'progress';
  const stats = projects.map((p) => derived.projectStats.get(p.id));
  let value, sub, color;
  switch (m) {
    case 'progress': {
      const v = weightedProgress(leaves); const e = expectedProgress(scope, leaves);
      value = `${v}%`; sub = `planned ${e}% by today`; color = e - v > 15 ? 'var(--danger)' : undefined; break;
    }
    case 'open_tasks': value = leaves.filter((r) => r.task.status !== 'done').length; sub = `${leaves.filter((r) => r.task.status === 'in_progress').length} in progress · ${leaves.filter((r) => r.task.status === 'blocked').length} blocked`; break;
    case 'overdue': { const n = leaves.filter((r) => r.task.status !== 'done' && r.finish < today).length; value = n; sub = 'past finish date, not done'; color = n ? 'var(--danger)' : undefined; break; }
    case 'done_tasks': { const d = leaves.filter((r) => r.task.status === 'done').length; value = `${d}/${leaves.length}`; sub = `${leaves.length ? Math.round((d / leaves.length) * 100) : 0}% of tasks`; break; }
    case 'forecast': {
      const f = leaves.reduce((a, r) => (r.finish > a ? r.finish : a), '');
      const t = projects.reduce((a, p) => (p.target_date && p.target_date > a ? p.target_date : a), '');
      value = f ? fmtDate(f) : '—'; sub = t ? `target ${fmtDate(t)}` : 'no target set'; color = t && f > t ? 'var(--danger)' : undefined; break;
    }
    case 'cost': { const c = stats.reduce((s, x) => s + x.cost, 0); value = fmtMoneyShort(c, currency); sub = `budget ${fmtMoneyShort(projects.reduce((s, p) => s + (p.budget || 0), 0), currency)}`; break; }
    case 'budget_used': {
      const c = stats.reduce((s, x) => s + x.cost, 0); const b = projects.reduce((s, p) => s + (p.budget || 0), 0);
      value = b ? fmtPct(c / b) : '—'; sub = `${fmtMoneyShort(c, currency)} of ${fmtMoneyShort(b, currency)}`; color = b && c > b ? 'var(--danger)' : undefined; break;
    }
    case 'hours_remaining': {
      const h = leaves.filter((r) => r.task.status !== 'done').reduce((s, r) => s + workOf(scope, r).hours * (1 - r.progress / 100), 0);
      value = fmtHours(h); sub = 'planned work not yet done'; break;
    }
    case 'utilization': {
      const wl = computeWorkload({ resources: scope.resources, tasks: scope.data.tasks, assignments: scope.data.assignments, timeOff: scope.data.timeOff, dates: derived.dates, cal: derived.cal, from: today, to: addDays(today, 27), bucket: 'week', projects: scope.data.projects });
      const cap = wl.resources.reduce((s, r) => s + r.totalCap, 0); const load = wl.resources.reduce((s, r) => s + r.totalLoad, 0);
      const over = wl.resources.filter((r) => r.overloaded).length;
      value = fmtPct(cap ? load / cap : 0); sub = `${over} of ${wl.resources.length} people over-allocated`; color = over ? 'var(--warn)' : undefined; break;
    }
    case 'critical': value = leaves.filter((r) => r.critical && r.task.status !== 'done').length; sub = 'open tasks with zero slack'; break;
    case 'milestones': {
      const ms = leaves.filter((r) => r.task.is_milestone && r.task.status !== 'done' && r.start >= today && r.start <= addDays(today, 30));
      value = ms.length; sub = ms[0] ? `next: ${ms.sort((a, b) => a.start.localeCompare(b.start))[0].task.name}` : 'none in the next 30 days'; break;
    }
    case 'projects': {
      const risk = stats.filter((s) => ['at_risk', 'off_track'].includes(s.health)).length;
      value = projects.length; sub = `${projects.filter((p) => p.status === 'active').length} active · ${risk} need attention`; color = undefined; break;
    }
    case 'team': value = scope.resources.length; sub = `${new Set(scope.resources.map((r) => r.discipline)).size} disciplines`; break;
    default: value = '—';
  }
  return (
    <div>
      <div className="k-value" style={{ color, fontSize: String(value).length > 12 ? 20 : 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
      <div className="k-sub" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ---------- distribution donut ----------
function Distribution({ scope, options }) {
  const by = options.groupBy || 'status';
  let segs;
  if (by === 'status') segs = TASK_STATUSES.map((s) => ({ label: s.label, color: s.color, value: scope.leaves.filter((r) => r.task.status === s.id).length }));
  else if (by === 'priority') segs = PRIORITIES.map((s) => ({ label: s.label, color: s.color, value: scope.leaves.filter((r) => r.task.priority === s.id).length }));
  else {
    const m = new Map();
    for (const r of scope.leaves) { const k = r.task.discipline || 'Unspecified'; m.set(k, (m.get(k) || 0) + 1); }
    segs = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: PALETTE[i % PALETTE.length] }));
  }
  segs = segs.filter((s) => s.value > 0);
  return (
    <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
      <Donut segments={segs} size={130} center={{ value: scope.leaves.length, label: 'tasks' }} />
      <div className="col grow" style={{ gap: 6, minWidth: 120 }}>
        {segs.map((s) => <div key={s.label} className="row small"><i style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} /><span className="grow ellipsis">{s.label}</span><b>{s.value}</b></div>)}
      </div>
    </div>
  );
}

// ---------- tasks by assignee ----------
function ByAssignee({ scope }) {
  const rows = scope.resources.map((res) => {
    const mine = scope.leaves.filter((r) => (scope.derived.asgByTask.get(r.id) || []).some((a) => a.resource_id === res.id));
    return { key: res.id, label: res.name, parts: TASK_STATUSES.map((s) => ({ label: s.label, color: s.color, value: mine.filter((r) => r.task.status === s.id).length })) };
  });
  const un = scope.leaves.filter((r) => !(scope.derived.asgByTask.get(r.id) || []).length && !r.task.is_milestone);
  if (un.length) rows.push({ key: 'un', label: 'Unassigned', parts: TASK_STATUSES.map((s) => ({ label: s.label, color: s.color, value: un.filter((r) => r.task.status === s.id).length })) });
  rows.sort((a, b) => b.parts.reduce((s, p) => s + p.value, 0) - a.parts.reduce((s, p) => s + p.value, 0));
  return (
    <>
      <StackedHBars rows={rows} empty="No assigned tasks" />
      <div className="legend mt8">{TASK_STATUSES.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </>
  );
}

// ---------- progress vs plan ----------
function ProgressBars({ scope }) {
  let rows;
  if (scope.kind === 'space') {
    rows = scope.projects.map((p) => {
      const s = scope.derived.projectStats.get(p.id);
      return { key: p.id, label: p.name, value: s.progress, marker: s.expected, color: p.color, right: `${s.progress}% / ${s.expected}%` };
    });
  } else {
    const phases = scope.rows.filter((r) => r.level === 0);
    rows = phases.map((r) => {
      const kids = scope.leaves.filter((l) => l.wbs.startsWith(r.wbs + '.') || l.id === r.id);
      return { key: r.id, label: `${r.wbs} ${r.task.name}`, value: r.progress, marker: expectedProgress(scope, kids), color: r.project.color, right: `${r.progress}% / ${expectedProgress(scope, kids)}%` };
    });
  }
  return (
    <>
      <HBars rows={rows} max={100} empty="No phases yet" />
      <div className="faint tiny mt8">Bar = actual progress · black line = planned progress by today</div>
    </>
  );
}

// ---------- project health table ----------
function HealthTable({ scope }) {
  if (!scope.projects.length) return <Empty>No projects in this space yet.</Empty>;
  return (
    <table className="tbl">
      <thead><tr><th>Project</th><th>Health</th><th>Progress</th><th>Forecast</th><th>Target</th><th className="num">Overdue</th></tr></thead>
      <tbody>
        {scope.projects.map((p) => {
          const s = scope.derived.projectStats.get(p.id);
          const late = p.target_date && s.finish && s.finish > p.target_date;
          return (
            <tr key={p.id} className="click" onClick={() => navigate(`project/${p.id}/dashboard`)}>
              <td><div className="row"><span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} /><b className="ellipsis">{p.name}</b></div></td>
              <td><HealthPill health={s.health} /></td>
              <td><div className="row"><Progress value={s.progress} color={p.color} width={70} /><span className="small">{s.progress}%</span></div></td>
              <td style={{ color: late ? 'var(--danger)' : undefined }}>{fmtDate(s.finish)}</td>
              <td className="muted">{fmtDate(p.target_date)}</td>
              <td className="num" style={{ color: s.overdue ? 'var(--danger)' : 'var(--text-3)' }}>{s.overdue}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- burndown ----------
function Burndown({ scope }) {
  const { leaves, today } = scope;
  const cal = scope.derived.cal;
  const model = useMemo(() => {
    if (!leaves.length) return null;
    const items = leaves.filter((r) => !r.task.is_milestone).map((r) => ({ r, h: workOf(scope, r).hours, days: [...cal.range(r.start, r.finish)] }));
    const start = startOfWeek(leaves.reduce((a, r) => (r.start < a ? r.start : a), leaves[0].start));
    const end = leaves.reduce((a, r) => (r.finish > a ? r.finish : a), leaves[0].finish);
    const weeks = [];
    for (let d = start; d <= addDays(end, 7); d = addDays(d, 7)) weeks.push(d);
    const plannedAt = (d) => items.reduce((s, it) => s + (it.days.length ? it.h * it.days.filter((x) => x > d).length / it.days.length : 0), 0);
    const total = items.reduce((s, it) => s + it.h, 0);
    const actual = items.reduce((s, it) => s + it.h * (1 - it.r.progress / 100), 0);
    const ti = weeks.findIndex((w, i) => w <= today && (i === weeks.length - 1 || weeks[i + 1] > today));
    return {
      labels: weeks.map((w) => fmtDate(w, { short: true })),
      planned: weeks.map((w) => ({ y: plannedAt(addDays(w, -1)) })),
      actualPts: weeks.map((_, i) => (i === ti ? { y: actual } : null)),
      ideal: weeks.map((_, i) => ({ y: total * (1 - i / Math.max(weeks.length - 1, 1)) })),
      ti, total, actual, plannedNow: plannedAt(today),
    };
  }, [leaves, cal, today]); // eslint-disable-line
  if (!model) return <Empty>No scheduled work.</Empty>;
  const behind = model.actual - model.plannedNow;
  return (
    <>
      <LineChart labels={model.labels} markerIndex={model.ti} format={(v) => `${Math.round(v)}h`} series={[
        { key: 'ideal', label: 'Ideal', color: '#cbd5e1', dashed: true, points: model.ideal },
        { key: 'plan', label: 'Planned remaining', color: '#4f46e5', points: model.planned },
        { key: 'act', label: 'Actual remaining (today)', color: behind > 0 ? '#dc2626' : '#16a34a', points: model.actualPts, dots: true },
      ]} />
      <div className="legend mt8">
        <span><i style={{ background: '#4f46e5', height: 3 }} />Planned remaining</span>
        <span><i style={{ background: '#cbd5e1', height: 3 }} />Ideal</span>
        <span><i style={{ background: behind > 0 ? '#dc2626' : '#16a34a', borderRadius: 99 }} />Actual today: {fmtHours(model.actual)} ({behind > 0 ? `${fmtHours(behind)} behind` : `${fmtHours(-behind)} ahead`})</span>
      </div>
    </>
  );
}

// ---------- team utilization ----------
function TeamUtil({ scope, options }) {
  const weeks = Number(options.weeks) || 4;
  const wl = computeWorkload({ resources: scope.resources, tasks: scope.data.tasks, assignments: scope.data.assignments, timeOff: scope.data.timeOff, dates: scope.derived.dates, cal: scope.derived.cal, from: scope.today, to: addDays(scope.today, weeks * 7 - 1), bucket: 'week', projects: scope.data.projects });
  if (!wl.resources.length) return <Empty>No one is assigned yet.</Empty>;
  return (
    <>
      <UtilBars rows={[...wl.resources].sort((a, b) => b.utilization - a.utilization).map((r) => ({ key: r.resource.id, label: r.resource.name, value: r.utilization }))} />
      <div className="faint tiny mt8">Load across all projects · dashed line = 100% capacity</div>
    </>
  );
}

// ---------- weekly workload stacked ----------
function WeeklyLoad({ scope, options }) {
  const weeks = Number(options.weeks) || 8;
  const from = startOfWeek(scope.today);
  const wl = computeWorkload({ resources: scope.resources, tasks: scope.data.tasks, assignments: scope.assignments, timeOff: scope.data.timeOff, dates: scope.derived.dates, cal: scope.derived.cal, from, to: addDays(from, weeks * 7 - 1), bucket: 'week', projects: scope.data.projects });
  const byProject = scope.kind === 'space';
  const taskProject = new Map(scope.rows.map((r) => [r.id, r.project]));
  const series = byProject
    ? scope.projects.map((p) => ({ key: `p${p.id}`, label: p.name, color: p.color }))
    : wl.resources.map((w) => ({ key: `r${w.resource.id}`, label: w.resource.name, color: w.resource.color }));
  const chart = wl.buckets.map((b, i) => {
    const row = { label: bucketLabel(b, 'week'), cap: wl.resources.reduce((s, r) => s + r.rows[i].capacity, 0) };
    for (const w of wl.resources) {
      for (const [tid, h] of w.rows[i].items) {
        const k = byProject ? `p${taskProject.get(tid)?.id}` : `r${w.resource.id}`;
        row[k] = (row[k] || 0) + h;
      }
    }
    return row;
  });
  if (!series.length) return <Empty>No assigned work.</Empty>;
  return (
    <>
      <StackedBars data={chart} series={series} line={{ key: 'cap', label: 'Team capacity', color: '#16a34a' }} height={210} format={(v) => `${Math.round(v)}h`} />
      <div className="legend mt8">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}<span><i style={{ background: '#16a34a', height: 3 }} />Capacity of assigned people</span></div>
    </>
  );
}

// ---------- lists ----------
function Milestones({ scope, options, actions }) {
  const days = Number(options.days) || 60;
  const ms = scope.leaves.filter((r) => r.task.is_milestone && r.task.status !== 'done' && r.start <= addDays(scope.today, days))
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 10);
  if (!ms.length) return <Empty>No open milestones in the next {days} days.</Empty>;
  return ms.map((r) => {
    const slip = r.task.baseline_finish && r.finish > r.task.baseline_finish ? scope.derived.cal.workdays(r.task.baseline_finish, r.finish) - 1 : 0;
    return (
      <div key={r.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(r.id)}>
        <Diamond size={12} style={{ color: r.project.color, fill: r.project.color }} />
        <div className="grow"><div className="bold small ellipsis">{r.task.name}</div>{scope.kind === 'space' && <div className="faint tiny">{r.project.name}</div>}</div>
        {slip > 0 && <span className="tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>+{slip}d</span>}
        <span className={`small nowrap ${r.start < scope.today ? '' : 'muted'}`} style={{ color: r.start < scope.today ? 'var(--danger)' : undefined }}>{fmtDate(r.start, { short: true })}</span>
      </div>
    );
  });
}

function Overdue({ scope, actions }) {
  const list = scope.leaves.filter((r) => r.task.status !== 'done' && r.finish < scope.today).sort((a, b) => a.finish.localeCompare(b.finish));
  if (!list.length) return <Empty>Nothing overdue. 🎯</Empty>;
  return list.slice(0, 12).map((r) => {
    const people = workOf(scope, r).people;
    return (
      <div key={r.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(r.id)}>
        <div className="grow"><div className="bold small ellipsis">{r.task.name}</div><div className="faint tiny">{scope.kind === 'space' ? `${r.project.code} · ` : ''}due {fmtDate(r.finish, { short: true })}</div></div>
        {people[0] && <Avatar resource={people[0]} />}
        <StatusPill status={r.task.status} />
      </div>
    );
  });
}

function MyFocus({ scope, options, actions }) {
  const days = Number(options.days) || 14;
  const list = scope.leaves.filter((r) => r.task.status !== 'done' && r.start <= addDays(scope.today, days) && r.finish >= scope.today)
    .sort((a, b) => a.finish.localeCompare(b.finish)).slice(0, 12);
  if (!list.length) return <Empty>No active work in the next {days} days.</Empty>;
  return list.map((r) => (
    <div key={r.id} className="row" style={{ padding: '7px 0', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(r.id)}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: priorityOf(r.task.priority).color }} title={priorityOf(r.task.priority).label} />
      <div className="grow"><div className="small bold ellipsis">{r.task.name}</div><div className="faint tiny">{fmtDate(r.start, { short: true })} → {fmtDate(r.finish, { short: true })}{scope.kind === 'space' ? ` · ${r.project.code}` : ''}</div></div>
      <Progress value={r.progress} width={50} color={statusOf(r.task.status).color} />
    </div>
  ));
}

// ---------- mini timeline ----------
function Timeline({ scope }) {
  const ref = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const items = scope.kind === 'space'
    ? scope.projects.map((p) => { const s = scope.derived.projectStats.get(p.id); return { key: p.id, label: p.name, start: s.start, finish: s.finish, progress: s.progress, color: p.color, target: p.target_date, go: () => navigate(`project/${p.id}/gantt`) }; }).filter((x) => x.start)
    : scope.rows.filter((r) => r.level === 0).map((r) => ({ key: r.id, label: `${r.wbs} ${r.task.name}`, start: r.start, finish: r.finish, progress: r.progress, color: r.project.color, ms: r.task.is_milestone }));
  if (!items.length) return <div ref={ref}><Empty>Nothing scheduled yet.</Empty></div>;
  const from = startOfMonth(items.reduce((a, x) => (x.start < a ? x.start : a), items[0].start));
  const to = addMonths(startOfMonth(items.reduce((a, x) => (x.finish > a ? x.finish : a), items[0].finish)), 1);
  const LW = 170, RH = 26, W = Math.max(w, 400), days = Math.max(diffDays(from, to), 1);
  const x = (d) => LW + (diffDays(from, d) / days) * (W - LW - 10);
  const months = [];
  for (let m = from; m < to; m = addMonths(m, 1)) months.push(m);
  const H = items.length * RH + 24;
  return (
    <div ref={ref}>
      <svg width={W} height={H}>
        {months.map((m) => <g key={m}><line x1={x(m)} x2={x(m)} y1={0} y2={H} stroke="#eef0f4" /><text x={x(m) + 4} y={12} fontSize="10" fill="#6b7280">{parseDate(m).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</text></g>)}
        {scope.today >= from && scope.today <= to && <line x1={x(scope.today)} x2={x(scope.today)} y1={14} y2={H} stroke="#ef4444" strokeWidth="1.5" />}
        {items.map((it, i) => {
          const y = 20 + i * RH;
          const x1 = x(it.start), x2 = Math.max(x1 + 4, x(addDays(it.finish, 1)));
          return (
            <g key={it.key} style={{ cursor: it.go ? 'pointer' : 'default' }} onClick={it.go}>
              <text x={4} y={y + 13} fontSize="11.5" fill="#111827">{it.label.length > 26 ? it.label.slice(0, 25) + '…' : it.label}</text>
              <rect x={x1} y={y + 3} width={x2 - x1} height={14} rx="4" fill={it.color} opacity="0.3" />
              <rect x={x1} y={y + 3} width={(x2 - x1) * it.progress / 100} height={14} rx="4" fill={it.color} />
              {it.target && <line x1={x(it.target)} x2={x(it.target)} y1={y} y2={y + 20} stroke="#7c3aed" strokeWidth="2" />}
              <title>{`${it.label}\n${fmtDate(it.start)} → ${fmtDate(it.finish)} · ${it.progress}%`}</title>
            </g>
          );
        })}
      </svg>
      <div className="faint tiny">Solid = completed · light = remaining · red = today{scope.kind === 'space' ? ' · purple = target' : ''}</div>
    </div>
  );
}

// ---------- breakdown ----------
function Breakdown({ scope, options }) {
  const measure = options.measure || 'cost';
  const by = options.groupBy || (scope.kind === 'space' ? 'project' : 'phase');
  const acc = new Map();
  const add = (key, label, color, v) => { const e = acc.get(key) || { key, label, color, value: 0 }; e.value += v; acc.set(key, e); };
  const phaseOf = (r) => { let p = r; while (p.parentId) p = scope.derived.schedules.get(r.project.id).byId.get(p.parentId); return p; };
  for (const r of scope.leaves) {
    const wk = workOf(scope, r);
    const val = measure === 'cost' ? wk.cost : measure === 'hours' ? wk.hours : 1;
    if (by === 'person') {
      const asg = scope.derived.asgByTask.get(r.id) || [];
      if (!asg.length) { add('none', 'Unassigned', '#94a3b8', measure === 'tasks' ? 1 : val); continue; }
      for (const a of asg) {
        const res = scope.derived.resById.get(a.resource_id);
        if (!res) continue;
        const h = hoursPerDay(res, scope.derived.cal) * (a.units / 100) * r.dur;
        add(res.id, res.name, res.color, measure === 'cost' ? h * (res.cost_rate || 0) : measure === 'hours' ? h : 1);
      }
    } else if (by === 'project') add(r.project.id, r.project.name, r.project.color, val);
    else if (by === 'discipline') add(r.task.discipline || '—', r.task.discipline || 'Unspecified', null, val);
    else { const ph = phaseOf(r); add(`${r.project.id}-${ph.id}`, scope.kind === 'space' ? `${r.project.code} ${ph.task.name}` : `${ph.wbs} ${ph.task.name}`, r.project.color, val); }
  }
  const fmt = measure === 'cost' ? (v) => fmtMoneyShort(v, scope.currency) : measure === 'hours' ? fmtHours : (v) => Math.round(v);
  const rows = [...acc.values()].sort((a, b) => b.value - a.value).map((r, i) => ({ ...r, color: r.color || PALETTE[i % PALETTE.length] }));
  const budget = scope.projects.reduce((s, p) => s + (p.budget || 0), 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <HBars rows={rows.slice(0, 12)} format={fmt} />
      <div className="faint tiny mt8">Total {fmt(total)}{measure === 'cost' && budget ? ` · budget ${fmtMoneyShort(budget, scope.currency)} (${fmtPct(total / budget)} used)` : ''}</div>
    </>
  );
}

// ---------- note ----------
function Note({ options }) {
  return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{options.text || <span className="faint">Click the gear in edit mode to write a note.</span>}</div>;
}

// ---------- registry ----------
const W_OPTS = [{ value: 3, label: '1/4' }, { value: 4, label: '1/3' }, { value: 6, label: '1/2' }, { value: 8, label: '2/3' }, { value: 12, label: 'Full' }];
export const WIDTHS = W_OPTS;

export const WIDGETS = {
  kpi: {
    name: 'KPI', icon: Gauge, w: 3, description: 'A single headline number: progress, overdue, cost, utilization…',
    title: (o) => KPI_METRICS[o.metric] || 'KPI', compact: true,
    options: [{ key: 'metric', label: 'Metric', type: 'select', choices: Object.entries(KPI_METRICS).map(([value, label]) => ({ value, label })) }],
    defaults: { metric: 'progress' }, render: Kpi,
  },
  distribution: {
    name: 'Task distribution', icon: PieChart, w: 4, description: 'Donut of tasks by status, priority or discipline.',
    title: (o) => `Tasks by ${o.groupBy || 'status'}`,
    options: [{ key: 'groupBy', label: 'Group by', type: 'select', choices: [{ value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'discipline', label: 'Discipline' }] }],
    defaults: { groupBy: 'status' }, render: Distribution,
  },
  by_assignee: { name: 'Tasks by assignee', icon: Users, w: 6, description: 'Stacked bars of each person’s tasks by status.', title: () => 'Tasks by assignee', render: ByAssignee },
  progress: { name: 'Progress vs plan', icon: Activity, w: 6, description: 'Actual vs planned progress per project (space) or per phase (project).', title: (o, s) => (s === 'space' ? 'Project progress vs plan' : 'Phase progress vs plan'), render: ProgressBars },
  health: { name: 'Project health', icon: HeartPulse, w: 8, description: 'Health, progress, forecast and overdue per project.', title: () => 'Project health', render: HealthTable, scopes: ['space'], flush: true },
  burndown: { name: 'Burn-down', icon: TrendingDown, w: 6, description: 'Remaining planned hours over time vs today’s actual remaining.', title: () => 'Burn-down (remaining hours)', render: Burndown },
  team_util: {
    name: 'Team utilization', icon: Users, w: 4, description: 'Utilization of the people working here (load from all projects).',
    title: (o) => `Team utilization · next ${o.weeks || 4} weeks`,
    options: [{ key: 'weeks', label: 'Horizon', type: 'select', choices: [2, 4, 8, 12].map((n) => ({ value: n, label: `${n} weeks` })) }],
    defaults: { weeks: 4 }, render: TeamUtil,
  },
  weekly_load: {
    name: 'Weekly workload', icon: BarChart3, w: 8, description: 'Hours per week stacked by project (space) or person (project) vs capacity.',
    title: (o) => `Weekly workload · next ${o.weeks || 8} weeks`,
    options: [{ key: 'weeks', label: 'Horizon', type: 'select', choices: [4, 8, 12, 16].map((n) => ({ value: n, label: `${n} weeks` })) }],
    defaults: { weeks: 8 }, render: WeeklyLoad,
  },
  timeline: { name: 'Timeline', icon: GanttChartSquare, w: 12, description: 'Mini Gantt of projects (space) or phases (project).', title: (o, s) => (s === 'space' ? 'Project timeline' : 'Phase timeline'), render: Timeline },
  breakdown: {
    name: 'Breakdown', icon: Coins, w: 6, description: 'Cost, hours or task count grouped by project, phase, discipline or person.',
    title: (o) => `${{ cost: 'Planned cost', hours: 'Planned hours', tasks: 'Tasks' }[o.measure || 'cost']} by ${o.groupBy || 'project'}`,
    options: [
      { key: 'measure', label: 'Measure', type: 'select', choices: [{ value: 'cost', label: 'Planned cost' }, { value: 'hours', label: 'Planned hours' }, { value: 'tasks', label: 'Task count' }] },
      { key: 'groupBy', label: 'Group by', type: 'select', choices: [{ value: 'project', label: 'Project' }, { value: 'phase', label: 'Phase' }, { value: 'discipline', label: 'Discipline' }, { value: 'person', label: 'Person' }] },
    ],
    defaults: { measure: 'cost', groupBy: 'project' }, render: Breakdown,
  },
  milestones: {
    name: 'Milestones', icon: Diamond, w: 4, description: 'Open milestones with baseline slippage.',
    title: () => 'Upcoming milestones',
    options: [{ key: 'days', label: 'Look ahead', type: 'select', choices: [30, 60, 90, 180].map((n) => ({ value: n, label: `${n} days` })) }],
    defaults: { days: 60 }, render: Milestones,
  },
  overdue: { name: 'Overdue work', icon: CalendarClock, w: 4, description: 'Tasks past their finish date that are not done.', title: () => 'Overdue work', render: Overdue },
  focus: {
    name: 'Active & upcoming', icon: ListChecks, w: 6, description: 'Work in progress or starting soon, by due date.',
    title: (o) => `Active & upcoming · ${o.days || 14} days`,
    options: [{ key: 'days', label: 'Look ahead', type: 'select', choices: [7, 14, 30].map((n) => ({ value: n, label: `${n} days` })) }],
    defaults: { days: 14 }, render: MyFocus,
  },
  note: {
    name: 'Note', icon: StickyNote, w: 4, description: 'Free text: goals, decisions, links.',
    title: () => 'Note', options: [{ key: 'text', label: 'Text', type: 'textarea' }], defaults: { text: '' }, render: Note,
  },
};

let seq = 0;
export const newWidget = (type, extra = {}) => ({
  id: `w${Date.now().toString(36)}${(seq++).toString(36)}`,
  type, w: WIDGETS[type].w, options: { ...(WIDGETS[type].defaults || {}) }, ...extra,
});

export function defaultDashboard(kind) {
  const k = (metric) => newWidget('kpi', { options: { metric } });
  if (kind === 'space') {
    return [
      k('projects'), k('progress'), k('overdue'), k('cost'),
      newWidget('health'), newWidget('distribution'),
      newWidget('timeline'),
      newWidget('weekly_load'), newWidget('milestones'),
      newWidget('breakdown', { options: { measure: 'cost', groupBy: 'project' } }), newWidget('team_util', { w: 6 }),
    ];
  }
  return [
    k('progress'), k('forecast'), k('open_tasks'), k('budget_used'),
    newWidget('progress'), newWidget('burndown'),
    newWidget('timeline', { w: 8 }), newWidget('milestones'),
    newWidget('by_assignee', { w: 8 }), newWidget('distribution'),
    newWidget('breakdown', { options: { measure: 'hours', groupBy: 'discipline' } }), newWidget('overdue', { w: 6 }),
  ];
}

export function widgetTitle(wd, kind) {
  const def = WIDGETS[wd.type];
  return wd.title || (def ? def.title(wd.options || {}, kind) : 'Widget');
}

export { KPI_METRICS };
