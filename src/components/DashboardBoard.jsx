import React, { useMemo, useState } from 'react';
import { Plus, Settings2, X, GripVertical, RotateCcw, Check, LayoutGrid, Copy } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { Modal, Field, confirmDialog } from './ui.jsx';
import { WIDGETS, WIDTHS, buildScope, defaultDashboard, newWidget, widgetTitle } from '../lib/widgets.jsx';

class WidgetBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() { return this.state.err ? <div className="faint small">This widget could not render: {String(this.state.err.message)}</div> : this.props.children; }
}

/**
 * Customizable dashboard for a space or a project.
 * props: scopeType 'space'|'project', scopeId, projectIds
 */
export default function DashboardBoard({ scopeType, scopeId, projectIds }) {
  const { data, derived, actions } = useStore();
  const [editing, setEditing] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [config, setConfig] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const saved = actions.dashboardFor(scopeType, scopeId);
  const widgets = useMemo(() => (saved || defaultDashboard(scopeType)).filter((w) => WIDGETS[w.type]), [saved, scopeType]);
  const scope = useMemo(() => buildScope(data, derived, projectIds, scopeType), [data, derived, projectIds, scopeType]);
  const save = (list) => actions.saveDashboard(scopeType, scopeId, list);

  const update = (id, patch) => save(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const remove = (id) => save(widgets.filter((w) => w.id !== id));
  const add = (type, extra) => { save([...widgets, newWidget(type, extra)]); };
  const duplicate = (w) => { const i = widgets.findIndex((x) => x.id === w.id); const c = newWidget(w.type, { w: w.w, title: w.title, options: { ...w.options } }); save([...widgets.slice(0, i + 1), c, ...widgets.slice(i + 1)]); };
  const drop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const list = widgets.filter((w) => w.id !== dragId);
    const moving = widgets.find((w) => w.id === dragId);
    const i = targetId === '__end' ? list.length : list.findIndex((w) => w.id === targetId);
    list.splice(i, 0, moving);
    save(list);
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: 'Reset dashboard?', confirmLabel: 'Reset', message: 'Replace all widgets with the default layout for this ' + scopeType + '.' });
    if (ok) save(defaultDashboard(scopeType));
  };

  return (
    <div>
      <div className="row mb16">
        <LayoutGrid size={15} className="faint" />
        <span className="small muted">{widgets.length} widgets{saved ? '' : ' · default layout'}</span>
        <div className="grow" />
        {editing ? (
          <>
            <button className="btn sm" onClick={reset}><RotateCcw size={13} />Reset</button>
            <button className="btn sm" onClick={() => setGallery(true)}><Plus size={14} />Add widget</button>
            <button className="btn sm primary" onClick={() => setEditing(false)}><Check size={14} />Done</button>
          </>
        ) : (
          <>
            <button className="btn sm" onClick={() => setGallery(true)}><Plus size={14} />Add chart</button>
            <button className="btn sm" onClick={() => setEditing(true)}><Settings2 size={14} />Customize</button>
          </>
        )}
      </div>

      <div className={`dash-grid ${editing ? 'editing' : ''}`}>
        {widgets.map((w) => {
          const def = WIDGETS[w.type];
          const Render = def.render;
          return (
            <div key={w.id} className={`card dash-w ${def.compact ? 'compact' : ''} ${overId === w.id ? 'drop-before' : ''} ${dragId === w.id ? 'dragging' : ''}`}
              style={{ gridColumn: `span ${w.w || def.w}` }}
              draggable={editing}
              onDragStart={(e) => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { if (editing && dragId) { e.preventDefault(); setOverId(w.id); } }}
              onDragLeave={() => setOverId((o) => (o === w.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOverId(null); drop(w.id); }}>
              <div className="dash-h">
                {editing && <GripVertical size={14} className="faint" style={{ cursor: 'grab' }} />}
                {def.compact && <def.icon size={13} className="faint" />}
                <span className="dash-title ellipsis">{widgetTitle(w, scopeType)}</span>
                {editing && (
                  <div className="row" style={{ gap: 2 }}>
                    <select className="input sm" title="Width" style={{ width: 62, height: 24 }} value={w.w || def.w} onChange={(e) => update(w.id, { w: Number(e.target.value) })}>
                      {WIDTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="btn ghost sm icon" title="Settings" onClick={() => setConfig(w)}><Settings2 size={13} /></button>
                    <button className="btn ghost sm icon" title="Duplicate" onClick={() => duplicate(w)}><Copy size={13} /></button>
                    <button className="btn ghost sm icon danger" title="Remove" onClick={() => remove(w.id)}><X size={14} /></button>
                  </div>
                )}
              </div>
              <div className={`dash-b ${def.flush ? 'flush' : ''}`}>
                <WidgetBoundary><Render scope={scope} options={w.options || {}} actions={actions} /></WidgetBoundary>
              </div>
            </div>
          );
        })}
        {editing && (
          <div className="dash-add" style={{ gridColumn: 'span 3' }} onClick={() => setGallery(true)}
            onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); drop('__end'); }}>
            <Plus size={18} /> Add widget
          </div>
        )}
      </div>
      {!widgets.length && !editing && (
        <div className="empty">This dashboard is empty. <button className="btn sm primary" onClick={() => setGallery(true)}><Plus size={13} />Add chart</button></div>
      )}

      {gallery && <Gallery scopeType={scopeType} onClose={() => setGallery(false)} onAdd={(type, extra) => { add(type, extra); setGallery(false); }} />}
      {config && <ConfigModal widget={config} scopeType={scopeType} onClose={() => setConfig(null)} onSave={(patch) => { update(config.id, patch); setConfig(null); }} />}
    </div>
  );
}

function Gallery({ scopeType, onClose, onAdd }) {
  const types = Object.entries(WIDGETS).filter(([, d]) => !d.scopes || d.scopes.includes(scopeType));
  const [kpi, setKpi] = useState('overdue');
  return (
    <Modal title="Add a widget" onClose={onClose} wide>
      <div className="gallery">
        {types.map(([type, d]) => (
          <div key={type} className="g-item" onClick={() => type !== 'kpi' && onAdd(type)}>
            <div className="g-ico"><d.icon size={18} /></div>
            <div className="grow">
              <div className="bold">{d.name}</div>
              <div className="small muted">{d.description}</div>
              {type === 'kpi' && (
                <div className="row mt8" onClick={(e) => e.stopPropagation()}>
                  <select className="input sm" value={kpi} onChange={(e) => setKpi(e.target.value)}>
                    {d.options[0].choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <button className="btn sm primary" onClick={() => onAdd('kpi', { options: { metric: kpi } })}>Add</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ConfigModal({ widget, scopeType, onClose, onSave }) {
  const def = WIDGETS[widget.type];
  const [title, setTitle] = useState(widget.title || '');
  const [w, setW] = useState(widget.w || def.w);
  const [opts, setOpts] = useState({ ...(def.defaults || {}), ...(widget.options || {}) });
  return (
    <Modal title={`Widget settings · ${def.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={() => onSave({ title: title.trim() || undefined, w, options: opts })}>Save</button>
    </>}>
      <div className="col" style={{ gap: 12 }}>
        <Field label="Title (leave empty for automatic)">
          <input className="input" value={title} placeholder={def.title(opts, scopeType)} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Width">
          <select className="input" value={w} onChange={(e) => setW(Number(e.target.value))}>
            {WIDTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {(def.options || []).map((o) => (
          <Field key={o.key} label={o.label}>
            {o.type === 'textarea'
              ? <textarea className="input" rows={6} value={opts[o.key] || ''} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.value })} />
              : (
                <select className="input" value={opts[o.key]} onChange={(e) => {
                  const raw = e.target.value;
                  const choice = o.choices.find((c) => String(c.value) === raw);
                  setOpts({ ...opts, [o.key]: choice ? choice.value : raw });
                }}>
                  {o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
          </Field>
        ))}
      </div>
    </Modal>
  );
}
