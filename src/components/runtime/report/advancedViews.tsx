"use client";

import React, { useMemo, useState } from "react";
import { FieldDefinition, RecordDefinition, FormDefinition } from "@/types/schema";
import { aggregateValues, getRawValue, toNumber } from "@/lib/engine/reportEngine";
import { CHART_COLORS, ChartDataPoint, ChartSeries, formatCompact } from "@/lib/engine/pageEngine";
import { BarChart, LineChart, PieChart, FunnelChart, ChartTable, Legend } from "../charts/Charts";
import { IconButton } from "@/components/ui/Button";
import { CommonProps, formatAgg, isNumericField } from "./views";
import { RowActionsMenu } from "./RowActionsMenu";
import { ChevronRight, ChevronLeft, ChevronDown, CalendarDays, AlertTriangle, Check, Trophy, Table as TableIcon } from "lucide-react";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDate = (v: any): Date | null => { if (!v) return null; const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v); return isNaN(d.getTime()) ? null : d; };
const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtNum = (form: FormDefinition, fieldId: string | undefined, v: number) => (fieldId ? formatAgg(form, fieldId, v) : v.toLocaleString("en-IN"));
const firstField = (form: FormDefinition, types: string[]) => form.fields.find((f) => types.includes(f.type));
const titleOf = (form: FormDefinition, pref?: string) => pref || form.titleFieldId || form.fields.find((f) => !["section", "subform"].includes(f.type))?.id;

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="p-10 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-xl m-5">{text}</div>;

const Badge: React.FC<{ field?: FieldDefinition; value: string }> = ({ field, value }) => {
  if (!value) return null;
  const color = field?.optionColors?.[value];
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={color ? { background: color, color: "#fff" } : { background: "#f1f5f9", color: "#334155" }}>{value}</span>;
};

// ── List (mobile-style rows) ─────────────────────────────────────────────────

export const ListView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const cfg = report.list || {};
  const titleId = titleOf(form, cfg.titleFieldId);
  const subtitleId = cfg.subtitleFieldId || form.fields.find((f) => !["section", "subform"].includes(f.type) && f.id !== titleId)?.id;
  const badgeField = form.fields.find((f) => f.id === cfg.badgeFieldId) || firstField(form, ["dropdown", "radio"]);
  const metaIds = cfg.metaFieldIds?.length ? cfg.metaFieldIds : form.fields.filter((f) => ["currency", "number", "date", "datetime"].includes(f.type)).slice(0, 2).map((f) => f.id);
  if (!records.length) return <Empty text="No records." />;
  return (
    <div className="divide-y divide-slate-100">
      {records.map((rec) => {
        const img = cfg.avatarFieldId ? rec.data?.[cfg.avatarFieldId]?.url : undefined;
        const title = titleId ? displayValue(rec, titleId) || rec.id : rec.id;
        return (
          <div key={rec.id} onClick={() => actions.onOpen(rec)} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 cursor-pointer group">
            {img ? <img src={img} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" /> : <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center shrink-0">{title.slice(0, 1).toUpperCase()}</div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900 truncate">{title}</span>{badgeField && <Badge field={badgeField} value={displayValue(rec, badgeField.id)} />}</div>
              {subtitleId && <div className="text-xs text-slate-500 truncate">{displayValue(rec, subtitleId)}</div>}
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              {metaIds.map((id) => <div key={id} className={`text-xs ${isNumericField(form, id) ? "font-semibold text-slate-900 tabular-nums" : "text-slate-500"}`}>{displayValue(rec, id) || "—"}</div>)}
            </div>
            <RowActionsMenu rec={rec} actions={actions} perms={perms} className="opacity-60 group-hover:opacity-100" />
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </div>
        );
      })}
    </div>
  );
};

// ── Hierarchy / tree ─────────────────────────────────────────────────────────

export const TreeView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const parentField = form.fields.find((f) => f.id === report.tree?.parentFieldId) || form.fields.find((f) => f.type === "lookup" && f.lookup?.targetFormId === form.id);
  const titleId = titleOf(form, report.tree?.titleFieldId);
  const detailIds = report.tree?.detailFieldIds || [];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { roots, children } = useMemo(() => {
    const ids = new Set(records.map((r) => r.id));
    const children = new Map<string, RecordDefinition[]>();
    const roots: RecordDefinition[] = [];
    for (const r of records) {
      const raw = parentField ? r.data?.[parentField.id] : undefined;
      const pid = Array.isArray(raw) ? raw[0] : raw;
      if (pid && ids.has(pid) && pid !== r.id) children.set(pid, [...(children.get(pid) || []), r]);
      else roots.push(r);
    }
    return { roots, children };
  }, [records, parentField]);
  if (!parentField) return <Empty text="Configure a parent lookup (pointing to this same form) for the hierarchy view." />;
  const countDesc = (id: string): number => (children.get(id) || []).reduce((s, c) => s + 1 + countDesc(c.id), 0);
  const Node: React.FC<{ rec: RecordDefinition; depth: number }> = ({ rec, depth }) => {
    const kids = children.get(rec.id) || [];
    const isCol = collapsed[rec.id];
    return (
      <>
        <div className="flex items-center gap-1.5 py-1.5 pr-3 hover:bg-blue-50/50 rounded-lg group" style={{ paddingLeft: 8 + depth * 22 }}>
          <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [rec.id]: !c[rec.id] }))} className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 ${kids.length ? "" : "invisible"}`}>{isCol ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
          <button type="button" onClick={() => actions.onOpen(rec)} className="text-xs font-semibold text-slate-900 hover:text-blue-700 text-left truncate">{titleId ? displayValue(rec, titleId) || rec.id : rec.id}</button>
          {kids.length > 0 && <span className="text-[10px] px-1.5 py-px rounded-full bg-slate-100 text-slate-500 font-semibold">{countDesc(rec.id)}</span>}
          <RowActionsMenu rec={rec} actions={actions} perms={perms} size="xs" hover />
          <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">{detailIds.map((id) => <span key={id}><span className="text-slate-400">{form.fields.find((f) => f.id === id)?.label}:</span> <span className="text-slate-800 font-medium">{displayValue(rec, id) || "—"}</span></span>)}</span>
        </div>
        {!isCol && kids.map((k) => <Node key={k.id} rec={k} depth={depth + 1} />)}
      </>
    );
  };
  if (!records.length) return <Empty text="No records." />;
  return (
    <div className="p-3">
      <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-slate-500"><span>{roots.length} top-level · {records.length} total</span><span className="flex gap-2"><button type="button" className="text-blue-600 font-semibold" onClick={() => setCollapsed({})}>Expand all</button><button type="button" className="text-slate-500" onClick={() => setCollapsed(Object.fromEntries(records.map((r) => [r.id, true])))}>Collapse all</button></span></div>
      {roots.map((r) => <Node key={r.id} rec={r} depth={0} />)}
    </div>
  );
};

// ── Checklist ────────────────────────────────────────────────────────────────

export const ChecklistView: React.FC<CommonProps & { onToggle?: (rec: RecordDefinition, done: boolean) => void }> = ({ report, form, records, displayValue, actions, perms, onToggle }) => {
  const doneField = form.fields.find((f) => f.id === report.checklist?.doneFieldId) || firstField(form, ["checkbox"]);
  const titleId = titleOf(form, report.checklist?.titleFieldId);
  const dueField = form.fields.find((f) => f.id === report.checklist?.dueFieldId) || firstField(form, ["date", "datetime"]);
  const assigneeId = report.checklist?.assigneeFieldId;
  const [showDone, setShowDone] = useState(!report.checklist?.hideDone);
  if (!doneField) return <Empty text="Add a checkbox field (e.g. Done) and pick it in the report's view config." />;
  const today = startOfDay(new Date());
  const enriched = records.map((r) => { const d = dueField ? parseDate(r.data?.[dueField.id]) : null; return { r, done: Boolean(r.data?.[doneField.id]), due: d, days: d ? dayDiff(startOfDay(d), today) : null }; });
  const pending = enriched.filter((e) => !e.done).sort((a, b) => (a.days ?? 9e9) - (b.days ?? 9e9));
  const done = enriched.filter((e) => e.done);
  const section = (label: string, items: typeof enriched, tone: string) => items.length > 0 && (
    <div key={label}>
      <div className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>{label} · {items.length}</div>
      {items.map(({ r, done, days, due }) => (
        <div key={r.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50 ${done ? "opacity-60" : ""}`}>
          <button type="button" disabled={!perms.edit || !onToggle} onClick={() => onToggle?.(r, !done)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-blue-500"}`}>{done && <Check className="w-3.5 h-3.5" />}</button>
          <button type="button" onClick={() => actions.onOpen(r)} className={`flex-1 text-left text-xs font-medium truncate ${done ? "line-through text-slate-500" : "text-slate-900"}`}>{titleId ? displayValue(r, titleId) || r.id : r.id}</button>
          {assigneeId && <span className="text-[11px] text-slate-500 truncate max-w-[140px]">{displayValue(r, assigneeId)}</span>}
          <RowActionsMenu rec={r} actions={actions} perms={perms} size="xs" />
          {due && <span className={`text-[11px] flex items-center gap-1 shrink-0 ${!done && days !== null && days < 0 ? "text-rose-600 font-semibold" : days === 0 ? "text-amber-600 font-semibold" : "text-slate-500"}`}>{!done && days !== null && days < 0 ? <AlertTriangle className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}{days === 0 ? "Today" : days === 1 ? "Tomorrow" : days !== null && days < 0 ? `${-days}d overdue` : iso(due)}</span>}
        </div>
      ))}
    </div>
  );
  return (
    <div>
      {section("Overdue", pending.filter((e) => e.days !== null && e.days < 0), "text-rose-600 bg-rose-50/60")}
      {section("Today", pending.filter((e) => e.days === 0), "text-amber-700 bg-amber-50/60")}
      {section("Upcoming", pending.filter((e) => e.days !== null && e.days > 0), "text-blue-700 bg-blue-50/60")}
      {section("No date", pending.filter((e) => e.days === null), "text-slate-500 bg-slate-50")}
      {pending.length === 0 && <div className="p-8 text-center text-xs text-emerald-700 font-semibold flex items-center justify-center gap-2"><Check className="w-4 h-4" /> All done!</div>}
      {done.length > 0 && <button type="button" onClick={() => setShowDone((s) => !s)} className="w-full px-4 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 text-left flex items-center gap-1">{showDone ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Completed ({done.length})</button>}
      {showDone && section("Completed", done, "text-emerald-700 bg-emerald-50/60")}
    </div>
  );
};

// ── Funnel ───────────────────────────────────────────────────────────────────

export const FunnelView: React.FC<CommonProps> = ({ report, form, records, displayValue }) => {
  const stageField = form.fields.find((f) => f.id === report.funnel?.stageFieldId) || firstField(form, ["dropdown", "radio"]);
  const valueId = report.funnel?.valueFieldId;
  if (!stageField) return <Empty text="Configure a stage (dropdown) field for the funnel." />;
  const stages = stageField.options?.length ? stageField.options : Array.from(new Set(records.map((r) => displayValue(r, stageField.id)))).filter(Boolean);
  const data: ChartDataPoint[] = stages.map((s, i) => { const recs = records.filter((r) => displayValue(r, stageField.id) === s); const value = valueId ? aggregateValues(recs.map((r) => getRawValue(r, valueId, form)), "sum") : recs.length; return { label: s, value, percentage: 0, color: stageField.optionColors?.[s] || CHART_COLORS[i % CHART_COLORS.length] }; });
  const first = data[0]?.value || 0;
  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3"><FunnelChart data={data} /></div>
      <div className="lg:col-span-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200"><tr><th className="text-left py-1.5">Stage</th><th className="text-right py-1.5">{valueId ? form.fields.find((f) => f.id === valueId)?.label : "Count"}</th><th className="text-right py-1.5">Of first</th><th className="text-right py-1.5">Step</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((d, i) => <tr key={d.label}><td className="py-1.5 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />{d.label}</td><td className="py-1.5 text-right tabular-nums font-semibold">{fmtNum(form, valueId, d.value)}</td><td className="py-1.5 text-right tabular-nums text-slate-500">{first ? Math.round((d.value / first) * 100) : 0}%</td><td className="py-1.5 text-right tabular-nums text-slate-500">{i > 0 && data[i - 1].value ? Math.round((d.value / data[i - 1].value) * 100) : i === 0 ? 100 : 0}%</td></tr>)}
          </tbody>
        </table>
        {report.funnel?.wonStages?.length ? <div className="mt-3 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-emerald-800">Conversion to {report.funnel.wonStages.join("/")}: <strong>{first ? Math.round((data.filter((d) => report.funnel!.wonStages!.includes(d.label)).reduce((s, d) => s + d.value, 0) / first) * 100) : 0}%</strong></div> : null}
      </div>
    </div>
  );
};

// ── Scheduler (resources × days) ─────────────────────────────────────────────

export const SchedulerView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const cfg = report.scheduler;
  const resField = form.fields.find((f) => f.id === cfg?.resourceFieldId) || firstField(form, ["lookup", "dropdown", "users"]);
  const dateField = form.fields.find((f) => f.id === cfg?.dateFieldId) || firstField(form, ["date", "datetime"]);
  const endField = form.fields.find((f) => f.id === cfg?.endDateFieldId);
  const titleId = titleOf(form, cfg?.titleFieldId);
  const [mode, setMode] = useState<"week" | "month">(cfg?.mode || "week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  if (!resField || !dateField) return <Empty text="Scheduler needs a resource field (room, staff, machine) and a date field." />;
  const days: Date[] = [];
  if (mode === "week") { const s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay()); for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); days.push(d); } }
  else { const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(); for (let i = 1; i <= n; i++) days.push(new Date(cursor.getFullYear(), cursor.getMonth(), i)); }
  const resources = resField.options?.length ? resField.options : Array.from(new Set(records.map((r) => displayValue(r, resField.id)).filter(Boolean))).sort();
  const todayKey = iso(new Date());
  const items = records.map((r) => { const s = parseDate(r.data?.[dateField.id]); const e = endField ? parseDate(r.data?.[endField.id]) : null; return { r, res: displayValue(r, resField.id), s: s ? startOfDay(s) : null, e: e ? startOfDay(e) : s ? startOfDay(s) : null }; }).filter((x) => x.s);
  const cell = (res: string, d: Date) => items.filter((x) => x.res === res && x.s! <= d && x.e! >= d);
  const shift = (n: number) => { const d = new Date(cursor); if (mode === "week") d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n); setCursor(d); };
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1"><IconButton onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></IconButton><IconButton onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></IconButton><button type="button" onClick={() => setCursor(startOfDay(new Date()))} className="text-[11px] font-semibold text-blue-600 px-2">Today</button></div>
        <h3 className="text-sm font-bold text-slate-900">{mode === "week" ? `${iso(days[0])} → ${iso(days[days.length - 1])}` : cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}</h3>
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-[11px]">{(["week", "month"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-md capitalize ${mode === m ? "bg-white shadow-3xs text-blue-700 font-semibold" : "text-slate-500"}`}>{m}</button>)}</div>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="border-collapse text-[11px] min-w-full">
          <thead><tr className="bg-slate-50"><th className="sticky left-0 bg-slate-50 z-[2] text-left px-3 py-2 border-b border-r border-slate-200 min-w-[160px]">{resField.label}</th>{days.map((d) => { const k = iso(d); return <th key={k} style={{ minWidth: mode === "week" ? 120 : 40 }} className={`px-1 py-2 border-b border-slate-200 text-center font-semibold ${k === todayKey ? "bg-blue-50 text-blue-700" : d.getDay() === 0 ? "text-rose-500" : "text-slate-600"}`}><div>{d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, mode === "week" ? 3 : 1)}</div><div className="text-[10px] font-normal">{d.getDate()}</div></th>; })}</tr></thead>
          <tbody>
            {resources.map((res) => (
              <tr key={res} className="border-b border-slate-100">
                <td className="sticky left-0 bg-white z-[1] px-3 py-2 border-r border-slate-200 font-semibold text-slate-800 whitespace-nowrap">{res}</td>
                {days.map((d) => { const k = iso(d); const list = cell(res, d); return (
                  <td key={k} className={`align-top p-0.5 border-r border-slate-100 ${k === todayKey ? "bg-blue-50/40" : ""} ${list.length ? "" : "hover:bg-slate-50"}`} style={{ minWidth: mode === "week" ? 120 : 40, height: 44 }}>
                    <div className="space-y-0.5">{list.slice(0, mode === "week" ? 4 : 2).map((x) => <div key={x.r.id} className="flex items-center gap-0.5 group"><button type="button" onClick={() => actions.onOpen(x.r)} title={titleId ? displayValue(x.r, titleId) : x.r.id} className="block flex-1 min-w-0 text-left px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-200 truncate hover:bg-indigo-200">{mode === "week" ? (titleId ? displayValue(x.r, titleId) || "•" : "•") : "•"}</button>{mode === "week" && <RowActionsMenu rec={x.r} actions={actions} perms={perms} size="xs" hover />}</div>)}{list.length > (mode === "week" ? 4 : 2) && <div className="text-[10px] text-slate-400 pl-1">+{list.length - (mode === "week" ? 4 : 2)}</div>}</div>
                  </td>); })}
              </tr>
            ))}
            {resources.length === 0 && <tr><td colSpan={days.length + 1} className="p-8 text-center text-slate-400">No resources found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Gantt ────────────────────────────────────────────────────────────────────

export const GanttView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions }) => {
  const cfg = report.gantt;
  const dateFields = form.fields.filter((f) => f.type === "date" || f.type === "datetime");
  const startField = form.fields.find((f) => f.id === cfg?.startFieldId) || dateFields[0];
  const endField = form.fields.find((f) => f.id === cfg?.endFieldId) || dateFields[1];
  const titleId = titleOf(form, cfg?.titleFieldId);
  const colorField = form.fields.find((f) => f.id === cfg?.colorFieldId) || firstField(form, ["dropdown"]);
  const [pxPerDay, setPx] = useState(24);
  if (!startField) return <Empty text="Gantt needs a start date field (and ideally an end date)." />;
  const today = startOfDay(new Date());
  const rows = records.map((r) => { const s = parseDate(r.data?.[startField.id]); const e = endField ? parseDate(r.data?.[endField.id]) : null; return { r, s: s ? startOfDay(s) : null, e: e ? startOfDay(e) : s ? startOfDay(s) : null, group: cfg?.groupFieldId ? displayValue(r, cfg.groupFieldId) || "(None)" : "", progress: cfg?.progressFieldId ? Math.max(0, Math.min(100, toNumber(r.data?.[cfg.progressFieldId]))) : null }; }).filter((x) => x.s).sort((a, b) => a.s!.getTime() - b.s!.getTime());
  if (!rows.length) return <Empty text="No records with a start date." />;
  const min = new Date(Math.min(today.getTime(), ...rows.map((x) => x.s!.getTime()))); min.setDate(min.getDate() - 3);
  const max = new Date(Math.max(today.getTime(), ...rows.map((x) => x.e!.getTime()))); max.setDate(max.getDate() + 7);
  const totalDays = dayDiff(max, min) + 1;
  const months: Array<{ label: string; days: number }> = [];
  for (let d = new Date(min); d <= max; d.setDate(d.getDate() + 1)) { const l = d.toLocaleString("en-US", { month: "short", year: "2-digit" }); if (months.length && months[months.length - 1].label === l) months[months.length - 1].days++; else months.push({ label: l, days: 1 }); }
  const groups = cfg?.groupFieldId ? Array.from(new Set(rows.map((x) => x.group))) : [""];
  const LEFT = 220;
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{rows.length} items · {startField.label}{endField ? ` → ${endField.label}` : ""}</span><span className="flex items-center gap-1">Zoom {[12, 24, 48].map((z) => <button key={z} type="button" onClick={() => setPx(z)} className={`px-2 py-0.5 rounded border ${pxPerDay === z ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{z === 12 ? "S" : z === 24 ? "M" : "L"}</button>)}</span></div>
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <div style={{ width: LEFT + totalDays * pxPerDay }} className="text-[11px]">
          <div className="flex sticky top-0 bg-slate-50 border-b border-slate-200 z-[2]"><div className="shrink-0 px-3 py-2 font-semibold text-slate-600 border-r border-slate-200 sticky left-0 bg-slate-50 z-[3]" style={{ width: LEFT }}>Item</div>{months.map((m, i) => <div key={i} className="shrink-0 px-2 py-2 border-r border-slate-200 font-semibold text-slate-600 truncate" style={{ width: m.days * pxPerDay }}>{m.label}</div>)}</div>
          {groups.map((g) => (
            <React.Fragment key={g}>
              {g !== "" && <div className="flex bg-slate-100/80 border-b border-slate-200"><div className="sticky left-0 bg-slate-100 px-3 py-1.5 font-bold text-slate-800 z-[1]" style={{ width: LEFT }}>{g}</div></div>}
              {rows.filter((x) => x.group === g).map(({ r, s, e, progress }) => {
                const left = dayDiff(s!, min) * pxPerDay; const width = Math.max(pxPerDay, (dayDiff(e!, s!) + 1) * pxPerDay);
                const color = colorField?.optionColors?.[displayValue(r, colorField.id)] || "#2a78d6";
                const late = e! < today && (progress ?? 0) < 100;
                return (
                  <div key={r.id} className="flex border-b border-slate-100 hover:bg-blue-50/40 group" style={{ height: 34 }}>
                    <button type="button" onClick={() => actions.onOpen(r)} className="shrink-0 sticky left-0 bg-white group-hover:bg-blue-50/40 px-3 pr-8 flex items-center gap-2 text-left border-r border-slate-200 z-[1] truncate relative" style={{ width: LEFT }}><span className="font-medium text-slate-900 truncate">{titleId ? displayValue(r, titleId) || r.id : r.id}</span>{late && <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />}</button>
                    <div className="relative flex-1">
                      <div className="absolute top-0 bottom-0 w-px bg-rose-400/70" style={{ left: dayDiff(today, min) * pxPerDay }} />
                      <button type="button" onClick={() => actions.onOpen(r)} title={`${iso(s!)} → ${iso(e!)}`} className="absolute top-1.5 h-[22px] rounded-md shadow-3xs overflow-hidden text-left" style={{ left, width, background: `${color}33`, border: `1px solid ${color}` }}>
                        {progress !== null && <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, background: color, opacity: 0.85 }} />}
                        <span className="relative px-1.5 text-[10px] font-semibold text-slate-900 whitespace-nowrap">{progress !== null ? `${progress}%` : dayDiff(e!, s!) + 1 + "d"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Chart ────────────────────────────────────────────────────────────────────

function bucket(raw: any, b?: "day" | "week" | "month" | "year") {
  const d = parseDate(raw); if (!d) return "Unknown";
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0");
  if (b === "year") return String(y);
  if (b === "week") { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return `${iso(s)} wk`; }
  if (b === "day" || !b) return iso(d);
  return `${y}-${m}`;
}

export function buildChart(report: CommonProps["report"], form: FormDefinition, records: RecordDefinition[], displayValue: CommonProps["displayValue"], overrideType?: string) {
  const cfg = report.chart;
  const groupField = form.fields.find((f) => f.id === cfg?.groupFieldId) || firstField(form, ["dropdown", "lookup", "radio"]);
  const groupId = cfg?.groupFieldId === "createdAt" ? "createdAt" : groupField?.id;
  const seriesField = form.fields.find((f) => f.id === cfg?.seriesFieldId);
  const valueId = cfg?.valueFieldId; const agg = cfg?.aggregate || (valueId ? "sum" : "count");
  const isDate = groupId === "createdAt" || groupField?.type === "date" || groupField?.type === "datetime";
  const dateBucket = cfg?.dateBucket || (isDate ? "month" : undefined);
  const keyOf = (r: RecordDefinition) => !groupId ? "All" : groupId === "createdAt" ? bucket(r.createdAt, dateBucket) : isDate ? bucket(r.data?.[groupId], dateBucket) : displayValue(r, groupId) || "(Blank)";
  const grid: Record<string, Record<string, any[]>> = {};
  const labels = new Set<string>(); const sNames = new Set<string>();
  for (const r of records) { const x = keyOf(r); const s = seriesField ? displayValue(r, seriesField.id) || "(Blank)" : "value"; labels.add(x); sNames.add(s); ((grid[s] = grid[s] || {})[x] = grid[s][x] || []).push(agg === "count" ? 1 : valueId ? getRawValue(r, valueId, form) : 1); }
  let labelList = Array.from(labels);
  const totalOf = (l: string) => Object.values(grid).reduce((s, g) => s + aggregateValues(g[l] || [], agg), 0);
  labelList = isDate ? labelList.sort() : labelList.sort((a, b) => totalOf(b) - totalOf(a));
  if (cfg?.limit && labelList.length > cfg.limit && !isDate) { const keep = labelList.slice(0, cfg.limit); const rest = labelList.slice(cfg.limit); for (const s of Object.keys(grid)) grid[s]["Other"] = rest.flatMap((l) => grid[s][l] || []); labelList = [...keep, "Other"]; }
  const names = Array.from(sNames).slice(0, 8);
  const series: ChartSeries[] = names.map((n, i) => ({ name: n, color: CHART_COLORS[i % CHART_COLORS.length], points: labelList.map((l) => ({ label: l, value: Math.round(aggregateValues(grid[n]?.[l] || [], agg) * 100) / 100 })) }));
  const total = series.reduce((s, x) => s + x.points.reduce((a, p) => a + p.value, 0), 0);
  const single: ChartDataPoint[] = labelList.map((l, i) => { const v = series.reduce((s, x) => s + (x.points[i]?.value || 0), 0); return { label: l, value: v, percentage: total ? Math.round((v / total) * 100) : 0, color: CHART_COLORS[i % CHART_COLORS.length] }; });
  const type = (overrideType || cfg?.chartType || "column") as NonNullable<typeof cfg>["chartType"];
  return { type, labels: labelList, series, single, valueId, groupLabel: groupId === "createdAt" ? "Created" : groupField?.label || "", seriesLabel: seriesField?.label };
}

export const ChartView: React.FC<CommonProps> = ({ report, form, records, displayValue }) => {
  const [typeOverride, setTypeOverride] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(Boolean(report.chart?.showTable));
  const c = useMemo(() => buildChart(report, form, records, displayValue, typeOverride || undefined), [report, form, records, displayValue, typeOverride]);
  const fmt = (n: number) => (c.valueId ? formatAgg(form, c.valueId, n) : formatCompact(n));
  if (!records.length) return <Empty text="No records." />;
  const TYPES: Array<[string, string]> = [["column", "Column"], ["bar", "Bar"], ["stacked", "Stacked"], ["line", "Line"], ["area", "Area"], ["pie", "Pie"], ["donut", "Donut"]];
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 text-[11px]">
        <span className="text-slate-500">{c.groupLabel}{c.seriesLabel ? ` × ${c.seriesLabel}` : ""} · {report.chart?.aggregate || "count"}{c.valueId ? ` of ${form.fields.find((f) => f.id === c.valueId)?.label}` : ""}</span>
        <div className="flex items-center gap-1">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">{TYPES.map(([id, l]) => <button key={id} type="button" onClick={() => setTypeOverride(id)} className={`px-2 py-1 rounded-md ${c.type === id ? "bg-white shadow-3xs text-blue-700 font-semibold" : "text-slate-500 hover:text-slate-800"}`}>{l}</button>)}</div>
          <button type="button" onClick={() => setShowTable((s) => !s)} className={`ml-1 p-1.5 rounded-md border ${showTable ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500"}`} title="Data table"><TableIcon className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {c.type === "pie" || c.type === "donut" ? (
        <div className="flex flex-col md:flex-row items-center gap-6"><PieChart data={c.single} donut={c.type === "donut"} size={260} centerLabel={c.type === "donut" ? fmt(c.single.reduce((s, d) => s + d.value, 0)) : undefined} /><Legend items={c.single.map((d) => ({ label: `${d.label} (${d.percentage}%)`, color: d.color }))} /></div>
      ) : c.type === "line" || c.type === "area" ? (
        <><LineChart labels={c.labels} series={c.series} area={c.type === "area"} height={300} valueFormat={fmt} />{c.series.length > 1 && <Legend items={c.series.map((s) => ({ label: s.name, color: s.color }))} />}</>
      ) : (
        <><BarChart labels={c.labels} series={c.series} horizontal={c.type === "bar"} stacked={c.type === "stacked"} height={Math.max(260, c.type === "bar" ? c.labels.length * 28 + 60 : 300)} valueFormat={fmt} />{c.series.length > 1 && <Legend items={c.series.map((s) => ({ label: s.name, color: s.color }))} />}</>
      )}
      {showTable && <div className="border-t border-slate-100 pt-3"><ChartTable labels={c.labels} series={c.series} /></div>}
    </div>
  );
};

// ── Ranking / leaderboard ────────────────────────────────────────────────────

export const RankingView: React.FC<CommonProps> = ({ report, form, records, displayValue }) => {
  const cfg = report.ranking;
  const groupField = form.fields.find((f) => f.id === cfg?.groupFieldId) || firstField(form, ["lookup", "dropdown", "users", "text"]);
  const valueId = cfg?.valueFieldId; const agg = cfg?.aggregate || (valueId ? "sum" : "count");
  if (!groupField) return <Empty text="Configure a group field (customer, salesman, product…) for the ranking." />;
  const map = new Map<string, any[]>();
  for (const r of records) { const k = displayValue(r, groupField.id) || "(Blank)"; map.set(k, [...(map.get(k) || []), agg === "count" ? 1 : valueId ? getRawValue(r, valueId, form) : 1]); }
  let rows = Array.from(map.entries()).map(([label, vals]) => ({ label, value: aggregateValues(vals, agg), n: vals.length }));
  rows.sort((a, b) => (cfg?.order === "asc" ? a.value - b.value : b.value - a.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  rows = rows.slice(0, cfg?.top || 10);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const target = cfg?.targetValue;
  const medal = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-800", "bg-orange-300 text-orange-950"];
  return (
    <div className="p-5 space-y-2 max-w-4xl">
      <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-amber-500" /> Top {rows.length} by {agg}{valueId ? ` of ${form.fields.find((f) => f.id === valueId)?.label}` : ""} · {groupField.label}{target ? ` · target ${fmtNum(form, valueId, target)}` : ""}</div>
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${medal[i] || "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
          <span className="w-40 md:w-56 truncate font-semibold text-slate-900">{r.label}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
            <div className="h-full rounded-md" style={{ width: `${(Math.abs(r.value) / (target ? Math.max(max, target) : max)) * 100}%`, background: target ? (r.value >= target ? "#1baf7a" : "#2a78d6") : CHART_COLORS[i % CHART_COLORS.length] }} />
            {target ? <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500" style={{ left: `${(target / Math.max(max, target)) * 100}%` }} /> : null}
          </div>
          <span className="w-28 text-right tabular-nums font-bold text-slate-900">{fmtNum(form, valueId, r.value)}</span>
          <span className="w-12 text-right tabular-nums text-slate-400">{total ? Math.round((r.value / total) * 100) : 0}%</span>
        </div>
      ))}
      {rows.length === 0 && <Empty text="No records." />}
    </div>
  );
};

// ── Aging (receivables / payables) ──────────────────────────────────────────

export const AgingView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const cfg = report.aging;
  const dateField = form.fields.find((f) => f.id === cfg?.dateFieldId) || firstField(form, ["date", "datetime"]);
  const amountField = form.fields.find((f) => f.id === cfg?.amountFieldId) || form.fields.find((f) => f.type === "currency");
  const paidId = cfg?.paidFieldId;
  const partyField = form.fields.find((f) => f.id === cfg?.partyFieldId) || firstField(form, ["lookup"]);
  const edges = cfg?.buckets?.length ? cfg.buckets : [30, 60, 90];
  const grace = cfg?.dueDays || 0;
  const [open, setOpen] = useState<string | null>(null);
  if (!dateField || !amountField) return <Empty text="Aging needs a date field (invoice/due date) and an amount field." />;
  const today = startOfDay(new Date());
  const labels = ["Not due", ...edges.map((e, i) => (i === 0 ? `0–${e}` : `${edges[i - 1] + 1}–${e}`)), `${edges[edges.length - 1]}+`];
  const items = records.map((r) => { const d = parseDate(r.data?.[dateField.id]); const amt = toNumber(getRawValue(r, amountField.id, form)) - (paidId ? toNumber(getRawValue(r, paidId, form)) : 0); if (!d || amt <= 0) return null; const days = dayDiff(today, startOfDay(d)) - grace; let b = 0; if (days > 0) { b = edges.findIndex((e) => days <= e); b = b < 0 ? edges.length + 1 : b + 1; } return { r, amt, days, b, party: partyField ? displayValue(r, partyField.id) || "(Unknown)" : displayValue(r, form.titleFieldId || dateField.id) || r.id }; }).filter(Boolean) as Array<{ r: RecordDefinition; amt: number; days: number; b: number; party: string }>;
  const parties = new Map<string, typeof items>();
  for (const it of items) parties.set(it.party, [...(parties.get(it.party) || []), it]);
  const rows = Array.from(parties.entries()).map(([party, list]) => ({ party, list, cells: labels.map((_, i) => list.filter((x) => x.b === i).reduce((s, x) => s + x.amt, 0)), total: list.reduce((s, x) => s + x.amt, 0) })).sort((a, b) => b.total - a.total);
  const colTotals = labels.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
  const grand = colTotals.reduce((s, v) => s + v, 0);
  const fmt = (v: number) => formatAgg(form, amountField.id, v);
  const tone = (i: number) => (i === 0 ? "text-slate-600" : i === 1 ? "text-emerald-700" : i === 2 ? "text-amber-700" : i === 3 ? "text-orange-700" : "text-rose-700");
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 border-b border-slate-100">
        {labels.map((l, i) => <div key={l} className="rounded-xl border border-slate-200 p-3"><div className={`text-[10px] font-bold uppercase tracking-wider ${tone(i)}`}>{l} {i > 0 ? "days" : ""}</div><div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">{fmt(colTotals[i])}</div><div className="text-[10px] text-slate-400">{grand ? Math.round((colTotals[i] / grand) * 100) : 0}% of {fmt(grand)}</div></div>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 border-b border-slate-200"><tr><th className="px-4 py-2.5 text-left">{partyField?.label || "Record"}</th>{labels.map((l, i) => <th key={l} className={`px-3 py-2.5 text-right whitespace-nowrap ${tone(i)}`}>{l}</th>)}<th className="px-4 py-2.5 text-right bg-slate-100">Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <React.Fragment key={row.party}>
                <tr onClick={() => setOpen(open === row.party ? null : row.party)} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-semibold text-slate-900 flex items-center gap-1.5">{open === row.party ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}{row.party}<span className="text-[10px] font-normal text-slate-400">({row.list.length})</span></td>
                  {row.cells.map((v, i) => <td key={i} className={`px-3 py-2 text-right tabular-nums ${v ? tone(i) : "text-slate-300"}`}>{v ? fmt(v) : "—"}</td>)}
                  <td className="px-4 py-2 text-right tabular-nums font-bold bg-slate-50/60">{fmt(row.total)}</td>
                </tr>
                {open === row.party && row.list.sort((a, b) => b.days - a.days).map((it) => (
                  <tr key={it.r.id} onClick={() => actions.onOpen(it.r)} className="bg-slate-50/50 hover:bg-blue-50/50 cursor-pointer text-[11px]">
                    <td className="px-4 py-1.5 pl-10 text-slate-700">{displayValue(it.r, form.titleFieldId || form.fields.find((f) => f.type === "autonumber")?.id || dateField.id) || it.r.id} <span className="text-slate-400">· {displayValue(it.r, dateField.id)} · {it.days > 0 ? `${it.days}d overdue` : `due in ${-it.days}d`}</span></td>
                    {labels.map((_, i) => <td key={i} className={`px-3 py-1.5 text-right tabular-nums ${it.b === i ? tone(i) + " font-semibold" : "text-slate-300"}`}>{it.b === i ? fmt(it.amt) : ""}</td>)}
                    <td className="px-4 py-1.5 text-right tabular-nums"><span className="inline-flex items-center gap-1">{fmt(it.amt)}<RowActionsMenu rec={it.r} actions={actions} perms={perms} size="xs" /></span></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={labels.length + 2} className="p-10 text-center text-slate-400">Nothing outstanding.</td></tr>}
          </tbody>
          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-200"><tr><td className="px-4 py-2">Total</td>{colTotals.map((v, i) => <td key={i} className={`px-3 py-2 text-right tabular-nums ${tone(i)}`}>{fmt(v)}</td>)}<td className="px-4 py-2 text-right tabular-nums">{fmt(grand)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
};
