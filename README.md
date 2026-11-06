# MauProject

**Project Management & Engineering Resource Planning** for Engineering Managers.

MauProject combines Microsoft Project–style scheduling, ClickUp-style task management and
engineering capacity planning in a single macOS desktop application.

| Identity | Value |
|---|---|
| Product name | MauProject |
| Application ID | `com.mauproject.desktop` |
| Window title | MauProject |
| Database | `mauproject.db` (in `~/Library/Application Support/MauProject/`) |
| macOS installer | `MauProject.dmg` |
| Category | Project Management & Engineering Resource Planning |

## Features

- **Spaces** — group projects into spaces (e.g. per department, squad or business unit); sidebar tree, move projects between spaces.
- **Customizable dashboards** — every space and every project has its own dashboard. Add, remove, resize (¼ to full width),
  reorder (drag & drop), duplicate and configure widgets: KPIs (13 metrics), task distribution, tasks by assignee,
  progress vs plan, project health, burn-down, team utilization, weekly workload, timeline, cost/hours breakdown,
  milestones, overdue, active & upcoming, and notes. Layouts are saved per space/project in `mauproject.db`.
- **Portfolio dashboard** — project health (auto-computed), progress vs. plan, forecast vs. target, utilization, milestones, overdue work.
- **Projects** — cards/table, status, priority, budget, duplicate, archive.
- **Gantt (Microsoft Project–style)** — WBS outline with indent/outdent, inline editing, drag to move,
  drag edge to resize, drag-to-link dependencies (FS/SS/FF/SF + lag), automatic scheduling on a working-day calendar,
  critical path, baselines and slippage, day/week/month zoom, target and today lines.
- **WBS** — outline with rolled-up dates, progress, estimate, planned work and cost; tree diagram; CSV export.
- **Board & List (ClickUp-style)** — Kanban drag-and-drop by status; grouped lists by status/assignee/priority/project with quick add.
- **Multi-select & bulk actions** — select many tasks (List, Tasks, Gantt), projects or team members; bulk edit fields or delete.
- **Task details** — status, priority, dates, duration, progress, discipline, estimate, assignees with % units,
  dependencies, subtasks, description, comments.
- **Workload** — resource × period heatmap across all projects, over-allocation detection, drill-down and one-click reassignment to people with free capacity.
- **Capacity planning** — demand (assigned + unstaffed estimates) vs. supply by discipline, FTE gap per month, what-if hiring scenarios.
- **Team** — roster, discipline, weekly capacity, cost rate, time off.
- **Reports** — Portfolio Status, Project Status, Resource Utilization, Capacity Plan; export to PDF/HTML, plus CSV exports.
- **Excel export (WBS & Workload)** — File → Export WBS & Workload (⌘E): a live, formula-driven `.xlsx` with
  *Petunjuk, Master, Hari Libur, Task Plan* (WBS blocks + daily Gantt), *Ringkasan* (utilization, overload days, cost)
  and *Resource Map* (hours per person per project per day, overload highlighting). Choose period and projects.
- **Excel upload (WBS & Workload)** — File → Upload WBS & Workload (⌘U), Projects → *Upload Excel*, or Settings → Data.
  Reads *Master* (projects, resources with capacity/day and rate), *Hari Libur* and *Task Plan* (WBS blocks: Aktivitas, PIC,
  Mulai, Selesai, Jam/Hari, % Selesai, Status) from the BTN template or a MauProject export. Preview, pick projects and target
  space, then import; re-importing the same file updates projects in place (their task plan is replaced).
- **Currency & regional format** — IDR (Rupiah, `Rp 1.250.000`) is the default, with Indonesian date/number format;
  13 currencies supported, plus a one-click converter for existing budgets and cost rates (e.g. USD → IDR).
- **Settings** — working days, hours/day, company holidays, currency & locale, database backup.

## Development

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # Vite + Electron with hot reload
npm start            # production build, then launch
npm test             # scheduling engine unit tests
```

## Build the macOS installer

```bash
npm run dist:mac     # → release/MauProject.dmg
```

The DMG targets the architecture of the build machine. The build is unsigned; for distribution,
configure an Apple Developer ID via `CSC_LINK`/`CSC_KEY_PASSWORD` and notarization in `electron-builder.yml`.

## Architecture

```
electron/main.js      main process: window, menu, IPC, PDF export
electron/preload.js   secure bridge (window.mauproject)
electron/db.js        SQLite schema + whitelisted data access (mauproject.db)
src/lib/calendar.js   working-day calendar
src/lib/scheduler.js  CPM scheduling engine (forward/backward pass, roll-ups)
src/lib/analytics.js  workload and capacity calculations
src/lib/reports.js    branded report generators
src/views/            Dashboard, Projects, Project workspace (Gantt/WBS/Board/List/Team), Tasks, Workload, Capacity, Team, Reports, Settings
```

On first launch MauProject seeds a sample engineering portfolio (4 projects, 11 engineers) so every view has data.
Use **Settings → Delete all data** to start clean.
