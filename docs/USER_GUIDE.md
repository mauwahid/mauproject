# MauProject User Guide

## Getting started
1. **Create a project** — File → New Project (⌘N). Set start, target finish, budget and manager.
2. **Build the WBS** — open the project's **Gantt** tab. Add tasks, then select a task and press **Tab** to indent it
   under the task above (it becomes a summary/work package). **Shift+Tab** outdents.
3. **Link tasks** — drag the small dot at the end of a bar onto another bar, or select a task and press **Link**
   to link it to the previous task. Change link type (FS/SS/FF/SF) and lag in the task details.
4. **Assign people** — double-click a task (or press Enter) and add assignees with % allocation.
5. **Save a baseline** — click **Baseline** in the project header; enable *Baseline* in the Gantt toolbar to compare.

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

## Workload and capacity
- **Workload** shows each engineer's allocation per day/week/month across all projects. Red cells are
  over-allocated. Click a cell to see contributing tasks and reassign to someone with spare capacity.
- **Capacity Planning** compares demand (assigned work + estimates on unstaffed tasks, by discipline) with supply.
  Add *what-if hires* to model how new headcount closes the gap.

## Reports
**Reports** generates Portfolio Status, Project Status, Resource Utilization and Capacity Plan reports.
Export as PDF or HTML; export all tasks as CSV.

## Data
All data is stored locally in `mauproject.db` under `~/Library/Application Support/MauProject/`.
Use **File → Back Up Database…** or **Settings → Data** to create backups.
