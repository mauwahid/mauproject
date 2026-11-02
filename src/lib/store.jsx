import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { calendarFromSettings, todayISO } from './calendar.js';
import { schedule, createsCycle, projectProgress } from './scheduler.js';
import { hoursPerDay } from './analytics.js';
import { buildSampleData, finalizeSampleData } from './seed.js';

const api = window.mauproject;
const StoreCtx = createContext(null);

export function useStore() {
  return useContext(StoreCtx);
}

const COLL = {
  projects: 'projects',
  tasks: 'tasks',
  dependencies: 'dependencies',
  resources: 'resources',
  assignments: 'assignments',
  timeOff: 'time_off',
  holidays: 'holidays',
};

function descendants(tasks, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) if (t.parent_id && out.has(t.parent_id) && !out.has(t.id)) { out.add(t.id); grew = true; }
  }
  return out;
}

export function computeHealth(project, stats, today) {
  if (project.status === 'completed') return 'done';
  if (project.health && project.health !== 'auto') return project.health;
  if (!stats.finish) return 'on_track';
  let score = 0;
  if (project.target_date && stats.finish > project.target_date) score += 2;
  if (stats.overdue > 0) score += stats.overdue > 3 ? 2 : 1;
  if (stats.expected - stats.progress > 20) score += 1;
  if (stats.blocked > 0) score += 1;
  return score >= 3 ? 'off_track' : score >= 1 ? 'at_risk' : 'on_track';
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [openTaskId, setOpenTaskId] = useState(null);
  const ref = useRef(null);

  const commit = useCallback((next) => { ref.current = next; setData(next); }, []);
  const patch = useCallback((key, fn) => commit({ ...ref.current, [key]: fn(ref.current[key]) }), [commit]);

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const reload = useCallback(async () => {
    const all = await api.db.loadAll();
    commit(all);
    return all;
  }, [commit]);

  // ---------- scheduling ----------
  const calFor = (d) => calendarFromSettings(d.settings, d.holidays);

  const reschedule = useCallback(async (projectId) => {
    const d = ref.current;
    const s = schedule(
      d.tasks.filter((t) => t.project_id === projectId),
      d.dependencies.filter((x) => x.project_id === projectId),
      calFor(d),
    );
    if (!s.changes.length) return;
    const updated = await api.db.bulkUpdate('tasks', s.changes);
    const map = new Map(updated.map((t) => [t.id, t]));
    patch('tasks', (list) => list.map((t) => map.get(t.id) || t));
  }, [patch]);

  const rescheduleAll = useCallback(async () => {
    for (const p of ref.current.projects) await reschedule(p.id);
  }, [reschedule]);

  // ---------- initial load ----------
  useEffect(() => {
    (async () => {
      try {
        let all = await reload();
        if (all.settings.seeded !== '1' && all.projects.length === 0) {
          await api.db.importDataset(buildSampleData(todayISO()));
          all = await reload();
          await rescheduleAll();
          const fin = finalizeSampleData(ref.current, calFor(ref.current), todayISO());
          if (fin.length) await api.db.bulkUpdate('tasks', fin);
          await reload();
          await rescheduleAll();
        }
      } catch (e) {
        console.error(e);
        setError(String(e && e.message ? e.message : e));
      }
    })();
  }, [reload, rescheduleAll]);

  // ---------- derived ----------
  const derived = useMemo(() => {
    if (!data) return null;
    const cal = calFor(data);
    const today = todayISO();
    const schedules = new Map();
    const dates = new Map();
    const projectStats = new Map();
    const resById = new Map(data.resources.map((r) => [r.id, r]));
    const asgByTask = new Map();
    for (const a of data.assignments) {
      if (!asgByTask.has(a.task_id)) asgByTask.set(a.task_id, []);
      asgByTask.get(a.task_id).push(a);
    }
    for (const p of data.projects) {
      const s = schedule(
        data.tasks.filter((t) => t.project_id === p.id),
        data.dependencies.filter((x) => x.project_id === p.id),
        cal,
      );
      schedules.set(p.id, s);
      let overdue = 0, blocked = 0, done = 0, leaves = 0, cost = 0, work = 0, milestones = 0;
      for (const r of s.rows) {
        dates.set(r.id, { start: r.start, finish: r.finish, isSummary: r.isSummary, wbs: r.wbs, critical: r.critical });
        if (r.isSummary) continue;
        leaves++;
        if (r.task.is_milestone) milestones++;
        if (r.task.status === 'done') done++;
        if (r.task.status === 'blocked') blocked++;
        if (r.finish < today && r.task.status !== 'done') overdue++;
        for (const a of asgByTask.get(r.id) || []) {
          const res = resById.get(a.resource_id);
          if (!res) continue;
          const h = hoursPerDay(res, cal) * (a.units / 100) * Math.max(r.dur, 0);
          work += h;
          cost += h * (Number(res.cost_rate) || 0);
        }
      }
      const progress = projectProgress(s);
      let expected = 0;
      if (s.start && s.finish) {
        const total = cal.workdays(s.start, s.finish);
        const elapsed = today < s.start ? 0 : today > s.finish ? total : cal.workdays(s.start, today);
        expected = total ? Math.round((elapsed / total) * 100) : 0;
      }
      const stats = {
        start: s.start, finish: s.finish, progress, expected, overdue, blocked, done, leaves,
        cost, work, milestones, critical: s.criticalCount,
      };
      stats.health = computeHealth(p, stats, today);
      projectStats.set(p.id, stats);
    }
    return { cal, today, schedules, dates, projectStats, resById, asgByTask };
  }, [data]);

  // ---------- actions ----------
  const actions = useMemo(() => {
    const create = async (key, obj) => {
      const row = await api.db.create(COLL[key], obj);
      patch(key, (l) => [...l, row]);
      return row;
    };
    const update = async (key, id, p) => {
      const row = await api.db.update(COLL[key], id, p);
      patch(key, (l) => l.map((x) => (x.id === id ? row : x)));
      return row;
    };

    return {
      reload,
      toast,
      openTask: setOpenTaskId,
      reschedule,
      rescheduleAll,

      async setSetting(k, v) {
        await api.db.setSetting(k, v);
        patch('settings', (s) => ({ ...s, [k]: String(v) }));
        if (k === 'workingDays' || k === 'hoursPerDay') await rescheduleAll();
      },

      // projects
      createProject: (p) => create('projects', p),
      updateProject: (id, p) => update('projects', id, p),
      async deleteProject(id) {
        await api.db.remove('projects', id);
        const d = ref.current;
        const tids = new Set(d.tasks.filter((t) => t.project_id === id).map((t) => t.id));
        commit({
          ...d,
          projects: d.projects.filter((p) => p.id !== id),
          tasks: d.tasks.filter((t) => !tids.has(t.id)),
          dependencies: d.dependencies.filter((x) => x.project_id !== id),
          assignments: d.assignments.filter((a) => !tids.has(a.task_id)),
        });
      },
      async duplicateProject(id) {
        const np = await api.db.duplicateProject(id);
        await reload();
        return np;
      },
      async setBaseline(projectId) {
        const s = derived?.schedules.get(projectId);
        if (!s) return;
        const items = s.rows.map((r) => ({ id: r.id, patch: { baseline_start: r.start, baseline_finish: r.finish } }));
        const updated = await api.db.bulkUpdate('tasks', items);
        const map = new Map(updated.map((t) => [t.id, t]));
        patch('tasks', (l) => l.map((t) => map.get(t.id) || t));
        toast('Baseline saved');
      },

      // tasks
      async createTask(t) {
        const d = ref.current;
        const siblings = d.tasks.filter((x) => x.project_id === t.project_id && (x.parent_id || null) === (t.parent_id || null));
        const sort_order = t.sort_order ?? (siblings.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1);
        const project = d.projects.find((p) => p.id === t.project_id);
        const parent = t.parent_id ? d.tasks.find((x) => x.id === t.parent_id) : null;
        const start = t.start_date || parent?.start_date || (project && project.start_date > todayISO() ? project.start_date : todayISO());
        const row = await create('tasks', {
          name: 'New Task', duration: 1, status: 'todo', priority: 'medium', ...t, sort_order, start_date: start,
        });
        await reschedule(t.project_id);
        return row;
      },
      async updateTask(id, p) {
        const before = ref.current.tasks.find((t) => t.id === id);
        const row = await update('tasks', id, p);
        if (p.status === 'done' && before?.status !== 'done' && p.progress === undefined && row.progress < 100) {
          await update('tasks', id, { progress: 100 });
        }
        await reschedule(row.project_id);
        return row;
      },
      async deleteTask(id) {
        const d = ref.current;
        const t = d.tasks.find((x) => x.id === id);
        if (!t) return;
        await api.db.remove('tasks', id);
        const gone = descendants(d.tasks, id);
        commit({
          ...d,
          tasks: d.tasks.filter((x) => !gone.has(x.id)),
          dependencies: d.dependencies.filter((x) => !gone.has(x.predecessor_id) && !gone.has(x.successor_id)),
          assignments: d.assignments.filter((a) => !gone.has(a.task_id)),
        });
        await reschedule(t.project_id);
      },
      async indentTask(id) {
        const d = ref.current;
        const t = d.tasks.find((x) => x.id === id);
        const sibs = d.tasks.filter((x) => x.project_id === t.project_id && (x.parent_id || null) === (t.parent_id || null))
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
        const i = sibs.findIndex((x) => x.id === id);
        if (i <= 0) return toast('Nothing above to indent under', 'warn');
        const newParent = sibs[i - 1];
        const kids = d.tasks.filter((x) => x.parent_id === newParent.id);
        const so = kids.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1;
        // Dependencies are only allowed between leaf tasks: drop links on the new summary.
        const drop = d.dependencies.filter((x) => x.predecessor_id === newParent.id || x.successor_id === newParent.id);
        for (const x of drop) await api.db.remove('dependencies', x.id);
        if (drop.length) patch('dependencies', (l) => l.filter((x) => !drop.includes(x)));
        await update('tasks', id, { parent_id: newParent.id, sort_order: so });
        await reschedule(t.project_id);
      },
      async outdentTask(id) {
        const d = ref.current;
        const t = d.tasks.find((x) => x.id === id);
        if (!t.parent_id) return;
        const parent = d.tasks.find((x) => x.id === t.parent_id);
        const sibs = d.tasks.filter((x) => x.project_id === t.project_id && (x.parent_id || null) === (parent.parent_id || null))
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
        const items = [];
        let n = 1;
        for (const s of sibs) {
          items.push({ id: s.id, patch: { sort_order: n++ } });
          if (s.id === parent.id) items.push({ id, patch: { sort_order: n++, parent_id: parent.parent_id || null } });
        }
        const updated = await api.db.bulkUpdate('tasks', items);
        const map = new Map(updated.map((x) => [x.id, x]));
        patch('tasks', (l) => l.map((x) => map.get(x.id) || x));
        await reschedule(t.project_id);
      },
      async moveTask(id, dir) {
        const d = ref.current;
        const t = d.tasks.find((x) => x.id === id);
        const sibs = d.tasks.filter((x) => x.project_id === t.project_id && (x.parent_id || null) === (t.parent_id || null))
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
        const i = sibs.findIndex((x) => x.id === id);
        const j = i + dir;
        if (j < 0 || j >= sibs.length) return;
        [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
        const updated = await api.db.bulkUpdate('tasks', sibs.map((s, k) => ({ id: s.id, patch: { sort_order: k + 1 } })));
        const map = new Map(updated.map((x) => [x.id, x]));
        patch('tasks', (l) => l.map((x) => map.get(x.id) || x));
      },

      // dependencies
      async addDependency(predId, succId, type = 'FS', lag = 0) {
        const d = ref.current;
        const p = d.tasks.find((x) => x.id === predId);
        const s = d.tasks.find((x) => x.id === succId);
        if (!p || !s) return null;
        if (p.project_id !== s.project_id) { toast('Links must be within the same project', 'warn'); return null; }
        if (d.tasks.some((x) => x.parent_id === predId || x.parent_id === succId)) { toast('Link work tasks, not summary tasks', 'warn'); return null; }
        if (d.dependencies.some((x) => x.predecessor_id === predId && x.successor_id === succId)) return null;
        if (createsCycle(d.dependencies, predId, succId)) { toast('That link would create a circular dependency', 'error'); return null; }
        const row = await create('dependencies', { project_id: p.project_id, predecessor_id: predId, successor_id: succId, type, lag });
        await reschedule(p.project_id);
        return row;
      },
      async updateDependency(id, p) {
        const row = await update('dependencies', id, p);
        await reschedule(row.project_id);
      },
      async removeDependency(id) {
        const dep = ref.current.dependencies.find((x) => x.id === id);
        await api.db.remove('dependencies', id);
        patch('dependencies', (l) => l.filter((x) => x.id !== id));
        if (dep) await reschedule(dep.project_id);
      },

      // resources
      createResource: (r) => create('resources', r),
      updateResource: (id, r) => update('resources', id, r),
      async deleteResource(id) {
        await api.db.remove('resources', id);
        const d = ref.current;
        commit({
          ...d,
          resources: d.resources.filter((r) => r.id !== id),
          assignments: d.assignments.filter((a) => a.resource_id !== id),
          timeOff: d.timeOff.filter((o) => o.resource_id !== id),
        });
      },
      async assign(taskId, resourceId, units = 100) {
        if (ref.current.assignments.some((a) => a.task_id === taskId && a.resource_id === resourceId)) return null;
        return create('assignments', { task_id: taskId, resource_id: resourceId, units });
      },
      updateAssignment: (id, p) => update('assignments', id, p),
      async unassign(id) {
        await api.db.remove('assignments', id);
        patch('assignments', (l) => l.filter((a) => a.id !== id));
      },
      createTimeOff: (o) => create('timeOff', o),
      async deleteTimeOff(id) {
        await api.db.remove('time_off', id);
        patch('timeOff', (l) => l.filter((o) => o.id !== id));
      },

      // calendar
      async addHoliday(h) {
        const row = await create('holidays', h);
        await rescheduleAll();
        return row;
      },
      async deleteHoliday(id) {
        await api.db.remove('holidays', id);
        patch('holidays', (l) => l.filter((h) => h.id !== id));
        await rescheduleAll();
      },

      // data management
      async loadSampleData() {
        await api.db.importDataset(buildSampleData(todayISO()));
        await reload();
        await rescheduleAll();
        const fin = finalizeSampleData(ref.current, calFor(ref.current), todayISO());
        if (fin.length) await api.db.bulkUpdate('tasks', fin);
        await reload();
        await rescheduleAll();
        toast('Sample engineering portfolio loaded', 'success');
      },
      async resetAll() {
        await api.db.reset();
        await reload();
        toast('All data cleared');
      },
    };
  }, [patch, commit, reload, reschedule, rescheduleAll, toast, derived]);

  const value = useMemo(() => ({ data, derived, actions, toasts, openTaskId, error }), [data, derived, actions, toasts, openTaskId, error]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
