"use client";

import React, { useMemo, useState } from "react";
import { ChartDataPoint, ChartSeries, formatCompact } from "@/lib/engine/pageEngine";

/**
 * Inline-SVG charts following the dataviz mark specs:
 * bars ≤24px with 4px rounded data-end, 2px lines, ≥8px markers with a surface ring,
 * hairline recessive grid, legend for ≥2 series, hover tooltip, optional table view.
 */

export type ChartKind = "bar" | "column" | "line" | "area" | "pie" | "donut" | "stacked" | "gauge" | "funnel";

const SURFACE = "#ffffff";
const GRID = "#e2e8f0";
const TEXT = "#334155";
const MUTED = "#94a3b8";

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const Tooltip: React.FC<{ x: number; y: number; title: string; rows: Array<{ label: string; value: string; color?: string }> }> = ({ x, y, title, rows }) => (
  <div className="pointer-events-none absolute z-20 bg-slate-900 text-white text-[11px] rounded-lg px-2.5 py-2 shadow-xl min-w-[120px]" style={{ left: x + 12, top: y - 8, transform: "translateY(-100%)" }}>
    <div className="font-semibold mb-1">{title}</div>
    {rows.map((r, i) => (
      <div key={i} className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-white/80">{r.color && <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />}{r.label}</span>
        <span className="font-semibold tabular-nums">{r.value}</span>
      </div>
    ))}
  </div>
);

export const Legend: React.FC<{ items: Array<{ label: string; color: string }> }> = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 px-1">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: it.color }} />{it.label}</span>
    ))}
  </div>
);

export const ChartTable: React.FC<{ labels: string[]; series: ChartSeries[] }> = ({ labels, series }) => (
  <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="text-slate-500"><tr><th className="text-left py-1 pr-3">Label</th>{series.map((s) => <th key={s.name} className="text-right py-1 pr-3">{s.name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{labels.map((l, i) => <tr key={l}><td className="py-1 pr-3 text-slate-700">{l}</td>{series.map((s) => <td key={s.name} className="py-1 pr-3 text-right tabular-nums text-slate-900">{s.points[i]?.value.toLocaleString("en-IN")}</td>)}</tr>)}</tbody></table></div>
);

// ── Bars / columns / stacked ─────────────────────────────────────────────────

export const BarChart: React.FC<{ labels: string[]; series: ChartSeries[]; horizontal?: boolean; stacked?: boolean; height?: number; onClickLabel?: (label: string) => void; valueFormat?: (n: number) => string }> = ({ labels, series, horizontal, stacked, height = 260, onClickLabel, valueFormat = formatCompact }) => {
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  const W = 640, H = height, padL = horizontal ? 110 : 44, padR = 16, padT = 12, padB = horizontal ? 24 : 36;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxVal = useMemo(() => Math.max(1, ...labels.map((_, i) => (stacked ? series.reduce((s, sr) => s + (sr.points[i]?.value || 0), 0) : Math.max(...series.map((sr) => sr.points[i]?.value || 0))))), [labels, series, stacked]);
  const ticks = niceTicks(maxVal);
  const scaleMax = ticks[ticks.length - 1] || maxVal;
  const n = labels.length || 1;
  const band = (horizontal ? ih : iw) / n;
  const groups = stacked ? 1 : series.length;
  const thick = Math.min(24, (band * 0.7) / groups);
  const gap = 2;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {ticks.map((t) => {
          const pos = horizontal ? padL + (t / scaleMax) * iw : padT + ih - (t / scaleMax) * ih;
          return horizontal ? (
            <g key={t}><line x1={pos} x2={pos} y1={padT} y2={padT + ih} stroke={GRID} strokeWidth={1} /><text x={pos} y={H - 8} fontSize={10} textAnchor="middle" fill={MUTED}>{valueFormat(t)}</text></g>
          ) : (
            <g key={t}><line x1={padL} x2={W - padR} y1={pos} y2={pos} stroke={GRID} strokeWidth={1} /><text x={padL - 6} y={pos + 3.5} fontSize={10} textAnchor="end" fill={MUTED}>{valueFormat(t)}</text></g>
          );
        })}
        {labels.map((label, i) => {
          let acc = 0;
          const centre = (horizontal ? padT : padL) + band * i + band / 2;
          return (
            <g key={label} onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, i }); }} onMouseLeave={() => setHover(null)} onClick={() => onClickLabel?.(label)} style={{ cursor: onClickLabel ? "pointer" : "default" }}>
              <rect x={horizontal ? padL : padL + band * i} y={horizontal ? padT + band * i : padT} width={horizontal ? iw : band} height={horizontal ? band : ih} fill="transparent" />
              {series.map((sr, si) => {
                const v = sr.points[i]?.value || 0;
                const len = (v / scaleMax) * (horizontal ? iw : ih);
                const offset = stacked ? centre - thick / 2 : centre - (thick * groups) / 2 + si * thick + (si ? gap : 0) * 0;
                const start = stacked ? acc : 0;
                acc += len;
                if (len <= 0) return null;
                const isLast = !stacked || si === series.length - 1;
                const r = isLast ? 4 : 0;
                const g = stacked && si > 0 ? gap : 0;
                if (horizontal) {
                  const x = padL + start + g, w = Math.max(0, len - g), y = offset, h = thick;
                  const path = `M${x},${y} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h - r} a${r},${r} 0 0 1 -${r},${r} H${x} Z`;
                  return <path key={sr.name} d={path} fill={sr.color} />;
                }
                const x = offset, w = thick, y = padT + ih - start - len + g, h = Math.max(0, len - g);
                const path = `M${x},${y + h} V${y + r} a${r},${r} 0 0 1 ${r},-${r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h} Z`;
                return <path key={sr.name} d={path} fill={sr.color} />;
              })}
              {horizontal ? (
                <text x={padL - 8} y={centre + 3.5} fontSize={10.5} textAnchor="end" fill={TEXT}>{label.length > 16 ? label.slice(0, 15) + "…" : label}</text>
              ) : (
                <text x={centre} y={H - 12} fontSize={10.5} textAnchor="middle" fill={TEXT}>{label.length > 10 ? label.slice(0, 9) + "…" : label}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={horizontal ? padL : W - padR} y1={horizontal ? padT : padT + ih} y2={padT + ih} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      {hover && <Tooltip x={hover.x} y={hover.y} title={labels[hover.i]} rows={series.map((s) => ({ label: s.name, value: (s.points[hover.i]?.value || 0).toLocaleString("en-IN"), color: s.color }))} />}
    </div>
  );
};

// ── Line / area ──────────────────────────────────────────────────────────────

export const LineChart: React.FC<{ labels: string[]; series: ChartSeries[]; area?: boolean; height?: number; valueFormat?: (n: number) => string }> = ({ labels, series, area, height = 260, valueFormat = formatCompact }) => {
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  const W = 640, H = height, padL = 44, padR = 16, padT = 12, padB = 32;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = niceTicks(maxVal);
  const scaleMax = ticks[ticks.length - 1] || maxVal;
  const n = Math.max(1, labels.length - 1);
  const xs = (i: number) => padL + (labels.length === 1 ? iw / 2 : (i / n) * iw);
  const ys = (v: number) => padT + ih - (v / scaleMax) * ih;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - padL) / iw) * n))); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, i }); }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={ys(t)} y2={ys(t)} stroke={GRID} strokeWidth={1} /><text x={padL - 6} y={ys(t) + 3.5} fontSize={10} textAnchor="end" fill={MUTED}>{valueFormat(t)}</text></g>)}
        {labels.map((l, i) => (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) && <text key={l} x={xs(i)} y={H - 10} fontSize={10.5} textAnchor="middle" fill={TEXT}>{l.length > 10 ? l.slice(0, 9) + "…" : l}</text>)}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${xs(i)},${ys(p.value)}`).join(" ");
          return (
            <g key={s.name}>
              {area && <path d={`${d} L${xs(s.points.length - 1)},${padT + ih} L${xs(0)},${padT + ih} Z`} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (hover?.i === i || s.points.length <= 20) && <circle key={i} cx={xs(i)} cy={ys(p.value)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />)}
            </g>
          );
        })}
        {hover && <line x1={xs(hover.i)} x2={xs(hover.i)} y1={padT} y2={padT + ih} stroke="#94a3b8" strokeWidth={1} />}
      </svg>
      {hover && <Tooltip x={hover.x} y={hover.y} title={labels[hover.i]} rows={series.map((s) => ({ label: s.name, value: (s.points[hover.i]?.value || 0).toLocaleString("en-IN"), color: s.color }))} />}
    </div>
  );
};

// ── Pie / donut ──────────────────────────────────────────────────────────────

export const PieChart: React.FC<{ data: ChartDataPoint[]; donut?: boolean; size?: number; onClickLabel?: (label: string) => void; centerLabel?: string }> = ({ data, donut, size = 220, onClickLabel, centerLabel }) => {
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = size / 2 - 4, cx = size / 2, cy = size / 2, inner = donut ? R * 0.6 : 0;
  const arcs = data.reduce<Array<{ d: ChartDataPoint; a0: number; a1: number }>>((acc, d) => { const a0 = acc.length ? acc[acc.length - 1].a1 : -Math.PI / 2; acc.push({ d, a0, a1: a0 + (d.value / total) * Math.PI * 2 }); return acc; }, []);
  const pt = (a: number, r: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  return (
    <div className="relative flex items-center gap-5 flex-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
        {arcs.map(({ d, a0, a1 }, i) => {
          if (a1 - a0 <= 0) return null;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [ix0, iy0] = pt(a0, inner), [ix1, iy1] = pt(a1, inner);
          const path = donut ? `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${ix1},${iy1} A${inner},${inner} 0 ${large} 0 ${ix0},${iy0} Z` : `M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`;
          return <path key={d.label} d={path} fill={d.color} stroke={SURFACE} strokeWidth={2} onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, i }); }} onMouseLeave={() => setHover(null)} onClick={() => onClickLabel?.(d.label)} style={{ cursor: onClickLabel ? "pointer" : "default", opacity: hover && hover.i !== i ? 0.7 : 1 }} />;
        })}
        {donut && <text x={cx} y={cy + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={TEXT}>{centerLabel ?? formatCompact(total)}</text>}
      </svg>
      <div className="space-y-1 text-[11px] min-w-[140px]">
        {data.map((d) => <div key={d.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-slate-600 truncate"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />{d.label}</span><span className="font-semibold text-slate-900 tabular-nums">{d.percentage}%</span></div>)}
      </div>
      {hover && <Tooltip x={hover.x} y={hover.y} title={data[hover.i].label} rows={[{ label: "Value", value: data[hover.i].value.toLocaleString("en-IN") }, { label: "Share", value: `${data[hover.i].percentage}%` }]} />}
    </div>
  );
};

// ── Gauge / funnel ───────────────────────────────────────────────────────────

export const GaugeChart: React.FC<{ value: number; max: number; label?: string; color?: string }> = ({ value, max, label, color = "#2a78d6" }) => {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const R = 80, cx = 100, cy = 95;
  const arc = (p: number) => { const a = Math.PI + p * Math.PI; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  const [ex, ey] = arc(pct);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[260px]">
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} fill="none" stroke={GRID} strokeWidth={14} strokeLinecap="round" />
        {pct > 0 && <path d={`M${cx - R},${cy} A${R},${R} 0 ${pct > 0.5 ? 1 : 0} 1 ${ex},${ey}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />}
        <text x={cx} y={cy - 8} fontSize={22} fontWeight={700} textAnchor="middle" fill={TEXT}>{formatCompact(value)}</text>
        <text x={cx} y={cy + 8} fontSize={10} textAnchor="middle" fill={MUTED}>of {formatCompact(max)} ({Math.round(pct * 100)}%)</text>
      </svg>
      {label && <div className="text-[11px] text-slate-500">{label}</div>}
    </div>
  );
};

export const FunnelChart: React.FC<{ data: ChartDataPoint[]; onClickLabel?: (l: string) => void }> = ({ data, onClickLabel }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3 text-[11px]" onClick={() => onClickLabel?.(d.label)} style={{ cursor: onClickLabel ? "pointer" : "default" }}>
          <span className="w-28 truncate text-slate-600 text-right">{d.label}</span>
          <div className="flex-1 flex justify-center"><div className="h-6 rounded-md transition-all" style={{ width: `${Math.max(6, (d.value / max) * 100)}%`, background: d.color }} /></div>
          <span className="w-20 tabular-nums font-semibold text-slate-900">{d.value.toLocaleString("en-IN")}{i > 0 && data[0].value ? <span className="text-slate-400 font-normal"> · {Math.round((d.value / data[0].value) * 100)}%</span> : null}</span>
        </div>
      ))}
    </div>
  );
};
