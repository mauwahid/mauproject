import React, { useMemo, useState } from 'react';
import { FileText, FileDown, Code2, Briefcase, Users, Gauge, Table, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../lib/store.jsx';
import { TopBar } from '../components/layout.jsx';
import { portfolioReport, projectReport, utilizationReport, capacityReport } from '../lib/reports.js';
import { toCSV } from '../lib/format.js';

const TYPES = [
  { id: 'portfolio', label: 'Portfolio Status', desc: 'Health, progress, forecast and budget across all projects', icon: Briefcase },
  { id: 'project', label: 'Project Status', desc: 'Schedule, WBS, overdue and upcoming work for one project', icon: FileText },
  { id: 'utilization', label: 'Resource Utilization', desc: 'Weekly utilization and over-allocations per engineer', icon: Users },
  { id: 'capacity', label: 'Capacity Plan', desc: 'Demand vs. supply by discipline with FTE gaps', icon: Gauge },
];

export default function Reports({ openModal }) {
  const { data, derived, actions } = useStore();
  const [type, setType] = useState('portfolio');
  const [pid, setPid] = useState(data.projects[0]?.id || '');
  const project = data.projects.find((p) => p.id === Number(pid));

  const html = useMemo(() => {
    if (type === 'portfolio') return portfolioReport(data, derived);
    if (type === 'project') return project ? projectReport(project, data, derived) : '<p style="font-family:sans-serif;padding:20px">Create a project first.</p>';
    if (type === 'utilization') return utilizationReport(data, derived);
    return capacityReport(data, derived);
  }, [type, project, data, derived]);

  const baseName = () => {
    const t = TYPES.find((x) => x.id === type).label;
    return type === 'project' && project ? `MauProject ${project.code || project.name} ${t} Report` : `MauProject ${t} Report`;
  };

  const pdf = async () => {
    const p = await window.mauproject.files.exportPdf(html, `${baseName()}.pdf`);
    if (p) actions.toast('PDF exported', 'success');
  };
  const htmlExport = async () => {
    const p = await window.mauproject.files.saveText(`${baseName()}.html`, html, 'HTML', 'html');
    if (p) actions.toast('HTML exported', 'success');
  };
  const tasksCsv = async () => {
    const projById = new Map(data.projects.map((p) => [p.id, p]));
    const rows = data.tasks.map((t) => {
      const d = derived.dates.get(t.id) || {};
      const people = (derived.asgByTask.get(t.id) || []).map((a) => `${derived.resById.get(a.resource_id)?.name} (${a.units}%)`).join('; ');
      return [projById.get(t.project_id)?.code, projById.get(t.project_id)?.name, d.wbs, t.name, d.isSummary ? 'Summary' : t.is_milestone ? 'Milestone' : 'Task',
        t.status, t.priority, t.discipline, d.start, d.finish, t.duration, t.progress, t.estimate_hours, people, t.baseline_start, t.baseline_finish];
    });
    const csv = toCSV(['Project code', 'Project', 'WBS', 'Task', 'Type', 'Status', 'Priority', 'Discipline', 'Start', 'Finish', 'Duration (d)', 'Progress %', 'Estimate (h)', 'Assignees', 'Baseline start', 'Baseline finish'], rows);
    const p = await window.mauproject.files.saveText('MauProject All Tasks.csv', csv, 'CSV', 'csv');
    if (p) actions.toast('Tasks exported', 'success');
  };

  return (
    <>
      <TopBar title="Reports" crumbs="Generate, preview and export">
        <button className="btn sm" onClick={() => openModal({ type: 'xlsx' })}><FileSpreadsheet size={14} />WBS & Workload Excel</button>
        <button className="btn sm" onClick={tasksCsv}><Table size={14} />All tasks CSV</button>
        <button className="btn sm" onClick={htmlExport}><Code2 size={14} />HTML</button>
        <button className="btn primary sm" onClick={pdf}><FileDown size={14} />Export PDF</button>
      </TopBar>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          <div className="card report-list" style={{ padding: 8, alignSelf: 'start' }}>
            {TYPES.map((t) => (
              <div key={t.id} className={`r-item ${type === t.id ? 'active' : ''}`} onClick={() => setType(t.id)}>
                <t.icon size={16} style={{ marginTop: 2, color: 'var(--brand)' }} />
                <div><div className="bold">{t.label}</div><div className="small muted">{t.desc}</div></div>
              </div>
            ))}
            <div className="r-item" onClick={() => openModal({ type: 'xlsx' })}>
              <FileSpreadsheet size={16} style={{ marginTop: 2, color: '#107c41' }} />
              <div><div className="bold">WBS & Workload (Excel)</div><div className="small muted">Task Plan + Gantt, Resource Map harian, Ringkasan — .xlsx dengan rumus</div></div>
            </div>
            {type === 'project' && (
              <div style={{ padding: '8px 6px' }}>
                <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
                  {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <iframe title="Report preview" className="report-frame" srcDoc={html} sandbox="" />
        </div>
      </div>
    </>
  );
}
