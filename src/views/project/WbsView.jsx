import React, { useMemo, useState } from 'react';
import { Network, Table2, Download } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { Progress, Segmented, AvatarStack } from '../../components/ui.jsx';
import { fmtDate, fmtHours, fmtMoney, toCSV } from '../../lib/format.js';
import { hoursPerDay } from '../../lib/analytics.js';

export default function WbsView({ project }) {
  const { data, derived, actions } = useStore();
  const [mode, setMode] = useState('outline');
  const sched = derived.schedules.get(project.id);

  // work + cost per row (leaf from assignments, summaries rolled up)
  const metrics = useMemo(() => {
    const m = new Map();
    const leafCalc = (r) => {
      let work = 0, cost = 0;
      for (const a of derived.asgByTask.get(r.id) || []) {
        const res = derived.resById.get(a.resource_id);
        if (!res) continue;
        const h = hoursPerDay(res, derived.cal) * a.units / 100 * r.dur;
        work += h;
        cost += h * (Number(res.cost_rate) || 0);
      }
      return { work, cost, est: Number(r.task.estimate_hours) || 0 };
    };
    const walk = (r) => {
      if (!r.isSummary) { const v = leafCalc(r); m.set(r.id, v); return v; }
      const acc = { work: 0, cost: 0, est: 0 };
      for (const c of r.childIds) { const v = walk(sched.byId.get(c)); acc.work += v.work; acc.cost += v.cost; acc.est += v.est; }
      m.set(r.id, acc);
      return acc;
    };
    sched.rows.filter((r) => r.level === 0).forEach(walk);
    return m;
  }, [sched, derived]);

  const total = sched.rows.filter((r) => r.level === 0).reduce((s, r) => {
    const v = metrics.get(r.id); return { work: s.work + v.work, cost: s.cost + v.cost, est: s.est + v.est };
  }, { work: 0, cost: 0, est: 0 });

  const exportCsv = async () => {
    const csv = toCSV(
      ['WBS', 'Task', 'Level', 'Type', 'Start', 'Finish', 'Duration (d)', 'Progress %', 'Estimate (h)', 'Planned work (h)', 'Planned cost', 'Status'],
      sched.rows.map((r) => {
        const v = metrics.get(r.id);
        return [r.wbs, r.task.name, r.level + 1, r.isSummary ? 'Summary' : r.task.is_milestone ? 'Milestone' : 'Task', r.start, r.finish, r.dur, r.progress,
          v.est, Math.round(v.work), Math.round(v.cost), r.task.status];
      }),
    );
    const p = await window.mauproject.files.saveText(`MauProject ${project.code || project.name} WBS.csv`, csv, 'CSV', 'csv');
    if (p) actions.toast('WBS exported', 'success');
  };

  const node = (r) => {
    const kids = r.childIds.map((id) => sched.byId.get(id));
    const allLeaves = kids.every((k) => !k.isSummary);
    return (
      <div className="wbs-node" key={r.id}>
        <Box r={r} onOpen={() => actions.openTask(r.id)} metric={metrics.get(r.id)} />
        {kids.length > 0 && (allLeaves
          ? <div className="wbs-leaves">{kids.map((k) => <Box key={k.id} r={k} small onOpen={() => actions.openTask(k.id)} metric={metrics.get(k.id)} />)}</div>
          : <div className="wbs-children">{kids.map(node)}</div>)}
      </div>
    );
  };

  return (
    <>
      <div className="toolbar">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'outline', label: 'Outline', icon: Table2 }, { value: 'tree', label: 'Tree diagram', icon: Network }]} />
        <div className="grow" />
        <span className="small muted">Estimate {fmtHours(total.est)} · Planned work {fmtHours(total.work)} · Planned cost {fmtMoney(total.cost, data.settings.currency)}</span>
        <button className="btn sm" onClick={exportCsv}><Download size={14} />Export CSV</button>
      </div>
      {mode === 'tree' ? (
        <div className="wbs-tree">
          <div className="wbs-node" style={{ minWidth: '100%' }}>
            <div className="wbs-box root">
              <div className="code">{project.code || '0'}</div>
              <div className="nm">{project.name}</div>
              <Progress value={derived.projectStats.get(project.id).progress} color="#fff" />
            </div>
            <div className="wbs-children">{sched.rows.filter((r) => r.level === 0).map(node)}</div>
          </div>
        </div>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, background: '#fff' }}>
          <table className="tbl">
            <thead><tr>
              <th>WBS</th><th>Work package / task</th><th>Assignees</th><th>Start</th><th>Finish</th><th className="num">Duration</th>
              <th style={{ width: 140 }}>Progress</th><th className="num">Estimate</th><th className="num">Planned work</th><th className="num">Planned cost</th>
            </tr></thead>
            <tbody>
              {sched.rows.map((r) => {
                const v = metrics.get(r.id);
                const people = (derived.asgByTask.get(r.id) || []).map((a) => derived.resById.get(a.resource_id)).filter(Boolean);
                return (
                  <tr key={r.id} className="click" onClick={() => actions.openTask(r.id)} style={{ fontWeight: r.isSummary ? 650 : 400, background: r.level === 0 ? '#fafbff' : undefined }}>
                    <td className="faint">{r.wbs}</td>
                    <td style={{ paddingLeft: 12 + r.level * 18 }}>{r.task.name}{r.task.is_milestone ? <span className="tag" style={{ marginLeft: 6 }}>milestone</span> : null}</td>
                    <td>{people.length ? <AvatarStack resources={people} /> : ''}</td>
                    <td className="small">{fmtDate(r.start)}</td>
                    <td className="small">{fmtDate(r.finish)}</td>
                    <td className="num">{r.dur}d</td>
                    <td><div className="row"><Progress value={r.progress} color={project.color} width={70} /><span className="small">{r.progress}%</span></div></td>
                    <td className="num">{v.est ? fmtHours(v.est) : '—'}</td>
                    <td className="num">{v.work ? fmtHours(v.work) : '—'}</td>
                    <td className="num">{v.cost ? fmtMoney(v.cost, data.settings.currency) : '—'}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700 }}>
                <td /><td>Project total</td><td /><td>{fmtDate(sched.start)}</td><td>{fmtDate(sched.finish)}</td><td />
                <td>{derived.projectStats.get(project.id).progress}%</td>
                <td className="num">{fmtHours(total.est)}</td><td className="num">{fmtHours(total.work)}</td><td className="num">{fmtMoney(total.cost, data.settings.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Box({ r, small, onOpen, metric }) {
  return (
    <div className="wbs-box" onClick={onOpen} style={{ borderLeft: r.critical && !r.isSummary ? '3px solid var(--crit)' : undefined }}>
      <div className="code">{r.wbs}</div>
      <div className="nm">{r.task.name}</div>
      {!small && <Progress value={r.progress} />}
      <div className="tiny faint" style={{ marginTop: small ? 0 : 5 }}>
        {r.task.is_milestone ? `◆ ${fmtDate(r.start, { short: true })}` : `${r.dur}d · ${r.progress}%`}{metric?.work ? ` · ${Math.round(metric.work)}h` : ''}
      </div>
    </div>
  );
}
