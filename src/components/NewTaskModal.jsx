import React, { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field } from './ui.jsx';
import { TASK_STATUSES, PRIORITIES, DISCIPLINES } from '../lib/format.js';
import { todayISO } from '../lib/calendar.js';

export default function NewTaskModal({ projectId, parentId, onClose }) {
  const { data, derived, actions } = useStore();
  const projects = data.projects.filter((p) => !p.archived);
  const [f, setF] = useState({
    project_id: projectId || projects[0]?.id || '', parent_id: parentId || '', name: '', status: 'todo', priority: 'medium',
    discipline: '', start_date: todayISO(), duration: 5, estimate_hours: 0, is_milestone: 0, assignee: '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value });
  const pid = Number(f.project_id);
  const parents = derived.schedules.get(pid)?.rows || [];

  const save = async () => {
    if (!pid) return actions.toast('Create a project first', 'warn');
    if (!f.name.trim()) return actions.toast('Task name is required', 'warn');
    const t = await actions.createTask({
      project_id: pid, parent_id: f.parent_id ? Number(f.parent_id) : null, name: f.name.trim(), status: f.status,
      priority: f.priority, discipline: f.discipline, start_date: f.start_date, duration: Number(f.duration) || 1,
      estimate_hours: Number(f.estimate_hours) || 0, is_milestone: f.is_milestone,
    });
    if (f.assignee) await actions.assign(t.id, Number(f.assignee), 100);
    actions.toast('Task created', 'success');
    onClose();
  };

  return (
    <Modal title="New Task" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Create Task</button>
    </>}>
      <div className="grid2">
        <Field label="Task name" className="span2"><input className="input" autoFocus value={f.name} onChange={set('name')} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
        <Field label="Project">
          <select className="input" value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value, parent_id: '' })}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Parent (WBS)">
          <select className="input" value={f.parent_id} onChange={set('parent_id')}>
            <option value="">— Top level —</option>
            {parents.map((r) => <option key={r.id} value={r.id}>{'  '.repeat(r.level)}{r.wbs} {r.task.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>{TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </Field>
        <Field label="Priority">
          <select className="input" value={f.priority} onChange={set('priority')}>{PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </Field>
        <Field label="Start"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Duration (working days)"><input className="input" type="number" min="1" value={f.duration} onChange={set('duration')} disabled={!!f.is_milestone} /></Field>
        <Field label="Discipline">
          <select className="input" value={f.discipline} onChange={set('discipline')}>
            <option value="">—</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Estimate (hours)"><input className="input" type="number" min="0" value={f.estimate_hours} onChange={set('estimate_hours')} /></Field>
        <Field label="Assignee">
          <select className="input" value={f.assignee} onChange={set('assignee')}>
            <option value="">Unassigned</option>
            {data.resources.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} — {r.role}</option>)}
          </select>
        </Field>
        <Field label="Milestone">
          <label className="row"><input type="checkbox" checked={!!f.is_milestone} onChange={set('is_milestone')} /> Zero-duration milestone</label>
        </Field>
      </div>
    </Modal>
  );
}
