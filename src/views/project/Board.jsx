import React, { useState } from 'react';
import { Plus, Calendar, Diamond } from 'lucide-react';
import { useStore } from '../../lib/store.jsx';
import { AvatarStack, Progress } from '../../components/ui.jsx';
import { TASK_STATUSES, priorityOf, fmtDate } from '../../lib/format.js';

export default function Board({ project }) {
  const { data, derived, actions } = useStore();
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const sched = derived.schedules.get(project.id);
  const leaves = sched.rows.filter((r) => !r.isSummary);
  const parentName = (r) => (r.parentId ? sched.byId.get(r.parentId)?.task.name : '');

  const drop = async (status) => {
    setOver(null);
    if (!dragId) return;
    const t = data.tasks.find((x) => x.id === dragId);
    setDragId(null);
    if (t && t.status !== status) {
      const patch = { status };
      if (status === 'done') patch.progress = 100;
      else if (t.status === 'done') patch.progress = Math.min(t.progress, 90);
      if (status === 'in_progress' && t.progress === 0) patch.progress = 5;
      await actions.updateTask(t.id, patch);
    }
  };

  return (
    <div className="board">
      {TASK_STATUSES.map((s) => {
        const items = leaves.filter((r) => r.task.status === s.id);
        return (
          <div key={s.id} className={`b-col ${over === s.id ? 'drop' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s.id)}>
            <div className="b-col-h">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
              {s.label}<span className="count">{items.length}</span>
              <div className="grow" />
              <button className="btn ghost sm icon" title="Add task" onClick={async () => {
                const t = await actions.createTask({ project_id: project.id, name: 'New task', status: s.id, duration: 3 });
                actions.openTask(t.id);
              }}><Plus size={14} /></button>
            </div>
            <div className="b-list">
              {items.map((r) => {
                const t = r.task;
                const people = (derived.asgByTask.get(t.id) || []).map((a) => derived.resById.get(a.resource_id)).filter(Boolean);
                const late = t.status !== 'done' && r.finish < derived.today;
                const pr = priorityOf(t.priority);
                return (
                  <div key={t.id} className={`b-card ${dragId === t.id ? 'dragging' : ''}`} draggable
                    onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onClick={() => actions.openTask(t.id)}>
                    <div className="row tiny faint mb8">
                      <span>{r.wbs}</span>
                      <span className="ellipsis grow">{parentName(r)}</span>
                      {r.critical && <span className="tag" style={{ background: '#ffe4e6', color: '#e11d48' }}>critical</span>}
                    </div>
                    <div className="t">{t.is_milestone ? <Diamond size={12} style={{ marginRight: 4 }} /> : null}{t.name}</div>
                    {t.discipline && <div className="mt8"><span className="tag">{t.discipline}</span></div>}
                    {!t.is_milestone && t.progress > 0 && t.status !== 'done' && <div className="mt8"><Progress value={t.progress} color={s.color} /></div>}
                    <div className="meta">
                      <span title={pr.label} style={{ width: 8, height: 8, borderRadius: 2, background: pr.color }} />
                      <Calendar size={12} />
                      <span style={{ color: late ? 'var(--danger)' : undefined, fontWeight: late ? 650 : 400 }}>{fmtDate(r.finish, { short: true })}</span>
                      <div className="grow" />
                      <AvatarStack resources={people} max={3} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
