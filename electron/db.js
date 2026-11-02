'use strict';
/**
 * MauProject data layer — SQLite (mauproject.db) via better-sqlite3.
 * All access from the renderer goes through the whitelisted operations below.
 */
const Database = require('better-sqlite3');

const SCHEMA_VERSION = 1;

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

/** Whitelisted tables and writable columns. */
const TABLES = {
  projects: ['code', 'name', 'description', 'manager', 'client', 'status', 'priority', 'health',
    'start_date', 'target_date', 'budget', 'color', 'archived'],
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
    if (version < SCHEMA_VERSION) {
      this.db.exec(SCHEMA);
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
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
      DELETE FROM projects; DELETE FROM time_off; DELETE FROM resources; DELETE FROM holidays;`);
    this.setSetting('seeded', '1');
    return true;
  }

  /** Import a full dataset (used by the sample-data seeder). Expects client-side ids for linking. */
  importDataset(ds) {
    const tx = this.db.transaction(() => {
      const rmap = new Map();
      for (const r of ds.resources || []) rmap.set(r.key, this.create('resources', r).id);
      for (const h of ds.holidays || []) this.db.prepare('INSERT OR IGNORE INTO holidays(date, name) VALUES (?, ?)').run(h.date, h.name);
      for (const p of ds.projects || []) {
        const np = this.create('projects', p);
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

  backupTo(dest) {
    return this.db.backup(dest);
  }

  close() {
    this.db.close();
  }
}

module.exports = { MauProjectDB, TABLES };
