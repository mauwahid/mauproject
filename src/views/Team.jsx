import React, { useMemo, useState } from 'react';
import { Users, Pencil, Trash2, Plane, X } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, NewButton } from '../components/layout.jsx';
import { Avatar, Modal, Field, Empty, confirmDialog } from '../components/ui.jsx';
import { computeWorkload, utilClass } from '../lib/analytics.js';
import { addDays } from '../lib/calendar.js';
import { DISCIPLINES, PALETTE, fmtMoney, fmtPct, fmtDate } from '../lib/format.js';

export default function Team() {
  const { data, derived, actions } = useStore();
  const [edit, setEdit] = useState(null);
  const [timeOffFor, setTimeOffFor] = useState(null);

  const wl = useMemo(() => computeWorkload({
    resources: data.resources, tasks: data.tasks, assignments: data.assignments, timeOff: data.timeOff,
    dates: derived.dates, cal: derived.cal, from: derived.today, to: addDays(derived.today, 27), bucket: 'week', projects: data.projects,
  }), [data, derived]);
  const utilOf = new Map(wl.resources.map((w) => [w.resource.id, w.utilization]));

  const statsOf = (rid) => {
    const tids = data.assignments.filter((a) => a.resource_id === rid).map((a) => a.task_id);
    const tasks = data.tasks.filter((t) => tids.includes(t.id));
    return {
      open: tasks.filter((t) => t.status !== 'done').length,
      projects: [...new Set(tasks.filter((t) => t.status !== 'done').map((t) => t.project_id))].map((id) => data.projects.find((p) => p.id === id)).filter(Boolean),
    };
  };

  const del = async (r) => {
    const ok = await confirmDialog({ title: `Remove ${r.name}?`, danger: true, confirmLabel: 'Remove', message: 'Their task assignments and time off will be removed. Consider marking them inactive instead to keep history.' });
    if (ok) { await actions.deleteResource(r.id); actions.toast('Team member removed'); }
  };

  return (
    <>
      <TopBar title="Team" crumbs={`${data.resources.filter((r) => r.active).length} active engineers`}>
        <NewButton label="Add Member" onClick={() => setEdit({})} />
      </TopBar>
      <div className="content">
        {!data.resources.length ? (
          <Empty icon={Users} title="Build your team roster" action={<button className="btn primary" onClick={() => setEdit({})}>Add team member</button>}>
            Add engineers with their discipline, weekly capacity and cost rate to unlock workload and capacity planning.
          </Empty>
        ) : (
          <div className="card">
            <table className="tbl">
              <thead><tr>
                <th>Name</th><th>Role</th><th>Discipline</th><th className="num">Capacity</th><th className="num">Rate</th>
                <th>Open tasks</th><th>Projects</th><th>Utilization (4 wks)</th><th>Time off</th><th />
              </tr></thead>
              <tbody>
                {data.resources.map((r) => {
                  const s = statsOf(r.id);
                  const u = utilOf.get(r.id);
                  const off = data.timeOff.filter((o) => o.resource_id === r.id && o.end_date >= derived.today);
                  return (
                    <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                      <td><div className="row"><Avatar resource={r} /><div><div className="bold">{r.name}</div><div className="faint tiny">{r.email}</div></div></div></td>
                      <td>{r.role}</td>
                      <td>{r.discipline ? <span className="tag">{r.discipline}</span> : '—'}</td>
                      <td className="num">{r.capacity_hours}h/wk</td>
                      <td className="num">{fmtMoney(r.cost_rate, data.settings.currency)}/h</td>
                      <td>{s.open}</td>
                      <td><div className="row">{s.projects.map((p) => <span key={p.id} className="tag" style={{ background: p.color + '22', color: p.color }}>{p.code || p.name}</span>)}</div></td>
                      <td>{r.active ? <span className={`hc ${utilClass(u)}`} style={{ display: 'inline-grid', height: 24, minWidth: 54 }}>{fmtPct(u)}</span> : <span className="faint">inactive</span>}</td>
                      <td className="small">{off.length ? off.map((o) => <div key={o.id}>{fmtDate(o.start_date, { short: true })}–{fmtDate(o.end_date, { short: true })}</div>) : <span className="faint">—</span>}</td>
                      <td className="nowrap">
                        <button className="btn ghost sm icon" title="Time off" onClick={() => setTimeOffFor(r)}><Plane size={14} /></button>
                        <button className="btn ghost sm icon" title="Edit" onClick={() => setEdit(r)}><Pencil size={14} /></button>
                        <button className="btn ghost sm icon danger" title="Remove" onClick={() => del(r)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <ResourceModal resource={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {timeOffFor && <TimeOffModal resource={timeOffFor} onClose={() => setTimeOffFor(null)} />}
    </>
  );
}

function ResourceModal({ resource, onClose }) {
  const { data, actions } = useStore();
  const [f, setF] = useState(() => resource ? { ...resource } : {
    name: '', email: '', role: '', discipline: DISCIPLINES[0], capacity_hours: 40, cost_rate: 100, color: PALETTE[data.resources.length % PALETTE.length], active: 1,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value });
  const save = async () => {
    if (!f.name.trim()) return actions.toast('Name is required', 'warn');
    const p = { ...f, name: f.name.trim(), capacity_hours: Number(f.capacity_hours) || 0, cost_rate: Number(f.cost_rate) || 0 };
    if (resource) await actions.updateResource(resource.id, p); else await actions.createResource(p);
    actions.toast(resource ? 'Team member updated' : 'Team member added', 'success');
    onClose();
  };
  return (
    <Modal title={resource ? 'Edit Team Member' : 'Add Team Member'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Save</button>
    </>}>
      <div className="grid2">
        <Field label="Full name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" value={f.email} onChange={set('email')} /></Field>
        <Field label="Role / title"><input className="input" value={f.role} onChange={set('role')} placeholder="e.g. Senior Firmware Engineer" /></Field>
        <Field label="Discipline">
          <select className="input" value={f.discipline} onChange={set('discipline')}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select>
        </Field>
        <Field label="Capacity (hours / week)"><input className="input" type="number" value={f.capacity_hours} onChange={set('capacity_hours')} /></Field>
        <Field label="Cost rate (per hour)"><input className="input" type="number" value={f.cost_rate} onChange={set('cost_rate')} /></Field>
        <Field label="Color">
          <div className="row">{PALETTE.map((c) => <span key={c} onClick={() => setF({ ...f, color: c })} style={{ width: 20, height: 20, borderRadius: 10, background: c, cursor: 'pointer', outline: f.color === c ? '2px solid #111827' : 'none', outlineOffset: 2 }} />)}</div>
        </Field>
        <Field label="Status"><label className="row"><input type="checkbox" checked={!!f.active} onChange={set('active')} />Active (counts toward capacity)</label></Field>
      </div>
    </Modal>
  );
}

function TimeOffModal({ resource, onClose }) {
  const { data, derived, actions } = useStore();
  const [f, setF] = useState({ start_date: derived.today, end_date: derived.today, reason: 'Vacation' });
  const list = data.timeOff.filter((o) => o.resource_id === resource.id).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return (
    <Modal title={`Time off · ${resource.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <div className="row">
        <input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        <input className="input" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
        <input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button className="btn primary" onClick={async () => {
          if (f.end_date < f.start_date) return actions.toast('End must be after start', 'warn');
          await actions.createTimeOff({ ...f, resource_id: resource.id });
        }}>Add</button>
      </div>
      <div className="mt16">
        {list.map((o) => (
          <div key={o.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid #f2f3f6' }}>
            <Plane size={14} className="faint" />
            <span className="grow">{fmtDate(o.start_date)} – {fmtDate(o.end_date)} <span className="faint">· {o.reason}</span></span>
            <button className="btn ghost sm icon" onClick={() => actions.deleteTimeOff(o.id)}><X size={13} /></button>
          </div>
        ))}
        {!list.length && <div className="faint">No time off recorded.</div>}
      </div>
    </Modal>
  );
}
