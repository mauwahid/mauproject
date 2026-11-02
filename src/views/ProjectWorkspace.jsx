import React, { useMemo } from 'react';
import {
  GanttChartSquare, Network, Kanban, List, Users, LayoutDashboard, Settings2, Save, Plus, Diamond, FileDown, FileSpreadsheet,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, navigate } from '../components/layout.jsx';
import { HealthPill, ProjectStatusPill, Progress, Avatar, Empty } from '../components/ui.jsx';
import TaskList from '../components/TaskList.jsx';
import Gantt from './project/Gantt.jsx';
import WbsView from './project/WbsView.jsx';
import Board from './project/Board.jsx';
import { computeWorkload, bucketLabel, utilClass } from '../lib/analytics.js';
import { addDays } from '../lib/calendar.js';
import { fmtDate, fmtMoney, fmtMoneyShort, fmtHours, fmtPct } from '../lib/format.js';
import { projectReport } from '../lib/reports.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { id: 'wbs', label: 'WBS', icon: Network },
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list', label: 'List', icon: List },
  { id: 'team', label: 'Team & Workload', icon: Users },
];

export default function ProjectWorkspace({ projectId, tab, openModal }) {
  const { data, derived, actions } = useStore();
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) {
    return <><TopBar title="Project not found" /><div className="content"><Empty title="This project no longer exists" action={<button className="btn" onClick={() => navigate('projects')}>Back to projects</button>} /></div></>;
  }
  const stats = derived.projectStats.get(project.id);
  const sched = derived.schedules.get(project.id);
  const empty = sched.rows.length === 0;

  const exportPdf = async () => {
    const html = projectReport(project, data, derived);
    const p = await window.mauproject.files.exportPdf(html, `MauProject ${project.code || project.name} Status Report.pdf`);
    if (p) actions.toast('Report exported', 'success');
  };

  return (
    <>
      <TopBar title={project.name} crumbs={<span style={{ cursor: 'pointer' }} onClick={() => navigate('projects')}>Projects / {project.code}</span>}
        icon={<span style={{ width: 12, height: 32, borderRadius: 4, background: project.color }} />}>
        <HealthPill health={stats.health} />
        <ProjectStatusPill status={project.status} />
        <button className="btn sm" onClick={() => actions.setBaseline(project.id)} title="Save current schedule as baseline"><Save size={14} />Baseline</button>
        <button className="btn sm" onClick={exportPdf}><FileDown size={14} />Report</button>
        <button className="btn sm" onClick={() => openModal({ type: 'xlsx', projectIds: [project.id] })}><FileSpreadsheet size={14} />Excel</button>
        <button className="btn sm icon" title="Project settings" onClick={() => openModal({ type: 'project', project })}><Settings2 size={15} /></button>
        <button className="btn primary sm" onClick={() => openModal({ type: 'task', projectId: project.id })}><Plus size={14} />Task</button>
      </TopBar>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => navigate(`project/${project.id}/${t.id}`)}>
            <t.icon size={14} />{t.label}
          </div>
        ))}
      </div>
      {empty && tab !== 'overview' ? (
        <div className="content">
          <Empty icon={GanttChartSquare} title="Start building the work breakdown" action={
            <button className="btn primary" onClick={() => actions.createTask({ project_id: project.id, name: 'Phase 1', duration: 5 })}><Plus size={14} />Add first task</button>
          }>Add phases and tasks, then indent them to form the WBS. Link tasks to drive the schedule.</Empty>
        </div>
      ) : (
        <div className={`content ${['gantt', 'wbs', 'board'].includes(tab) ? 'flush' : ''}`}>
          {tab === 'gantt' && <Gantt project={project} />}
          {tab === 'wbs' && <WbsView project={project} />}
          {tab === 'board' && <Board project={project} />}
          {tab === 'list' && <TaskList projectId={project.id} />}
          {tab === 'team' && <ProjectTeam project={project} />}
          {tab === 'overview' && <Overview project={project} stats={stats} />}
        </div>
      )}
    </>
  );
}

function Overview({ project, stats }) {
  const { data, derived, actions } = useStore();
  const sched = derived.schedules.get(project.id);
  const phases = sched.rows.filter((r) => r.level === 0);
  const milestones = sched.rows.filter((r) => r.task.is_milestone);
  const late = project.target_date && stats.finish && stats.finish > project.target_date;
  const variance = project.target_date && stats.finish ? derived.cal.workdays(project.target_date, stats.finish) - 1 : 0;

  const disc = useMemo(() => {
    const m = new Map();
    for (const r of sched.rows) {
      if (r.isSummary) continue;
      const k = r.task.discipline || 'Unspecified';
      m.set(k, (m.get(k) || 0) + (Number(r.task.estimate_hours) || 0));
    }
    const max = Math.max(1, ...m.values());
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v, pct: v / max }));
  }, [sched]);

  return (
    <>
      <div className="kpis">
        <div className="card kpi"><div className="k-label">Progress</div><div className="k-value">{stats.progress}%</div><div className="k-sub">planned {stats.expected}% by today</div></div>
        <div className="card kpi"><div className="k-label">Forecast finish</div><div className="k-value" style={{ fontSize: 20, color: late ? 'var(--danger)' : undefined }}>{fmtDate(stats.finish)}</div>
          <div className="k-sub">{project.target_date ? (late ? `${variance} working days past target` : 'on or before target') : 'no target set'}</div></div>
        <div className="card kpi"><div className="k-label">Tasks</div><div className="k-value">{stats.done}/{stats.leaves}</div><div className="k-sub">{stats.overdue} overdue · {stats.blocked} blocked</div></div>
        <div className="card kpi"><div className="k-label">Critical path</div><div className="k-value">{stats.critical}</div><div className="k-sub">tasks with zero slack</div></div>
        <div className="card kpi"><div className="k-label">Planned cost</div><div className="k-value" style={{ fontSize: 20, color: project.budget && stats.cost > project.budget ? 'var(--danger)' : undefined }}>{fmtMoneyShort(stats.cost, data.settings.currency)}</div>
          <div className="k-sub">budget {fmtMoney(project.budget, data.settings.currency)} · {fmtHours(stats.work)} work</div></div>
      </div>
      <div className="layout-2 mt16">
        <div className="card">
          <div className="card-h"><h3>Phases</h3></div>
          <div className="card-b flush">
            <table className="tbl">
              <thead><tr><th>WBS</th><th>Phase</th><th>Start</th><th>Finish</th><th style={{ width: 180 }}>Progress</th></tr></thead>
              <tbody>
                {phases.map((r) => (
                  <tr key={r.id} className="click" onClick={() => actions.openTask(r.id)}>
                    <td className="faint">{r.wbs}</td><td className="bold">{r.task.name}</td>
                    <td>{fmtDate(r.start)}</td><td>{fmtDate(r.finish)}</td>
                    <td><div className="row"><Progress value={r.progress} color={project.color} width={110} /><span className="small">{r.progress}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>About</h3></div>
          <div className="card-b col small">
            <div className="muted" style={{ lineHeight: 1.5 }}>{project.description || 'No description.'}</div>
            <div className="props" style={{ margin: 0, gridTemplateColumns: '110px 1fr' }}>
              <label>Manager</label><span>{project.manager || '—'}</span>
              <label>Client / BU</label><span>{project.client || '—'}</span>
              <label>Start</label><span>{fmtDate(project.start_date)}</span>
              <label>Target</label><span>{fmtDate(project.target_date)}</span>
              <label>Priority</label><span style={{ textTransform: 'capitalize' }}>{project.priority}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="layout-even mt16">
        <div className="card">
          <div className="card-h"><Diamond size={14} /><h3>Milestones</h3></div>
          <div className="card-b flush">
            {milestones.length ? milestones.map((r) => {
              const slip = r.task.baseline_finish && r.finish > r.task.baseline_finish ? derived.cal.workdays(r.task.baseline_finish, r.finish) - 1 : 0;
              return (
                <div key={r.id} className="row" style={{ padding: '9px 16px', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(r.id)}>
                  <Diamond size={12} style={{ color: r.task.status === 'done' ? 'var(--ok)' : project.color, fill: r.task.status === 'done' ? 'var(--ok)' : project.color }} />
                  <span className="grow bold small">{r.task.name}</span>
                  {slip > 0 && <span className="tag" style={{ background: '#fee2e2', color: '#b91c1c' }}>+{slip}d vs baseline</span>}
                  <span className="small muted">{fmtDate(r.start)}</span>
                </div>
              );
            }) : <div className="faint" style={{ padding: 16 }}>No milestones defined.</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Estimated effort by discipline</h3></div>
          <div className="card-b col" style={{ gap: 10 }}>
            {disc.map((d) => (
              <div key={d.k} className="row small">
                <span style={{ width: 140 }} className="ellipsis">{d.k}</span>
                <div className="grow" style={{ height: 10, background: '#eef0f4', borderRadius: 99 }}><div style={{ width: `${d.pct * 100}%`, height: '100%', background: project.color, borderRadius: 99 }} /></div>
                <span style={{ width: 60 }} className="right bold">{fmtHours(d.v)}</span>
              </div>
            ))}
            {!disc.length && <span className="faint">Add estimates to tasks to see effort by discipline.</span>}
          </div>
        </div>
      </div>
    </>
  );
}

function ProjectTeam({ project }) {
  const { data, derived, actions } = useStore();
  const from = derived.today;
  const to = addDays(from, 7 * 10 - 1);
  const projTaskIds = new Set(data.tasks.filter((t) => t.project_id === project.id).map((t) => t.id));
  const resIds = new Set(data.assignments.filter((a) => projTaskIds.has(a.task_id)).map((a) => a.resource_id));
  const people = data.resources.filter((r) => resIds.has(r.id));

  const args = { resources: people, tasks: data.tasks, timeOff: data.timeOff, dates: derived.dates, cal: derived.cal, from, to, bucket: 'week', projects: data.projects };
  const all = useMemo(() => computeWorkload({ ...args, assignments: data.assignments }), [data, derived]); // eslint-disable-line
  const mine = useMemo(() => computeWorkload({ ...args, assignments: data.assignments.filter((a) => projTaskIds.has(a.task_id)) }), [data, derived]); // eslint-disable-line

  const unstaffed = derived.schedules.get(project.id).rows.filter((r) => !r.isSummary && !r.task.is_milestone && r.task.status !== 'done' && !(derived.asgByTask.get(r.id) || []).length);

  return (
    <>
      <div className="card">
        <div className="card-h"><h3>Team allocation · next 10 weeks</h3><span className="small muted">cell = hours on this project · color = total utilization across all projects</span></div>
        <div className="card-b flush" style={{ overflow: 'auto' }}>
          {people.length ? (
            <table className="heat">
              <thead><tr><th className="res">Team member</th>{all.buckets.map((b) => <th key={b.key}>{bucketLabel(b, 'week')}</th>)}<th>This project</th></tr></thead>
              <tbody>
                {all.resources.map((w, i) => {
                  const m = mine.resources[i];
                  return (
                    <tr key={w.resource.id}>
                      <td className="res"><div className="row"><Avatar resource={w.resource} /><div><div className="bold small">{w.resource.name}</div><div className="faint tiny">{w.resource.role}</div></div></div></td>
                      {w.rows.map((x, j) => {
                        const u = x.capacity ? x.load / x.capacity : (x.load ? 2 : null);
                        return <td key={x.key}><div className={`hc ${utilClass(u)}`} title={`Total ${fmtHours(x.load)} / ${fmtHours(x.capacity)} (${fmtPct(u)})`}>{m.rows[j].load ? Math.round(m.rows[j].load) : '·'}</div></td>;
                      })}
                      <td className="small bold" style={{ padding: '0 12px' }}>{fmtHours(m.totalLoad)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="faint" style={{ padding: 16 }}>No one is assigned to this project yet. Open a task to assign team members.</div>}
        </div>
      </div>
      <div className="card mt16">
        <div className="card-h"><h3>Unstaffed work</h3><span className="small muted">{unstaffed.length} tasks need an owner</span></div>
        <div className="card-b flush">
          <table className="tbl">
            <thead><tr><th>WBS</th><th>Task</th><th>Discipline</th><th>Start</th><th>Finish</th><th className="num">Estimate</th><th>Assign</th></tr></thead>
            <tbody>
              {unstaffed.map((r) => (
                <tr key={r.id}>
                  <td className="faint">{r.wbs}</td>
                  <td className="bold" style={{ cursor: 'pointer' }} onClick={() => actions.openTask(r.id)}>{r.task.name}</td>
                  <td>{r.task.discipline ? <span className="tag">{r.task.discipline}</span> : '—'}</td>
                  <td>{fmtDate(r.start)}</td><td>{fmtDate(r.finish)}</td>
                  <td className="num">{fmtHours(r.task.estimate_hours)}</td>
                  <td>
                    <select className="input sm" style={{ width: 220 }} value="" onChange={(e) => e.target.value && actions.assign(r.id, Number(e.target.value), 100)}>
                      <option value="">Choose…</option>
                      {[...data.resources].filter((x) => x.active)
                        .sort((a, b) => (b.discipline === r.task.discipline) - (a.discipline === r.task.discipline))
                        .map((x) => <option key={x.id} value={x.id}>{x.name} · {x.discipline}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!unstaffed.length && <tr><td colSpan={7} className="faint">Every open task has an owner.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

