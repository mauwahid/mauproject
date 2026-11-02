import React, { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field } from './ui.jsx';
import { PROJECT_STATUSES, PRIORITIES, PALETTE } from '../lib/format.js';
import { todayISO, addDays } from '../lib/calendar.js';
import { navigate } from './layout.jsx';

export default function ProjectModal({ project, onClose }) {
  const { data, actions } = useStore();
  const editing = !!project;
  const [f, setF] = useState(() => project ? { ...project } : {
    name: '', code: '', description: '', manager: data.settings.userName || '', client: '',
    status: 'planning', priority: 'medium', health: 'auto', start_date: todayISO(), target_date: addDays(todayISO(), 90),
    budget: 0, color: PALETTE[data.projects.length % PALETTE.length],
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return actions.toast('Project name is required', 'warn');
    const payload = { ...f, budget: Number(f.budget) || 0, name: f.name.trim() };
    if (editing) {
      await actions.updateProject(project.id, payload);
      actions.toast('Project updated', 'success');
    } else {
      const p = await actions.createProject(payload);
      actions.toast('Project created', 'success');
      navigate(`project/${p.id}/gantt`);
    }
    onClose();
  };

  return (
    <Modal title={editing ? 'Project Settings' : 'New Project'} onClose={onClose} wide footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>{editing ? 'Save Changes' : 'Create Project'}</button>
    </>}>
      <div className="grid3">
        <Field label="Project name" className="span2"><input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Atlas EV Charger Gen 3" /></Field>
        <Field label="Code"><input className="input" value={f.code} onChange={set('code')} placeholder="ATL-300" /></Field>
        <Field label="Description" className="span3"><textarea className="input" value={f.description} onChange={set('description')} /></Field>
        <Field label="Project manager"><input className="input" value={f.manager} onChange={set('manager')} /></Field>
        <Field label="Client / Business unit"><input className="input" value={f.client} onChange={set('client')} /></Field>
        <Field label="Budget"><input className="input" type="number" value={f.budget} onChange={set('budget')} /></Field>
        <Field label="Start date"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Target finish"><input className="input" type="date" value={f.target_date || ''} onChange={set('target_date')} /></Field>
        <Field label="Status">
          <select className="input" value={f.status} onChange={set('status')}>
            {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={f.priority} onChange={set('priority')}>
            {PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Health">
          <select className="input" value={f.health} onChange={set('health')}>
            <option value="auto">Automatic (from schedule)</option>
            <option value="on_track">On Track</option>
            <option value="at_risk">At Risk</option>
            <option value="off_track">Off Track</option>
          </select>
        </Field>
        <Field label="Color">
          <div className="row">
            {PALETTE.map((c) => (
              <span key={c} onClick={() => setF({ ...f, color: c })} style={{
                width: 20, height: 20, borderRadius: 6, background: c, cursor: 'pointer',
                outline: f.color === c ? '2px solid #111827' : 'none', outlineOffset: 2,
              }} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
