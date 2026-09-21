"use client";

import React, { useMemo, useState } from "react";
import { FormDefinition, RecordDefinition, ReportColumnConfig, ReportDefinition } from "@/types/schema";
import { conditionalClasses, aggregateValues, getRawValue, pivotRecords, RecordGroup, toNumber } from "@/lib/engine/reportEngine";
import { formatCurrency } from "@/lib/utils/formatters";
import { IconButton } from "@/components/ui/Button";
import { RowActionsMenu } from "./RowActionsMenu";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, ChevronRight, ChevronLeft, GripVertical, Check, X as XIcon } from "lucide-react";

export interface RowActions {
  onOpen: (rec: RecordDefinition) => void;
  onEdit?: (rec: RecordDefinition) => void;
  onDelete?: (rec: RecordDefinition) => void;
  onPrint?: (rec: RecordDefinition) => void;
  onDuplicate?: (rec: RecordDefinition) => void;
  onCopyLink?: (rec: RecordDefinition) => void;
  onLookupClick?: (fieldId: string, targetId: string) => void;
}

export interface CommonProps {
  report: ReportDefinition;
  form: FormDefinition;
  records: RecordDefinition[];
  displayValue: (rec: RecordDefinition, fieldId: string) => string;
  actions: RowActions;
  perms: { edit: boolean; delete: boolean; print: boolean; create: boolean };
}

const numericTypes = new Set(["number", "currency", "decimal", "percentage", "rollup", "formula", "rating"]);

export function isNumericField(form: FormDefinition, fieldId: string) {
  const f = form.fields.find((x) => x.id === fieldId);
  if (!f) return false;
  if (f.type === "formula") return f.formula?.resultType === "number";
  return numericTypes.has(f.type);
}

export function formatAgg(form: FormDefinition, fieldId: string, v: number) {
  const f = form.fields.find((x) => x.id === fieldId);
  if (f?.type === "currency") return formatCurrency(v, f.currencySymbol || "₹", f.decimalPlaces ?? 2);
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ── Table ────────────────────────────────────────────────────────────────────

export const TableView: React.FC<
  CommonProps & {
    columns: ReportColumnConfig[];
    groups: RecordGroup[] | null;
    sortField: string | null;
    sortOrder: "asc" | "desc";
    onSort: (fieldId: string) => void;
    selected: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
    inlineEdit?: boolean;
    onInlineSave?: (rec: RecordDefinition, fieldId: string, value: any) => Promise<void>;
    onResizeColumn?: (fieldId: string, width: number) => void;
  }
> = ({ report, form, records, columns, groups, displayValue, actions, perms, sortField, sortOrder, onSort, selected, onToggleSelect, onToggleAll, inlineEdit, onInlineSave, onResizeColumn }) => {
  const [editing, setEditing] = useState<{ id: string; fieldId: string; value: any } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const formats = report.conditionalFormats || [];
  const showRunning = report.showRunningTotal && report.runningTotalFieldId;

  const footerAggs = columns.filter((c) => c.aggregate);
  const allIds = records.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const startResize = (e: React.MouseEvent, fieldId: string, startWidth: number) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const move = (ev: MouseEvent) => onResizeColumn?.(fieldId, Math.max(70, startWidth + ev.clientX - startX));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const renderRow = (rec: RecordDefinition, idx: number, running?: number) => {
    const cf = conditionalClasses(rec, formats, form);
    const isSel = selected.has(rec.id);
    return (
      <tr key={rec.id} onClick={() => actions.onOpen(rec)} className={`cursor-pointer transition-colors group ${isSel ? "bg-blue-50/70" : cf.row || (idx % 2 ? "bg-slate-50/40" : "bg-white")} hover:bg-blue-50/50`}>
        <td className="pl-3 pr-1 py-2 sticky left-0 z-[1] bg-inherit" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(rec.id)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600" />
            <RowActionsMenu rec={rec} actions={actions} perms={perms} className="opacity-60 group-hover:opacity-100" />
          </div>
        </td>
        {columns.map((col, ci) => {
          const field = form.fields.find((f) => f.id === col.fieldId);
          const val = displayValue(rec, col.fieldId);
          const isLookup = field?.type === "lookup" && rec.data?.[col.fieldId];
          const isEditingCell = editing?.id === rec.id && editing.fieldId === col.fieldId;
          const editable = inlineEdit && perms.edit && field && !["formula", "rollup", "autonumber", "subform", "lookup", "file", "image", "signature", "richtext", "address", "geolocation"].includes(field.type);
          const num = isNumericField(form, col.fieldId);
          return (
            <td
              key={col.fieldId}
              className={`px-3 py-2.5 text-xs whitespace-nowrap max-w-[320px] truncate ${num ? "text-right tabular-nums" : ""} ${cf.cells[col.fieldId] ? `${cf.cells[col.fieldId]} rounded` : "text-slate-700"} ${col.frozen || ci === 0 ? "font-medium text-slate-900" : ""}`}
              style={{ width: col.width, minWidth: col.width }}
              onDoubleClick={(e) => { if (editable) { e.stopPropagation(); setEditing({ id: rec.id, fieldId: col.fieldId, value: rec.data?.[col.fieldId] ?? "" }); } }}
            >
              {isEditingCell ? (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {field?.options?.length ? (
                    <select autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} className="text-xs border border-blue-400 rounded px-1 py-0.5 bg-white">{field.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : field?.type === "checkbox" ? (
                    <input type="checkbox" autoFocus checked={Boolean(editing.value)} onChange={(e) => setEditing({ ...editing, value: e.target.checked })} />
                  ) : (
                    <input autoFocus type={num ? "number" : field?.type === "date" ? "date" : "text"} value={editing.value} onChange={(e) => setEditing({ ...editing, value: num ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value })} onKeyDown={async (e) => { if (e.key === "Enter") { await onInlineSave?.(rec, col.fieldId, editing.value); setEditing(null); } if (e.key === "Escape") setEditing(null); }} className="text-xs border border-blue-400 rounded px-1.5 py-0.5 w-full bg-white" />
                  )}
                  <IconButton size="sm" tone="primary" onClick={async () => { await onInlineSave?.(rec, col.fieldId, editing.value); setEditing(null); }}><Check className="w-3.5 h-3.5" /></IconButton>
                  <IconButton size="sm" onClick={() => setEditing(null)}><XIcon className="w-3.5 h-3.5" /></IconButton>
                </span>
              ) : isLookup && actions.onLookupClick ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); actions.onLookupClick!(col.fieldId, Array.isArray(rec.data[col.fieldId]) ? rec.data[col.fieldId][0] : rec.data[col.fieldId]); }} className="text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-1">
                  {val}<ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                </button>
              ) : field?.type === "checkbox" ? (
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${rec.data?.[col.fieldId] ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{val}</span>
              ) : field?.type === "color" && rec.data?.[col.fieldId] ? (
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-slate-200" style={{ background: rec.data[col.fieldId] }} />{val}</span>
              ) : field?.type === "image" && rec.data?.[col.fieldId]?.url ? (
                <img src={rec.data[col.fieldId].url} alt="" className="w-8 h-8 rounded object-cover border border-slate-200" />
              ) : field?.optionColors?.[val] ? (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-white" style={{ background: field.optionColors[val] }}>{val}</span>
              ) : (
                val || <span className="text-slate-300">—</span>
              )}
            </td>
          );
        })}
        {showRunning && <td className="px-3 py-2.5 text-xs text-right tabular-nums font-semibold text-indigo-700">{formatAgg(form, report.runningTotalFieldId!, running || 0)}</td>}
      </tr>
    );
  };

  const colCount = columns.length + 1 + (showRunning ? 1 : 0);
  const runningTotals = useMemo(() => { const m: Record<string, number> = {}; if (!showRunning) return m; let acc = 0; const seq = groups ? groups.flatMap((g) => g.records) : records; for (const r of seq) { acc += toNumber(getRawValue(r, report.runningTotalFieldId!, form)); m[r.id] = acc; } return m; }, [showRunning, groups, records, report.runningTotalFieldId, form]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[640px]">
        <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wide border-b border-slate-200 sticky top-0 z-[2]">
          <tr>
            <th className="pl-3 pr-1 py-2.5 w-16 sticky left-0 bg-slate-50 z-[3]"><input type="checkbox" checked={allSelected} onChange={() => onToggleAll(allSelected ? [] : allIds)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600" title="Select all" /></th>
            {columns.map((col) => {
              const num = isNumericField(form, col.fieldId);
              const active = sortField === col.fieldId;
              return (
                <th key={col.fieldId} className={`px-3 py-2.5 whitespace-nowrap relative select-none ${num ? "text-right" : ""}`} style={{ width: col.width, minWidth: col.width }}>
                  <button type="button" onClick={() => onSort(col.fieldId)} className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-blue-700" : ""}`}>
                    {col.label}
                    {active ? (sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                  {onResizeColumn && <span onMouseDown={(e) => startResize(e, col.fieldId, col.width || 160)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300/60" />}
                </th>
              );
            })}
            {showRunning && <th className="px-3 py-2.5 text-right whitespace-nowrap text-indigo-700">Running total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.length === 0 ? (
            <tr><td colSpan={colCount} className="px-4 py-14 text-center text-xs text-slate-400">No records match the current filters.</td></tr>
          ) : groups ? (
            groups.map((g) => {
              const isCol = collapsedGroups[g.key];
              return (
                <React.Fragment key={g.key}>
                  <tr className="bg-slate-100/80 border-y border-slate-200">
                    <td colSpan={colCount} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <button type="button" onClick={() => setCollapsedGroups((c) => ({ ...c, [g.key]: !c[g.key] }))} className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          {isCol ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5 rotate-90" />}
                          {g.label}
                          <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-semibold text-slate-500">{g.records.length}</span>
                        </button>
                        <div className="flex items-center gap-4 text-[11px] text-slate-600">
                          {(report.groupAggregates || []).map((a) => (
                            <span key={`${a.fieldId}:${a.aggregate}`}><span className="uppercase text-[10px] text-slate-400 mr-1">{a.aggregate}</span><span className="font-semibold text-slate-900">{form.fields.find((f) => f.id === a.fieldId)?.label}: {formatAgg(form, a.fieldId, g.aggregates[`${a.fieldId}:${a.aggregate}`] || 0)}</span></span>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {!isCol && g.records.map((rec, i) => renderRow(rec, i, runningTotals[rec.id]))}
                </React.Fragment>
              );
            })
          ) : (
            records.map((rec, i) => renderRow(rec, i, runningTotals[rec.id]))
          )}
        </tbody>
        {footerAggs.length > 0 && records.length > 0 && (
          <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold">
            <tr>
              <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400">Total</td>
              {columns.map((c) => (
                <td key={c.fieldId} className="px-3 py-2 text-right tabular-nums text-slate-900">
                  {c.aggregate ? <><span className="text-[9px] uppercase text-slate-400 mr-1">{c.aggregate}</span>{formatAgg(form, c.fieldId, aggregateValues(records.map((r) => getRawValue(r, c.fieldId, form)), c.aggregate))}</> : ""}
                </td>
              ))}
              {showRunning && <td />}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

// ── Grid (cards) ─────────────────────────────────────────────────────────────

export const GridView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const cfg = report.grid || {};
  const titleId = cfg.titleFieldId || form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
  const cardFields = (cfg.cardFieldIds?.length ? cfg.cardFieldIds : form.fields.filter((f) => f.type !== "section" && f.type !== "subform" && f.id !== titleId).slice(0, 4).map((f) => f.id)).map((id) => form.fields.find((f) => f.id === id)).filter(Boolean);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
      {records.length === 0 && <div className="col-span-full text-center text-xs text-slate-400 py-12">No records.</div>}
      {records.map((rec) => {
        const img = cfg.imageFieldId ? rec.data?.[cfg.imageFieldId]?.url : undefined;
        return (
          <div key={rec.id} onClick={() => actions.onOpen(rec)} className="bg-white rounded-xl border border-slate-200 shadow-3xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer overflow-hidden group">
            {img && <img src={img} alt="" className="w-full h-36 object-cover" />}
            <div className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 truncate">{titleId ? displayValue(rec, titleId) || rec.id : rec.id}</h3>
                <RowActionsMenu rec={rec} actions={actions} perms={perms} className="-mr-1 -mt-1" />
              </div>
              {cfg.subtitleFieldId && <p className="text-xs text-slate-500">{displayValue(rec, cfg.subtitleFieldId)}</p>}
              <dl className="space-y-1 pt-1 border-t border-slate-100">
                {cardFields.map((f) => (
                  <div key={f!.id} className="flex justify-between gap-3 text-[11px]">
                    <dt className="text-slate-400 truncate">{f!.label}</dt>
                    <dd className="text-slate-800 font-medium truncate text-right">{displayValue(rec, f!.id) || "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Kanban ───────────────────────────────────────────────────────────────────

export const KanbanView: React.FC<CommonProps & { onMove?: (rec: RecordDefinition, newStatus: string) => void }> = ({ report, form, records, displayValue, actions, perms, onMove }) => {
  const statusField = form.fields.find((f) => f.id === report.kanban?.statusFieldId) || form.fields.find((f) => f.type === "dropdown" || f.type === "radio");
  const titleId = report.kanban?.titleFieldId || form.titleFieldId || form.fields.find((f) => f.type !== "section" && f.id !== statusField?.id)?.id;
  const cardFields = (report.kanban?.cardFieldIds || []).map((id) => form.fields.find((f) => f.id === id)).filter(Boolean);
  const [dragId, setDragId] = useState<string | null>(null);
  if (!statusField) return <div className="p-10 text-center text-xs text-slate-400">Configure a status (dropdown) field for this Kanban report in the builder.</div>;
  const columns = statusField.options?.length ? [...statusField.options] : Array.from(new Set(records.map((r) => String(r.data?.[statusField.id] ?? "")))).filter(Boolean);
  const blank = records.filter((r) => !r.data?.[statusField.id]);
  const lanes = [...columns.map((c) => ({ key: c, records: records.filter((r) => String(r.data?.[statusField.id] ?? "") === c) })), ...(blank.length ? [{ key: "(No status)", records: blank }] : [])];

  return (
    <div className="flex gap-4 p-5 overflow-x-auto min-h-[420px]">
      {lanes.map((lane) => {
        const color = statusField.optionColors?.[lane.key];
        return (
          <div
            key={lane.key}
            onDragOver={(e) => { if (perms.edit && onMove) e.preventDefault(); }}
            onDrop={() => { const rec = records.find((r) => r.id === dragId); if (rec && onMove && lane.key !== "(No status)") onMove(rec, lane.key); setDragId(null); }}
            className="w-72 shrink-0 bg-slate-100/70 rounded-xl border border-slate-200 flex flex-col max-h-[70vh]"
          >
            <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-2">{color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}{lane.key}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{lane.records.length}</span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {lane.records.map((rec) => (
                <div key={rec.id} draggable={perms.edit && Boolean(onMove)} onDragStart={() => setDragId(rec.id)} onClick={() => actions.onOpen(rec)} className={`bg-white rounded-lg border border-slate-200 p-3 shadow-3xs hover:border-blue-300 cursor-pointer space-y-1.5 ${dragId === rec.id ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-1.5 group">
                    {perms.edit && onMove && <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />}
                    <span className="text-xs font-semibold text-slate-900 leading-snug flex-1">{titleId ? displayValue(rec, titleId) || rec.id : rec.id}</span>
                    <RowActionsMenu rec={rec} actions={actions} perms={perms} size="xs" className="-mr-1 -mt-0.5" />
                  </div>
                  {cardFields.map((f) => (
                    <div key={f!.id} className="text-[11px] text-slate-500 flex justify-between gap-2"><span>{f!.label}</span><span className="text-slate-800 font-medium truncate">{displayValue(rec, f!.id) || "—"}</span></div>
                  ))}
                </div>
              ))}
              {lane.records.length === 0 && <div className="text-[11px] text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">Drop here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Calendar ─────────────────────────────────────────────────────────────────

export const CalendarView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const dateField = form.fields.find((f) => f.id === report.calendar?.dateFieldId) || form.fields.find((f) => f.type === "date" || f.type === "datetime");
  const titleId = report.calendar?.titleFieldId || form.titleFieldId || form.fields.find((f) => f.type !== "section" && f.id !== dateField?.id)?.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  if (!dateField) return <div className="p-10 text-center text-xs text-slate-400">Configure a date field for this Calendar report.</div>;
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [...Array(startDay).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const byDay: Record<string, RecordDefinition[]> = {};
  for (const r of records) {
    const v = r.data?.[dateField.id];
    if (!v) continue;
    const key = String(v).slice(0, 10);
    (byDay[key] = byDay[key] || []).push(r);
  }
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayKey = iso(new Date());

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="w-4 h-4" /></IconButton>
          <IconButton onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="w-4 h-4" /></IconButton>
          <button type="button" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="text-[11px] font-semibold text-blue-600 px-2">Today</button>
        </div>
        <h3 className="text-sm font-bold text-slate-900">{cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}</h3>
        <span className="text-[11px] text-slate-400">by {dateField.label}</span>
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 py-2">{d}</div>)}
        {cells.map((d, i) => {
          const key = d ? iso(d) : "";
          const items = d ? byDay[key] || [] : [];
          return (
            <div key={i} className={`bg-white min-h-[96px] p-1.5 ${!d ? "bg-slate-50/60" : ""}`}>
              {d && <div className={`text-[11px] font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${key === todayKey ? "bg-blue-600 text-white" : "text-slate-500"}`}>{d.getDate()}</div>}
              <div className="space-y-1">
                {items.slice(0, 3).map((r) => <div key={r.id} className="flex items-center gap-0.5 group"><button type="button" onClick={() => actions.onOpen(r)} className="flex-1 min-w-0 text-left text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100 truncate hover:bg-blue-100">{titleId ? displayValue(r, titleId) || r.id : r.id}</button><RowActionsMenu rec={r} actions={actions} perms={perms} size="xs" hover /></div>)}
                {items.length > 3 && <div className="text-[10px] text-slate-400 pl-1">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Timeline ─────────────────────────────────────────────────────────────────

export const TimelineView: React.FC<CommonProps> = ({ report, form, records, displayValue, actions, perms }) => {
  const dateField = form.fields.find((f) => f.id === report.calendar?.dateFieldId) || form.fields.find((f) => f.type === "date" || f.type === "datetime");
  const titleId = report.calendar?.titleFieldId || form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
  const sorted = [...records].sort((a, b) => String(dateField ? b.data?.[dateField.id] : b.createdAt).localeCompare(String(dateField ? a.data?.[dateField.id] : a.createdAt)));
  return (
    <div className="p-6 max-w-3xl">
      <ol className="relative border-l-2 border-slate-200 space-y-5 pl-6">
        {sorted.map((r) => (
          <li key={r.id} className="relative">
            <span className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white" />
            <div className="flex items-start gap-1 group">
              <button type="button" onClick={() => actions.onOpen(r)} className="text-left flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-3.5 shadow-3xs hover:border-blue-300">
                <div className="text-[11px] text-slate-400 font-medium">{dateField ? displayValue(r, dateField.id) : new Date(r.createdAt).toLocaleString()}</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{titleId ? displayValue(r, titleId) || r.id : r.id}</div>
              </button>
              <RowActionsMenu rec={r} actions={actions} perms={perms} className="mt-2" />
            </div>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-xs text-slate-400">No records.</li>}
      </ol>
    </div>
  );
};

// ── Summary (group + totals) ─────────────────────────────────────────────────

export const SummaryView: React.FC<CommonProps & { groupBy: string | null }> = ({ report, form, records, displayValue, groupBy }) => {
  const gb = groupBy || report.groupByFieldId || form.fields.find((f) => ["dropdown", "lookup", "radio"].includes(f.type))?.id;
  const aggs = report.groupAggregates?.length ? report.groupAggregates : form.fields.filter((f) => isNumericField(form, f.id)).slice(0, 4).map((f) => ({ fieldId: f.id, aggregate: "sum" as const }));
  const groups = useMemo(() => (gb ? (() => { const map = new Map<string, RecordDefinition[]>(); records.forEach((r) => { const k = displayValue(r, gb) || "(Blank)"; map.set(k, [...(map.get(k) || []), r]); }); return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])); })() : []), [gb, records, displayValue]);
  if (!gb) return <div className="p-10 text-center text-xs text-slate-400">Choose a Group-by field.</div>;
  const gbLabel = form.fields.find((f) => f.id === gb)?.label || gb;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 border-b border-slate-200">
          <tr><th className="px-4 py-2.5 text-left">{gbLabel}</th><th className="px-4 py-2.5 text-right">Count</th>{aggs.map((a) => <th key={`${a.fieldId}${a.aggregate}`} className="px-4 py-2.5 text-right">{a.aggregate} · {form.fields.find((f) => f.id === a.fieldId)?.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map(([label, recs]) => (
            <tr key={label} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-semibold text-slate-900">{label}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{recs.length}</td>
              {aggs.map((a) => <td key={`${a.fieldId}${a.aggregate}`} className="px-4 py-2.5 text-right tabular-nums">{formatAgg(form, a.fieldId, aggregateValues(recs.map((r) => getRawValue(r, a.fieldId, form)), a.aggregate))}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
          <tr><td className="px-4 py-2.5">Grand total</td><td className="px-4 py-2.5 text-right tabular-nums">{records.length}</td>{aggs.map((a) => <td key={`${a.fieldId}${a.aggregate}`} className="px-4 py-2.5 text-right tabular-nums">{formatAgg(form, a.fieldId, aggregateValues(records.map((r) => getRawValue(r, a.fieldId, form)), a.aggregate))}</td>)}</tr>
        </tfoot>
      </table>
    </div>
  );
};

// ── Pivot ────────────────────────────────────────────────────────────────────

export const PivotView: React.FC<CommonProps> = ({ report, form, records, displayValue }) => {
  const cfg = report.pivot;
  const rowId = cfg?.rowFieldId || form.fields.find((f) => ["dropdown", "lookup", "radio"].includes(f.type))?.id;
  if (!rowId) return <div className="p-10 text-center text-xs text-slate-400">Configure row/column fields for this Pivot report.</div>;
  const p = pivotRecords(records, rowId, cfg?.columnFieldId, cfg?.valueFieldId, cfg?.aggregate || "count", displayValue);
  const fmt = (v: number) => (cfg?.valueFieldId ? formatAgg(form, cfg.valueFieldId, v) : v.toLocaleString());
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">
          <tr><th className="px-4 py-2.5 text-left border-b border-r border-slate-200 sticky left-0 bg-slate-50">{form.fields.find((f) => f.id === rowId)?.label}</th>{p.colKeys.map((c) => <th key={c} className="px-4 py-2.5 text-right border-b border-slate-200 whitespace-nowrap">{c}</th>)}<th className="px-4 py-2.5 text-right border-b border-l border-slate-200 bg-slate-100">Total</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {p.rowKeys.map((r) => (
            <tr key={r} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-semibold text-slate-900 border-r border-slate-200 sticky left-0 bg-white">{r}</td>
              {p.colKeys.map((c) => <td key={c} className={`px-4 py-2 text-right tabular-nums ${p.cells[r][c] ? "" : "text-slate-300"}`}>{p.cells[r][c] ? fmt(p.cells[r][c]) : "—"}</td>)}
              <td className="px-4 py-2 text-right tabular-nums font-bold border-l border-slate-200 bg-slate-50/60">{fmt(p.rowTotals[r])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-200">
          <tr><td className="px-4 py-2 border-r border-slate-200 sticky left-0 bg-slate-100">Total</td>{p.colKeys.map((c) => <td key={c} className="px-4 py-2 text-right tabular-nums">{fmt(p.colTotals[c] || 0)}</td>)}<td className="px-4 py-2 text-right tabular-nums border-l border-slate-200">{fmt(p.grandTotal)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
};

/** Trash bin view. */
export const TrashView: React.FC<{ form: FormDefinition; records: RecordDefinition[]; displayValue: (r: RecordDefinition, f: string) => string; onRestore: (r: RecordDefinition) => void; onPurge: (r: RecordDefinition) => void; canDelete: boolean }> = ({ form, records, displayValue, onRestore, onPurge, canDelete }) => {
  const titleId = form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
  return (
    <div className="divide-y divide-slate-100">
      {records.length === 0 && <div className="p-12 text-center text-xs text-slate-400">Trash is empty.</div>}
      {records.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 truncate">{titleId ? displayValue(r, titleId) || r.id : r.id}</div>
            <div className="text-[11px] text-slate-400">Deleted {r.deletedAt ? new Date(r.deletedAt).toLocaleString() : ""} {r.deletedBy ? `by ${r.deletedBy}` : ""}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => onRestore(r)} className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100">Restore</button>
            {canDelete && <button type="button" onClick={() => onPurge(r)} className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold hover:bg-rose-100">Delete forever</button>}
          </div>
        </div>
      ))}
    </div>
  );
};
