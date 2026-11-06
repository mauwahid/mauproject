import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  Plus, CornerDownRight, IndentIncrease, IndentDecrease, ArrowUp, ArrowDown, Link2, Trash2, ChevronRight, ChevronDown,
  CalendarDays, Diamond, ChevronsDownUp, ChevronsUpDown, Flag,
} from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { BlurInput } from '../../components/TaskDrawer.jsx';
import { Segmented, confirmDialog, ContextMenu } from '../../components/ui.jsx';
import { useSelection, BulkBar, BulkEditTasksModal, confirmDeleteTasks } from '../../components/bulk.jsx';
import { addDays, diffDays, parseDate, minDate, maxDate, startOfWeek, startOfMonth, addMonths } from '../../lib/calendar.js';
import { predLabel } from '../../lib/scheduler.js';
import { fmtDate } from '../../lib/format.js';

const ROW = 34;
const ZOOMS = { day: 30, week: 11, month: 3.6 };
const COLS = [
  { key: 'wbs', label: 'WBS', w: 54 },
  { key: 'name', label: 'Task name', w: 250 },
  { key: 'dur', label: 'Dur.', w: 56 },
  { key: 'start', label: 'Start', w: 118 },
  { key: 'finish', label: 'Finish', w: 90 },
  { key: 'pct', label: '%', w: 54 },
  { key: 'pred', label: 'Pred.', w: 70 },
  { key: 'res', label: 'Resources', w: 120 },
];

export default function Gantt({ project }) {
  const { data, derived, actions } = useStore();
  const sched = derived.schedules.get(project.id);
  const cal = derived.cal;
  const [zoom, setZoom] = useState('week');
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showCritical, setShowCritical] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);
  const [drag, setDrag] = useState(null); // {id, mode, start, dur}
  const [link, setLink] = useState(null); // {fromId, x, y}
  const [menu, setMenu] = useState(null);
  const timelineRef = useRef(null);
  const gridRef = useRef(null);
  const ppd = ZOOMS[zoom];

  const deps = data.dependencies.filter((d) => d.project_id === project.id);
  const resNames = useMemo(() => {
    const m = new Map();
    for (const a of data.assignments) {
      const r = derived.resById.get(a.resource_id);
      if (!r) continue;
      if (!m.has(a.task_id)) m.set(a.task_id, []);
      m.get(a.task_id).push(a.units !== 100 ? `${r.name.split(' ')[0]} [${a.units}%]` : r.name.split(' ')[0]);
    }
    return m;
  }, [data.assignments, derived.resById]);

  // visible rows honoring collapse
  const rows = useMemo(() => {
    const out = [];
    const hidden = new Set();
    for (const r of sched.rows) {
      if (r.parentId && (hidden.has(r.parentId) || collapsed.has(r.parentId))) { hidden.add(r.id); continue; }
      out.push(r);
    }
    return out;
  }, [sched, collapsed]);
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const picked = useSelection(useMemo(() => rows.map((r) => r.id), [rows]));
  const multi = picked.size > 1;
  const [bulkEdit, setBulkEdit] = useState(false);
  const pickRow = (id, e) => { setSelected(id); picked.click(id, e); };
  const deletePicked = async () => { if (await confirmDeleteTasks(actions, data, picked.ids)) { picked.clear(); setSelected(null); } };

  // time range
  const range = useMemo(() => {
    const s = minDate(project.start_date, sched.start) || project.start_date;
    const f = maxDate(maxDate(sched.finish, project.target_date), addDays(s, 60));
    const from = zoom === 'month' ? startOfMonth(addDays(s, -14)) : startOfWeek(addDays(s, -7));
    const to = zoom === 'month' ? addDays(addMonths(f, 2), -1) : addDays(startOfWeek(addDays(f, 28)), 6);
    return { from, to, days: diffDays(from, to) + 1 };
  }, [project, sched, zoom]);
  const width = range.days * ppd;
  const xOf = useCallback((iso) => diffDays(range.from, iso) * ppd, [range.from, ppd]);

  // scroll to today on first render / zoom change
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const target = derived.today >= range.from && derived.today <= range.to ? derived.today : sched.start || range.from;
    el.scrollLeft = Math.max(0, xOf(target) - 220);
  }, [zoom]); // eslint-disable-line

  const onScroll = (e) => { if (gridRef.current) gridRef.current.scrollTop = e.currentTarget.scrollTop; };
  const onGridWheel = (e) => { if (timelineRef.current) timelineRef.current.scrollTop += e.deltaY; };

  // ---------- bar drag (move / resize) ----------
  const startDrag = (e, r, mode) => {
    if (r.isSummary || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(r.id);
    const x0 = e.clientX;
    const orig = { start: r.start, finish: r.finish, dur: r.dur };
    let moved = false;
    let last = null;
    const move = (ev) => {
      const delta = Math.round((ev.clientX - x0) / ppd);
      if (delta !== 0) moved = true;
      if (mode === 'move') {
        const ns = cal.snap(addDays(orig.start, delta));
        last = { id: r.id, start: ns, dur: orig.dur };
      } else {
        const nf = addDays(orig.finish, delta);
        const nd = Math.max(1, cal.workdays(orig.start, nf));
        last = { id: r.id, start: orig.start, dur: nd };
      }
      setDrag(last);
    };
    const up = async () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag(null);
      if (!moved || !last) return;
      if (mode === 'move' && last.start !== orig.start) {
        const hasPreds = deps.some((d) => d.successor_id === r.id);
        const patch = { start_date: last.start };
        if (hasPreds && r.task.schedule_mode === 'auto') {
          patch.schedule_mode = 'manual';
          actions.toast('Task pinned to manual scheduling (it has predecessors)', 'warn');
        }
        await actions.updateTask(r.id, patch);
      } else if (mode === 'resize' && last.dur !== orig.dur) {
        await actions.updateTask(r.id, { duration: last.dur });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ---------- link drag ----------
  const startLink = (e, r) => {
    e.stopPropagation();
    e.preventDefault();
    const box = timelineRef.current.getBoundingClientRect();
    const toLocal = (ev) => ({ x: ev.clientX - box.left + timelineRef.current.scrollLeft, y: ev.clientY - box.top + timelineRef.current.scrollTop - 52 });
    setLink({ fromId: r.id, ...toLocal(e) });
    const move = (ev) => setLink({ fromId: r.id, ...toLocal(ev) });
    const up = async (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setLink(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest('[data-task-id]');
      if (target) {
        const tid = Number(target.getAttribute('data-task-id'));
        if (tid && tid !== r.id) {
          const res = await actions.addDependency(r.id, tid, 'FS', 0);
          if (res) actions.toast('Dependency added (Finish-to-Start)', 'success');
        }
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ---------- toolbar actions ----------
  const sel = selected ? sched.byId.get(selected) : null;
  const addTask = async (asChild) => {
    let parent_id = null;
    let sort_order;
    if (sel) {
      if (asChild) parent_id = sel.id;
      else { parent_id = sel.parentId; sort_order = sel.task.sort_order + 0.5; }
    }
    const t = await actions.createTask({ project_id: project.id, parent_id, sort_order, name: asChild ? 'New subtask' : 'New task', start_date: sel ? sel.start : undefined, duration: 3 });
    if (sort_order !== undefined) {
      // renumber siblings so ordering stays clean
      const sibs = data.tasks.filter((x) => x.project_id === project.id && (x.parent_id || null) === (parent_id || null)).concat([t])
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      await window.mauproject.db.bulkUpdate('tasks', sibs.map((s, i) => ({ id: s.id, patch: { sort_order: i + 1 } })));
      await actions.reload();
    }
    if (asChild && sel) setCollapsed((c) => { const n = new Set(c); n.delete(sel.id); return n; });
    setSelected(t.id);
    setTimeout(() => {
      const inp = document.querySelector(`[data-name-input="${t.id}"]`);
      if (inp) { inp.focus(); inp.select(); }
    }, 60);
  };
  const linkToPrevious = async () => {
    if (!sel) return;
    const leaves = sched.rows.filter((r) => !r.isSummary);
    const i = leaves.findIndex((r) => r.id === sel.id);
    if (i <= 0) return actions.toast('No previous work task to link from', 'warn');
    const res = await actions.addDependency(leaves[i - 1].id, sel.id, 'FS', 0);
    if (res) actions.toast(`Linked ${leaves[i - 1].wbs} → ${sel.wbs}`, 'success');
  };
  const del = async (r = sel) => {
    if (multi) return deletePicked();
    if (!r) return;
    const ok = await confirmDialog({ title: 'Delete task?', danger: true, confirmLabel: 'Delete', message: `“${r.task.name}”${r.isSummary ? ' and all of its subtasks' : ''} will be permanently deleted.` });
    if (ok) { await actions.deleteTask(r.id); setSelected(null); }
  };

  useEffect(() => {
    const k = (e) => {
      if (!selected || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (document.querySelector('.drawer, .overlay')) return;
      if (e.key === 'Tab') { e.preventDefault(); e.shiftKey ? actions.outdentTask(selected) : actions.indentTask(selected); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
      if (e.key === 'Enter') { e.preventDefault(); actions.openTask(selected); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = rowIndex.get(selected) ?? 0;
        const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) pickRow(n.id, e);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // ---------- header scale ----------
  const header = useMemo(() => {
    const top = [];
    const bottom = [];
    if (zoom === 'month') {
      for (let m = startOfMonth(range.from); m <= range.to; m = addMonths(m, 1)) {
        const d = parseDate(m);
        bottom.push({ x: xOf(m), w: diffDays(m, addMonths(m, 1)) * ppd, label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) });
        if (d.getUTCMonth() === 0 || m === startOfMonth(range.from)) top.push({ x: xOf(m), label: String(d.getUTCFullYear()) });
      }
    } else {
      for (let m = startOfMonth(range.from); m <= range.to; m = addMonths(m, 1)) {
        const d = parseDate(m);
        top.push({ x: Math.max(0, xOf(m)), label: d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
      }
      if (zoom === 'week') {
        for (let w = range.from; w <= range.to; w = addDays(w, 7)) bottom.push({ x: xOf(w), w: 7 * ppd, label: String(parseDate(w).getUTCDate()) });
      } else {
        for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
          const dt = parseDate(d);
          bottom.push({ x: xOf(d), w: ppd, label: `${'SMTWTFS'[dt.getUTCDay()]}${dt.getUTCDate()}`, off: !cal.isWorking(d) });
        }
      }
    }
    return { top, bottom };
  }, [zoom, range, xOf, ppd, cal]);

  const nonWorking = useMemo(() => {
    if (zoom === 'month') return [];
    const out = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) if (!cal.isWorking(d)) out.push(d);
    return out;
  }, [zoom, range, cal]);

  // ---------- geometry ----------
  const geo = (r) => {
    const live = drag && drag.id === r.id ? drag : null;
    const start = live ? live.start : r.start;
    const dur = live ? live.dur : r.dur;
    const finish = r.task.is_milestone ? start : live ? cal.finish(start, dur) : r.finish;
    const x1 = xOf(start);
    const x2 = r.task.is_milestone ? x1 : xOf(finish) + ppd;
    return { x1, x2, start, finish };
  };

  const arrows = deps.map((d) => {
    const pi = rowIndex.get(d.predecessor_id);
    const si = rowIndex.get(d.successor_id);
    if (pi === undefined || si === undefined) return null;
    const p = geo(sched.byId.get(d.predecessor_id));
    const s = geo(sched.byId.get(d.successor_id));
    const fromEnd = d.type === 'FS' || d.type === 'FF';
    const toStart = d.type === 'FS' || d.type === 'SS';
    const pm = sched.byId.get(d.predecessor_id).task.is_milestone;
    const sm = sched.byId.get(d.successor_id).task.is_milestone;
    const ax = fromEnd ? p.x2 + (pm ? 6 : 0) : p.x1 - (pm ? 6 : 0);
    const ay = pi * ROW + ROW / 2;
    const bx = toStart ? s.x1 - (sm ? 6 : 0) : s.x2 + (sm ? 6 : 0);
    const by = si * ROW + ROW / 2;
    const midY = by > ay ? si * ROW : si * ROW + ROW;
    let path;
    if (fromEnd && toStart) {
      path = bx - 8 >= ax + 8 ? `M${ax},${ay} H${bx - 8} V${by} H${bx}` : `M${ax},${ay} H${ax + 8} V${midY} H${bx - 8} V${by} H${bx}`;
    } else if (!fromEnd && toStart) {
      path = `M${ax},${ay} H${Math.min(ax, bx) - 8} V${by} H${bx}`;
    } else if (fromEnd && !toStart) {
      path = `M${ax},${ay} H${Math.max(ax, bx) + 8} V${by} H${bx}`;
    } else {
      path = bx + 8 <= ax - 8 ? `M${ax},${ay} H${bx + 8} V${by} H${bx}` : `M${ax},${ay} H${ax - 8} V${midY} H${bx + 8} V${by} H${bx}`;
    }
    const crit = showCritical && sched.byId.get(d.predecessor_id).critical && sched.byId.get(d.successor_id).critical;
    return { id: d.id, path, bx, by, toStart, crit };
  }).filter(Boolean);

  const gridW = COLS.reduce((s, c) => s + c.w, 0);
  const bodyH = Math.max(rows.length * ROW + 40, 300);
  const todayX = xOf(derived.today);

  const toggle = (id) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rowMenu = (e, r) => {
    e.preventDefault();
    if (multi && picked.has(r.id)) {
      setMenu({
        x: e.clientX, y: e.clientY, items: [
          { label: `Edit ${picked.size} selected tasks…`, icon: ChevronRight, onClick: () => setBulkEdit(true) },
          { label: `Delete ${picked.size} selected tasks`, icon: Trash2, danger: true, onClick: deletePicked },
        ],
      });
      return;
    }
    pickRow(r.id);
    setMenu({
      x: e.clientX, y: e.clientY, items: [
        { label: 'Open details', icon: ChevronRight, onClick: () => actions.openTask(r.id) },
        { label: 'Add subtask', icon: CornerDownRight, onClick: () => addTask(true) },
        '-',
        { label: 'Indent', icon: IndentIncrease, onClick: () => actions.indentTask(r.id) },
        { label: 'Outdent', icon: IndentDecrease, onClick: () => actions.outdentTask(r.id) },
        { label: 'Move up', icon: ArrowUp, onClick: () => actions.moveTask(r.id, -1) },
        { label: 'Move down', icon: ArrowDown, onClick: () => actions.moveTask(r.id, 1) },
        ...(!r.isSummary ? [{ label: r.task.is_milestone ? 'Convert to task' : 'Convert to milestone', icon: Diamond, onClick: () => actions.updateTask(r.id, { is_milestone: r.task.is_milestone ? 0 : 1, duration: r.task.is_milestone ? 1 : 0 }) }] : []),
        '-',
        { label: 'Delete', icon: Trash2, danger: true, onClick: () => del(r) },
      ],
    });
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn sm primary" onClick={() => addTask(false)}><Plus size={14} />Task</button>
        <button className="btn sm" onClick={() => addTask(true)} disabled={!sel}><CornerDownRight size={14} />Subtask</button>
        <div className="sep" />
        <button className="btn sm icon" title="Outdent (Shift+Tab)" disabled={!sel} onClick={() => actions.outdentTask(sel.id)}><IndentDecrease size={14} /></button>
        <button className="btn sm icon" title="Indent (Tab)" disabled={!sel} onClick={() => actions.indentTask(sel.id)}><IndentIncrease size={14} /></button>
        <button className="btn sm icon" title="Move up" disabled={!sel} onClick={() => actions.moveTask(sel.id, -1)}><ArrowUp size={14} /></button>
        <button className="btn sm icon" title="Move down" disabled={!sel} onClick={() => actions.moveTask(sel.id, 1)}><ArrowDown size={14} /></button>
        <button className="btn sm" title="Link selected task to the previous work task" disabled={!sel || sel.isSummary} onClick={linkToPrevious}><Link2 size={14} />Link</button>
        <button className="btn sm icon danger" title="Delete" disabled={!sel} onClick={() => del()}><Trash2 size={14} /></button>
        <div className="sep" />
        <button className="btn sm icon" title="Collapse all" onClick={() => setCollapsed(new Set(sched.rows.filter((r) => r.isSummary).map((r) => r.id)))}><ChevronsDownUp size={14} /></button>
        <button className="btn sm icon" title="Expand all" onClick={() => setCollapsed(new Set())}><ChevronsUpDown size={14} /></button>
        <div className="sep" />
        <label className="row small"><input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} />Critical path</label>
        <label className="row small"><input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />Baseline</label>
        <div className="grow" />
        <div className="g-legend">
          <span><i style={{ background: project.color }} />Task</span>
          <span><i style={{ background: 'var(--crit)' }} />Critical</span>
          <span><i style={{ background: '#1f2937', height: 5 }} />Summary</span>
          {showBaseline && <span><i style={{ background: '#cbd5e1', height: 4 }} />Baseline</span>}
        </div>
        <button className="btn sm" onClick={() => { timelineRef.current.scrollLeft = Math.max(0, todayX - 220); }}><CalendarDays size={14} />Today</button>
        <Segmented value={zoom} onChange={setZoom} options={[{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} />
      </div>

      <div className="gantt">
        {/* ---------- grid ---------- */}
        <div className="g-grid" style={{ width: gridW }}>
          <div className="g-grid-head">
            {COLS.map((c) => <div key={c.key} className="g-cell" style={{ width: c.w }}>{c.label}</div>)}
          </div>
          <div className="g-rows" ref={gridRef} onWheel={onGridWheel}>
            <div style={{ height: bodyH }}>
              {rows.map((r) => {
                const t = r.task;
                const late = !r.isSummary && t.status !== 'done' && r.finish < derived.today;
                return (
                  <div key={r.id} className={`g-row ${r.isSummary ? 'summary' : ''} ${multi && picked.has(r.id) ? 'picked' : selected === r.id ? 'sel' : ''}`}
                    onMouseDown={(e) => { if (e.button === 0) { if (e.shiftKey || e.metaKey || e.ctrlKey) e.preventDefault(); pickRow(r.id, e); } }} onDoubleClick={() => actions.openTask(r.id)} onContextMenu={(e) => rowMenu(e, r)}>
                    <div className="g-cell faint" style={{ width: COLS[0].w }}>{r.wbs}</div>
                    <div className="g-cell" style={{ width: COLS[1].w, paddingLeft: 6 + r.level * 16 }}>
                      {r.isSummary
                        ? <span className="twisty" onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{collapsed.has(r.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                        : <span className="twisty">{t.is_milestone ? <Diamond size={11} style={{ fill: project.color, color: project.color }} /> : <span style={{ width: 6, height: 6, borderRadius: 2, background: late ? 'var(--danger)' : t.status === 'done' ? 'var(--ok)' : '#cbd5e1' }} />}</span>}
                      <BlurInput className="cell-input" data-name-input={r.id} value={t.name} onCommit={(v) => v.trim() && actions.updateTask(r.id, { name: v.trim() })}
                        style={{ fontWeight: r.isSummary ? 650 : 400, textDecoration: t.status === 'done' && !r.isSummary ? 'line-through' : 'none', color: t.status === 'done' && !r.isSummary ? 'var(--text-3)' : undefined }} />
                    </div>
                    <div className="g-cell" style={{ width: COLS[2].w }}>
                      {r.isSummary || t.is_milestone ? <span className="muted small">{r.dur}d</span>
                        : <BlurInput className="cell-input" type="number" min="1" value={t.duration} onCommit={(v) => actions.updateTask(r.id, { duration: Math.max(1, v || 1) })} />}
                    </div>
                    <div className="g-cell small" style={{ width: COLS[3].w }}>
                      {r.isSummary ? fmtDate(r.start, { short: true }) : (
                        <BlurInput className="cell-input" type="date" value={t.start_date} onCommit={(v) => v && actions.updateTask(r.id, { start_date: v, ...(deps.some((d) => d.successor_id === r.id) ? { schedule_mode: 'manual' } : {}) })} style={{ fontSize: 11.5 }} />
                      )}
                    </div>
                    <div className="g-cell small" style={{ width: COLS[4].w, color: late ? 'var(--danger)' : undefined }}>{fmtDate(r.finish, { short: true })}</div>
                    <div className="g-cell small" style={{ width: COLS[5].w }}>
                      {r.isSummary ? `${r.progress}%` : <BlurInput className="cell-input" type="number" min="0" max="100" value={t.progress} onCommit={(v) => { const p = Math.max(0, Math.min(100, v || 0)); actions.updateTask(r.id, { progress: p, ...(p === 100 ? { status: 'done' } : p > 0 && t.status === 'todo' ? { status: 'in_progress' } : {}) }); }} />}
                    </div>
                    <div className="g-cell small muted" style={{ width: COLS[6].w }} title={predLabel(r.id, deps, sched)}>{predLabel(r.id, deps, sched)}</div>
                    <div className="g-cell small muted" style={{ width: COLS[7].w }} title={(resNames.get(r.id) || []).join(', ')}>{(resNames.get(r.id) || []).join(', ')}</div>
                  </div>
                );
              })}
              <div className="quick-add" style={{ height: ROW }}>
                <Plus size={14} />
                <input placeholder="Add a task…" onKeyDown={async (e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    const v = e.currentTarget.value.trim();
                    e.currentTarget.value = '';
                    const t = await actions.createTask({ project_id: project.id, name: v, duration: 3 });
                    setSelected(t.id);
                  }
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* ---------- timeline ---------- */}
        <div className="g-timeline" ref={timelineRef} onScroll={onScroll}>
          <div className="g-time-head" style={{ width }}>
            <svg width={width} height={52}>
              {header.top.map((h, i) => (
                <g key={i}>
                  <line x1={h.x} x2={h.x} y1={0} y2={26} stroke="#e5e7eb" />
                  <text x={h.x + 6} y={17} fontSize="11.5" fontWeight="650" fill="#374151">{h.label}</text>
                </g>
              ))}
              <line x1={0} x2={width} y1={26} y2={26} stroke="#e5e7eb" />
              {header.bottom.map((h, i) => (
                <g key={i}>
                  {h.off && <rect x={h.x} y={26} width={h.w} height={26} fill="#f1f3f7" />}
                  <line x1={h.x} x2={h.x} y1={26} y2={52} stroke="#eceef2" />
                  <text x={h.x + h.w / 2} y={43} textAnchor="middle" fontSize="10.5" fill={h.off ? '#9ca3af' : '#6b7280'}>{zoom === 'day' ? h.label.slice(1) : h.label}</text>
                </g>
              ))}
            </svg>
          </div>
          <div style={{ position: 'relative', width, height: bodyH }} onMouseDown={(e) => { if (e.target === e.currentTarget || e.target.tagName === 'svg') { setSelected(null); picked.clear(); } }}>
            <svg width={width} height={bodyH} style={{ position: 'absolute', left: 0, top: 0 }}>
              {nonWorking.map((d) => <rect key={d} x={xOf(d)} y={0} width={ppd} height={bodyH} fill="#f6f7fa" />)}
              {zoom !== 'day' && header.bottom.map((h, i) => <line key={i} x1={h.x} x2={h.x} y1={0} y2={bodyH} stroke="#f1f2f5" />)}
              {rows.map((r, i) => (selected === r.id || (multi && picked.has(r.id))) && <rect key={r.id} x={0} y={i * ROW} width={width} height={ROW} fill="#eef2ff" />)}
              {project.target_date && (
                <g>
                  <line x1={xOf(project.target_date) + ppd} x2={xOf(project.target_date) + ppd} y1={0} y2={bodyH} stroke="#7c3aed" strokeDasharray="4 4" />
                  <text x={xOf(project.target_date) + ppd + 4} y={12} fontSize="10" fill="#7c3aed" fontWeight="600">Target</text>
                </g>
              )}
              {derived.today >= range.from && derived.today <= range.to && (
                <g>
                  <line x1={todayX + ppd / 2} x2={todayX + ppd / 2} y1={0} y2={bodyH} stroke="#ef4444" strokeWidth="1.5" />
                  <text x={todayX + ppd / 2 + 4} y={24} fontSize="10" fill="#ef4444" fontWeight="600">Today</text>
                </g>
              )}
              <defs>
                <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker>
                <marker id="arrc" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#e11d48" /></marker>
              </defs>
              {arrows.map((a) => (
                <path key={a.id} d={a.path} fill="none" stroke={a.crit ? '#e11d48' : '#94a3b8'} strokeWidth="1.3" markerEnd={`url(#${a.crit ? 'arrc' : 'arr'})`} />
              ))}
              {link && (() => {
                const fi = rowIndex.get(link.fromId);
                const g = geo(sched.byId.get(link.fromId));
                return <line x1={g.x2} y1={fi * ROW + ROW / 2} x2={link.x} y2={link.y} stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="4 3" />;
              })()}
            </svg>

            {rows.map((r, i) => {
              const t = r.task;
              const { x1, x2, start, finish } = geo(r);
              const top = i * ROW;
              const crit = showCritical && r.critical && !r.isSummary;
              const color = crit ? 'var(--crit)' : project.color;
              const baseline = showBaseline && t.baseline_start && (
                <div style={{
                  position: 'absolute', left: xOf(t.baseline_start), width: Math.max(4, xOf(t.baseline_finish) + ppd - xOf(t.baseline_start)),
                  top: top + 26, height: 4, background: '#cbd5e1', borderRadius: 2,
                }} title={`Baseline: ${fmtDate(t.baseline_start)} → ${fmtDate(t.baseline_finish)}`} />
              );
              const names = (resNames.get(r.id) || []).join(', ');
              if (r.isSummary) {
                return (
                  <React.Fragment key={r.id}>
                    {baseline}
                    <div data-task-id={r.id} title={`${t.name}\n${fmtDate(start)} → ${fmtDate(finish)} · ${r.progress}%`}
                      style={{ position: 'absolute', left: x1, width: Math.max(2, x2 - x1), top: top + 11, height: 8 }}
                      onDoubleClick={() => actions.openTask(r.id)} onMouseDown={() => setSelected(r.id)}>
                      <div style={{ position: 'absolute', inset: 0, background: '#1f2937', borderRadius: 2 }} />
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${r.progress}%`, background: '#64748b', borderRadius: 2 }} />
                      <div style={{ position: 'absolute', left: 0, top: 6, borderLeft: '5px solid #1f2937', borderBottom: '6px solid transparent' }} />
                      <div style={{ position: 'absolute', right: 0, top: 6, borderRight: '5px solid #1f2937', borderBottom: '6px solid transparent' }} />
                    </div>
                  </React.Fragment>
                );
              }
              if (t.is_milestone) {
                return (
                  <React.Fragment key={r.id}>
                    {baseline}
                    <div data-task-id={r.id} className="g-bar" style={{ left: x1 - 8, top: top + 9, width: 16, height: 16, background: 'transparent' }}
                      onMouseDown={(e) => startDrag(e, r, 'move')} onDoubleClick={() => actions.openTask(r.id)} title={`${t.name}\n${fmtDate(start)}`}>
                      <div style={{ width: 12, height: 12, margin: 2, transform: 'rotate(45deg)', background: crit ? 'var(--crit)' : '#1f2937', borderRadius: 2 }} />
                      <span className="lbl" style={{ left: 22 }}>{t.name} · {fmtDate(start, { short: true })}</span>
                    </div>
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={r.id}>
                  {baseline}
                  <div data-task-id={r.id} className="g-bar" onMouseDown={(e) => startDrag(e, r, 'move')} onDoubleClick={() => actions.openTask(r.id)}
                    title={`${t.name}\n${fmtDate(start)} → ${fmtDate(finish)} (${drag?.id === r.id ? drag.dur : r.dur}d)\n${t.progress}% complete${r.slack > 0 ? ` · ${r.slack}d slack` : ''}`}
                    style={{ left: x1, width: Math.max(4, x2 - x1), top: top + 9, background: color, opacity: t.status === 'done' ? 0.55 : 1, outline: r.cyclic ? '2px solid orange' : 'none' }}>
                    <div className="fill" style={{ width: `${t.progress}%` }} />
                    <span className="lbl">{names}</span>
                    <div className="handle" onMouseDown={(e) => startDrag(e, r, 'resize')} />
                    <div className="link-dot" style={{ borderColor: color }} onMouseDown={(e) => startLink(e, r)} title="Drag to another task to link" />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
      <div className="row small muted" style={{ padding: '6px 20px', borderTop: '1px solid var(--border)', background: '#fff' }}>
        <Flag size={12} />
        <span>{sched.rows.filter((r) => !r.isSummary).length} tasks · {sched.criticalCount} on critical path · {fmtDate(sched.start)} → {fmtDate(sched.finish)} ({sched.start ? cal.workdays(sched.start, sched.finish) : 0} working days)</span>
        <div className="grow" />
        <span className="faint">⌘/Shift-click rows to multi-select · Drag bars to reschedule · drag the right edge to change duration · drag the dot to link · Tab/Shift+Tab to indent · Enter for details</span>
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {multi && (
        <BulkBar count={picked.size} noun="task" onClear={() => picked.clear()} onEdit={() => setBulkEdit(true)} onDelete={deletePicked}>
          <button className="bulk-btn" title="Shift selected tasks one working day earlier" onClick={() => actions.bulkUpdateTasks(picked.ids, {}, { shiftDays: -1 })}>−1d</button>
          <button className="bulk-btn" title="Shift selected tasks one working day later" onClick={() => actions.bulkUpdateTasks(picked.ids, {}, { shiftDays: 1 })}>+1d</button>
        </BulkBar>
      )}
      {bulkEdit && <BulkEditTasksModal ids={picked.ids} onClose={() => setBulkEdit(false)} />}
    </>
  );
}

