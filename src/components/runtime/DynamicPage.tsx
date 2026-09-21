"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageDefinition, PageComponent, DatePreset } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { evaluatePageExpression, computeChartData, computeSeriesData, computeMetric, GlobalPageFilter, formatCompact, CHART_COLORS, globalFilterPredicate, resolveGlobalRange, isGlobalFilterActive, DEFAULT_FILTER_PRESETS } from "@/lib/engine/pageEngine";
import { DATE_PRESETS } from "@/lib/engine/reportEngine";
import { BarChart, LineChart, PieChart, GaugeChart, FunnelChart, Legend, ChartTable, ChartKind } from "./charts/Charts";
import { DynamicReport } from "./DynamicReport";
import { DynamicForm } from "./DynamicForm";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Table as TableIcon, BarChart3, Plus, ExternalLink, Filter, CalendarDays, X } from "lucide-react";

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
/** Human label of the active range, e.g. "Last 7 days · 15 Sep 2026 → 21 Sep 2026". */
export function describeGlobalFilter(gf: GlobalPageFilter): string {
  if (!isGlobalFilterActive(gf)) return "";
  const [from, to] = resolveGlobalRange(gf);
  const preset = DATE_PRESETS.find((p) => p.id === gf.datePreset)?.label;
  const range = from && to ? `${fmtDay(from)} → ${fmtDay(to)}` : from ? `from ${fmtDay(from)}` : to ? `until ${fmtDay(to)}` : "";
  return preset ? `${preset} · ${range}` : range;
}

/** Initial page filter: the first date-filter widget's default preset and per-form date fields. */
function initialFilter(page: PageDefinition): GlobalPageFilter {
  const fp = page.components.find((c) => c.type === "filter_panel");
  const p = fp?.props || {};
  return { datePreset: p.defaultPreset || "", dateFieldByForm: p.dateFields || {} };
}

const spanClass = (w?: number) => {
  const n = Math.max(1, Math.min(12, w || 12));
  return ({ 12: "lg:col-span-12", 6: "lg:col-span-6", 4: "lg:col-span-4", 3: "lg:col-span-3", 8: "lg:col-span-8", 9: "lg:col-span-9", 2: "lg:col-span-2", 5: "lg:col-span-5", 7: "lg:col-span-7", 10: "lg:col-span-10", 11: "lg:col-span-11", 1: "lg:col-span-1" } as Record<number, string>)[n];
};

/** Very small markdown → HTML (headings, bold, italic, lists, links, code). */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc(md)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^(?:- |\* )(.*)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "<br/><br/>").replace(/\n/g, "<br/>");
}

export const DynamicPage: React.FC<{ page: PageDefinition; embedded?: boolean }> = ({ page, embedded }) => {
  const { app, recordsMap, permissions } = useLiveApp();
  const router = useRouter();
  const [gf, setGf] = useState<GlobalPageFilter>(() => initialFilter(page));
  const filterActive = isGlobalFilterActive(gf);
  const filterLabel = describeGlobalFilter(gf);
  if (!app) return null;

  const drill = (formId: string, fieldId: string, label: string) => {
    const form = app.forms.find((f) => f.id === formId);
    const rep = app.reports.find((r) => r.sourceFormId === formId && r.reportType !== "ledger");
    if (!form) return;
    const params = new URLSearchParams();
    params.set("app", app.linkName);
    if (rep) params.set("report", rep.linkName); else params.set("form", form.linkName);
    params.set("q", label);
    router.push(`/app?${params.toString()}`);
  };

  const renderComponent = (comp: PageComponent): React.ReactNode => {
    const p = comp.props || {};
    switch (comp.type) {
      case "heading": {
        const title = evaluatePageExpression(p.title || "", app, recordsMap, gf);
        const subtitle = p.subtitle ? evaluatePageExpression(p.subtitle, app, recordsMap, gf) : "";
        return (
          <div className={`${p.plain ? "" : "bg-white p-5 rounded-xl border border-slate-200 shadow-3xs"} flex items-center justify-between gap-4`}>
            <div><h1 className={`${p.size === "lg" ? "text-2xl" : "text-xl"} font-bold text-slate-900 tracking-tight`}>{title}</h1>{subtitle && <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>}</div>
            {p.buttonLabel && p.buttonFormId && (() => { const f = app.forms.find((x) => x.id === p.buttonFormId); return f && permissions.form(f.id).create ? <Link href={getLiveAppUrl(app.linkName, { form: f.linkName, action: "new" })} className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-3.5 py-2 rounded-lg" style={{ background: app.settings?.accentColor || "#2563eb" }}><Plus className="w-3.5 h-3.5" />{p.buttonLabel}</Link> : null; })()}
          </div>
        );
      }
      case "text":
        return <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs text-xs text-slate-700 leading-relaxed whitespace-pre-line">{evaluatePageExpression(p.content || "", app, recordsMap, gf)}</div>;
      case "markdown":
        return <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs text-sm text-slate-700 leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-blue-600 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded" dangerouslySetInnerHTML={{ __html: renderMarkdown(evaluatePageExpression(p.content || "", app, recordsMap, gf)) }} />;
      case "divider":
        return <div className="flex items-center gap-3 py-1">{p.label && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{p.label}</span>}<div className="h-px flex-1 bg-slate-200" /></div>;
      case "image":
        return p.src ? <img src={p.src} alt={p.alt || ""} className="w-full rounded-xl border border-slate-200 object-cover" style={{ maxHeight: p.height || 260 }} /> : <div className="bg-slate-100 rounded-xl border border-dashed border-slate-300 h-40 flex items-center justify-center text-xs text-slate-400">No image URL</div>;
      case "iframe":
        return p.src ? <iframe src={p.src} title={p.title || "embed"} className="w-full rounded-xl border border-slate-200 bg-white" style={{ height: p.height || 400 }} /> : null;
      case "button": {
        const f = app.forms.find((x) => x.id === p.formId);
        const rep = app.reports.find((x) => x.id === p.reportId);
        const pg = app.pages.find((x) => x.id === p.pageId);
        const href = p.url || (f ? getLiveAppUrl(app.linkName, { form: f.linkName, action: p.action === "new" ? "new" : undefined, prefill: p.prefill }) : rep ? getLiveAppUrl(app.linkName, { report: rep.linkName }) : pg ? getLiveAppUrl(app.linkName, { page: pg.linkName }) : "#");
        return <Link href={href} target={p.url ? "_blank" : undefined} className={`inline-flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-xl transition-all ${p.variant === "outline" ? "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" : "text-white shadow-xs hover:opacity-90"}`} style={p.variant === "outline" ? undefined : { background: p.color || app.settings?.accentColor || "#2563eb" }}>{p.label || "Open"}<ArrowRight className="w-3.5 h-3.5" /></Link>;
      }
      case "quick_links": {
        const links: any[] = p.links || [];
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {links.map((l, i) => { const f = app.forms.find((x) => x.id === l.formId); if (f && !permissions.form(f.id).view) return null; const href = l.url || (f ? getLiveAppUrl(app.linkName, { form: f.linkName, action: l.action === "new" ? "new" : undefined }) : "#"); return <Link key={i} href={href} className="bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 hover:shadow-sm flex items-center gap-2.5 text-xs font-semibold text-slate-800"><span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">{l.action === "new" ? <Plus className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}</span>{l.label || f?.name}</Link>; })}
          </div>
        );
      }
      case "filter_panel": {
        const presets: DatePreset[] = Array.isArray(p.presets) && p.presets.length ? p.presets : DEFAULT_FILTER_PRESETS;
        const chips = DATE_PRESETS.filter((d) => presets.includes(d.id));
        const setPreset = (v: DatePreset | "") => setGf({ ...gf, datePreset: v, dateFrom: "", dateTo: "" });
        const custom = Boolean(gf.dateFrom || gf.dateTo);
        return (
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-3xs space-y-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-600 flex items-center gap-1.5 mr-1"><Filter className="w-3.5 h-3.5 text-blue-600" />{p.label || "Date range"}</span>
              {p.style === "dropdown" ? (
                <select value={gf.datePreset || ""} onChange={(e) => setPreset(e.target.value as DatePreset | "")} className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"><option value="">All time</option>{chips.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
              ) : (
                <div className="inline-flex flex-wrap gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button type="button" onClick={() => setPreset("")} className={`px-2.5 py-1 rounded-md font-medium ${!filterActive ? "bg-white shadow-3xs text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>All time</button>
                  {chips.map((d) => <button key={d.id} type="button" onClick={() => setPreset(d.id)} className={`px-2.5 py-1 rounded-md font-medium ${gf.datePreset === d.id ? "bg-white shadow-3xs text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>{d.label}</button>)}
                </div>
              )}
              {p.showCustom !== false && (
                <span className={`inline-flex items-center gap-1.5 ${custom ? "text-blue-700" : "text-slate-500"}`}>
                  <CalendarDays className="w-3.5 h-3.5" />
                  <input type="date" value={gf.dateFrom || ""} onChange={(e) => setGf({ ...gf, dateFrom: e.target.value, datePreset: "" })} className="border border-slate-300 rounded-lg px-2 py-1 bg-white" />
                  <span className="text-slate-400">to</span>
                  <input type="date" value={gf.dateTo || ""} onChange={(e) => setGf({ ...gf, dateTo: e.target.value, datePreset: "" })} className="border border-slate-300 rounded-lg px-2 py-1 bg-white" />
                </span>
              )}
              {filterActive && <button type="button" onClick={() => setPreset("")} className="text-rose-600 font-semibold inline-flex items-center gap-0.5 ml-auto"><X className="w-3 h-3" />Clear</button>}
            </div>
            {filterActive && <div className="text-[11px] text-slate-500">Showing <span className="font-semibold text-slate-800">{filterLabel}</span> in every KPI, chart and report on this page.</div>}
          </div>
        );
      }
      case "stat_card": {
        const stats: any[] = p.stats || [];
        return (
          <div className={`grid gap-4 ${stats.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : stats.length === 3 ? "grid-cols-1 sm:grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {stats.map((stat, idx) => {
              const metric = stat.metric ? computeMetric(stat.metric, app, recordsMap, gf) : null;
              const rawVal = metric ? metric.value : evaluatePageExpression(String(stat.value ?? ""), app, recordsMap, gf);
              const display = metric ? (stat.prefix || "") + (stat.compact ? formatCompact(metric.value) : metric.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })) + (stat.suffix || "") : rawVal;
              const change = metric?.changePct;
              const color = stat.color || CHART_COLORS[idx % CHART_COLORS.length];
              const form = stat.metric?.formId ? app.forms.find((f) => f.id === stat.metric.formId) : undefined;
              const rep = form && app.reports.find((r) => r.sourceFormId === form.id && r.reportType !== "ledger");
              const inner = (
                <>
                  <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">{evaluatePageExpression(stat.label || "", app, recordsMap, gf)}</span><span className="w-2 h-2 rounded-full" style={{ background: color }} /></div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1 truncate">{display}</div>
                  {change !== undefined && metric ? (
                    <div className={`text-[11px] mt-1 flex items-center gap-1 font-medium ${change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-500"}`}>
                      {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {Math.abs(change)}% <span className="text-slate-500 font-normal truncate">{metric.periodValue !== undefined ? `${metric.compareLabel} (${(stat.prefix || "") + (stat.compact ? formatCompact(metric.periodValue) : metric.periodValue.toLocaleString("en-IN", { maximumFractionDigits: 2 }))})` : metric.compareLabel}</span>
                    </div>
                  ) : stat.change ? <div className="text-[11px] text-slate-500 mt-1">{stat.change}</div> : filterActive ? <div className="text-[11px] text-slate-400 mt-1 truncate">{DATE_PRESETS.find((d) => d.id === gf.datePreset)?.label || "Custom range"}</div> : null}
                </>
              );
              return rep ? <Link key={idx} href={getLiveAppUrl(app.linkName, { report: rep.linkName })} className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs hover:border-blue-300 block">{inner}</Link> : <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs">{inner}</div>;
            })}
          </div>
        );
      }
      case "chart":
        return <ChartWidget comp={comp} gf={gf} onDrill={drill} />;
      case "report_embed": {
        const rep = app.reports.find((r) => r.id === p.reportId);
        const form = rep && app.forms.find((f) => f.id === rep.sourceFormId);
        if (!rep || !form) return <div className="bg-white p-6 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 text-center">Select a report for this widget.</div>;
        if (!permissions.report(rep.id).view) return null;
        const pred = p.ignoreDateFilter ? null : globalFilterPredicate(form, gf);
        return <DynamicReport report={{ ...rep, pageSize: p.pageSize || 8 }} form={form} embedded initialView={p.view} recordFilter={pred || undefined} filterNote={DATE_PRESETS.find((d) => d.id === gf.datePreset)?.label || "Custom range"} />;
      }
      case "form_embed": {
        const form = app.forms.find((f) => f.id === p.formId);
        if (!form) return <div className="bg-white p-6 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 text-center">Select a form for this widget.</div>;
        if (!permissions.form(form.id).create) return null;
        return <div className="bg-slate-50 rounded-xl border border-slate-200 p-4"><DynamicForm form={form} embedded hideHeader={p.hideHeader} onSuccess={() => { /* stay on page */ }} /></div>;
      }
      case "container":
        return (
          <div className={`${p.plain ? "" : "bg-white rounded-xl border border-slate-200 shadow-3xs p-4"} space-y-4`}>
            {p.title && <h3 className="text-sm font-semibold text-slate-900">{p.title}</h3>}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">{(comp.children || []).map((c) => <div key={c.id} className={spanClass(c.width)}>{renderComponent(c)}</div>)}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`${embedded ? "" : "max-w-7xl mx-auto"}`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {page.components.map((comp) => <div key={comp.id} className={spanClass(comp.width)}>{renderComponent(comp)}</div>)}
        {page.components.length === 0 && <div className="lg:col-span-12 bg-white p-12 rounded-xl border-2 border-dashed border-slate-300 text-center text-xs text-slate-400">This page has no widgets yet.</div>}
      </div>
    </div>
  );
};

const ChartWidget: React.FC<{ comp: PageComponent; gf: GlobalPageFilter; onDrill: (formId: string, fieldId: string, label: string) => void }> = ({ comp, gf, onDrill }) => {
  const { app, recordsMap } = useLiveApp();
  const [table, setTable] = useState(false);
  const p = comp.props || {};
  const kind: ChartKind = p.chartType || "bar";
  const single = useMemo(() => (app && p.formId ? computeChartData(p.formId, p.groupByFieldId || "createdAt", p.metric || "count", p.measureFieldId, app, recordsMap, { filters: p.filters, gf, sort: p.sort, limit: p.limit || (kind === "pie" || kind === "donut" ? 6 : 12), dateBucket: p.dateBucket }) : []), [app, p, recordsMap, gf, kind]);
  const multi = useMemo(() => (app && p.formId && p.seriesFieldId ? computeSeriesData(p.formId, p.groupByFieldId || "createdAt", p.seriesFieldId, p.metric || "count", p.measureFieldId, app, recordsMap, { filters: p.filters, gf, dateBucket: p.dateBucket }) : null), [app, p, recordsMap, gf]);
  if (!app) return null;
  const form = app.forms.find((f) => f.id === p.formId);
  const labels = multi ? multi.labels : single.map((d) => d.label);
  const series = multi ? multi.series : [{ name: p.seriesLabel || (p.metric === "count" || !p.metric ? "Count" : `${p.metric} of ${form?.fields.find((f) => f.id === p.measureFieldId)?.label || ""}`), color: p.color || CHART_COLORS[0], points: single.map((d) => ({ label: d.label, value: d.value })) }];
  const drillFn = p.drilldown !== false && form ? (label: string) => onDrill(form.id, p.groupByFieldId, label) : undefined;
  const empty = labels.length === 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-3xs p-4 space-y-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-slate-400" />{p.title || form?.name || "Chart"}</h3>{p.subtitle && <p className="text-[11px] text-slate-500">{p.subtitle}</p>}</div>
        <button type="button" onClick={() => setTable((t) => !t)} className={`p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 ${table ? "bg-slate-100 text-slate-700" : ""}`} title="Toggle table view"><TableIcon className="w-3.5 h-3.5" /></button>
      </div>
      {!form ? <div className="text-xs text-slate-400 text-center py-10">Select a form and group-by field.</div> : empty ? <div className="text-xs text-slate-400 text-center py-10">No data yet.</div> : table ? <ChartTable labels={labels} series={series} /> : (
        <>
          {(kind === "bar" || kind === "column" || kind === "stacked") && <BarChart labels={labels} series={series} horizontal={kind === "bar"} stacked={kind === "stacked"} height={p.height || 260} onClickLabel={drillFn} />}
          {(kind === "line" || kind === "area") && <LineChart labels={labels} series={series} area={kind === "area"} height={p.height || 260} />}
          {(kind === "pie" || kind === "donut") && <PieChart data={single} donut={kind === "donut"} onClickLabel={drillFn} />}
          {kind === "funnel" && <FunnelChart data={single} onClickLabel={drillFn} />}
          {kind === "gauge" && <GaugeChart value={single.reduce((s, d) => s + d.value, 0)} max={Number(p.gaugeMax) || Math.max(1, single.reduce((s, d) => s + d.value, 0))} label={p.gaugeLabel} color={p.color} />}
          {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
        </>
      )}
    </div>
  );
};
