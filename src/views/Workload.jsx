import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, X, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar } from '../components/layout.jsx';
import { Avatar, Segmented, Empty } from '../components/ui.jsx';
import { computeWorkload, bucketLabel, utilClass } from '../lib/analytics.js';
import { addDays, addMonths, startOfWeek } from '../lib/calendar.js';
import { DISCIPLINES, fmtHours, fmtPct, fmtDate } from '../lib/format.js';

const HORIZON = { day: 21, week: 12, month: 6 };

export default function Workload({ openModal }) {
  const { data, derived, actions } = useStore();
  const [bucket, setBucket] = useState('week');
  const [offset, setOffset] = useState(0);
  const [disc, setDisc] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [display, setDisplay] = useState('pct');
  const [sel, setSel] = useState(null); // {rid, key}

  const from = useMemo(() => {
    const base = bucket === 'month' ? derived.today.slice(0, 8) + '01' : bucket === 'week' ? startOfWeek(derived.today) : derived.today;
    if (bucket === 'month') return addMonths(base, offset);
    return addDays(base, offset * (bucket === 'week' ? 7 : 1) * 4);
  }, [bucket, offset, derived.today]);
  const to = bucket === 'month' ? addDays(addMonths(from, HORIZON.month), -1) : addDays(from, bucket === 'week' ? HORIZON.week * 7 - 1 : HORIZON.day - 1);

  const resources = data.resources.filter((r) => r.active && (!disc || r.discipline === disc));
  const assignments = projectFilter ? data.assignments.filter((a) => data.tasks.find((t) => t.id === a.task_id)?.project_id === Number(projectFilter)) : data.assignments;

  const wl = useMemo(() => computeWorkload({
    resources, tasks: data.tasks, assignments, timeOff: data.timeOff, dates: derived.dates, cal: derived.cal, from, to, bucket, projects: data.projects,
  }), [resources, data, assignments, derived, from, to, bucket]);

  const taskById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  const team = wl.buckets.map((b, i) => {
    const cap = wl.resources.reduce((s, r) => s + r.rows[i].capacity, 0);
    const load = wl.resources.reduce((s, r) => s + r.rows[i].load, 0);
    return { cap, load };
  });
  const conflicts = wl.resources.filter((r) => r.overloaded > 0);

  const cellText = (x) => {
    if (!x.capacity && !x.load) return '';
    if (display === 'hours') return x.load ? Math.round(x.load) : '0';
    return x.capacity ? `${Math.round((x.load / x.capacity) * 100)}%` : `${Math.round(x.load)}h off`;
  };

  const selRes = sel && wl.resources.find((r) => r.resource.id === sel.rid);
  const selIdx = sel ? wl.buckets.findIndex((b) => b.key === sel.key) : -1;
  const selRow = selRes && selIdx >= 0 ? selRes.rows[selIdx] : null;

  // candidates with spare capacity in the selected bucket, same discipline first
  const candidates = useMemo(() => {
    if (!selRes || selIdx < 0) return [];
    const full = computeWorkload({ resources: data.resources, tasks: data.tasks, assignments: data.assignments, timeOff: data.timeOff, dates: derived.dates, cal: derived.cal, from, to, bucket, projects: data.projects });
    return full.resources
      .filter((r) => r.resource.id !== selRes.resource.id)
      .map((r) => ({ r: r.resource, spare: r.rows[selIdx].capacity - r.rows[selIdx].load, same: r.resource.discipline === selRes.resource.discipline }))
      .filter((c) => c.spare > 1)
      .sort((a, b) => (b.same - a.same) || (b.spare - a.spare))
      .slice(0, 6);
  }, [selRes, selIdx, data, derived, from, to, bucket]);

  const reassign = async (taskId, toRid) => {
    const a = data.assignments.find((x) => x.task_id === taskId && x.resource_id === selRes.resource.id);
    if (!a) return;
    if (data.assignments.some((x) => x.task_id === taskId && x.resource_id === toRid)) return actions.toast('Already assigned to that person', 'warn');
    await actions.unassign(a.id);
    await actions.assign(taskId, toRid, a.units);
    actions.toast('Task reassigned', 'success');
  };

  return (
    <>
      <TopBar title="Resource Workload" crumbs={`${fmtDate(from)} – ${fmtDate(to)}`}>
        <Segmented value={bucket} onChange={(v) => { setBucket(v); setOffset(0); setSel(null); }} options={[{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} />
        <button className="btn sm primary" onClick={() => openModal({ type: 'xlsx' })}><FileSpreadsheet size={14} />Export Excel</button>
      </TopBar>
      <div className="content">
        <div className="row wrap mb16">
          <div className="btn-group">
            <button className="btn sm" onClick={() => setOffset(offset - 1)}>‹ Earlier</button>
            <button className="btn sm" onClick={() => setOffset(0)}>Today</button>
            <button className="btn sm" onClick={() => setOffset(offset + 1)}>Later ›</button>
          </div>
          <select className="input sm" style={{ width: 170 }} value={disc} onChange={(e) => setDisc(e.target.value)}>
            <option value="">All disciplines</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="input sm" style={{ width: 220 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Load from all projects</option>
            {data.projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>Only {p.name}</option>)}
          </select>
          <Segmented value={display} onChange={setDisplay} options={[{ value: 'pct', label: '% utilization' }, { value: 'hours', label: 'Hours' }]} />
          <div className="grow" />
          <span className="legend-sw"><i className="u-low" />&lt;50%</span>
          <span className="legend-sw"><i className="u-ok" />50–85%</span>
          <span className="legend-sw"><i className="u-high" />85–100%</span>
          <span className="legend-sw"><i className="u-over" />Over-allocated</span>
        </div>

        {!resources.length ? <Empty title="No team members">Add people on the Team page to plan workload.</Empty> : (
          <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 360px' : '1fr', gap: 16, alignItems: 'start' }}>
            <div className="card" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 190px)' }}>
              <table className="heat">
                <thead>
                  <tr>
                    <th className="res">Team member</th>
                    {wl.buckets.map((b) => <th key={b.key}>{bucketLabel(b, bucket)}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {wl.resources.map((w) => (
                    <tr key={w.resource.id}>
                      <td className="res">
                        <div className="row">
                          <Avatar resource={w.resource} />
                          <div className="grow">
                            <div className="bold small">{w.resource.name}</div>
                            <div className="faint tiny">{w.resource.role} · {w.resource.capacity_hours}h/wk</div>
                          </div>
                          {w.overloaded > 0 && <AlertTriangle size={14} style={{ color: 'var(--danger)' }} title="Over-allocated" />}
                        </div>
                      </td>
                      {w.rows.map((x) => {
                        const u = x.capacity ? x.load / x.capacity : x.load ? 2 : null;
                        const isSel = sel && sel.rid === w.resource.id && sel.key === x.key;
                        return (
                          <td key={x.key}>
                            <div className={`hc ${utilClass(u)} ${isSel ? 'sel' : ''}`} title={x.capacity ? `${fmtHours(x.load)} of ${fmtHours(x.capacity)}` : `${fmtHours(x.load)} scheduled while unavailable (time off / holiday)`}
                              onClick={() => setSel(isSel ? null : { rid: w.resource.id, key: x.key })}>{cellText(x)}</div>
                          </td>
                        );
                      })}
                      <td className="small" style={{ padding: '0 12px', whiteSpace: 'nowrap' }}><b>{fmtPct(w.utilization)}</b><div className="faint tiny">{fmtHours(w.totalLoad)}</div></td>
                    </tr>
                  ))}
                  <tr>
                    <td className="res bold">Team total</td>
                    {team.map((t, i) => <td key={i}><div className={`hc ${utilClass(t.cap ? t.load / t.cap : null)}`}>{display === 'hours' ? Math.round(t.load) : t.cap ? `${Math.round((t.load / t.cap) * 100)}%` : ''}</div></td>)}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {sel && selRes && selRow && (
              <div className="card">
                <div className="card-h">
                  <Avatar resource={selRes.resource} />
                  <h3>{selRes.resource.name}<div className="faint tiny" style={{ fontWeight: 400 }}>{fmtDate(selRow.start)} – {fmtDate(selRow.end)}</div></h3>
                  <button className="btn ghost sm icon" onClick={() => setSel(null)}><X size={14} /></button>
                </div>
                <div className="card-b">
                  <div className="row mb16">
                    <div className="grow"><div className="faint tiny">Allocated</div><b style={{ fontSize: 18 }}>{fmtHours(selRow.load)}</b></div>
                    <div className="grow"><div className="faint tiny">Capacity</div><b style={{ fontSize: 18 }}>{fmtHours(selRow.capacity)}</b></div>
                    <div className="grow"><div className="faint tiny">Utilization</div><b style={{ fontSize: 18, color: selRow.load > selRow.capacity ? 'var(--danger)' : undefined }}>{fmtPct(selRow.capacity ? selRow.load / selRow.capacity : 0)}</b></div>
                  </div>
                  <div className="section-title" style={{ marginTop: 0 }}>Assigned work</div>
                  {[...selRow.items.entries()].sort((a, b) => b[1] - a[1]).map(([tid, h]) => {
                    const t = taskById.get(tid);
                    const p = projById.get(t.project_id);
                    return (
                      <div key={tid} style={{ padding: '7px 0', borderBottom: '1px solid #f2f3f6' }}>
                        <div className="row">
                          <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} />
                          <span className="grow ellipsis bold small" style={{ cursor: 'pointer' }} onClick={() => actions.openTask(tid)}>{t.name}</span>
                          <span className="small">{fmtHours(h)}</span>
                        </div>
                        <div className="row tiny faint" style={{ marginLeft: 16 }}>
                          <span className="grow">{p.code} · {fmtDate(derived.dates.get(tid).start, { short: true })} → {fmtDate(derived.dates.get(tid).finish, { short: true })}</span>
                          {candidates.length > 0 && (
                            <select className="input sm" style={{ width: 150, height: 22 }} value="" onChange={(e) => e.target.value && reassign(tid, Number(e.target.value))}>
                              <option value="">Reassign to…</option>
                              {candidates.map((c) => <option key={c.r.id} value={c.r.id}>{c.r.name} ({Math.round(c.spare)}h free)</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!selRow.items.size && <div className="faint small">No assigned work in this period.</div>}
                  <div className="section-title"><ArrowRightLeft size={12} />Available in this period</div>
                  {candidates.map((c) => (
                    <div key={c.r.id} className="row small" style={{ padding: '4px 0' }}>
                      <Avatar resource={c.r} />
                      <span className="grow">{c.r.name}<span className="faint tiny"> · {c.r.discipline}</span></span>
                      <b style={{ color: 'var(--ok)' }}>{Math.round(c.spare)}h free</b>
                    </div>
                  ))}
                  {!candidates.length && <div className="faint small">Nobody has spare capacity in this period.</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="card mt16">
            <div className="card-h"><AlertTriangle size={14} style={{ color: 'var(--danger)' }} /><h3>Over-allocation conflicts</h3></div>
            <div className="card-b flush">
              <table className="tbl">
                <thead><tr><th>Team member</th><th>Periods over capacity</th><th>Peak load</th><th>Worst period</th></tr></thead>
                <tbody>
                  {conflicts.map((c) => {
                    const worst = c.rows.reduce((m, x) => (x.load - x.capacity > m.load - m.capacity ? x : m), c.rows[0]);
                    return (
                      <tr key={c.resource.id} className="click" onClick={() => setSel({ rid: c.resource.id, key: worst.key })}>
                        <td><div className="row"><Avatar resource={c.resource} />{c.resource.name}</div></td>
                        <td>{c.overloaded} of {c.rows.length}</td>
                        <td style={{ color: 'var(--danger)', fontWeight: 650 }}>{worst.capacity ? fmtPct(worst.load / worst.capacity) : 'Work during time off'}</td>
                        <td>{bucketLabel(worst, bucket)} · {fmtHours(worst.load)} / {fmtHours(worst.capacity)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
