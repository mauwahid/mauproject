import React, { useState } from 'react';
import { LayoutGrid, Table2, MoreHorizontal, Pencil, Copy, Archive, Trash2, FolderKanban, ArchiveRestore } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, NewButton, navigate } from '../components/layout.jsx';
import { HealthPill, ProjectStatusPill, PriorityPill, Progress, AvatarStack, Empty, ContextMenu, Segmented, confirmDialog } from '../components/ui.jsx';
import { PROJECT_STATUSES, fmtDate, fmtMoney } from '../lib/format.js';

export default function Projects({ openModal }) {
  const { data, derived, actions } = useStore();
  const [mode, setMode] = useState('grid');
  const [filter, setFilter] = useState('open');
  const [menu, setMenu] = useState(null);

  const list = data.projects.filter((p) => {
    if (filter === 'archived') return p.archived;
    if (p.archived) return false;
    if (filter === 'open') return !['completed', 'cancelled'].includes(p.status);
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const teamOf = (pid) => {
    const tids = new Set(data.tasks.filter((t) => t.project_id === pid).map((t) => t.id));
    const rids = new Set(data.assignments.filter((a) => tids.has(a.task_id)).map((a) => a.resource_id));
    return data.resources.filter((r) => rids.has(r.id));
  };

  const openMenu = (e, p) => {
    e.stopPropagation();
    setMenu({
      x: e.clientX, y: e.clientY, items: [
        { label: 'Edit project', icon: Pencil, onClick: () => openModal({ type: 'project', project: p }) },
        { label: 'Duplicate', icon: Copy, onClick: async () => { await actions.duplicateProject(p.id); actions.toast('Project duplicated', 'success'); } },
        p.archived
          ? { label: 'Restore', icon: ArchiveRestore, onClick: () => actions.updateProject(p.id, { archived: 0 }) }
          : { label: 'Archive', icon: Archive, onClick: () => actions.updateProject(p.id, { archived: 1 }) },
        '-',
        {
          label: 'Delete project', icon: Trash2, danger: true, onClick: async () => {
            const ok = await confirmDialog({ title: `Delete ${p.name}?`, danger: true, confirmLabel: 'Delete project', message: 'All tasks, dependencies and assignments in this project will be permanently deleted.' });
            if (ok) { await actions.deleteProject(p.id); actions.toast('Project deleted'); }
          },
        },
      ],
    });
  };

  return (
    <>
      <TopBar title="Projects" crumbs={`${data.projects.length} projects in workspace`}>
        <NewButton label="New Project" onClick={() => openModal({ type: 'project' })} />
      </TopBar>
      <div className="content">
        <div className="row mb16">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'open', label: 'Open' }, ...PROJECT_STATUSES.map((s) => ({ value: s.id, label: s.label })),
            { value: 'all', label: 'All' }, { value: 'archived', label: 'Archived' },
          ]} />
          <div className="grow" />
          <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', icon: LayoutGrid, label: 'Cards' }, { value: 'table', icon: Table2, label: 'Table' }]} />
        </div>

        {!list.length && <Empty icon={FolderKanban} title="No projects here" action={<button className="btn primary" onClick={() => openModal({ type: 'project' })}>New Project</button>}>Create a project to start building its WBS and schedule.</Empty>}

        {mode === 'grid' ? (
          <div className="proj-grid">
            {list.map((p) => {
              const s = derived.projectStats.get(p.id);
              return (
                <div key={p.id} className="card proj-card" onClick={() => navigate(`project/${p.id}/gantt`)}>
                  <div className="stripe" style={{ background: p.color }} />
                  <div className="row">
                    <span className="code">{p.code || 'PROJECT'}</span>
                    <div className="grow" />
                    <HealthPill health={s.health} />
                    <button className="btn ghost sm icon" onClick={(e) => openMenu(e, p)}><MoreHorizontal size={15} /></button>
                  </div>
                  <h3>{p.name}</h3>
                  <div className="desc">{p.description || <span className="faint">No description</span>}</div>
                  <div className="row mt16"><Progress value={s.progress} color={p.color} width="100%" /><b className="small">{s.progress}%</b></div>
                  <div className="stat-row">
                    <div className="s"><b>{fmtDate(s.start, { short: true })} – {fmtDate(s.finish, { short: true })}</b>Schedule</div>
                    <div className="s"><b>{s.done}/{s.leaves}</b>Tasks done</div>
                    <div className="s"><b>{fmtMoney(s.cost, data.settings.currency)}</b>Planned cost</div>
                  </div>
                  <div className="row mt16">
                    <ProjectStatusPill status={p.status} />
                    <PriorityPill priority={p.priority} />
                    <div className="grow" />
                    <AvatarStack resources={teamOf(p.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : list.length > 0 && (
          <div className="card">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Project</th><th>Manager</th><th>Status</th><th>Health</th><th>Progress</th><th>Start</th><th>Finish</th><th>Target</th><th className="num">Budget</th><th className="num">Planned cost</th><th /></tr></thead>
              <tbody>
                {list.map((p) => {
                  const s = derived.projectStats.get(p.id);
                  return (
                    <tr key={p.id} className="click" onClick={() => navigate(`project/${p.id}/gantt`)}>
                      <td className="faint bold">{p.code}</td>
                      <td><div className="row"><span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} /><b>{p.name}</b></div></td>
                      <td>{p.manager}</td>
                      <td><ProjectStatusPill status={p.status} /></td>
                      <td><HealthPill health={s.health} /></td>
                      <td><div className="row"><Progress value={s.progress} color={p.color} width={70} /><span className="small">{s.progress}%</span></div></td>
                      <td>{fmtDate(s.start)}</td>
                      <td>{fmtDate(s.finish)}</td>
                      <td>{fmtDate(p.target_date)}</td>
                      <td className="num">{fmtMoney(p.budget, data.settings.currency)}</td>
                      <td className="num" style={{ color: s.cost > p.budget && p.budget ? 'var(--danger)' : undefined }}>{fmtMoney(s.cost, data.settings.currency)}</td>
                      <td><button className="btn ghost sm icon" onClick={(e) => openMenu(e, p)}><MoreHorizontal size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}
