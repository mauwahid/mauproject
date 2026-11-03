import React, { useMemo, useState, useEffect } from 'react';
import { Search, FolderKanban, CheckSquare, User, Plus, ArrowRight } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { navigate } from './layout.jsx';

export default function CommandPalette({ onClose, openModal }) {
  const { data, actions } = useStore();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmds = [
      { icon: Plus, label: 'New space', run: () => openModal({ type: 'space' }) },
      { icon: Plus, label: 'New project', run: () => openModal({ type: 'project' }) },
      { icon: Plus, label: 'New task', run: () => openModal({ type: 'task' }) },
      { icon: ArrowRight, label: 'Upload WBS & Workload (Excel)', run: () => openModal({ type: 'import' }) },
      { icon: ArrowRight, label: 'Export WBS & Workload (Excel)', run: () => openModal({ type: 'xlsx' }) },
      ...['Dashboard', 'Projects', 'Tasks', 'Workload', 'Capacity', 'Team', 'Reports', 'Settings']
        .map((v) => ({ icon: ArrowRight, label: `Go to ${v}`, run: () => navigate(v.toLowerCase()) })),
    ];
    const spaces = data.spaces.map((sp) => ({ icon: FolderKanban, label: sp.name, hint: 'Space', run: () => navigate(`space/${sp.id}/dashboard`) }));
    const projects = data.projects.map((p) => ({ icon: FolderKanban, label: p.name, hint: p.code, run: () => navigate(`project/${p.id}/gantt`) }));
    const people = data.resources.map((r) => ({ icon: User, label: r.name, hint: r.role, run: () => navigate(`workload`) }));
    const tasks = data.tasks.map((t) => ({ icon: CheckSquare, label: t.name, hint: data.projects.find((p) => p.id === t.project_id)?.code, run: () => actions.openTask(t.id) }));
    const all = [...cmds, ...spaces, ...projects, ...people, ...tasks];
    return (s ? all.filter((x) => `${x.label} ${x.hint || ''}`.toLowerCase().includes(s)) : all).slice(0, 40);
  }, [q, data, actions, openModal]);

  useEffect(() => setI(0), [q]);

  const run = (it) => { onClose(); it && it.run(); };

  return (
    <div className="overlay" style={{ placeItems: 'start center', paddingTop: '12vh' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 620 }}>
        <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} className="faint" />
          <input autoFocus className="grow" style={{ border: 'none', outline: 'none', fontSize: 15, height: 30 }}
            placeholder="Search projects, tasks, people, or commands…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter') run(items[i]);
              if (e.key === 'Escape') onClose();
            }} />
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto', padding: 6 }}>
          {items.map((it, k) => (
            <div key={k} className="menu-item" style={{ background: k === i ? 'var(--brand-50)' : undefined }} onMouseEnter={() => setI(k)} onClick={() => run(it)}>
              <it.icon size={14} className="faint" />
              <span className="grow ellipsis">{it.label}</span>
              {it.hint && <span className="faint tiny">{it.hint}</span>}
            </div>
          ))}
          {!items.length && <div className="faint" style={{ padding: 16 }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}
