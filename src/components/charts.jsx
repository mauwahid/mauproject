import React, { useState, useRef, useEffect } from 'react';

/**
 * Stacked bar chart with optional reference line series (e.g. capacity).
 * series: [{ key, label, color }] stacked; line: { key, label, color }
 */
export function StackedBars({ data, series, line, height = 220, format = (v) => Math.round(v), labelKey = 'label' }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [cw, setCw] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setCw(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(cw, data.length * 46 + 60);
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const max = Math.max(1, ...data.map((d) => Math.max(series.reduce((s, x) => s + (d[x.key] || 0), 0), line ? d[line.key] || 0 : 0))) * 1.1;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = Math.min(30, (iw / Math.max(data.length, 1)) * 0.6);
  const x = (i) => pad.l + (iw / data.length) * (i + 0.5);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = 4;

  return (
    <div className="chart-wrap" ref={wrapRef} style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {[...Array(ticks + 1)].map((_, i) => {
          const v = (max / ticks) * i;
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#eef0f4" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{format(v)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x(i) - (iw / data.length) / 2} y={pad.t} width={iw / data.length} height={ih} fill={hover === i ? '#f5f6fa' : 'transparent'} />
              {series.map((s) => {
                const v = d[s.key] || 0;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                return <rect key={s.key} x={x(i) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={s.color} rx="2" />;
              })}
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="#6b7280">{d[labelKey]}</text>
            </g>
          );
        })}
        {line && (
          <>
            <polyline fill="none" stroke={line.color} strokeWidth="2" strokeDasharray="5 4"
              points={data.map((d, i) => `${x(i) - bw / 2 - 4},${y(d[line.key] || 0)} ${x(i) + bw / 2 + 4},${y(d[line.key] || 0)}`).join(' ')} />
          </>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div style={{
          position: 'absolute', top: 6, left: `${Math.min(80, (x(hover) / W) * 100)}%`, background: '#111827', color: '#fff',
          borderRadius: 8, padding: '8px 10px', fontSize: 11.5, pointerEvents: 'none', boxShadow: 'var(--shadow-lg)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{data[hover][labelKey]}</div>
          {series.map((s) => <div key={s.key}><i style={{ display: 'inline-block', width: 8, height: 8, background: s.color, borderRadius: 2, marginRight: 6 }} />{s.label}: {format(data[hover][s.key] || 0)}</div>)}
          {line && <div><i style={{ display: 'inline-block', width: 8, height: 2, background: line.color, marginRight: 6, verticalAlign: 'middle' }} />{line.label}: {format(data[hover][line.key] || 0)}</div>}
        </div>
      )}
    </div>
  );
}

export function Donut({ segments, size = 140, thickness = 18, center }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f3f7" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        off += len;
        return el;
      })}
      {center && (
        <>
          <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="700" fill="#111827">{center.value}</text>
          <text x="50%" y="62%" textAnchor="middle" fontSize="10.5" fill="#6b7280">{center.label}</text>
        </>
      )}
    </svg>
  );
}

/** Horizontal utilization bar list */
export function UtilBars({ rows }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {rows.map((r) => {
        const pct = Math.round(r.value * 100);
        const color = r.value > 1 ? '#dc2626' : r.value > 0.85 ? '#f59e0b' : r.value > 0.5 ? '#16a34a' : '#3b82f6';
        return (
          <div key={r.key} className="row">
            <div style={{ width: 150 }} className="ellipsis small">{r.label}</div>
            <div className="grow" style={{ position: 'relative', height: 10, background: '#eef0f4', borderRadius: 99 }}>
              <div style={{ width: `${Math.min(100, pct / 1.5)}%`, height: '100%', background: color, borderRadius: 99 }} />
              <div style={{ position: 'absolute', left: `${100 / 1.5}%`, top: -3, bottom: -3, borderLeft: '1.5px dashed #9ca3af' }} />
            </div>
            <div style={{ width: 44, textAlign: 'right', color, fontWeight: 650 }} className="small">{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}
