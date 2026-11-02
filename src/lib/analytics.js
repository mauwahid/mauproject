/**
 * Resource workload & capacity analytics for MauProject.
 */
import { startOfWeek, startOfMonth, addDays, addMonths, parseDate } from './calendar.js';

export function bucketKey(iso, bucket) {
  if (bucket === 'month') return startOfMonth(iso);
  if (bucket === 'day') return iso;
  return startOfWeek(iso);
}

/** Bucket start dates covering [from, to]. */
export function buckets(from, to, bucket) {
  const out = [];
  let cur = bucketKey(from, bucket);
  while (cur <= to) {
    let end;
    if (bucket === 'month') end = addDays(addMonths(cur, 1), -1);
    else if (bucket === 'day') end = cur;
    else end = addDays(cur, 6);
    out.push({ key: cur, start: cur, end });
    cur = bucket === 'month' ? addMonths(cur, 1) : addDays(cur, bucket === 'day' ? 1 : 7);
  }
  return out;
}

export function bucketLabel(b, bucket) {
  const d = parseDate(b.start);
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  if (bucket === 'month') return `${mon} ${String(d.getUTCFullYear()).slice(2)}`;
  return `${mon} ${d.getUTCDate()}`;
}

export function hoursPerDay(resource, cal) {
  const wd = cal.workingDays.size || 5;
  return (Number(resource.capacity_hours) || 0) / wd;
}

function timeOffSet(timeOff, resourceId) {
  const set = new Set();
  for (const o of timeOff || []) {
    if (o.resource_id !== resourceId) continue;
    for (let d = o.start_date; d <= o.end_date; d = addDays(d, 1)) set.add(d);
  }
  return set;
}

/**
 * Per-resource load across buckets.
 * @param {object} p
 * @param {Array} p.tasks          all tasks (with computed start/finish via p.dates)
 * @param {Map}   p.dates          taskId -> {start, finish, isSummary}
 */
export function computeWorkload({ resources, tasks, assignments, timeOff, dates, cal, from, to, bucket = 'week', projects }) {
  const bks = buckets(from, to, bucket);
  const index = new Map(bks.map((b, i) => [b.key, i]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const archived = new Set((projects || []).filter((p) => p.archived || p.status === 'cancelled').map((p) => p.id));
  const result = [];

  for (const r of resources) {
    if (!r.active) continue;
    const hpd = hoursPerDay(r, cal);
    const off = timeOffSet(timeOff, r.id);
    const rows = bks.map((b) => ({ ...b, capacity: 0, load: 0, items: new Map() }));
    // capacity
    for (const d of cal.range(from, to)) {
      const i = index.get(bucketKey(d, bucket));
      if (i === undefined) continue;
      if (!off.has(d)) rows[i].capacity += hpd;
    }
    // load
    for (const a of assignments) {
      if (a.resource_id !== r.id) continue;
      const t = taskById.get(a.task_id);
      if (!t || t.status === 'done' || archived.has(t.project_id)) continue;
      const dt = dates.get(t.id);
      if (!dt || dt.isSummary || t.is_milestone) continue;
      const s = dt.start > from ? dt.start : from;
      const e = dt.finish < to ? dt.finish : to;
      if (s > e) continue;
      const perDay = hpd * (Number(a.units) || 0) / 100;
      for (const d of cal.range(s, e)) {
        const i = index.get(bucketKey(d, bucket));
        if (i === undefined) continue;
        rows[i].load += perDay;
        rows[i].items.set(t.id, (rows[i].items.get(t.id) || 0) + perDay);
      }
    }
    const totalCap = rows.reduce((s, x) => s + x.capacity, 0);
    const totalLoad = rows.reduce((s, x) => s + x.load, 0);
    result.push({
      resource: r,
      rows,
      totalCap,
      totalLoad,
      utilization: totalCap ? totalLoad / totalCap : 0,
      overloaded: rows.filter((x) => x.load > x.capacity + 0.01).length,
    });
  }
  return { buckets: bks, resources: result };
}

/**
 * Discipline-level demand vs. supply.
 * Demand = assigned load (by the resource's discipline) + unstaffed task estimates (by task discipline).
 */
export function computeCapacity({ resources, tasks, assignments, timeOff, dates, cal, from, to, bucket = 'month', projects }) {
  const wl = computeWorkload({ resources, tasks, assignments, timeOff, dates, cal, from, to, bucket, projects });
  const bks = wl.buckets;
  const index = new Map(bks.map((b, i) => [b.key, i]));
  const disc = new Map();
  const ensure = (name) => {
    const k = name || 'Unassigned';
    if (!disc.has(k)) disc.set(k, { name: k, headcount: 0, rows: bks.map((b) => ({ ...b, supply: 0, assigned: 0, unstaffed: 0 })) });
    return disc.get(k);
  };
  for (const w of wl.resources) {
    const g = ensure(w.resource.discipline);
    g.headcount += 1;
    w.rows.forEach((x, i) => { g.rows[i].supply += x.capacity; g.rows[i].assigned += x.load; });
  }
  const staffed = new Set(assignments.map((a) => a.task_id));
  const archived = new Set((projects || []).filter((p) => p.archived || p.status === 'cancelled').map((p) => p.id));
  for (const t of tasks) {
    if (staffed.has(t.id) || t.status === 'done' || archived.has(t.project_id)) continue;
    const hrs = Number(t.estimate_hours) || 0;
    const dt = dates.get(t.id);
    if (!hrs || !dt || dt.isSummary || t.is_milestone) continue;
    const days = [...cal.range(dt.start, dt.finish)];
    if (!days.length) continue;
    const perDay = hrs * (1 - (Number(t.progress) || 0) / 100) / days.length;
    const g = ensure(t.discipline);
    for (const d of days) {
      if (d < from || d > to) continue;
      const i = index.get(bucketKey(d, bucket));
      if (i !== undefined) g.rows[i].unstaffed += perDay;
    }
  }
  const groups = [...disc.values()].map((g) => {
    const supply = g.rows.reduce((s, r) => s + r.supply, 0);
    const demand = g.rows.reduce((s, r) => s + r.assigned + r.unstaffed, 0);
    return { ...g, supply, demand, gap: supply - demand };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { buckets: bks, groups };
}

/** Utilization color scale: under / healthy / high / over. */
export function utilClass(u) {
  if (u === null || u === undefined || Number.isNaN(u)) return 'u-none';
  if (u === 0) return 'u-zero';
  if (u < 0.5) return 'u-low';
  if (u <= 0.85) return 'u-ok';
  if (u <= 1.0) return 'u-high';
  return 'u-over';
}
