import React, { useEffect, useState } from 'react';
import {
  X, Trash2, Calendar, Flag, CircleDot, Clock, Users, Link2, ListTree, MessageSquare, Gauge, Layers, Diamond, Lock, Tag, Plus, ExternalLink,
} from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Avatar, StatusPill, confirmDialog } from './ui.jsx';
import { TASK_STATUSES, PRIORITIES, DISCIPLINES, fmtDate, fmtHours, statusOf } from '../lib/format.js';
import { DEP_TYPES } from '../lib/scheduler.js';
import { hoursPerDay } from '../lib/analytics.js';
import { navigate } from './layout.jsx';

/** Input that commits on blur / Enter. */
export function BlurInput({ value, onCommit, type = 'text', className = 'input sm', ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { if (String(v) !== String(value ?? '')) onCommit(type === 'number' ? Number(v) : v); };
  return (
    <input {...rest} type={type} className={className} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value ?? ''); } }} />
  );
}

export default function TaskDrawer({ taskId, onClose }) {
  const { data, derived, actions } = useStore();
  const task = data.tasks.find((t) => t.id === taskId);
  const [desc, setDesc] = useState(task?.description || '');
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [sub, setSub] = useState('');

  useEffect(() => { setDesc(task?.description || ''); }, [taskId]); // eslint-disable-line
  useEffect(() => {
    window.mauproject.db.comments(taskId).then(setComments);
  }, [taskId]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !document.querySelector('.overlay')) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  if (!task) return null;
  const project = data.projects.find((p) => p.id === task.project_id);
  const sched = derived.schedules.get(task.project_id);
  const row = sched?.byId.get(task.id);
  const isSummary = row?.isSummary;
  const up = (patch) => actions.updateTask(task.id, patch);

  const assignments = data.assignments.filter((a) => a.task_id === task.id);
  const assignedIds = new Set(assignments.map((a) => a.resource_id));
  const preds = data.dependencies.filter((d) => d.successor_id === task.id);
  const succs = data.dependencies.filter((d) => d.predecessor_id === task.id);
  const leafCandidates = (sched?.rows || []).filter((r) => !r.isSummary && r.id !== task.id && !preds.some((p) => p.predecessor_id === r.id));
  const children = data.tasks.filter((t) => t.parent_id === task.id).sort((a, b) => a.sort_order - b.sort_order);
  const label = (id) => { const r = sched?.byId.get(id); return r ? `${r.wbs} ${r.task.name}` : '?'; };

  const work = assignments.reduce((s, a) => {
    const r = derived.resById.get(a.resource_id);
    return s + (r ? hoursPerDay(r, derived.cal) * a.units / 100 * (row?.dur || 0) : 0);
  }, 0);

  const addComment = async () => {
    if (!comment.trim()) return;
    await window.mauproject.db.create('comments', { task_id: task.id, author: data.settings.userName || 'Me', body: comment.trim() });
    setComment('');
    setComments(await window.mauproject.db.comments(task.id));
  };

  const del = async () => {
    const n = children.length;
    const ok = await confirmDialog({
      title: 'Delete task?', danger: true, confirmLabel: 'Delete',
      message: `“${task.name}”${n ? ` and its ${n} subtask${n > 1 ? 's' : ''}` : ''} will be permanently removed along with assignments and links.`,
    });
    if (!ok) return;
    onClose();
    await actions.deleteTask(task.id);
    actions.toast('Task deleted');
  };

  return (
    <>
      <div className="drawer-overlay" onMouseDown={onClose} />
      <div className="drawer">
        <div className="drawer-h">
          <span className="dot" style={{ width: 10, height: 10, borderRadius: 3, background: project?.color }} />
          <span className="small muted ellipsis grow" style={{ cursor: 'pointer' }} onClick={() => { onClose(); navigate(`project/${project.id}/gantt`); }}>
            {project?.name} <span className="faint">/ {row?.wbs}</span>
          </span>
          {row?.critical && <span className="pill" style={{ background: '#ffe4e6', color: '#e11d48' }}>Critical path</span>}
          <button className="btn ghost sm icon" title="Delete task" onClick={del}><Trash2 size={15} /></button>
          <button className="btn ghost sm icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="drawer-b">
          <BlurInput className="title-input" value={task.name} onCommit={(name) => name.trim() && up({ name: name.trim() })} />

          <div className="props">
            <label><CircleDot size={14} />Status</label>
            <select className="input sm" value={task.status} onChange={(e) => up({ status: e.target.value })} style={{ width: 180 }}>
              {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <label><Flag size={14} />Priority</label>
            <select className="input sm" value={task.priority} onChange={(e) => up({ priority: e.target.value })} style={{ width: 180 }}>
              {PRIORITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <label><Calendar size={14} />Dates</label>
            <div className="row">
              {isSummary ? <span>{fmtDate(row.start)} → {fmtDate(row.finish)} <span className="faint">(rolled up)</span></span> : <>
                <BlurInput type="date" value={task.start_date} onCommit={(v) => v && up({ start_date: v })} style={{ width: 150 }} />
                <span className="faint">→</span>
                <span>{fmtDate(row?.finish)}</span>
              </>}
            </div>
            <label><Clock size={14} />Duration</label>
            <div className="row">
              {isSummary || task.is_milestone ? <span>{task.is_milestone ? 'Milestone' : `${row?.dur} working days`}</span> : <>
                <BlurInput type="number" min="1" value={task.duration} onCommit={(v) => up({ duration: Math.max(1, v || 1) })} style={{ width: 80 }} />
                <span className="faint">working days</span>
              </>}
              {row && !isSummary && <span className="faint small" style={{ marginLeft: 'auto' }}>Slack: {row.slack}d</span>}
            </div>
            <label><Gauge size={14} />Progress</label>
            <div className="row">
              {isSummary ? <span>{row.progress}% <span className="faint">(rolled up)</span></span> : <>
                <input type="range" min="0" max="100" step="5" value={task.progress} style={{ width: 200 }}
                  onChange={(e) => up({ progress: Number(e.target.value), ...(Number(e.target.value) === 100 ? { status: 'done' } : task.status === 'done' ? { status: 'in_progress' } : task.status === 'todo' && Number(e.target.value) > 0 ? { status: 'in_progress' } : {}) })} />
                <b>{task.progress}%</b>
              </>}
            </div>
            <label><Layers size={14} />Discipline</label>
            <select className="input sm" value={task.discipline} onChange={(e) => up({ discipline: e.target.value })} style={{ width: 180 }}>
              <option value="">—</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
            </select>
            <label><Clock size={14} />Estimate</label>
            <div className="row">
              <BlurInput type="number" min="0" value={task.estimate_hours} onCommit={(v) => up({ estimate_hours: v || 0 })} style={{ width: 80 }} />
              <span className="faint">hours · planned work from assignments: {fmtHours(work)}</span>
            </div>
            {!isSummary && <>
              <label><Lock size={14} />Scheduling</label>
              <select className="input sm" value={task.schedule_mode} onChange={(e) => up({ schedule_mode: e.target.value })} style={{ width: 240 }}>
                <option value="auto">Auto (driven by predecessors)</option>
                <option value="manual">Manual (pinned dates)</option>
              </select>
              <label><Diamond size={14} />Milestone</label>
              <label className="row" style={{ color: 'inherit' }}>
                <input type="checkbox" checked={!!task.is_milestone} onChange={(e) => up({ is_milestone: e.target.checked ? 1 : 0, duration: e.target.checked ? 0 : 1 })} />
                Zero-duration milestone
              </label>
            </>}
            <label><Tag size={14} />Tags</label>
            <BlurInput value={task.tags} placeholder="comma separated" onCommit={(v) => up({ tags: v })} />
            {task.baseline_start && <>
              <label><Calendar size={14} />Baseline</label>
              <span className="muted">{fmtDate(task.baseline_start)} → {fmtDate(task.baseline_finish)}
                {row && row.finish > task.baseline_finish && <b style={{ color: 'var(--danger)', marginLeft: 8 }}>+{derived.cal.workdays(task.baseline_finish, row.finish) - 1}d slip</b>}
              </span>
            </>}
          </div>

          <div className="section-title"><Users size={13} />Assignees</div>
          {isSummary && <div className="faint small mb8">Assign people to the work tasks under this summary.</div>}
          {assignments.map((a) => {
            const r = derived.resById.get(a.resource_id);
            if (!r) return null;
            return (
              <div key={a.id} className="row" style={{ padding: '5px 0' }}>
                <Avatar resource={r} />
                <div className="grow"><div className="bold">{r.name}</div><div className="faint tiny">{r.role}</div></div>
                <BlurInput type="number" min="5" max="200" step="5" value={a.units} onCommit={(v) => actions.updateAssignment(a.id, { units: Math.max(5, v || 100) })} style={{ width: 70 }} />
                <span className="faint">%</span>
                <button className="btn ghost sm icon" onClick={() => actions.unassign(a.id)}><X size={13} /></button>
              </div>
            );
          })}
          {!isSummary && (
            <select className="input sm mt8" value="" onChange={(e) => e.target.value && actions.assign(task.id, Number(e.target.value), 100)} style={{ width: 280 }}>
              <option value="">+ Assign a team member…</option>
              {data.resources.filter((r) => r.active && !assignedIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} — {r.role}</option>)}
            </select>
          )}

          {!isSummary && <>
            <div className="section-title"><Link2 size={13} />Dependencies</div>
            {preds.map((d) => (
              <div key={d.id} className="row" style={{ padding: '4px 0' }}>
                <span className="faint small" style={{ width: 70 }}>Waits on</span>
                <span className="grow ellipsis" style={{ cursor: 'pointer' }} onClick={() => actions.openTask(d.predecessor_id)}>{label(d.predecessor_id)}</span>
                <select className="input sm" style={{ width: 70 }} value={d.type} title={DEP_TYPES[d.type]} onChange={(e) => actions.updateDependency(d.id, { type: e.target.value })}>
                  {Object.keys(DEP_TYPES).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <BlurInput type="number" value={d.lag} title="Lag (working days)" onCommit={(v) => actions.updateDependency(d.id, { lag: v || 0 })} style={{ width: 56 }} />
                <span className="faint tiny">d lag</span>
                <button className="btn ghost sm icon" onClick={() => actions.removeDependency(d.id)}><X size={13} /></button>
              </div>
            ))}
            {succs.map((d) => (
              <div key={d.id} className="row" style={{ padding: '4px 0' }}>
                <span className="faint small" style={{ width: 70 }}>Blocks</span>
                <span className="grow ellipsis" style={{ cursor: 'pointer' }} onClick={() => actions.openTask(d.successor_id)}>{label(d.successor_id)}</span>
                <span className="tag">{d.type}{d.lag ? ` ${d.lag > 0 ? '+' : ''}${d.lag}d` : ''}</span>
                <button className="btn ghost sm icon" onClick={() => actions.removeDependency(d.id)}><X size={13} /></button>
              </div>
            ))}
            <select className="input sm mt8" value="" style={{ width: 340 }} onChange={(e) => e.target.value && actions.addDependency(Number(e.target.value), task.id, 'FS', 0)}>
              <option value="">+ Add predecessor (Finish-to-Start)…</option>
              {leafCandidates.map((r) => <option key={r.id} value={r.id}>{r.wbs} {r.task.name}</option>)}
            </select>
          </>}

          <div className="section-title"><ListTree size={13} />Subtasks</div>
          {children.map((c) => (
            <div key={c.id} className="row" style={{ padding: '4px 0', cursor: 'pointer' }} onClick={() => actions.openTask(c.id)}>
              <span className="status-dot" style={{ borderColor: statusOf(c.status).color, background: c.status === 'done' ? statusOf(c.status).color : 'transparent' }} />
              <span className="grow ellipsis" style={{ textDecoration: c.status === 'done' ? 'line-through' : 'none' }}>{c.name}</span>
              <StatusPill status={c.status} />
              <ExternalLink size={13} className="faint" />
            </div>
          ))}
          <div className="quick-add" style={{ padding: '4px 0' }}>
            <Plus size={14} />
            <input placeholder="Add subtask and press Enter (turns this into a summary task)" value={sub} onChange={(e) => setSub(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && sub.trim()) {
                  await actions.createTask({ project_id: task.project_id, parent_id: task.id, name: sub.trim(), start_date: task.start_date, duration: 1 });
                  setSub('');
                }
              }} />
          </div>

          <div className="section-title">Description</div>
          <textarea className="input" rows={4} value={desc} placeholder="Scope, acceptance criteria, notes…"
            onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && up({ description: desc })} />

          <div className="section-title"><MessageSquare size={13} />Activity</div>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f2f3f6' }}>
              <div className="row small"><b>{c.author}</b><span className="faint tiny">{new Date(c.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</span></div>
              <div style={{ marginTop: 3, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{c.body}</div>
            </div>
          ))}
          <div className="row mt8">
            <input className="input" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
            <button className="btn primary" onClick={addComment}>Post</button>
          </div>
        </div>
      </div>
    </>
  );
}
