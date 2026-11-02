/**
 * Sample engineering portfolio so a new MauProject workspace is immediately useful.
 * Dates are generated relative to today.
 */
import { addDays, startOfWeek } from './calendar.js';

const RES = [
  ['aisha', 'Aisha Rahman', 'Systems Engineer', 'Systems', 40, 120, '#4f46e5'],
  ['daniel', 'Daniel Kim', 'Senior Mechanical Engineer', 'Mechanical', 40, 135, '#0ea5e9'],
  ['nadia', 'Nadia Petrova', 'Mechanical Engineer', 'Mechanical', 40, 110, '#06b6d4'],
  ['priya', 'Priya Nair', 'Electrical Engineer', 'Electrical', 40, 125, '#f59e0b'],
  ['kenji', 'Kenji Watanabe', 'PCB Design Engineer', 'Electrical', 32, 115, '#f97316'],
  ['marco', 'Marco Rossi', 'Firmware Lead', 'Firmware', 40, 140, '#10b981'],
  ['sofia', 'Sofia Martins', 'Software Engineer', 'Software', 40, 120, '#8b5cf6'],
  ['fatima', 'Fatima Zahra', 'Software Engineer', 'Software', 40, 115, '#a855f7'],
  ['liam', "Liam O'Connor", 'Test Engineer', 'QA / Test', 40, 100, '#ef4444'],
  ['hannah', 'Hannah Weber', 'Manufacturing Engineer', 'Manufacturing', 40, 110, '#ec4899'],
  ['ethan', 'Ethan Brooks', 'Project Engineer', 'Project Management', 40, 105, '#64748b'],
];

/**
 * Phase DSL: { n: name, c: [leaf...] }
 * Leaf: [key, name, durationDays, discipline, assign[[res, units]], opts]
 * opts.after: explicit predecessor keys; opts.par: no auto-chain; opts.ms: milestone
 */
function buildProject(meta, phases) {
  const tasks = [];
  const deps = [];
  let order = 1;
  let prevPhaseLast = null;
  phases.forEach((ph, pi) => {
    const pkey = `P${pi}`;
    tasks.push({ key: pkey, name: ph.n, start_date: meta.start_date, duration: 1, sort_order: order++, status: 'todo' });
    let prev = null;
    let last = null;
    ph.c.forEach((leaf, li) => {
      const [key, name, dur, disc, assign = [], opts = {}] = leaf;
      tasks.push({
        key, parent: pkey, name, start_date: meta.start_date,
        duration: opts.ms ? 0 : dur, is_milestone: opts.ms ? 1 : 0,
        discipline: disc || '', sort_order: li + 1,
        estimate_hours: opts.ms ? 0 : dur * 8 * Math.max(1, assign.length || 1),
        priority: opts.pri || 'medium', status: 'todo',
        assign: assign.map(([r, units]) => ({ r, units })),
        description: opts.desc || '',
      });
      if (opts.after) opts.after.forEach((a) => deps.push(Array.isArray(a) ? [a[0], key, a[1], a[2]] : [a, key]));
      else if (!opts.par) {
        if (prev) deps.push([prev, key]);
        else if (prevPhaseLast) deps.push([prevPhaseLast, key]);
      }
      prev = opts.par ? prev : key;
      last = key;
    });
    prevPhaseLast = last;
  });
  return { ...meta, tasks, deps };
}

export function buildSampleData(today) {
  const wk = startOfWeek(today);
  const resources = RES.map(([key, name, role, discipline, capacity_hours, cost_rate, color]) => ({
    key, name, role, discipline, capacity_hours, cost_rate, color, active: 1,
    email: name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com',
  }));

  const atlas = buildProject({
    code: 'ATL-200', name: 'Atlas EV Charger Gen 2', status: 'active', priority: 'high', color: '#4f46e5',
    manager: 'Ethan Brooks', client: 'Internal — Energy BU', budget: 480000,
    description: 'Second-generation 22 kW AC wall charger: new enclosure, power board and OTA-capable firmware.',
    start_date: addDays(wk, -70), target_date: addDays(wk, 84),
  }, [
    { n: 'Requirements & Architecture', c: [
      ['a1', 'Stakeholder requirements', 5, 'Systems', [['aisha', 100]]],
      ['a2', 'System architecture & interfaces', 8, 'Systems', [['aisha', 100], ['marco', 25]]],
      ['a3', 'Requirements review (SRR)', 0, 'Systems', [], { ms: true }],
    ] },
    { n: 'Detailed Design', c: [
      ['b1', 'Enclosure CAD & DFM', 15, 'Mechanical', [['daniel', 100]], { after: ['a3'] }],
      ['b2', 'Thermal simulation', 8, 'Mechanical', [['nadia', 75]], { after: ['b1'] }],
      ['b3', 'Power stage schematic', 12, 'Electrical', [['priya', 100]], { after: ['a3'] }],
      ['b4', 'PCB layout (main board)', 10, 'Electrical', [['kenji', 100]], { after: ['b3'] }],
      ['b5', 'Firmware HAL & drivers', 18, 'Firmware', [['marco', 75]], { after: ['a3'] }],
      ['b6', 'Critical design review (CDR)', 0, 'Systems', [], { ms: true, after: ['b2', 'b4', 'b5'] }],
    ] },
    { n: 'Prototype Build', c: [
      ['c1', 'EVT prototype procurement', 10, 'Manufacturing', [['hannah', 50]], { after: ['b6'] }],
      ['c2', 'EVT assembly', 5, 'Manufacturing', [['hannah', 100], ['nadia', 50]]],
      ['c3', 'Board bring-up', 6, 'Electrical', [['priya', 100], ['marco', 50]]],
    ] },
    { n: 'Verification & Validation', c: [
      ['d1', 'Functional test plan', 5, 'QA / Test', [['liam', 100]], { after: ['b6'] }],
      ['d2', 'EMC pre-compliance', 8, 'Electrical', [['priya', 50], ['liam', 100]], { after: ['c3', 'd1'] }],
      ['d3', 'Thermal & environmental testing', 10, 'QA / Test', [['liam', 100], ['nadia', 50]], { after: ['d2'] }],
      ['d4', 'Certification submission (UL/CE)', 0, 'QA / Test', [], { ms: true, after: ['d3'] }],
    ] },
  ]);

  const orion = buildProject({
    code: 'ORN-310', name: 'Orion Firmware Platform', status: 'active', priority: 'urgent', color: '#10b981',
    manager: 'Marco Rossi', client: 'Platform Engineering', budget: 260000,
    description: 'Shared RTOS-based firmware platform with secure boot, OTA updates and device telemetry.',
    start_date: addDays(wk, -42), target_date: addDays(wk, 49),
  }, [
    { n: 'Platform Core', c: [
      ['o1', 'RTOS port & BSP', 10, 'Firmware', [['marco', 50]]],
      ['o2', 'Secure bootloader', 12, 'Firmware', [['marco', 50], ['fatima', 50]]],
      ['o3', 'OTA update service', 15, 'Software', [['fatima', 100]]],
    ] },
    { n: 'Cloud & Telemetry', c: [
      ['o4', 'Telemetry schema & ingestion API', 10, 'Software', [['sofia', 100]], { par: true }],
      ['o5', 'Device management dashboard', 15, 'Software', [['sofia', 100]], { after: ['o4'] }],
      ['o6', 'Fleet rollout tooling', 8, 'Software', [['fatima', 50], ['sofia', 50]], { after: ['o3', 'o5'] }],
    ] },
    { n: 'Release', c: [
      ['o7', 'Hardware-in-the-loop regression', 8, 'QA / Test', [['liam', 50]], { after: ['o6'] }],
      ['o8', 'Security penetration test', 5, 'Software', [], { after: ['o7'], pri: 'high' }],
      ['o9', 'Platform v1.0 release', 0, 'Firmware', [], { ms: true, after: ['o8'] }],
    ] },
  ]);

  const plant = buildProject({
    code: 'PL4-120', name: 'Plant Line 4 Automation', status: 'active', priority: 'medium', color: '#f59e0b',
    manager: 'Hannah Weber', client: 'Operations', budget: 350000,
    description: 'Automate final assembly on Line 4: robotic screwdriving cell, vision inspection and MES integration.',
    start_date: addDays(wk, -21), target_date: addDays(wk, 105),
  }, [
    { n: 'Concept', c: [
      ['p1', 'Line study & takt analysis', 5, 'Manufacturing', [['hannah', 50]]],
      ['p2', 'Cell concept & layout', 8, 'Mechanical', [['daniel', 50]]],
      ['p3', 'Concept approval', 0, 'Project Management', [['ethan', 25]], { ms: true }],
    ] },
    { n: 'Engineering', c: [
      ['p4', 'Fixture & end-effector design', 15, 'Mechanical', [['daniel', 50], ['nadia', 50]]],
      ['p5', 'Electrical panel & safety design', 12, 'Electrical', [['kenji', 50]], { after: ['p3'] }],
      ['p6', 'PLC & robot programming', 20, 'Software', [], { after: ['p5'] }],
      ['p7', 'Vision inspection algorithm', 15, 'Software', [['fatima', 25]], { after: ['p3'] }],
    ] },
    { n: 'Installation & Commissioning', c: [
      ['p8', 'Equipment install', 10, 'Manufacturing', [['hannah', 100]], { after: ['p4', 'p6'] }],
      ['p9', 'Commissioning & SAT', 10, 'QA / Test', [['liam', 50], ['hannah', 50]]],
      ['p10', 'Production handover', 0, 'Project Management', [], { ms: true }],
    ] },
  ]);

  const helios = buildProject({
    code: 'HEL-050', name: 'Helios Sensor Module', status: 'planning', priority: 'medium', color: '#ec4899',
    manager: 'Aisha Rahman', client: 'Industrial IoT', budget: 190000,
    description: 'Low-power environmental sensor module. Staffing not yet confirmed — see Capacity Planning.',
    start_date: addDays(wk, 21), target_date: addDays(wk, 154),
  }, [
    { n: 'Definition', c: [
      ['h1', 'Product requirements', 8, 'Systems', [['aisha', 50]]],
      ['h2', 'Sensor selection & trade study', 10, 'Electrical', []],
    ] },
    { n: 'Development', c: [
      ['h3', 'Low-power PCB design', 20, 'Electrical', []],
      ['h4', 'Enclosure & sealing design', 15, 'Mechanical', [], { after: ['h2'] }],
      ['h5', 'Sensor firmware', 25, 'Firmware', [], { after: ['h2'] }],
      ['h6', 'Mobile provisioning app', 20, 'Software', [], { after: ['h1'] }],
    ] },
    { n: 'Validation', c: [
      ['h7', 'DVT testing', 15, 'QA / Test', [], { after: ['h3', 'h4', 'h5'] }],
      ['h8', 'Pilot run', 0, 'Manufacturing', [], { ms: true }],
    ] },
  ]);

  const holidays = [];
  const y = Number(today.slice(0, 4));
  for (const yr of [y, y + 1]) {
    holidays.push({ date: `${yr}-01-01`, name: "New Year's Day" }, { date: `${yr}-12-25`, name: 'Christmas Day' });
  }

  const timeOff = [{ r: 'daniel', start_date: addDays(wk, 14), end_date: addDays(wk, 18), reason: 'Vacation' }];

  return { resources, holidays, timeOff, projects: [atlas, orion, plant, helios] };
}

/**
 * After the first scheduling pass, set realistic progress/status relative to today
 * and capture a baseline, then introduce a little slippage on a few tasks.
 */
export function finalizeSampleData(data, cal, today) {
  const out = [];
  const isParent = new Set(data.tasks.filter((t) => t.parent_id).map((t) => t.parent_id));
  const slip = new Set(['EMC pre-compliance', 'Secure bootloader', 'Fixture & end-effector design']);
  const blocked = new Set(['Security penetration test']);
  for (const t of data.tasks) {
    const finish = t.is_milestone ? t.start_date : cal.finish(t.start_date, t.duration);
    const patch = { baseline_start: t.start_date, baseline_finish: finish };
    if (!isParent.has(t.id)) {
      if (finish < today) {
        patch.progress = 100; patch.status = 'done';
      } else if (t.start_date <= today) {
        const total = cal.workdays(t.start_date, finish);
        const el = cal.workdays(t.start_date, today);
        let pr = Math.round((el / Math.max(total, 1)) * 100 / 5) * 5;
        if (slip.has(t.name)) pr = Math.max(0, pr - 25);
        patch.progress = Math.min(95, pr);
        patch.status = pr > 70 ? 'review' : 'in_progress';
      }
      if (slip.has(t.name)) patch.duration = t.duration + 4;
      if (blocked.has(t.name)) patch.status = 'blocked';
    }
    out.push({ id: t.id, patch });
  }
  return out;
}
