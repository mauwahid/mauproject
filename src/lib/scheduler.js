/**
 * MauProject scheduling engine.
 * - Builds the WBS tree and outline codes
 * - Forward pass (ASAP) honoring FS / SS / FF / SF links with lag (working days)
 * - Backward pass for total slack and the critical path
 * - Summary-task roll-ups (dates, progress, work)
 */

export const DEP_TYPES = {
  FS: 'Finish-to-Start',
  SS: 'Start-to-Start',
  FF: 'Finish-to-Finish',
  SF: 'Start-to-Finish',
};

export function buildTree(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map();
  const roots = [];
  for (const t of tasks) {
    const pid = t.parent_id && byId.has(t.parent_id) ? t.parent_id : null;
    if (pid == null) roots.push(t);
    else {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(t);
    }
  }
  const cmp = (a, b) => (a.sort_order - b.sort_order) || (a.id - b.id);
  roots.sort(cmp);
  for (const list of children.values()) list.sort(cmp);
  return { byId, children, roots };
}

/** Would linking pred -> succ create a cycle? */
export function createsCycle(deps, predId, succId) {
  if (predId === succId) return true;
  const out = new Map();
  for (const d of deps) {
    if (!out.has(d.predecessor_id)) out.set(d.predecessor_id, []);
    out.get(d.predecessor_id).push(d.successor_id);
  }
  const stack = [succId];
  const seen = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (n === predId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of out.get(n) || []) stack.push(m);
  }
  return false;
}

/**
 * @returns {{
 *  rows: Array, byId: Map, order: number[], start: string, finish: string,
 *  changes: Array<{id:number, patch:object}>, criticalCount: number
 * }}
 */
export function schedule(tasks, deps, cal) {
  const { byId, children, roots } = buildTree(tasks);
  const info = new Map();
  const order = [];

  // ---- WBS codes + flat order
  const walk = (list, prefix, level, parentId) => {
    list.forEach((t, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      const kids = children.get(t.id) || [];
      info.set(t.id, { id: t.id, task: t, wbs, level, parentId, isSummary: kids.length > 0, childIds: kids.map((k) => k.id) });
      order.push(t.id);
      walk(kids, wbs, level + 1, t.id);
    });
  };
  walk(roots, '', 0, null);

  // ---- leaf initial values
  const leaves = order.filter((id) => !info.get(id).isSummary);
  for (const id of leaves) {
    const t = byId.get(id);
    const n = info.get(id);
    n.dur = t.is_milestone ? 0 : Math.max(1, Number(t.duration) || 1);
    n.s = cal.idx(t.start_date);
    n.e = n.s + n.dur - 1;
  }

  // ---- dependency graph between leaves
  const leafSet = new Set(leaves);
  const links = deps.filter((d) => leafSet.has(d.predecessor_id) && leafSet.has(d.successor_id));
  const preds = new Map();
  const succs = new Map();
  for (const d of links) {
    if (!preds.has(d.successor_id)) preds.set(d.successor_id, []);
    preds.get(d.successor_id).push(d);
    if (!succs.has(d.predecessor_id)) succs.set(d.predecessor_id, []);
    succs.get(d.predecessor_id).push(d);
  }

  // Kahn topological sort
  const indeg = new Map(leaves.map((id) => [id, 0]));
  for (const d of links) indeg.set(d.successor_id, indeg.get(d.successor_id) + 1);
  const queue = leaves.filter((id) => indeg.get(id) === 0);
  const topo = [];
  while (queue.length) {
    const id = queue.shift();
    topo.push(id);
    for (const d of succs.get(id) || []) {
      indeg.set(d.successor_id, indeg.get(d.successor_id) - 1);
      if (indeg.get(d.successor_id) === 0) queue.push(d.successor_id);
    }
  }
  const cyclic = leaves.filter((id) => !topo.includes(id));

  // ---- forward pass
  for (const id of topo) {
    const n = info.get(id);
    const ps = preds.get(id);
    if (!ps || !ps.length || n.task.schedule_mode === 'manual') continue;
    let es = -Infinity;
    for (const d of ps) {
      const p = info.get(d.predecessor_id);
      const lag = Number(d.lag) || 0;
      let c;
      switch (d.type) {
        case 'SS': c = p.s + lag; break;
        case 'FF': c = p.e + lag - n.dur + 1; break;
        case 'SF': c = p.s + lag - n.dur; break;
        default: c = p.e + 1 + lag;
      }
      if (c > es) es = c;
    }
    n.s = Math.max(0, es);
    n.e = n.s + n.dur - 1;
  }

  // ---- backward pass
  let projEnd = -Infinity;
  for (const id of leaves) projEnd = Math.max(projEnd, info.get(id).e);
  for (const id of leaves) info.get(id).lf = projEnd;
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i];
    const n = info.get(id);
    for (const d of succs.get(id) || []) {
      const s = info.get(d.successor_id);
      const lag = Number(d.lag) || 0;
      const ls = s.lf - s.dur + 1;
      let c;
      switch (d.type) {
        case 'SS': c = ls - lag + n.dur - 1; break;
        case 'FF': c = s.lf - lag; break;
        case 'SF': c = s.lf - lag + n.dur; break;
        default: c = ls - 1 - lag;
      }
      if (c < n.lf) n.lf = c;
    }
  }
  let criticalCount = 0;
  for (const id of leaves) {
    const n = info.get(id);
    n.slack = n.lf - n.e;
    n.critical = n.slack <= 0 && leaves.length > 1;
    if (n.critical) criticalCount++;
  }
  for (const id of cyclic) info.get(id).cyclic = true;

  // ---- summary roll-ups (post-order)
  const roll = (id) => {
    const n = info.get(id);
    if (!n.isSummary) {
      const t = n.task;
      n.progress = Number(t.progress) || 0;
      n.hours = Number(t.estimate_hours) || 0;
      return n;
    }
    let s = Infinity, e = -Infinity, w = 0, pw = 0, hrs = 0, crit = false, minSlack = Infinity;
    for (const cid of n.childIds) {
      const c = roll(cid);
      s = Math.min(s, c.s);
      e = Math.max(e, c.e);
      const weight = Math.max(c.dur, 1);
      w += weight;
      pw += weight * c.progress;
      hrs += c.hours;
      crit = crit || c.critical;
      minSlack = Math.min(minSlack, c.slack ?? Infinity);
    }
    n.s = s; n.e = Math.max(e, s); n.dur = n.e - n.s + 1;
    n.progress = w ? Math.round(pw / w) : 0;
    n.hours = hrs;
    n.critical = crit;
    n.slack = minSlack;
    return n;
  };
  roots.forEach((r) => roll(r.id));

  // ---- materialize dates + detect changes to persist
  const changes = [];
  const rows = order.map((id) => {
    const n = info.get(id);
    const t = n.task;
    n.start = cal.date(n.s);
    n.finish = n.dur === 0 ? n.start : cal.date(n.e);
    const patch = {};
    if (n.start !== t.start_date) patch.start_date = n.start;
    if (n.isSummary && n.dur !== t.duration) patch.duration = n.dur;
    if (n.isSummary && n.progress !== t.progress) patch.progress = n.progress;
    if (Object.keys(patch).length) changes.push({ id, patch });
    return n;
  });

  const starts = rows.map((r) => r.start);
  const finishes = rows.map((r) => r.finish);
  return {
    rows,
    byId: info,
    order,
    start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    finish: finishes.length ? finishes.reduce((a, b) => (a > b ? a : b)) : null,
    changes,
    criticalCount,
    cyclic,
  };
}

/** Project-level progress weighted by duration across leaf tasks. */
export function projectProgress(sched) {
  let w = 0, pw = 0;
  for (const r of sched.rows) {
    if (r.isSummary) continue;
    const weight = Math.max(r.dur, 1);
    w += weight;
    pw += weight * r.progress;
  }
  return w ? Math.round(pw / w) : 0;
}

/** Predecessor label in MS Project notation, e.g. "3FS+2d, 5SS". */
export function predLabel(taskId, deps, sched) {
  return deps
    .filter((d) => d.successor_id === taskId)
    .map((d) => {
      const r = sched.byId.get(d.predecessor_id);
      const code = r ? r.wbs : '?';
      const lag = Number(d.lag) || 0;
      return `${code}${d.type === 'FS' && !lag ? '' : d.type}${lag ? (lag > 0 ? '+' : '') + lag + 'd' : ''}`;
    })
    .join(', ');
}
