import React, { useMemo, useState } from 'react';
import { UserPlus, X, TrendingUp, Download } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar } from '../components/layout.jsx';
import { Segmented } from '../components/ui.jsx';
import { StackedBars } from '../components/charts.jsx';
import { computeCapacity, bucketLabel } from '../lib/analytics.js';
import { addDays, addMonths, startOfWeek } from '../lib/calendar.js';
import { DISCIPLINES, fmtHours, fmtDate, toCSV } from '../lib/format.js';

export default function Capacity() {
  const { data, derived, actions } = useStore();
  const [months, setMonths] = useState(6);
  const [bucket, setBucket] = useState('month');
  const [focus, setFocus] = useState('');
  const [hires, setHires] = useState([]); // what-if: {discipline, fte, from}
  const [draft, setDraft] = useState({ discipline: DISCIPLINES[0], fte: 1, from: derived.today.slice(0, 8) + '01' });

  const from = bucket === 'month' ? derived.today.slice(0, 8) + '01' : startOfWeek(derived.today);
  const to = addDays(addMonths(from.slice(0, 8) + '01', months), -1);
  const hpd = Number(data.settings.hoursPerDay) || 8;

  const cap = useMemo(() => computeCapacity({
    resources: data.resources, tasks: data.tasks, assignments: data.assignments, timeOff: data.timeOff,
    dates: derived.dates, cal: derived.cal, from, to, bucket, projects: data.projects,
  }), [data, derived, from, to, bucket]);

  // apply what-if hires to supply
  const groups = useMemo(() => {
    const byName = new Map(cap.groups.map((g) => [g.name, { ...g, rows: g.rows.map((r) => ({ ...r, extra: 0 })) }]));
    for (const h of hires) {
      if (!byName.has(h.discipline)) {
        byName.set(h.discipline, { name: h.discipline, headcount: 0, supply: 0, demand: 0, gap: 0, rows: cap.buckets.map((b) => ({ ...b, supply: 0, assigned: 0, unstaffed: 0, extra: 0 })) });
      }
      const g = byName.get(h.discipline);
      for (const r of g.rows) {
        if (r.end < h.from) continue;
        const s = r.start > h.from ? r.start : h.from;
        r.extra += derived.cal.workdays(s, r.end) * hpd * h.fte;
      }
    }
    return [...byName.values()].map((g) => {
      const supply = g.rows.reduce((s, r) => s + r.supply + r.extra, 0);
      const demand = g.rows.reduce((s, r) => s + r.assigned + r.unstaffed, 0);
      return { ...g, supply, demand, gap: supply - demand };
    }).sort((a, b) => a.gap - b.gap);
  }, [cap, hires, derived.cal, hpd]);

  const shown = focus ? groups.filter((g) => g.name === focus) : groups;
  const chartData = cap.buckets.map((b, i) => ({
    label: bucketLabel(b, bucket),
    assigned: shown.reduce((s, g) => s + g.rows[i].assigned, 0),
    unstaffed: shown.reduce((s, g) => s + g.rows[i].unstaffed, 0),
    supply: shown.reduce((s, g) => s + g.rows[i].supply + g.rows[i].extra, 0),
  }));
  const totals = chartData.reduce((s, d) => ({ a: s.a + d.assigned, u: s.u + d.unstaffed, s: s.s + d.supply }), { a: 0, u: 0, s: 0 });

  const fteOf = (hours, row) => {
    const days = derived.cal.workdays(row.start, row.end) || 1;
    return hours / (days * hpd);
  };

  const exportCsv = async () => {
    const head = ['Discipline', 'Measure', ...cap.buckets.map((b) => b.start)];
    const rows = [];
    for (const g of groups) {
      rows.push([g.name, 'Supply (h)', ...g.rows.map((r) => Math.round(r.supply + r.extra))]);
      rows.push([g.name, 'Assigned demand (h)', ...g.rows.map((r) => Math.round(r.assigned))]);
      rows.push([g.name, 'Unstaffed demand (h)', ...g.rows.map((r) => Math.round(r.unstaffed))]);
      rows.push([g.name, 'Gap (FTE)', ...g.rows.map((r) => (fteOf(r.supply + r.extra - r.assigned - r.unstaffed, r)).toFixed(2))]);
    }
    const p = await window.mauproject.files.saveText('MauProject Capacity Plan.csv', toCSV(head, rows), 'CSV', 'csv');
    if (p) actions.toast('Capacity plan exported', 'success');
  };

  return (
    <>
      <TopBar title="Capacity Planning" crumbs={`${fmtDate(from)} – ${fmtDate(to)}`}>
        <Segmented value={bucket} onChange={setBucket} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        <Segmented value={months} onChange={setMonths} options={[{ value: 3, label: '3 mo' }, { value: 6, label: '6 mo' }, { value: 12, label: '12 mo' }]} />
        <button className="btn sm" onClick={exportCsv}><Download size={14} />CSV</button>
      </TopBar>
      <div className="content">
        <div className="kpis">
          <div className="card kpi"><div className="k-label">Supply</div><div className="k-value">{fmtHours(totals.s)}</div><div className="k-sub">available engineering hours</div></div>
          <div className="card kpi"><div className="k-label">Assigned demand</div><div className="k-value">{fmtHours(totals.a)}</div><div className="k-sub">from staffed tasks</div></div>
          <div className="card kpi"><div className="k-label">Unstaffed demand</div><div className="k-value" style={{ color: totals.u ? 'var(--warn)' : undefined }}>{fmtHours(totals.u)}</div><div className="k-sub">estimates on tasks without owners</div></div>
          <div className="card kpi"><div className="k-label">Net position</div><div className="k-value" style={{ color: totals.s - totals.a - totals.u < 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmtHours(totals.s - totals.a - totals.u)}</div><div className="k-sub">{totals.s ? Math.round(((totals.a + totals.u) / totals.s) * 100) : 0}% of capacity demanded</div></div>
        </div>

        <div className="layout-2 mt16">
          <div className="card">
            <div className="card-h">
              <TrendingUp size={15} /><h3>Demand vs. capacity {focus ? `· ${focus}` : '· all disciplines'}</h3>
              <select className="input sm" style={{ width: 180 }} value={focus} onChange={(e) => setFocus(e.target.value)}>
                <option value="">All disciplines</option>
                {groups.map((g) => <option key={g.name}>{g.name}</option>)}
              </select>
            </div>
            <div className="card-b">
              <StackedBars data={chartData} format={(v) => `${Math.round(v)}h`}
                series={[{ key: 'assigned', label: 'Assigned', color: '#4f46e5' }, { key: 'unstaffed', label: 'Unstaffed', color: '#f59e0b' }]}
                line={{ key: 'supply', label: 'Capacity', color: '#16a34a' }} height={250} />
              <div className="legend mt8">
                <span><i style={{ background: '#4f46e5' }} />Assigned demand</span>
                <span><i style={{ background: '#f59e0b' }} />Unstaffed demand</span>
                <span><i style={{ background: '#16a34a', height: 3 }} />Capacity (incl. what-if hires)</span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><UserPlus size={15} /><h3>What-if: planned hires</h3></div>
            <div className="card-b col">
              <div className="small muted">Model new hires or contractors to see how they close capacity gaps. Scenarios are not saved.</div>
              <div className="grid2">
                <select className="input sm span2" value={draft.discipline} onChange={(e) => setDraft({ ...draft, discipline: e.target.value })}>
                  {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                </select>
                <input className="input sm" type="number" step="0.5" min="0.5" value={draft.fte} onChange={(e) => setDraft({ ...draft, fte: Number(e.target.value) })} title="FTE" />
                <input className="input sm" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} title="Start date" />
              </div>
              <button className="btn sm primary" onClick={() => setHires([...hires, { ...draft, id: Date.now() }])}><UserPlus size={13} />Add to scenario</button>
              {hires.map((h) => (
                <div key={h.id} className="row small" style={{ padding: '4px 0', borderBottom: '1px solid #f2f3f6' }}>
                  <b>+{h.fte} FTE</b><span className="grow">{h.discipline}</span><span className="faint">from {fmtDate(h.from, { short: true })}</span>
                  <button className="btn ghost sm icon" onClick={() => setHires(hires.filter((x) => x.id !== h.id))}><X size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card mt16">
          <div className="card-h"><h3>Capacity by discipline</h3><span className="small muted">cell = surplus (+) / shortfall (−) in FTE</span></div>
          <div className="card-b flush" style={{ overflow: 'auto' }}>
            <table className="heat" style={{ width: '100%' }}>
              <thead><tr>
                <th className="res">Discipline</th><th>People</th><th>Supply</th><th>Demand</th><th>Gap</th>
                {cap.buckets.map((b) => <th key={b.key}>{bucketLabel(b, bucket)}</th>)}
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.name} onClick={() => setFocus(focus === g.name ? '' : g.name)} style={{ cursor: 'pointer' }}>
                    <td className="res bold" style={{ background: focus === g.name ? 'var(--brand-50)' : undefined }}>{g.name}</td>
                    <td className="small" style={{ textAlign: 'center' }}>{g.headcount}</td>
                    <td className="small nowrap" style={{ padding: '0 10px' }}>{fmtHours(g.supply)}</td>
                    <td className="small nowrap" style={{ padding: '0 10px' }}>{fmtHours(g.demand)}</td>
                    <td className="small nowrap bold" style={{ padding: '0 10px', color: g.gap < 0 ? 'var(--danger)' : 'var(--ok)' }}>{g.gap >= 0 ? '+' : ''}{fmtHours(g.gap)}</td>
                    {g.rows.map((r) => {
                      const supply = r.supply + r.extra;
                      const demand = r.assigned + r.unstaffed;
                      const fte = fteOf(supply - demand, r);
                      const cls = !supply && !demand ? 'u-none' : fte < -0.25 ? 'u-over' : fte < 0.25 ? 'u-high' : 'u-ok';
                      return (
                        <td key={r.key}>
                          <div className={`hc ${cls}`} title={`Supply ${fmtHours(supply)} · Assigned ${fmtHours(r.assigned)} · Unstaffed ${fmtHours(r.unstaffed)}`}>
                            {!supply && !demand ? '' : `${fte >= 0 ? '+' : ''}${fte.toFixed(1)}`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
