import React, { useState } from 'react';
import { LayoutDashboard, FolderKanban, Settings2, Plus, Trash2, Layers } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar, navigate } from '../components/layout.jsx';
import { Empty, Modal, Field, confirmDialog } from '../components/ui.jsx';
import DashboardBoard from '../components/DashboardBoard.jsx';
import { ProjectsBody } from './Projects.jsx';
import { PALETTE } from '../lib/format.js';

export function SpaceIcon({ space, size = 34 }) {
  return <div className="space-ico" style={{ background: space.color, width: size, height: size, fontSize: size * 0.42 }}>{(space.name || '?').trim()[0].toUpperCase()}</div>;
}

export default function SpaceView({ spaceId, tab, openModal }) {
  const { data } = useStore();
  const [edit, setEdit] = useState(false);
  const space = data.spaces.find((s) => s.id === spaceId);
  if (!space) {
    return <><TopBar title="Space not found" /><div className="content"><Empty icon={Layers} title="This space no longer exists" action={<button className="btn" onClick={() => navigate('projects')}>Back to projects</button>} /></div></>;
  }
  const projects = data.projects.filter((p) => p.space_id === space.id && !p.archived);
  const active = tab === 'projects' ? 'projects' : 'dashboard';
  return (
    <>
      <TopBar title={space.name} crumbs={`Space · ${projects.length} project${projects.length === 1 ? '' : 's'}`} icon={<SpaceIcon space={space} />}>
        <button className="btn sm icon" title="Space settings" onClick={() => setEdit(true)}><Settings2 size={15} /></button>
        <button className="btn primary sm" onClick={() => openModal({ type: 'project', spaceId: space.id })}><Plus size={14} />Project</button>
      </TopBar>
      <div className="tabs">
        <div className={`tab ${active === 'dashboard' ? 'active' : ''}`} onClick={() => navigate(`space/${space.id}/dashboard`)}><LayoutDashboard size={14} />Dashboard</div>
        <div className={`tab ${active === 'projects' ? 'active' : ''}`} onClick={() => navigate(`space/${space.id}/projects`)}><FolderKanban size={14} />Projects</div>
      </div>
      <div className="content">
        {space.description && <p className="muted" style={{ marginTop: 0 }}>{space.description}</p>}
        {active === 'dashboard'
          ? <DashboardBoard key={`s${space.id}`} scopeType="space" scopeId={space.id} projectIds={projects.map((p) => p.id)} />
          : <ProjectsBody openModal={openModal} spaceId={space.id} />}
      </div>
      {edit && <SpaceModal space={space} onClose={() => setEdit(false)} />}
    </>
  );
}

export function SpaceModal({ space, onClose }) {
  const { data, actions } = useStore();
  const [f, setF] = useState(() => space ? { ...space } : { name: '', description: '', color: PALETTE[data.spaces.length % PALETTE.length] });
  const save = async () => {
    if (!f.name.trim()) return actions.toast('Space name is required', 'warn');
    const payload = { name: f.name.trim(), description: f.description, color: f.color };
    if (space) await actions.updateSpace(space.id, payload);
    else { const s = await actions.createSpace(payload); navigate(`space/${s.id}/dashboard`); }
    actions.toast(space ? 'Space updated' : 'Space created', 'success');
    onClose();
  };
  const del = async () => {
    const n = data.projects.filter((p) => p.space_id === space.id).length;
    const ok = await confirmDialog({
      title: `Delete space “${space.name}”?`, danger: true, confirmLabel: 'Delete space',
      message: `The space and its dashboard will be deleted. ${n ? `Its ${n} project${n > 1 ? 's are' : ' is'} kept and moved to “No space”.` : ''}`,
    });
    if (!ok) return;
    await actions.deleteSpace(space.id);
    onClose();
    navigate('projects');
  };
  return (
    <Modal title={space ? 'Space Settings' : 'New Space'} onClose={onClose} footer={<>
      {space && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={del}><Trash2 size={14} />Delete</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>{space ? 'Save' : 'Create Space'}</button>
    </>}>
      <div className="col" style={{ gap: 12 }}>
        <Field label="Space name"><input className="input" autoFocus value={f.name} placeholder="e.g. Digital Banking, Mobile Squad" onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
        <Field label="Description"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Color">
          <div className="row">
            {PALETTE.map((c) => <span key={c} onClick={() => setF({ ...f, color: c })} style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', outline: f.color === c ? '2px solid #111827' : 'none', outlineOffset: 2 }} />)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
