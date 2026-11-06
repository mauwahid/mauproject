/**
 * Multi-select building blocks: selection hook, floating bulk-action bar and bulk edit dialogs
 * for tasks, projects and team members.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Pencil, Trash2, CheckSquare } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field, confirmDialog } from './ui.jsx';
import { TASK_STATUSES, PRIORITIES, DISCIPLINES, PROJECT_STATUSES } from '../lib/format.js';

/**
 * Selection state with click / Cmd-Ctrl-click / Shift-click range semantics.
 * `ordered` is the visible id order (for Shift ranges); ids no longer present are dropped automatically.
 */
export function useSelection(ordered) {
  const [sel, setSel] = useState(() => new Set());
  const anchor = useRef(null);
  const key = ordered.join(',');
  useEffect(() => {
    setSel((s) => {
      const live = new Set(ordered);
      const next = new Set([...s].filter((id) => live.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [key]); // eslint-disable-line

  /** Checkbox-style toggle (keeps other selections). Shift extends a range from the last anchor. */
  const toggle = useCallback((id, e) => {
    setSel((s) => {
      const next = new Set(s);
      if (e && e.shiftKey && anchor.current != null) {
        const a = ordered.indexOf(anchor.current);
        const b = ordered.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ordered[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      anchor.current = id;
      return next;
    });
  }, [key]); // eslint-disable-line

  /** Row-click semantics: plain click = single, Cmd/Ctrl = toggle, Shift = range. */
  const click = useCallback((id, e) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) return toggle(id, e);
    anchor.current = id;
    setSel(new Set([id]));
  }, [toggle]);

  const setMany = useCallback((ids, on) => setSel((s) => {
    const next = new Set(s);
    for (const id of ids) on ? next.add(id) : next.delete(id);
    return next;
  }), []);
  const clear = useCallback(() => setSel(new Set()), []);
  return { sel, ids: [...sel], has: (id) => sel.has(id), size: sel.size, toggle, click, setMany, clear, setSel };
}

/** Header checkbox that selects / clears a set of ids (indeterminate when partial). */
export function SelectAll({ ids, selection }) {
  const ref = useRef(null);
  const n = ids.filter((id) => selection.has(id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < ids.length; }, [n, ids.length]);
  return <input ref={ref} type="checkbox" className="sel-box" checked={ids.length > 0 && n === ids.length}
    onChange={(e) => selection.setMany(ids, e.target.checked)} onClick={(e) => e.stopPropagation()} title="Select all" />;
}

export function RowCheck({ id, selection }) {
  return <input type="checkbox" className="sel-box" checked={selection.has(id)}
    onClick={(e) => { e.stopPropagation(); selection.toggle(id, e); }} onChange={() => {}} />;
}

/** Floating action bar shown while items are selected. Esc clears. */
export function BulkBar({ count, noun, onEdit, onDelete, onClear, children }) {
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.overlay, .drawer')) onClear();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClear]);
  if (!count) return null;
  return (
    <div className="bulk-bar">
      <CheckSquare size={15} />
      <b>{count}</b><span>{noun}{count === 1 ? '' : 's'} selected</span>
      <div className="bulk-sep" />
      {children}
      {onEdit && <button className="bulk-btn" onClick={onEdit}><Pencil size={14} />Edit</button>}
      {onDelete && <button className="bulk-btn danger" onClick={onDelete}><Trash2 size={14} />Delete</button>}
      <button className="bulk-btn icon" title="Clear selection (Esc)" onClick={onClear}><X size={15} /></button>
    </div>
  );
}

const KEEP = '';
const keepOpt = <option value={KEEP}>— Keep current —</option>;

// ---------- tasks ----------
export function BulkEditTasksModal({ ids, onClose, onDone }) {
  const { data, actions } = useStore();
  const [f, setF] = useState({ status: KEEP, priority: KEEP, discipline: KEEP, progress: KEEP, start_date: '', shift: '', duration: '', addRes: KEEP, units: 100, removeRes: KEEP, tag: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const tasks = data.tasks.filter((t) => ids.includes(t.id));
  const summaries = tasks.filter((t) => data.tasks.some((x) => x.parent_id === t.id)).length;

  const save = async () => {
    const fields = {};
    if (f.status) fields.status = f.status;
    if (f.priority) fields.priority = f.priority;
    if (f.discipline) fields.discipline = f.discipline === '__none' ? '' : f.discipline;
    if (f.progress !== KEEP && f.progress !== '') fields.progress = Math.max(0, Math.min(100, Number(f.progress)));
    if (f.start_date) fields.start_date = f.start_date;
    if (f.duration) fields.duration = Math.max(1, Number(f.duration));
    const extra = {};
    if (f.shift && Number(f.shift)) extra.shiftDays = Number(f.shift);
    if (f.addRes) extra.addAssignee = { resourceId: Number(f.addRes), units: Number(f.units) || 100 };
    if (f.removeRes) extra.removeAssignee = Number(f.removeRes);
    if (f.tag.trim()) extra.addTag = f.tag.trim();
    if (!Object.keys(fields).length && !Object.keys(extra).length) return actions.toast('Nothing to change', 'warn');
    setBusy(true);
    await actions.bulkUpdateTasks(ids, fields, extra);
    setBusy(false);
    actions.toast(`${ids.length} task${ids.length > 1 ? 's' : ''} updated`, 'success');
    onDone && onDone();
    onClose();
  };

  return (
    <Modal title={`Edit ${ids.length} task${ids.length > 1 ? 's' : ''}`} onClose={onClose} wide footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Apply to ${ids.length}`}</button>
    </>}>
      <div className="small muted mb16">Only the fields you change are applied; everything else keeps its current value.
        {summaries > 0 && ` ${summaries} summary task${summaries > 1 ? 's' : ''} will keep their rolled-up dates, duration and progress.`}</div>
      <div className="grid3">
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{keepOpt}{TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set('priority')}>{keepOpt}{PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Discipline"><select className="input" value={f.discipline} onChange={set('discipline')}>{keepOpt}<option value="__none">(none)</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Progress %"><input className="input" type="number" min="0" max="100" placeholder="keep" value={f.progress} onChange={set('progress')} /></Field>
        <Field label="Set start date"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Shift dates (± working days)"><input className="input" type="number" placeholder="e.g. 5 or -3" value={f.shift} onChange={set('shift')} /></Field>
        <Field label="Duration (working days)"><input className="input" type="number" min="1" placeholder="keep" value={f.duration} onChange={set('duration')} /></Field>
        <Field label="Add assignee">
          <div className="row">
            <select className="input" value={f.addRes} onChange={set('addRes')}><option value="">—</option>{data.resources.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <input className="input" style={{ width: 70 }} type="number" min="5" max="200" value={f.units} onChange={set('units')} title="Allocation %" />
            <span className="faint">%</span>
          </div>
        </Field>
        <Field label="Remove assignee"><select className="input" value={f.removeRes} onChange={set('removeRes')}><option value="">—</option>{data.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label="Add tag"><input className="input" placeholder="e.g. sprint-12" value={f.tag} onChange={set('tag')} /></Field>
      </div>
    </Modal>
  );
}

export async function confirmDeleteTasks(actions, data, ids) {
  const childCount = data.tasks.filter((t) => t.parent_id && ids.includes(t.parent_id) && !ids.includes(t.id)).length;
  const ok = await confirmDialog({
    title: `Delete ${ids.length} task${ids.length > 1 ? 's' : ''}?`, danger: true, confirmLabel: 'Delete',
    message: `The selected tasks${childCount ? ` and their subtasks` : ''} will be permanently deleted along with their assignments and links. This cannot be undone.`,
  });
  if (!ok) return false;
  const n = await actions.bulkDeleteTasks(ids);
  actions.toast(`${n} task${n > 1 ? 's' : ''} deleted`);
  return true;
}

// ---------- projects ----------
export function BulkEditProjectsModal({ ids, onClose }) {
  const { data, actions } = useStore();
  const [f, setF] = useState({ status: KEEP, priority: KEEP, health: KEEP, space: KEEP, manager: '', target_date: '', archived: KEEP });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const fields = {};
    if (f.status) fields.status = f.status;
    if (f.priority) fields.priority = f.priority;
    if (f.health) fields.health = f.health;
    if (f.space) fields.space_id = f.space === '__none' ? null : Number(f.space);
    if (f.manager.trim()) fields.manager = f.manager.trim();
    if (f.target_date) fields.target_date = f.target_date;
    if (f.archived) fields.archived = Number(f.archived);
    if (!Object.keys(fields).length) return actions.toast('Nothing to change', 'warn');
    await actions.bulkUpdateProjects(ids, fields);
    actions.toast(`${ids.length} project${ids.length > 1 ? 's' : ''} updated`, 'success');
    onClose();
  };
  return (
    <Modal title={`Edit ${ids.length} project${ids.length > 1 ? 's' : ''}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Apply to {ids.length}</button>
    </>}>
      <div className="grid2">
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{keepOpt}{PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set('priority')}>{keepOpt}{PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Health"><select className="input" value={f.health} onChange={set('health')}>{keepOpt}<option value="auto">Automatic</option><option value="on_track">On Track</option><option value="at_risk">At Risk</option><option value="off_track">Off Track</option></select></Field>
        <Field label="Move to space"><select className="input" value={f.space} onChange={set('space')}>{keepOpt}<option value="__none">No space</option>{data.spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Project manager"><input className="input" placeholder="keep" value={f.manager} onChange={set('manager')} /></Field>
        <Field label="Target finish"><input className="input" type="date" value={f.target_date} onChange={set('target_date')} /></Field>
        <Field label="Archive"><select className="input" value={f.archived} onChange={set('archived')}>{keepOpt}<option value="1">Archive</option><option value="0">Restore (unarchive)</option></select></Field>
      </div>
    </Modal>
  );
}

export async function confirmDeleteProjects(actions, data, ids) {
  const tasks = data.tasks.filter((t) => ids.includes(t.project_id)).length;
  const ok = await confirmDialog({
    title: `Delete ${ids.length} project${ids.length > 1 ? 's' : ''}?`, danger: true, confirmLabel: 'Delete projects',
    message: `${ids.length} project${ids.length > 1 ? 's' : ''} and ${tasks} task${tasks === 1 ? '' : 's'} (with dependencies, assignments and dashboards) will be permanently deleted. Consider archiving instead.`,
  });
  if (!ok) return false;
  await actions.bulkDeleteProjects(ids);
  actions.toast(`${ids.length} project${ids.length > 1 ? 's' : ''} deleted`);
  return true;
}

// ---------- team ----------
export function BulkEditResourcesModal({ ids, onClose }) {
  const { actions } = useStore();
  const [f, setF] = useState({ role: '', discipline: KEEP, capacity_hours: '', cost_rate: '', active: KEEP });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const fields = {};
    if (f.role.trim()) fields.role = f.role.trim();
    if (f.discipline) fields.discipline = f.discipline;
    if (f.capacity_hours !== '') fields.capacity_hours = Math.max(0, Number(f.capacity_hours));
    if (f.cost_rate !== '') fields.cost_rate = Math.max(0, Number(f.cost_rate));
    if (f.active) fields.active = Number(f.active);
    if (!Object.keys(fields).length) return actions.toast('Nothing to change', 'warn');
    await actions.bulkUpdateResources(ids, fields);
    actions.toast(`${ids.length} team member${ids.length > 1 ? 's' : ''} updated`, 'success');
    onClose();
  };
  return (
    <Modal title={`Edit ${ids.length} team member${ids.length > 1 ? 's' : ''}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Apply to {ids.length}</button>
    </>}>
      <div className="grid2">
        <Field label="Role / title"><input className="input" placeholder="keep" value={f.role} onChange={set('role')} /></Field>
        <Field label="Discipline"><select className="input" value={f.discipline} onChange={set('discipline')}>{keepOpt}{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Capacity (hours / week)"><input className="input" type="number" min="0" placeholder="keep" value={f.capacity_hours} onChange={set('capacity_hours')} /></Field>
        <Field label="Cost rate (per hour)"><input className="input" type="number" min="0" placeholder="keep" value={f.cost_rate} onChange={set('cost_rate')} /></Field>
        <Field label="Status"><select className="input" value={f.active} onChange={set('active')}>{keepOpt}<option value="1">Active</option><option value="0">Inactive</option></select></Field>
      </div>
    </Modal>
  );
}

export async function confirmDeleteResources(actions, data, ids) {
  const asg = data.assignments.filter((a) => ids.includes(a.resource_id)).length;
  const ok = await confirmDialog({
    title: `Remove ${ids.length} team member${ids.length > 1 ? 's' : ''}?`, danger: true, confirmLabel: 'Remove',
    message: `Their ${asg} task assignment${asg === 1 ? '' : 's'} and time off will be removed. Marking them inactive keeps history instead.`,
  });
  if (!ok) return false;
  await actions.bulkDeleteResources(ids);
  actions.toast(`${ids.length} team member${ids.length > 1 ? 's' : ''} removed`);
  return true;
}
