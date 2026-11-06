# MauProject User Guide

## Getting started
1. **Create a project** — File → New Project (⌘N). Set start, target finish, budget and manager.
2. **Build the WBS** — open the project's **Gantt** tab. Add tasks, then select a task and press **Tab** to indent it
   under the task above (it becomes a summary/work package). **Shift+Tab** outdents.
3. **Link tasks** — drag the small dot at the end of a bar onto another bar, or select a task and press **Link**
   to link it to the previous task. Change link type (FS/SS/FF/SF) and lag in the task details.
4. **Assign people** — double-click a task (or press Enter) and add assignees with % allocation.
5. **Save a baseline** — click **Baseline** in the project header; enable *Baseline* in the Gantt toolbar to compare.

## Spaces and dashboards
- **Spaces** group projects. Create one with the **+** next to *Spaces* in the sidebar (or ⌘K → New space).
  Pick a space when creating a project, or use a project card's **⋯ → Move to …**. Deleting a space keeps its projects (they move to *No space*).
- Every space and project opens on its **Dashboard**. Click **Add chart** to add a widget, or **Customize** to:
  drag widgets to reorder, change width (¼, ⅓, ½, ⅔, full), open ⚙ settings (title, metric, grouping, horizon), duplicate or remove.
  **Reset** restores the default layout. Changes are saved automatically.

## Scheduling rules
- Durations are in working days, using the calendar in **Settings** (working days, hours/day, holidays).
- Tasks with predecessors are scheduled automatically (as soon as possible). Dragging such a task pins it to
  **Manual** scheduling; switch it back to **Auto** in task details.
- Summary tasks roll up dates, duration-weighted progress, work and cost from their children.
- The **critical path** (red) is the chain of tasks with zero total slack.

## Tasks, Board and List
- **Board** — drag cards between status columns.
- **List / Tasks** — group by status, assignee, priority or project; click the circle to complete a task.
- Press **⌘K** anywhere to search projects, tasks, people and commands.

## Multi-select, bulk edit and delete
- **Tasks (List tab, Tasks page)** — tick the checkboxes (or ⌘/Ctrl-click a row, Shift-click for a range; the header checkbox selects a whole group).
- **Gantt** — ⌘/Ctrl-click or Shift-click rows; right-click a selected row for *Edit / Delete selected*; **Delete** deletes all selected.
- **Projects** (cards or table) and **Team** — tick checkboxes or use *Select all*.
- A bar appears at the bottom: quick actions (status, priority, move to space, shift ±1 day, active/inactive), **Edit** for a bulk-edit
  form (only the fields you change are applied: status, priority, discipline, progress, start date, shift by working days, duration,
  add/remove assignee, tag…), and **Delete** (with confirmation). Press **Esc** to clear the selection.

## Workload and capacity
- **Workload** shows each engineer's allocation per day/week/month across all projects. Red cells are
  over-allocated. Click a cell to see contributing tasks and reassign to someone with spare capacity.
- **Capacity Planning** compares demand (assigned work + estimates on unstaffed tasks, by discipline) with supply.
  Add *what-if hires* to model how new headcount closes the gap.

## Reports
**Reports** generates Portfolio Status, Project Status, Resource Utilization and Capacity Plan reports.
Export as PDF or HTML; export all tasks as CSV.

## Excel export (WBS & Workload)
**File → Export WBS & Workload (Excel)…** (⌘E), or the **Excel** buttons on Reports, Workload and each project.
Pick the start month, timeline length and projects. The workbook contains:
- **Task Plan** — one WBS block per project (summary row, phases, one row per task × PIC with *Jam/Hari*) and a daily Gantt.
- **Resource Map** — per person a *TOTAL JAM* row (green = at capacity, yellow = below, red = overload) and hours per project per day.
- **Ringkasan** — utilization, overload days, peak hours and cost per person; dates, progress, status and planned cost per project.
- **Master / Hari Libur** — projects, people (capacity per day, hourly rate), statuses and holidays used by the formulas.
All figures are Excel formulas, so you can keep editing the plan in Excel. Blank yellow rows in each block are for extra activities.

## Excel upload (WBS & Workload)
**File → Upload WBS & Workload (Excel)…** (⌘U), the **Upload Excel** button on Projects, or **Settings → Data**.
1. Choose the `.xlsx` file (template *BTN WBS-Workload* or a MauProject export). Old `.xls` files must be saved as `.xlsx` first.
2. Review the preview: projects (with activity counts and whether they are new or already exist), people, holidays and notes
   (e.g. rows without a start date, PICs missing from Master).
3. Choose the target space (new / existing / none), what to do with existing project codes (update & replace task plan, or create new),
   and whether to update existing team members' role and capacity.
4. Click **Import**. Mapping: each Task Plan row → task (rows with the same WBS & activity but different PICs become one task with several
   assignees); *Jam/Hari* → allocation % of the PIC's daily capacity; *% Selesai* → progress; *Status* → status (On Hold → Blocked,
   Delayed → In Progress + tag `delayed`); WBS codes like `1.2.3` rebuild the hierarchy; Master *Kapasitas (jam/hari)* → weekly capacity.

## Currency (IDR)
**Settings → Currency & regional format**: choose **IDR — Rupiah Indonesia** and **Bahasa Indonesia** formatting
(`Rp 1.250.000`, `24 Des 2026`). Changing currency does not convert stored amounts; use **Convert budgets & rates**
with an exchange rate (e.g. 16000 for USD → IDR).

## Data
All data is stored locally in `mauproject.db` under `~/Library/Application Support/MauProject/`.
Use **File → Back Up Database…** or **Settings → Data** to create backups.
