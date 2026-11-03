'use strict';
/**
 * MauProject data layer — SQLite (mauproject.db) via better-sqlite3.
 * All access from the renderer goes through the whitelisted operations below.
 */
const Database = require('better-sqlite3');

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager     TEXT NOT NULL DEFAULT '',
  client      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planning',
  priority    TEXT NOT NULL DEFAULT 'medium',
  health      TEXT NOT NULL DEFAULT 'auto',
  start_date  TEXT NOT NULL,
  target_date TEXT,
  budget      REAL NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#4f46e5',
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id      INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order     REAL NOT NULL DEFAULT 0,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'todo',
  priority       TEXT NOT NULL DEFAULT 'medium',
  discipline     TEXT NOT NULL DEFAULT '',
  start_date     TEXT NOT NULL,
  duration       INTEGER NOT NULL DEFAULT 1,
  progress       INTEGER NOT NULL DEFAULT 0,
  is_milestone   INTEGER NOT NULL DEFAULT 0,
  schedule_mode  TEXT NOT NULL DEFAULT 'auto',
  estimate_hours REAL NOT NULL DEFAULT 0,
  tags           TEXT NOT NULL DEFAULT '',
  baseline_start TEXT,
  baseline_finish TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS dependencies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type           TEXT NOT NULL DEFAULT 'FS',
  lag            INTEGER NOT NULL DEFAULT 0,
  UNIQUE(predecessor_id, successor_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT '',
  discipline     TEXT NOT NULL DEFAULT '',
  capacity_hours REAL NOT NULL DEFAULT 40,
  cost_rate      REAL NOT NULL DEFAULT 0,
  color          TEXT NOT NULL DEFAULT '#0ea5e9',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  units       REAL NOT NULL DEFAULT 100,
  UNIQUE(task_id, resource_id)
);

CREATE TABLE IF NOT EXISTS time_off (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS holidays (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** v2: spaces group projects; dashboards store widget layouts per home / space / project. */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS spaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#4f46e5',
  icon        TEXT NOT NULL DEFAULT 'layers',
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS dashboards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_id   INTEGER NOT NULL DEFAULT 0,
  widgets    TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_type, scope_id)
);
`;

/** Whitelisted tables and writable columns. */
const TABLES = {
  projects: ['code', 'name', 'description', 'manager', 'client', 'status', 'priority', 'health',
    'start_date', 'target_date', 'budget', 'color', 'archived', 'space_id'],
  spaces: ['name', 'description', 'color', 'icon', 'sort_order'],
  tasks: ['project_id', 'parent_id', 'sort_order', 'name', 'description', 'status', 'priority',
    'discipline', 'start_date', 'duration', 'progress', 'is_milestone', 'schedule_mode',
    'estimate_hours', 'tags', 'baseline_start', 'baseline_finish'],
  dependencies: ['project_id', 'predecessor_id', 'successor_id', 'type', 'lag'],
  resources: ['name', 'email', 'role', 'discipline', 'capacity_hours', 'cost_rate', 'color', 'active'],
  assignments: ['task_id', 'resource_id', 'units'],
  time_off: ['resource_id', 'start_date', 'end_date', 'reason'],
  holidays: ['date', 'name'],
  comments: ['task_id', 'author', 'body'],
};
const HAS_UPDATED_AT = new Set(['projects', 'tasks']);

const DEFAULT_SETTINGS = {
  workingDays: '[1,2,3,4,5]',
  hoursPerDay: '8',
  currency: 'IDR',
  locale: 'id-ID',
  userName: 'Engineering Manager',
  theme: 'light',
  seeded: '0',
};

function assertTable(table) {
  if (!Object.prototype.hasOwnProperty.call(TABLES, table)) throw new Error(`Unknown table: ${table}`);
}

function pick(table, obj) {
  const cols = TABLES[table];
  const out = {};
  for (const k of Object.keys(obj || {})) if (cols.includes(k)) out[k] = obj[k] === undefined ? null : obj[k];
  return out;
}

class MauProjectDB {
  constructor(file) {
    this.file = file;
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  migrate() {
    const version = this.db.pragma('user_version', { simple: true });
    if (version < 1) this.db.exec(SCHEMA);
    if (version < 2) {
      this.db.transaction(() => {
        this.db.exec(SCHEMA_V2);
        const cols = this.db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
        if (!cols.includes('space_id')) {
          this.db.exec('ALTER TABLE projects ADD COLUMN space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL');
        }
        // Existing workspaces: put current projects into a default space.
        const n = this.db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
        if (n > 0 && this.db.prepare('SELECT COUNT(*) AS n FROM spaces').get().n === 0) {
          const id = this.db.prepare("INSERT INTO spaces(name, description, color, sort_order) VALUES ('General', 'Default space for existing projects', '#4f46e5', 1)").run().lastInsertRowid;
          this.db.prepare('UPDATE projects SET space_id = ? WHERE space_id IS NULL').run(id);
        }
      })();
    }
    if (version < SCHEMA_VERSION) this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    const ins = this.db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  }

  // ---------- generic CRUD ----------
  list(table) {
    assertTable(table);
    return this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  }

  get(table, id) {
    assertTable(table);
    return this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  create(table, obj) {
    assertTable(table);
    const row = pick(table, obj);
    const cols = Object.keys(row);
    if (!cols.length) throw new Error('Nothing to insert');
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`;
    const info = this.db.prepare(sql).run(row);
    return this.get(table, info.lastInsertRowid);
  }

  update(table, id, patch) {
    assertTable(table);
    const row = pick(table, patch);
    const cols = Object.keys(row);
    if (!cols.length) return this.get(table, id);
    let sets = cols.map((c) => `${c} = @${c}`).join(', ');
    if (HAS_UPDATED_AT.has(table)) sets += ", updated_at = datetime('now')";
    this.db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @__id`).run({ ...row, __id: id });
    return this.get(table, id);
  }

  remove(table, id) {
    assertTable(table);
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return true;
  }

  /** Apply many updates atomically: [{id, patch}] */
  bulkUpdate(table, items) {
    assertTable(table);
    const tx = this.db.transaction((list) => list.map(({ id, patch }) => this.update(table, id, patch)));
    return tx(items || []);
  }

  // ---------- aggregate ----------
  loadAll() {
    const settings = {};
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) settings[r.key] = r.value;
    return {
      settings,
      spaces: this.db.prepare('SELECT * FROM spaces ORDER BY sort_order, id').all(),
      dashboards: this.db.prepare('SELECT * FROM dashboards').all(),
      projects: this.list('projects'),
      tasks: this.db.prepare('SELECT * FROM tasks ORDER BY project_id, sort_order, id').all(),
      dependencies: this.list('dependencies'),
      resources: this.list('resources'),
      assignments: this.list('assignments'),
      timeOff: this.list('time_off'),
      holidays: this.db.prepare('SELECT * FROM holidays ORDER BY date').all(),
    };
  }

  setSetting(key, value) {
    this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(String(key), String(value));
    return true;
  }

  /** Upsert the widget layout for a dashboard scope ('home' | 'space' | 'project'). */
  saveDashboard(scopeType, scopeId, widgets) {
    if (!['home', 'space', 'project'].includes(scopeType)) throw new Error('Invalid dashboard scope');
    this.db.prepare(`INSERT INTO dashboards(scope_type, scope_id, widgets, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(scope_type, scope_id) DO UPDATE SET widgets = excluded.widgets, updated_at = excluded.updated_at`)
      .run(scopeType, Number(scopeId) || 0, JSON.stringify(widgets || []));
    return this.db.prepare('SELECT * FROM dashboards WHERE scope_type = ? AND scope_id = ?').get(scopeType, Number(scopeId) || 0);
  }

  /** Delete a space; its projects move to "no space"; its dashboard is removed. */
  deleteSpace(id) {
    this.db.transaction(() => {
      this.db.prepare('UPDATE projects SET space_id = NULL WHERE space_id = ?').run(id);
      this.db.prepare("DELETE FROM dashboards WHERE scope_type = 'space' AND scope_id = ?").run(id);
      this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
    })();
    return true;
  }

  commentsFor(taskId) {
    return this.db.prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at, id').all(taskId);
  }

  /** Duplicate a project with its WBS, dependencies and assignments. */
  duplicateProject(projectId) {
    const tx = this.db.transaction(() => {
      const p = this.get('projects', projectId);
      if (!p) throw new Error('Project not found');
      const np = this.create('projects', { ...p, name: `${p.name} (Copy)`, code: p.code ? `${p.code}-C` : '' });
      const tasks = this.db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY parent_id IS NOT NULL, id').all(projectId);
      const map = new Map();
      // insert parents before children
      const pending = [...tasks];
      let guard = 0;
      while (pending.length && guard++ < 10000) {
        const t = pending.shift();
        if (t.parent_id && !map.has(t.parent_id)) { pending.push(t); continue; }
        const nt = this.create('tasks', { ...t, project_id: np.id, parent_id: t.parent_id ? map.get(t.parent_id) : null });
        map.set(t.id, nt.id);
      }
      for (const d of this.db.prepare('SELECT * FROM dependencies WHERE project_id = ?').all(projectId)) {
        this.create('dependencies', { ...d, project_id: np.id, predecessor_id: map.get(d.predecessor_id), successor_id: map.get(d.successor_id) });
      }
      const asg = this.db.prepare('SELECT a.* FROM assignments a JOIN tasks t ON t.id = a.task_id WHERE t.project_id = ?').all(projectId);
      for (const a of asg) this.create('assignments', { ...a, task_id: map.get(a.task_id) });
      return np;
    });
    return tx();
  }

  /** Wipe all user data (keeps settings, resets the seeded flag). */
  reset() {
    this.db.exec(`DELETE FROM comments; DELETE FROM assignments; DELETE FROM dependencies; DELETE FROM tasks;
      DELETE FROM projects; DELETE FROM time_off; DELETE FROM resources; DELETE FROM holidays;
      DELETE FROM dashboards; DELETE FROM spaces;`);
    this.setSetting('seeded', '1');
    return true;
  }

  /** Import a full dataset (used by the sample-data seeder). Expects client-side ids for linking. */
  importDataset(ds) {
    const tx = this.db.transaction(() => {
      const rmap = new Map();
      for (const r of ds.resources || []) rmap.set(r.key, this.create('resources', r).id);
      for (const h of ds.holidays || []) this.db.prepare('INSERT OR IGNORE INTO holidays(date, name) VALUES (?, ?)').run(h.date, h.name);
      const smap = new Map();
      for (const sp of ds.spaces || []) smap.set(sp.key, this.create('spaces', sp).id);
      for (const p of ds.projects || []) {
        const np = this.create('projects', { ...p, space_id: p.space ? smap.get(p.space) : p.space_id ?? null });
        const tmap = new Map();
        for (const t of p.tasks || []) {
          const nt = this.create('tasks', { ...t, project_id: np.id, parent_id: t.parent ? tmap.get(t.parent) : null });
          tmap.set(t.key, nt.id);
          for (const a of t.assign || []) {
            this.create('assignments', { task_id: nt.id, resource_id: rmap.get(a.r), units: a.units ?? 100 });
          }
        }
        for (const d of p.deps || []) {
          this.create('dependencies', {
            project_id: np.id, predecessor_id: tmap.get(d[0]), successor_id: tmap.get(d[1]),
            type: d[2] || 'FS', lag: d[3] || 0,
          });
        }
      }
      for (const o of ds.timeOff || []) this.create('time_off', { ...o, resource_id: rmap.get(o.r) });
      this.setSetting('seeded', '1');
    });
    tx();
    return true;
  }

  /**
   * Import a parsed "WBS & Workload" workbook (see xlsx-import.js) in one transaction.
   * opts: { codes: string[], projectMode: 'replace'|'new', updateResources: bool,
   *         spaceMode: 'new'|'existing'|'none', spaceName, spaceId, palette: string[] }
   */
  importPlan(plan, opts) {
    const PALETTE = opts.palette || ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];
    const settings = {};
    for (const r of this.db.prepare('SELECT key, value FROM settings').all()) settings[r.key] = r.value;
    let wdays = [1, 2, 3, 4, 5];
    try { wdays = JSON.parse(settings.workingDays || '[1,2,3,4,5]'); } catch { /* default */ }
    const wd = new Set(wdays);
    const lc = (x) => String(x || '').trim().toLowerCase();
    const result = { projectsCreated: 0, projectsUpdated: 0, tasks: 0, assignments: 0, resourcesCreated: 0, resourcesUpdated: 0, holidays: 0, spaceId: null, projectIds: [] };

    const tx = this.db.transaction(() => {
      // holidays first so working-day math matches
      const insH = this.db.prepare('INSERT OR IGNORE INTO holidays(date, name) VALUES (?, ?)');
      for (const h of plan.holidays || []) result.holidays += insH.run(h.date, h.name).changes;
      const hol = new Set(this.db.prepare('SELECT date FROM holidays').all().map((h) => h.date));
      const iso = (d) => d.toISOString().slice(0, 10);
      const next = (s) => iso(new Date(Date.parse(s + 'T00:00:00Z') + 86400000));
      const isWork = (s) => wd.has(new Date(s + 'T00:00:00Z').getUTCDay()) && !hol.has(s);
      const workdays = (a, b) => { let n = 0; for (let d = a; d <= b; d = next(d)) if (isWork(d)) n++; return n; };

      // resources
      const resByName = new Map(this.list('resources').map((r) => [lc(r.name), r]));
      let colorIdx = resByName.size;
      for (const r of plan.resources || []) {
        const cap = Math.round((Number(r.capPerDay) || 8) * wd.size * 10) / 10;
        const ex = resByName.get(lc(r.name));
        if (ex) {
          if (opts.updateResources && !r.fromTaskPlan) {
            const patch = { role: r.role || ex.role, capacity_hours: cap };
            if (r.discipline && !ex.discipline) patch.discipline = r.discipline;
            if (r.rate) patch.cost_rate = r.rate;
            resByName.set(lc(r.name), this.update('resources', ex.id, patch));
            result.resourcesUpdated++;
          }
        } else {
          const row = this.create('resources', {
            name: r.name, role: r.role || '', discipline: r.discipline || '', capacity_hours: cap,
            cost_rate: r.rate || 0, color: PALETTE[colorIdx++ % PALETTE.length], active: 1,
          });
          resByName.set(lc(r.name), row);
          result.resourcesCreated++;
        }
      }

      // space
      let spaceId = null;
      if (opts.spaceMode === 'new') {
        const so = (this.db.prepare('SELECT MAX(sort_order) AS m FROM spaces').get().m || 0) + 1;
        spaceId = this.create('spaces', { name: opts.spaceName || plan.source || 'Imported', description: `Imported from ${plan.source}`, color: '#0ea5e9', sort_order: so }).id;
      } else if (opts.spaceMode === 'existing' && opts.spaceId) spaceId = Number(opts.spaceId);
      result.spaceId = spaceId;

      // projects + tasks
      const existing = this.list('projects');
      const wanted = new Set((opts.codes || plan.projects.map((p) => p.code)).map(lc));
      let pIdx = existing.length;
      for (const p of plan.projects) {
        if (!wanted.has(lc(p.code))) continue;
        const start = p.start || plan.period || new Date().toISOString().slice(0, 10);
        const pct = p.tasks.length ? p.tasks.reduce((a, t) => a + t.pct, 0) / p.tasks.length : 0;
        const fields = {
          code: p.code, name: p.name || p.code,
          description: p.version ? `Versi ${p.version}` : '',
          start_date: start, target_date: p.finish || null,
          status: pct >= 1 ? 'completed' : p.tasks.length ? 'active' : 'planning',
        };
        if (p.manager) fields.manager = p.manager;
        if (p.budget) fields.budget = p.budget;
        if (spaceId) fields.space_id = spaceId;
        const match = opts.projectMode === 'replace' && existing.find((x) => lc(x.code) === lc(p.code) || (!x.code && lc(x.name) === lc(p.name)));
        let projectId;
        if (match) {
          this.db.prepare('DELETE FROM tasks WHERE project_id = ?').run(match.id);
          this.update('projects', match.id, fields);
          projectId = match.id;
          result.projectsUpdated++;
        } else {
          projectId = this.create('projects', { ...fields, priority: 'medium', health: 'auto', color: PALETTE[pIdx++ % PALETTE.length], space_id: spaceId }).id;
          result.projectsCreated++;
        }
        result.projectIds.push(projectId);

        // merge rows that are the same activity with several PICs
        const groups = [];
        const byKey = new Map();
        for (const t of p.tasks) {
          const key = `${t.wbs}|${lc(t.name)}|${t.start}|${t.finish}`;
          if (t.wbs && byKey.has(key)) { byKey.get(key).pics.push(t); continue; }
          const g = { ...t, pics: [t] };
          groups.push(g);
          if (t.wbs) byKey.set(key, g);
        }
        const idByWbs = new Map();
        groups.forEach((g, i) => {
          const parentWbs = g.wbs.includes('.') ? g.wbs.slice(0, g.wbs.lastIndexOf('.')) : '';
          const parent_id = parentWbs.includes('.') ? idByWbs.get(parentWbs) || null : null;
          const s = g.start || start;
          const f = g.finish && g.finish >= s ? g.finish : s;
          const dur = Math.max(1, workdays(s, f));
          const people = g.pics.filter((x) => x.pic).map((x) => ({ res: resByName.get(lc(x.pic)), jam: x.jam }));
          const total = g.pics.reduce((a, x) => a + (x.total != null ? x.total : (x.jam || 0) * dur), 0);
          const tags = [g.delayed ? 'delayed' : '', g.start ? '' : 'belum dijadwalkan'].filter(Boolean).join(', ');
          const task = this.create('tasks', {
            project_id: projectId, parent_id, sort_order: i + 1, name: g.name, status: g.status,
            progress: Math.round(g.pct * 100), start_date: s, duration: dur, schedule_mode: 'auto',
            estimate_hours: Math.round(total * 10) / 10, tags, priority: 'medium',
            discipline: (people[0] && people[0].res && people[0].res.discipline) || '',
            description: g.statusText && !['done', 'in progress', 'not started'].includes(lc(g.statusText)) ? `Status di Excel: ${g.statusText}` : '',
          });
          if (g.wbs) idByWbs.set(g.wbs, task.id);
          result.tasks++;
          for (const pe of people) {
            if (!pe.res) continue;
            const hpd = (Number(pe.res.capacity_hours) || 40) / (wd.size || 5);
            const units = pe.jam ? Math.max(5, Math.round((pe.jam / hpd) * 100)) : 100;
            this.db.prepare('INSERT OR IGNORE INTO assignments(task_id, resource_id, units) VALUES (?, ?, ?)').run(task.id, pe.res.id, units);
            result.assignments++;
          }
        });
      }
    });
    tx();
    return result;
  }

  backupTo(dest) {
    return this.db.backup(dest);
  }

  close() {
    this.db.close();
  }
}

module.exports = { MauProjectDB, TABLES };
