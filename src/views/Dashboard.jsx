import React, { useMemo } from 'react';
import { FolderKanban, AlertTriangle, Users, Diamond, Wallet, Activity, CalendarClock } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, NewButton, navigate } from '../components/layout.jsx';
import { HealthPill, Progress, Avatar, Empty, StatusPill } from '../components/ui.jsx';
import { Donut, UtilBars } from '../components/charts.jsx';
import { computeWorkload } from '../lib/analytics.js';
import { TASK_STATUSES, fmtDate, fmtMoneyShort, fmtPct } from '../lib/format.js';
import { addDays } from '../lib/calendar.js';

export default function Dashboard({ openModal }) {
  const { data, derived, actions } = useStore();
  const { today, projectStats } = derived;
  const live = data.projects.filter((p) => !p.archived && p.status !== 'cancelled');
  const projById = new Map(data.projects.map((p) => [p.id, p]));

  const wl = useMemo(() => computeWorkload({
    resources: data.resources, tasks: data.tasks, assignments: data.assignments, timeOff: data.timeOff,
    dates: derived.dates, cal: derived.cal, from: today, to: addDays(today, 27), bucket: 'week', projects: data.projects,
  }), [data, derived, today]);

  const leafTasks = data.tasks.filter((t) => {
    const d = derived.dates.get(t.id);
    return d && !d.isSummary && live.some((p) => p.id === t.project_id);
  });
  const overdue = leafTasks.filter((t) => t.status !== 'done' && derived.dates.get(t.id).finish < today)
    .sort((a, b) => derived.dates.get(a.id).finish.localeCompare(derived.dates.get(b.id).finish));
  const milestones = leafTasks.filter((t) => t.is_milestone && t.status !== 'done' && derived.dates.get(t.id).start >= today)
    .sort((a, b) => derived.dates.get(a.id).start.localeCompare(derived.dates.get(b.id).start)).slice(0, 7);
  const statusCounts = TASK_STATUSES.map((s) => ({ ...s, value: leafTasks.filter((t) => t.status === s.id).length }));

  const totCap = wl.resources.reduce((s, r) => s + r.totalCap, 0);
  const totLoad = wl.resources.reduce((s, r) => s + r.totalLoad, 0);
  const overloaded = wl.resources.filter((r) => r.overloaded > 0);
  const budget = live.reduce((s, p) => s + (Number(p.budget) || 0), 0);
  const cost = live.reduce((s, p) => s + (projectStats.get(p.id)?.cost || 0), 0);
  const atRisk = live.filter((p) => ['at_risk', 'off_track'].includes(projectStats.get(p.id)?.health)).length;

  const kpis = [
    { icon: FolderKanban, label: 'Active projects', value: live.filter((p) => p.status === 'active').length, sub: `${live.length} in portfolio · ${atRisk} need attention` },
    { icon: Activity, label: 'Open tasks', value: leafTasks.filter((t) => t.status !== 'done').length, sub: `${leafTasks.filter((t) => t.status === 'in_progress').length} in progress` },
    { icon: AlertTriangle, label: 'Overdue tasks', value: overdue.length, sub: 'past finish date, not done', color: overdue.length ? 'var(--danger)' : undefined },
    { icon: Users, label: 'Team utilization (4 wks)', value: fmtPct(totCap ? totLoad / totCap : 0), sub: `${overloaded.length} people over-allocated`, color: overloaded.length ? 'var(--warn)' : undefined },
    { icon: Wallet, label: 'Planned labor cost', value: fmtMoneyShort(cost, data.settings.currency), sub: `of ${fmtMoneyShort(budget, data.settings.currency)} budget` },
  ];

  if (!data.projects.length) {
    return (
      <>
        <TopBar title="Dashboard"><NewButton label="New Project" onClick={() => openModal({ type: 'project' })} /></TopBar>
        <div className="content">
          <Empty icon={FolderKanban} title="Welcome to MauProject" action={<div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => openModal({ type: 'project' })}>Create your first project</button>
            <button className="btn" onClick={() => actions.loadSampleData()}>Load sample portfolio</button>
          </div>}>
            Plan projects with WBS and Gantt scheduling, manage tasks, and balance engineering capacity across your portfolio.
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Portfolio Dashboard" crumbs={`Today · ${fmtDate(today)}`}>
        <NewButton label="New Project" onClick={() => openModal({ type: 'project' })} />
      </TopBar>
      <div className="content">
        <div className="kpis">
          {kpis.map((k) => (
            <div key={k.label} className="card kpi">
              <div className="k-label"><k.icon size={14} />{k.label}</div>
              <div className="k-value" style={{ color: k.color }}>{k.value}</div>
              <div className="k-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="layout-2 mt16">
          <div className="card">
            <div className="card-h"><h3>Project health</h3><button className="btn sm ghost" onClick={() => navigate('projects')}>All projects →</button></div>
            <div className="card-b flush">
              <table className="tbl">
                <thead><tr><th>Project</th><th>Health</th><th style={{ width: 170 }}>Progress vs plan</th><th>Forecast finish</th><th>Target</th><th className="num">Overdue</th></tr></thead>
                <tbody>
                  {live.map((p) => {
                    const s = projectStats.get(p.id);
                    const late = p.target_date && s.finish && s.finish > p.target_date;
                    return (
                      <tr key={p.id} className="click" onClick={() => navigate(`project/${p.id}/gantt`)}>
                        <td><div className="row"><span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} /><b className="ellipsis">{p.name}</b></div><div className="faint tiny" style={{ marginLeft: 16 }}>{p.code} · {p.manager}</div></td>
                        <td><HealthPill health={s.health} /></td>
                        <td>
                          <div className="row"><Progress value={s.progress} color={p.color} width={90} /><b className="small">{s.progress}%</b></div>
                          <div className="faint tiny">planned {s.expected}%</div>
                        </td>
                        <td style={{ color: late ? 'var(--danger)' : undefined, fontWeight: late ? 650 : 400 }}>{fmtDate(s.finish)}</td>
                        <td className="muted">{fmtDate(p.target_date)}</td>
                        <td className="num" style={{ color: s.overdue ? 'var(--danger)' : 'var(--text-3)', fontWeight: 650 }}>{s.overdue}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Task status</h3></div>
            <div className="card-b row" style={{ gap: 20 }}>
              <Donut segments={statusCounts} center={{ value: leafTasks.length, label: 'tasks' }} />
              <div className="col" style={{ gap: 7 }}>
                {statusCounts.map((s) => (
                  <div key={s.id} className="row small"><i style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} /><span className="grow">{s.label}</span><b>{s.value}</b></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid3 mt16" style={{ gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-h"><h3>Team utilization · next 4 weeks</h3><button className="btn sm ghost" onClick={() => navigate('workload')}>Workload →</button></div>
            <div className="card-b">
              <UtilBars rows={[...wl.resources].sort((a, b) => b.utilization - a.utilization).map((r) => ({ key: r.resource.id, label: r.resource.name, value: r.utilization }))} />
              <div className="faint tiny mt8">Dashed line marks 100% of available capacity.</div>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><Diamond size={14} /><h3>Upcoming milestones</h3></div>
            <div className="card-b flush">
              {milestones.length ? milestones.map((t) => {
                const p = projById.get(t.project_id);
                return (
                  <div key={t.id} className="row" style={{ padding: '9px 16px', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(t.id)}>
                    <Diamond size={12} style={{ color: p.color, fill: p.color }} />
                    <div className="grow"><div className="ellipsis bold small">{t.name}</div><div className="faint tiny">{p.name}</div></div>
                    <span className="small muted nowrap">{fmtDate(derived.dates.get(t.id).start, { short: true })}</span>
                  </div>
                );
              }) : <div className="faint" style={{ padding: 16 }}>No upcoming milestones.</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><CalendarClock size={14} /><h3>Overdue work</h3></div>
            <div className="card-b flush" style={{ maxHeight: 330, overflow: 'auto' }}>
              {overdue.length ? overdue.slice(0, 12).map((t) => {
                const p = projById.get(t.project_id);
                const asg = data.assignments.filter((a) => a.task_id === t.id).map((a) => derived.resById.get(a.resource_id)).filter(Boolean);
                return (
                  <div key={t.id} className="row" style={{ padding: '9px 16px', borderBottom: '1px solid #f2f3f6', cursor: 'pointer' }} onClick={() => actions.openTask(t.id)}>
                    <div className="grow"><div className="ellipsis bold small">{t.name}</div><div className="faint tiny">{p.code} · due {fmtDate(derived.dates.get(t.id).finish, { short: true })}</div></div>
                    {asg[0] && <Avatar resource={asg[0]} />}
                    <StatusPill status={t.status} />
                  </div>
                );
              }) : <div className="faint" style={{ padding: 16 }}>Nothing overdue. 🎯</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
