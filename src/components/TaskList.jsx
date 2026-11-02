import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Search, Diamond } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { AvatarStack, Progress, Segmented } from './ui.jsx';
import { TASK_STATUSES, PRIORITIES, statusOf, priorityOf, fmtDate } from '../lib/format.js';

/**
 * ClickUp-style grouped task list.
 * props: projectId (optional, scopes list + enables quick add), showProject
 */
export default function TaskList({ projectId, showProject }) {
  const { data, derived, actions } = useStore();
  const [groupBy, setGroupBy] = useState('status');
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [folded, setFolded] = useState(new Set());
  const [sort, setSort] = useState('due');

  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const asg = derived.asgByTask;

  const tasks = useMemo(() => data.tasks.filter((t) => {
    const d = derived.dates.get(t.id);
    if (!d || d.isSummary) return false;
    const p = projById.get(t.project_id);
    if (projectId ? t.project_id !== projectId : (p.archived || p.status === 'cancelled')) return false;
    if (hideDone && t.status === 'done') return false;
    if (who === 'none' && (asg.get(t.id) || []).length) return false;
    if (who && who !== 'none' && !(asg.get(t.id) || []).some((a) => a.resource_id === Number(who))) return false;
    if (q && !`${t.name} ${t.tags} ${t.discipline}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [data.tasks, derived.dates, projById, projectId, hideDone, who, q, asg]);

  const sorted = useMemo(() => {
    const pri = Object.fromEntries(PRIORITIES.map((p, i) => [p.id, i]));
    const list = [...tasks];
    if (sort === 'due') list.sort((a, b) => derived.dates.get(a.id).finish.localeCompare(derived.dates.get(b.id).finish));
    if (sort === 'priority') list.sort((a, b) => pri[a.priority] - pri[b.priority]);
    if (sort === 'wbs') list.sort((a, b) => (a.project_id - b.project_id) || derived.dates.get(a.id).wbs.localeCompare(derived.dates.get(b.id).wbs, undefined, { numeric: true }));
    return list;
  }, [tasks, sort, derived.dates]);

  const groups = useMemo(() => {
    if (groupBy === 'status') return TASK_STATUSES.map((s) => ({ key: s.id, label: s.label, color: s.color, items: sorted.filter((t) => t.status === s.id), status: s.id }));
    if (groupBy === 'priority') return PRIORITIES.map((s) => ({ key: s.id, label: s.label, color: s.color, items: sorted.filter((t) => t.priority === s.id) }));
    if (groupBy === 'project') return data.projects.filter((p) => sorted.some((t) => t.project_id === p.id)).map((p) => ({ key: p.id, label: p.name, color: p.color, items: sorted.filter((t) => t.project_id === p.id) }));
    // assignee
    const g = data.resources.map((r) => ({ key: r.id, label: r.name, color: r.color, items: sorted.filter((t) => (asg.get(t.id) || []).some((a) => a.resource_id === r.id)) }));
    g.push({ key: 'none', label: 'Unassigned', color: '#94a3b8', items: sorted.filter((t) => !(asg.get(t.id) || []).length) });
    return g.filter((x) => x.items.length);
  }, [groupBy, sorted, data.projects, data.resources, asg]);

  const toggle = (k) => setFolded((f) => { const n = new Set(f); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const quickAdd = async (group, name) => {
    const pid = projectId || (groupBy === 'project' ? group.key : null);
    if (!pid) return actions.toast('Group by project or open a project to quick-add', 'warn');
    const patch = { project_id: pid, name, duration: 3 };
    if (groupBy === 'status') patch.status = group.key;
    if (groupBy === 'priority') patch.priority = group.key;
    const t = await actions.createTask(patch);
    if (groupBy === 'assignee' && group.key !== 'none') await actions.assign(t.id, group.key, 100);
  };

  return (
    <div>
      <div className="row wrap mb16">
        <div className="row" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 9 }} className="faint" />
          <input className="input" style={{ paddingLeft: 30, width: 240 }} placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" style={{ width: 190 }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {data.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="row small"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide done</label>
        <div className="grow" />
        <span className="small muted">Group</span>
        <Segmented value={groupBy} onChange={setGroupBy} options={[
          { value: 'status', label: 'Status' }, { value: 'assignee', label: 'Assignee' }, { value: 'priority', label: 'Priority' },
          ...(projectId ? [] : [{ value: 'project', label: 'Project' }]),
        ]} />
        <span className="small muted">Sort</span>
        <select className="input sm" style={{ width: 110 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="due">Due date</option><option value="priority">Priority</option><option value="wbs">WBS order</option>
        </select>
      </div>

      {groups.map((g) => (
        <div key={g.key} className="mb16">
          <div className="group-h" onClick={() => toggle(g.key)}>
            {folded.has(g.key) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            <span className="pill" style={{ background: g.color, color: '#fff' }}>{g.label}</span>
            <span className="count">{g.items.length}</span>
          </div>
          {!folded.has(g.key) && (
            <div className="card">
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: '38%' }}>Name</th>
                  {showProject && <th>Project</th>}
                  <th>Assignees</th><th>Start</th><th>Due</th><th>Priority</th><th>Status</th><th style={{ width: 110 }}>Progress</th>
                </tr></thead>
                <tbody>
                  {g.items.map((t) => {
                    const d = derived.dates.get(t.id);
                    const p = projById.get(t.project_id);
                    const late = t.status !== 'done' && d.finish < derived.today;
                    const people = (asg.get(t.id) || []).map((a) => derived.resById.get(a.resource_id)).filter(Boolean);
                    const st = statusOf(t.status);
                    return (
                      <tr key={t.id} className="click" onClick={() => actions.openTask(t.id)}>
                        <td>
                          <div className="row">
                            <span className="status-dot" title="Mark done" style={{ borderColor: st.color, background: t.status === 'done' ? st.color : 'transparent' }}
                              onClick={(e) => { e.stopPropagation(); actions.updateTask(t.id, t.status === 'done' ? { status: 'todo', progress: 0 } : { status: 'done', progress: 100 }); }} />
                            {t.is_milestone ? <Diamond size={12} className="faint" /> : null}
                            <span className="ellipsis" style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--text-3)' : undefined, fontWeight: 550 }}>{t.name}</span>
                            {derived.dates.get(t.id).critical && <span className="tag" style={{ background: '#ffe4e6', color: '#e11d48' }}>critical</span>}
                            {t.discipline && <span className="tag">{t.discipline}</span>}
                          </div>
                        </td>
                        {showProject && <td><span className="row small"><span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />{p.code || p.name}</span></td>}
                        <td>{people.length ? <AvatarStack resources={people} /> : <span className="faint small">—</span>}</td>
                        <td className="small muted nowrap">{fmtDate(d.start, { short: true })}</td>
                        <td className="small nowrap" style={{ color: late ? 'var(--danger)' : undefined, fontWeight: late ? 650 : 400 }}>{fmtDate(d.finish, { short: true })}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select className="input sm" style={{ width: 96, color: priorityOf(t.priority).color, fontWeight: 600 }} value={t.priority} onChange={(e) => actions.updateTask(t.id, { priority: e.target.value })}>
                            {PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select className="input sm" style={{ width: 112, color: st.color, fontWeight: 600 }} value={t.status} onChange={(e) => actions.updateTask(t.id, { status: e.target.value })}>
                            {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                          </select>
                        </td>
                        <td><div className="row"><Progress value={t.progress} width={60} color={st.color} /><span className="tiny muted">{t.progress}%</span></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(projectId || groupBy === 'project') && (
                <div className="quick-add">
                  <Plus size={14} />
                  <input placeholder="Add task…" onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) { quickAdd(g, e.currentTarget.value.trim()); e.currentTarget.value = ''; }
                  }} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {!groups.some((g) => g.items.length) && <div className="empty">No tasks match the current filters.</div>}
    </div>
  );
}
