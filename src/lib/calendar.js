/**
 * Working-day calendar for MauProject scheduling.
 * Dates are ISO strings 'YYYY-MM-DD' handled in UTC to avoid timezone drift.
 */
const DAY = 86400000;

export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  const n = new Date();
  return fmtISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

export function addDays(iso, n) {
  return fmtISO(new Date(parseDate(iso).getTime() + n * DAY));
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function weekday(iso) {
  return parseDate(iso).getUTCDay();
}

/** Monday of the week containing iso. */
export function startOfWeek(iso) {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(iso) {
  return iso.slice(0, 8) + '01';
}

export function addMonths(iso, n) {
  const d = parseDate(iso);
  return fmtISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

export function minDate(a, b) { return !a ? b : !b ? a : a < b ? a : b; }
export function maxDate(a, b) { return !a ? b : !b ? a : a > b ? a : b; }

/**
 * Calendar maps dates <-> working-day indices so schedule math is integer arithmetic.
 * Non-working dates map to the next working day's index.
 */
export class Calendar {
  constructor({ workingDays = [1, 2, 3, 4, 5], holidays = [], hoursPerDay = 8 } = {}) {
    this.workingDays = new Set(workingDays.length ? workingDays : [1, 2, 3, 4, 5]);
    this.holidays = new Set(holidays);
    this.hoursPerDay = hoursPerDay;
    this.base = '2015-01-01';
    this.days = []; // working dates
    this.index = new Map(); // date -> idx (next working)
    this.extendTo('2040-12-31');
  }

  isWorking(iso) {
    return this.workingDays.has(weekday(iso)) && !this.holidays.has(iso);
  }

  extendTo(iso) {
    let cur = this.last ? addDays(this.last, 1) : this.base;
    const pendingNonWorking = [];
    while (cur <= iso) {
      if (this.isWorking(cur)) {
        const idx = this.days.length;
        this.days.push(cur);
        this.index.set(cur, idx);
        for (const nw of pendingNonWorking) this.index.set(nw, idx);
        pendingNonWorking.length = 0;
      } else {
        pendingNonWorking.push(cur);
      }
      this.last = cur;
      cur = addDays(cur, 1);
    }
    this.pendingTail = pendingNonWorking;
  }

  /** Working-day index of a date (next working day if non-working). */
  idx(iso) {
    if (!iso) return 0;
    if (iso < this.base) return 0;
    if (iso > this.last) this.extendTo(addDays(iso, 400));
    const v = this.index.get(iso);
    return v === undefined ? this.days.length : v;
  }

  date(idx) {
    if (idx < 0) return this.base;
    while (idx >= this.days.length) this.extendTo(addDays(this.last, 800));
    return this.days[idx];
  }

  /** Next working day on or after iso. */
  snap(iso) { return this.date(this.idx(iso)); }

  /** Finish date of a task starting at start lasting duration working days. */
  finish(start, duration) {
    const s = this.idx(start);
    return this.date(s + Math.max(duration, 1) - 1);
  }

  /** Working days between two dates inclusive. */
  workdays(start, end) {
    if (!start || !end || end < start) return 0;
    let e = this.idx(end);
    if (!this.isWorking(end) && this.date(e) > end) e -= 1;
    return Math.max(0, e - this.idx(start) + 1);
  }

  /** Iterate working dates between start and end inclusive. */
  *range(start, end) {
    for (let i = this.idx(start); ; i++) {
      const d = this.date(i);
      if (d > end) break;
      yield d;
    }
  }
}

export function calendarFromSettings(settings, holidays) {
  let wd = [1, 2, 3, 4, 5];
  try { wd = JSON.parse(settings?.workingDays || '[1,2,3,4,5]'); } catch { /* default */ }
  return new Calendar({
    workingDays: wd,
    holidays: (holidays || []).map((h) => h.date),
    hoursPerDay: Number(settings?.hoursPerDay) || 8,
  });
}
