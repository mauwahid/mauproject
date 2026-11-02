import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, FolderKanban, ListChecks, Users, BarChart3, Gauge, FileText, Settings as SettingsIcon,
  ChevronRight, ChevronDown, Plus,
} from 'lucide-react';
import { useStore } from './lib/store.jsx';
import { BrandMark, Avatar, ConfirmHost } from './components/ui.jsx';
import TaskDrawer from './components/TaskDrawer.jsx';
import ProjectModal from './components/ProjectModal.jsx';
import NewTaskModal from './components/NewTaskModal.jsx';
import Dashboard from './views/Dashboard.jsx';
import Projects from './views/Projects.jsx';
import SpaceView, { SpaceModal } from './views/SpaceView.jsx';
import ProjectWorkspace from './views/ProjectWorkspace.jsx';
import Tasks from './views/Tasks.jsx';
import Workload from './views/Workload.jsx';
import Capacity from './views/Capacity.jsx';
import Team from './views/Team.jsx';
import Reports from './views/Reports.jsx';
import Settings from './views/Settings.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ExcelExportModal from './components/ExcelExportModal.jsx';
import { useRoute, navigate } from './components/layout.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
];
const NAV_RES = [
  { id: 'workload', label: 'Workload', icon: BarChart3 },
  { id: 'capacity', label: 'Capacity Planning', icon: Gauge },
  { id: 'team', label: 'Team', icon: Users },
];
const NAV_MORE = [
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Sidebar({ route, openModal }) {
  const { data } = useStore();
  const active = route[0];
  const [folded, setFolded] = useState(() => new Set());
  const projects = data.projects.filter((p) => !p.archived && p.status !== 'cancelled');
  const loose = projects.filter((p) => !p.space_id || !data.spaces.some((sp) => sp.id === p.space_id));
  const item = (n) => (
    <div key={n.id} className={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}>
      <n.icon size={16} /><span className="label">{n.label}</span>
    </div>
  );
  const projItem = (p) => (
    <div key={p.id} className={`nav-item ${active === 'project' && Number(route[1]) === p.id ? 'active' : ''}`}
      onClick={() => navigate(`project/${p.id}/dashboard`)}>
      <span className="dot" style={{ background: p.color }} />
      <span className="label">{p.name}</span>
    </div>
  );
  const toggle = (id) => setFolded((f) => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <aside className="sidebar">
      <div className="side-drag" />
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">MauProject</div>
          <div className="brand-sub">Engineering Resource Planning</div>
        </div>
      </div>
      <div className="nav-scroll">
        {NAV.map(item)}
        <div className="nav-section">Resources</div>
        {NAV_RES.map(item)}
        <div className="nav-section">Spaces<span className="add" title="New space" onClick={() => openModal({ type: 'space' })}><Plus size={13} /></span></div>
        {data.spaces.map((sp) => {
          const list = projects.filter((p) => p.space_id === sp.id);
          const open = !folded.has(sp.id);
          return (
            <div key={sp.id}>
              <div className={`nav-space ${active === 'space' && Number(route[1]) === sp.id ? 'active' : ''}`} onClick={() => navigate(`space/${sp.id}/dashboard`)}>
                <span className="tw" onClick={(e) => { e.stopPropagation(); toggle(sp.id); }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                <span className="sq" style={{ background: sp.color }}>{sp.name.trim()[0]?.toUpperCase()}</span>
                <span className="label ellipsis grow">{sp.name}</span>
                <span className="faint tiny">{list.length}</span>
              </div>
              {open && <div className="nav-sub">{list.map(projItem)}</div>}
            </div>
          );
        })}
        {!data.spaces.length && <div className="nav-item" onClick={() => openModal({ type: 'space' })}><Plus size={14} /><span className="label">Create a space</span></div>}
        {loose.length > 0 && <>
          <div className="nav-section">{data.spaces.length ? 'No space' : 'Projects'}</div>
          {loose.map(projItem)}
        </>}
        <div className="nav-section">Insights</div>
        {NAV_MORE.map(item)}
      </div>
      <div className="side-footer">
        <Avatar resource={{ name: data.settings.userName || 'Engineering Manager', color: '#4f46e5' }} />
        <div className="grow">
          <div className="who ellipsis">{data.settings.userName || 'Engineering Manager'}</div>
          <div className="role">MauProject Workspace</div>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const { data, derived, toasts, openTaskId, actions, error } = useStore();
  const route = useRoute();
  const [modal, setModal] = useState(null);
  const [palette, setPalette] = useState(false);

  const onMenuAction = useCallback(async (a) => {
    if (a === 'new-project') setModal({ type: 'project' });
    if (a === 'new-task') setModal({ type: 'task', projectId: route[0] === 'project' ? Number(route[1]) : null });
    if (a === 'export-xlsx') setModal({ type: 'xlsx', projectIds: route[0] === 'project' ? [Number(route[1])] : undefined });
    if (a === 'backup') {
      const p = await window.mauproject.db.backup();
      if (p) actions.toast('Database backed up', 'success');
    }
  }, [route, actions]);

  useEffect(() => {
    const offN = window.mauproject.on('menu:navigate', (r) => navigate(r));
    const offA = window.mauproject.on('menu:action', onMenuAction);
    return () => { offN(); offA(); };
  }, [onMenuAction]);

  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (error) return <div className="loading"><div><h2>MauProject could not open its database</h2><p className="muted">{error}</p></div></div>;
  if (!data || !derived) return <div className="loading"><div className="row"><BrandMark /> <b>Loading MauProject…</b></div></div>;

  const ctx = { route, openModal: setModal };
  let view;
  switch (route[0]) {
    case 'projects': view = <Projects {...ctx} />; break;
    case 'space': view = <SpaceView key={route[1]} {...ctx} spaceId={Number(route[1])} tab={route[2] || 'dashboard'} />; break;
    case 'project': view = <ProjectWorkspace key={route[1]} {...ctx} projectId={Number(route[1])} tab={route[2] || 'dashboard'} />; break;
    case 'tasks': view = <Tasks {...ctx} />; break;
    case 'workload': view = <Workload {...ctx} />; break;
    case 'capacity': view = <Capacity {...ctx} />; break;
    case 'team': view = <Team {...ctx} />; break;
    case 'reports': view = <Reports {...ctx} />; break;
    case 'settings': view = <Settings {...ctx} />; break;
    default: view = <Dashboard {...ctx} />;
  }

  return (
    <div className="shell">
      <Sidebar route={route} openModal={setModal} />
      <main className="main">
        {view}
      </main>
      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => actions.openTask(null)} />}
      {modal?.type === 'project' && <ProjectModal project={modal.project} spaceId={modal.spaceId || (route[0] === 'space' ? Number(route[1]) : undefined)} onClose={() => setModal(null)} />}
      {modal?.type === 'space' && <SpaceModal space={modal.space} onClose={() => setModal(null)} />}
      {modal?.type === 'task' && <NewTaskModal projectId={modal.projectId} parentId={modal.parentId} onClose={() => setModal(null)} />}
      {modal?.type === 'xlsx' && <ExcelExportModal projectIds={modal.projectIds} onClose={() => setModal(null)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} openModal={setModal} />}
      <ConfirmHost />
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </div>
  );
}

