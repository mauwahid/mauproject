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

// ---------- regional formatting (Settings → Currency & regional format) ----------
export const LOCALES = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'id-ID', label: 'Bahasa Indonesia (Indonesia)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-SG', label: 'English (Singapore)' },
];
export const CURRENCIES = [
  { id: 'IDR', label: 'IDR — Rupiah Indonesia', symbol: 'Rp', decimals: 0 },
  { id: 'USD', label: 'USD — US Dollar', symbol: '$', decimals: 0 },
  { id: 'EUR', label: 'EUR — Euro', symbol: '€', decimals: 0 },
  { id: 'SGD', label: 'SGD — Singapore Dollar', symbol: 'S$', decimals: 0 },
  { id: 'MYR', label: 'MYR — Malaysian Ringgit', symbol: 'RM', decimals: 0 },
  { id: 'GBP', label: 'GBP — British Pound', symbol: '£', decimals: 0 },
  { id: 'JPY', label: 'JPY — Japanese Yen', symbol: '¥', decimals: 0 },
  { id: 'AUD', label: 'AUD — Australian Dollar', symbol: 'A$', decimals: 0 },
  { id: 'CAD', label: 'CAD — Canadian Dollar', symbol: 'C$', decimals: 0 },
  { id: 'INR', label: 'INR — Indian Rupee', symbol: '₹', decimals: 0 },
  { id: 'AED', label: 'AED — UAE Dirham', symbol: 'AED', decimals: 0 },
  { id: 'SAR', label: 'SAR — Saudi Riyal', symbol: 'SAR', decimals: 0 },
  { id: 'CNY', label: 'CNY — Chinese Yuan', symbol: '¥', decimals: 0 },
];
let LOCALE = 'en-US';
export function setFormatLocale(locale) { LOCALE = LOCALES.some((l) => l.id === locale) ? locale : 'en-US'; }
export function getFormatLocale() { return LOCALE; }

/** Excel number format for a currency, e.g. "Rp" #,##0 for IDR. */
export function currencyExcelFormat(currency) {
  const c = CURRENCIES.find((x) => x.id === currency);
  const sym = c ? c.symbol : currency;
  return `"${sym} "#,##0;-"${sym} "#,##0;"${sym} "0`;
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = parseDate(iso);
  return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: opts.short ? undefined : 'numeric', timeZone: 'UTC' });
}

export function fmtMoney(n, currency = 'USD', opts = {}) {
  const locale = currency === 'IDR' && LOCALE.startsWith('en-US') ? 'id-ID' : LOCALE;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, maximumFractionDigits: opts.compact ? 1 : 0, minimumFractionDigits: 0,
      notation: opts.compact ? 'compact' : 'standard',
    }).format(n || 0);
  } catch {
    return `${currency} ${Math.round(n || 0).toLocaleString(LOCALE)}`;
  }
}

/** Compact money for KPI tiles once values get long (e.g. Rp 3,9 M). */
export const fmtMoneyShort = (n, currency) => (Math.abs(n || 0) >= 1e7 ? fmtMoney(n, currency, { compact: true }) : fmtMoney(n, currency));

export const fmtHours = (h) => `${(Math.round((h || 0) * 10) / 10).toLocaleString(LOCALE)}h`;
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
