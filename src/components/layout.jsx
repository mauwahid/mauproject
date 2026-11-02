import React, { useEffect, useState } from 'react';
import { Search, Plus } from 'lucide-react';

export function useRoute() {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}
export const navigate = (path) => { window.location.hash = '#/' + path; };

/** Shared page top bar */
export function TopBar({ title, crumbs, children, icon }) {
  return (
    <div className="topbar">
      <div className="title">
        {icon}
        <div>
          {crumbs && <div className="crumbs">{crumbs}</div>}
          <h1 style={{ fontSize: crumbs ? 16 : 18 }}>{title}</h1>
        </div>
      </div>
      <div className="spacer" />
      <button className="btn ghost sm" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
        <Search size={14} /> Search <span className="kbd">⌘K</span>
      </button>
      {children}
    </div>
  );
}

export const NewButton = ({ onClick, label = 'New' }) => (
  <button className="btn primary" onClick={onClick}><Plus size={15} />{label}</button>
);
