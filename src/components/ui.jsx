import React, { useEffect, useState, useRef } from 'react';
import { X, Inbox } from 'lucide-react';
import { initials, statusOf, priorityOf, projectStatusOf, HEALTH } from '../lib/format.js';

export function BrandMark({ size = 30 }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="10" height="4" rx="2" fill="#fff" />
        <rect x="7" y="10" width="12" height="4" rx="2" fill="#c7d2fe" />
        <rect x="11" y="16" width="10" height="4" rx="2" fill="#fff" />
      </svg>
    </div>
  );
}

export function Avatar({ resource, size, title }) {
  if (!resource) return null;
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} style={{ background: resource.color }} title={title || resource.name}>
      {initials(resource.name)}
    </span>
  );
}

export function AvatarStack({ resources, max = 4 }) {
  const shown = resources.slice(0, max);
  return (
    <span className="avatars">
      {shown.map((r) => <Avatar key={r.id} resource={r} />)}
      {resources.length > max && <span className="avatar" style={{ background: '#94a3b8' }}>+{resources.length - max}</span>}
    </span>
  );
}

const tint = (hex, a = 0.14) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export function Pill({ color, children }) {
  return (
    <span className="pill" style={{ background: tint(color), color }}>
      <span className="d" style={{ background: color }} />
      {children}
    </span>
  );
}

export const StatusPill = ({ status }) => { const s = statusOf(status); return <Pill color={s.color}>{s.label}</Pill>; };
export const PriorityPill = ({ priority }) => { const s = priorityOf(priority); return <Pill color={s.color}>{s.label}</Pill>; };
export const ProjectStatusPill = ({ status }) => { const s = projectStatusOf(status); return <Pill color={s.color}>{s.label}</Pill>; };
export const HealthPill = ({ health }) => { const h = HEALTH[health] || HEALTH.on_track; return <Pill color={h.color}>{h.label}</Pill>; };

export function Progress({ value, color, width }) {
  return (
    <div className="progress" style={{ width }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%`, background: color }} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-h">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, className }) {
  return (
    <div className={`field ${className || ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon size={22} /></div>
      <h3>{title}</h3>
      <div>{children}</div>
      {action && <div className="mt16">{action}</div>}
    </div>
  );
}

/** Context menu anchored at a point. items: [{label, icon, onClick, danger} | '-'] */
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    }
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close); };
  }, [x, y, onClose]);
  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) => it === '-' ? <div key={i} className="menu-sep" /> : (
        <div key={i} className={`menu-item ${it.danger ? 'danger' : ''}`} onClick={() => { onClose(); it.onClick(); }}>
          {it.icon && <it.icon size={14} />}{it.label}
        </div>
      ))}
    </div>
  );
}

// ---------- confirm dialog (promise based) ----------
let confirmListener = null;
export function confirmDialog(opts) {
  return new Promise((resolve) => confirmListener && confirmListener({ ...opts, resolve }));
}
export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => { confirmListener = setReq; return () => { confirmListener = null; }; }, []);
  if (!req) return null;
  const done = (v) => { req.resolve(v); setReq(null); };
  return (
    <Modal title={req.title || 'Are you sure?'} onClose={() => done(false)} footer={<>
      <button className="btn" onClick={() => done(false)}>Cancel</button>
      <button className={`btn ${req.danger ? 'danger solid' : 'primary'}`} onClick={() => done(true)} autoFocus>{req.confirmLabel || 'Confirm'}</button>
    </>}>
      <div className="muted" style={{ lineHeight: 1.5 }}>{req.message}</div>
    </Modal>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="btn-group">
      {options.map((o) => (
        <button key={o.value} className={`btn sm ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={13} />}{o.label}
        </button>
      ))}
    </div>
  );
}
