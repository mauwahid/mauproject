import React, { useState } from 'react';
import { LayoutGrid, Table2, MoreHorizontal, Pencil, Copy, Archive, Trash2, FolderKanban, ArchiveRestore, Layers, Upload } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, NewButton, navigate } from '../components/layout.jsx';
import { HealthPill, ProjectStatusPill, PriorityPill, Progress, AvatarStack, Empty, ContextMenu, Segmented, confirmDialog } from '../components/ui.jsx';
import { useSelection, SelectAll, RowCheck, BulkBar, BulkEditProjectsModal, confirmDeleteProjects } from '../components/bulk.jsx';
import { PROJECT_STATUSES, fmtDate, fmtMoney } from '../lib/format.js';

export default function Projects({ openModal }) {
  const { data } = useStore();
  return (
    <>
      <TopBar title="Projects" crumbs={`${data.projects.length} projects in ${data.spaces.length} space${data.spaces.length === 1 ? '' : 's'}`}>
        <button className="btn sm" onClick={() => openModal({ type: 'import' })}><Upload size={14} />Upload Excel</button>
        <NewButton label="New Project" onClick={() => openModal({ type: 'project' })} />
      </TopBar>
      <div className="content">
        <ProjectsBody openModal={openModal} />
      </div>
    </>
  );
}

/** Project list (cards/table). With spaceId, limited to that space. */
export function ProjectsBody({ openModal, spaceId }) {
  const { data, derived, actions } = useStore();
  const [mode, setMode] = useState('grid');
  const [filter, setFilter] = useState('open');
  const [spaceFilter, setSpaceFilter] = useState('');
  const [menu, setMenu] = useState(null);
  const spaceById = new Map(data.spaces.map((x) => [x.id, x]));

  const list = data.projects.filter((p) => {
    if (spaceId && p.space_id !== spaceId) return false;
    if (!spaceId && spaceFilter === 'none' && p.space_id) return false;
    if (!spaceId && spaceFilter && spaceFilter !== 'none' && p.space_id !== Number(spaceFilter)) return false;
    if (filter === 'archived') return p.archived;
    if (p.archived) return false;
    if (filter === 'open') return !['completed', 'cancelled'].includes(p.status);
    if (filter === 'all') return true;
    return p.status === filter;
  });
  const selection = useSelection(list.map((p) => p.id));
  const [bulkEdit, setBulkEdit] = useState(false);
  const cardClick = (p, e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || selection.size) { e.preventDefault(); selection.toggle(p.id, e); return; }
    navigate(`project/${p.id}/dashboard`);
  };

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
        ...data.spaces.filter((sp) => sp.id !== p.space_id).map((sp) => ({ label: `Move to ${sp.name}`, icon: Layers, onClick: () => actions.updateProject(p.id, { space_id: sp.id }) })),
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
      <div>
        <div className="row mb16 wrap">
          {!spaceId && (
            <select className="input sm" style={{ width: 190 }} value={spaceFilter} onChange={(e) => setSpaceFilter(e.target.value)}>
              <option value="">All spaces</option>
              {data.spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              <option value="none">No space</option>
            </select>
          )}
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'open', label: 'Open' }, ...PROJECT_STATUSES.map((s) => ({ value: s.id, label: s.label })),
            { value: 'all', label: 'All' }, { value: 'archived', label: 'Archived' },
          ]} />
          <div className="grow" />
          {list.length > 0 && <label className="row small muted" style={{ cursor: 'pointer' }}><SelectAll ids={list.map((p) => p.id)} selection={selection} />Select all</label>}
          <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', icon: LayoutGrid, label: 'Cards' }, { value: 'table', icon: Table2, label: 'Table' }]} />
        </div>

        {!list.length && <Empty icon={FolderKanban} title="No projects here" action={<button className="btn primary" onClick={() => openModal({ type: 'project', spaceId })}>New Project</button>}>Create a project to start building its WBS and schedule.</Empty>}

        {mode === 'grid' ? (
          <div className="proj-grid">
            {list.map((p) => {
              const s = derived.projectStats.get(p.id);
              return (
                <div key={p.id} className={`card proj-card ${selection.has(p.id) ? 'picked' : ''}`} onClick={(e) => cardClick(p, e)}>
                  <div className="stripe" style={{ background: p.color }} />
                  <div className="row">
                    <RowCheck id={p.id} selection={selection} />
                    <span className="code">{p.code || 'PROJECT'}</span>
                    {!spaceId && spaceById.get(p.space_id) && <span className="tag" style={{ background: spaceById.get(p.space_id).color + '1f', color: spaceById.get(p.space_id).color }}>{spaceById.get(p.space_id).name}</span>}
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
              <thead><tr><th style={{ width: 34, paddingRight: 0 }}><SelectAll ids={list.map((p) => p.id)} selection={selection} /></th><th>Code</th><th>Project</th>{!spaceId && <th>Space</th>}<th>Manager</th><th>Status</th><th>Health</th><th>Progress</th><th>Start</th><th>Finish</th><th>Target</th><th className="num">Budget</th><th className="num">Planned cost</th><th /></tr></thead>
              <tbody>
                {list.map((p) => {
                  const s = derived.projectStats.get(p.id);
                  return (
                    <tr key={p.id} className={`click ${selection.has(p.id) ? 'picked' : ''}`} onClick={(e) => cardClick(p, e)}>
                      <td style={{ paddingRight: 0 }}><RowCheck id={p.id} selection={selection} /></td>
                      <td className="faint bold">{p.code}</td>
                      <td><div className="row"><span style={{ width: 8, height: 8, borderRadius: 3, background: p.color }} /><b>{p.name}</b></div></td>
                      {!spaceId && <td className="small">{spaceById.get(p.space_id)?.name || <span className="faint">—</span>}</td>}
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
      <BulkBar count={selection.size} noun="project" onClear={selection.clear} onEdit={() => setBulkEdit(true)}
        onDelete={async () => { if (await confirmDeleteProjects(actions, data, selection.ids)) selection.clear(); }}>
        <select value="" title="Set status" onChange={async (e) => { if (e.target.value) { await actions.bulkUpdateProjects(selection.ids, { status: e.target.value }); actions.toast('Projects updated', 'success'); } }}>
          <option value="">Status…</option>{PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {data.spaces.length > 0 && (
          <select value="" title="Move to space" onChange={async (e) => { if (e.target.value) { await actions.bulkUpdateProjects(selection.ids, { space_id: e.target.value === 'none' ? null : Number(e.target.value) }); actions.toast('Projects moved', 'success'); } }}>
            <option value="">Move to space…</option>{data.spaces.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}<option value="none">No space</option>
          </select>
        )}
      </BulkBar>
      {bulkEdit && <BulkEditProjectsModal ids={selection.ids} onClose={() => setBulkEdit(false)} />}
    </>
  );
}
