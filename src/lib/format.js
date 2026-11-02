import { parseDate } from './calendar.js';

export const TASK_STATUSES = [
  { id: 'todo', label: 'To Do', color: '#94a3b8' },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { id: 'review', label: 'In Review', color: '#a855f7' },
  { id: 'blocked', label: 'Blocked', color: '#ef4444' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];
export const PRIORITIES = [
  { id: 'urgent', label: 'Urgent', color: '#dc2626' },
  { id: 'high', label: 'High', color: '#f97316' },
  { id: 'medium', label: 'Medium', color: '#eab308' },
  { id: 'low', label: 'Low', color: '#94a3b8' },
];
export const PROJECT_STATUSES = [
  { id: 'planning', label: 'Planning', color: '#8b5cf6' },
  { id: 'active', label: 'Active', color: '#3b82f6' },
  { id: 'on_hold', label: 'On Hold', color: '#f59e0b' },
  { id: 'completed', label: 'Completed', color: '#22c55e' },
  { id: 'cancelled', label: 'Cancelled', color: '#94a3b8' },
];
export const HEALTH = {
  on_track: { label: 'On Track', color: '#16a34a' },
  at_risk: { label: 'At Risk', color: '#f59e0b' },
  off_track: { label: 'Off Track', color: '#dc2626' },
  done: { label: 'Complete', color: '#64748b' },
};
export const DISCIPLINES = ['Systems', 'Mechanical', 'Electrical', 'Firmware', 'Software', 'QA / Test', 'Manufacturing', 'Project Management'];
export const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

export const statusOf = (id) => TASK_STATUSES.find((s) => s.id === id) || TASK_STATUSES[0];
export const priorityOf = (id) => PRIORITIES.find((s) => s.id === id) || PRIORITIES[2];
export const projectStatusOf = (id) => PROJECT_STATUSES.find((s) => s.id === id) || PROJECT_STATUSES[0];

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = parseDate(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: opts.short ? undefined : 'numeric', timeZone: 'UTC' });
}

export function fmtMoney(n, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `${currency} ${Math.round(n || 0).toLocaleString()}`;
  }
}

export const fmtHours = (h) => `${(Math.round((h || 0) * 10) / 10).toLocaleString()}h`;
export const fmtPct = (x) => `${Math.round((x || 0) * 100)}%`;

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers, rows) {
  return [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
