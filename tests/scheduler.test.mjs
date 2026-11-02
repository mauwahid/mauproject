import test from 'node:test';
import assert from 'node:assert/strict';
import { Calendar } from '../src/lib/calendar.js';
import { schedule, createsCycle } from '../src/lib/scheduler.js';

const cal = new Calendar({ workingDays: [1, 2, 3, 4, 5], holidays: ['2026-12-25'] });
const T = (id, o = {}) => ({ id, project_id: 1, parent_id: null, sort_order: id, name: `T${id}`, start_date: '2026-11-02', duration: 5, progress: 0, is_milestone: 0, schedule_mode: 'auto', estimate_hours: 0, ...o });

test('calendar skips weekends and holidays', () => {
  assert.equal(cal.finish('2026-11-02', 5), '2026-11-06'); // Mon..Fri
  assert.equal(cal.finish('2026-11-06', 2), '2026-11-09'); // Fri -> Mon
  assert.equal(cal.finish('2026-12-24', 2), '2026-12-28'); // skips Christmas + weekend
  assert.equal(cal.snap('2026-11-07'), '2026-11-09');
  assert.equal(cal.workdays('2026-11-02', '2026-11-13'), 10);
});

test('FS chain, lag, critical path and slack', () => {
  const tasks = [T(1), T(2), T(3, { duration: 2 }), T(4, { duration: 1 })];
  const deps = [
    { predecessor_id: 1, successor_id: 2, type: 'FS', lag: 0 },
    { predecessor_id: 2, successor_id: 4, type: 'FS', lag: 2 },
    { predecessor_id: 1, successor_id: 3, type: 'FS', lag: 0 },
  ];
  const s = schedule(tasks, deps, cal);
  const b = (id) => s.byId.get(id);
  assert.equal(b(2).start, '2026-11-09');
  assert.equal(b(4).start, '2026-11-18'); // T2 ends 11-13, +2 lag -> Wed 11-18
  assert.ok(b(1).critical && b(2).critical && b(4).critical);
  assert.ok(!b(3).critical);
  assert.equal(b(3).slack, 6);
});

test('SS / FF / SF links', () => {
  const tasks = [T(1, { duration: 4 }), T(2, { duration: 2 }), T(3, { duration: 2 }), T(4, { duration: 1 })];
  const deps = [
    { predecessor_id: 1, successor_id: 2, type: 'SS', lag: 1 },
    { predecessor_id: 1, successor_id: 3, type: 'FF', lag: 0 },
    { predecessor_id: 1, successor_id: 4, type: 'SF', lag: 0 },
  ];
  const s = schedule(tasks, deps, cal);
  assert.equal(s.byId.get(2).start, '2026-11-03');
  assert.equal(s.byId.get(3).finish, '2026-11-05');
  assert.equal(s.byId.get(4).finish, '2026-10-30'); // finishes the day before T1 starts
});

test('summary roll-up, WBS codes and milestones', () => {
  const tasks = [T(1, { name: 'Phase' }), T(2, { parent_id: 1, duration: 3, progress: 100 }), T(3, { parent_id: 1, duration: 1, progress: 0 }), T(4, { parent_id: 1, is_milestone: 1, duration: 0 })];
  const deps = [{ predecessor_id: 2, successor_id: 3, type: 'FS', lag: 0 }, { predecessor_id: 3, successor_id: 4, type: 'FS', lag: 0 }];
  const s = schedule(tasks, deps, cal);
  const p = s.byId.get(1);
  assert.equal(p.isSummary, true);
  assert.equal(p.start, '2026-11-02');
  assert.equal(p.finish, '2026-11-05');
  assert.equal(p.progress, 60); // (3*100 + 1*0 + 1*0)/5
  assert.deepEqual([s.byId.get(2).wbs, s.byId.get(4).wbs], ['1.1', '1.3']);
  assert.equal(s.byId.get(4).start, '2026-11-06'); // milestone after T3 finishes
});

test('cycle detection', () => {
  const deps = [{ predecessor_id: 1, successor_id: 2 }, { predecessor_id: 2, successor_id: 3 }];
  assert.equal(createsCycle(deps, 3, 1), true);
  assert.equal(createsCycle(deps, 1, 3), false);
});
