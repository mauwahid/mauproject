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
import DashboardBoard from '../components/DashboardBoard.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { id: 'wbs', label: 'WBS', icon: Network },
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list', label: 'List', icon: List },
  { id: 'team', label: 'Team & Workload', icon: Users },
];

export default function ProjectWorkspace({ projectId, tab: tabIn, openModal }) {
  const { data, derived, actions } = useStore();
  const project = data.projects.find((p) => p.id === projectId);
  const tab = tabIn === 'overview' ? 'dashboard' : tabIn;
  const space = project && data.spaces.find((x) => x.id === project.space_id);
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
      <TopBar title={project.name} crumbs={<span style={{ cursor: 'pointer' }} onClick={() => navigate(space ? `space/${space.id}/dashboard` : 'projects')}>{space ? space.name : 'Projects'} / {project.code}</span>}
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
      {empty && tab !== 'dashboard' ? (
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
          {tab === 'dashboard' && (
            <>
              {(project.description || space) && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {space && <span className="tag" style={{ background: space.color + '1f', color: space.color, marginRight: 8, cursor: 'pointer' }} onClick={() => navigate(`space/${space.id}/dashboard`)}>{space.name}</span>}
                  {project.description}
                </p>
              )}
              <DashboardBoard key={`p${project.id}`} scopeType="project" scopeId={project.id} projectIds={[project.id]} />
            </>
          )}
        </div>
      )}
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

