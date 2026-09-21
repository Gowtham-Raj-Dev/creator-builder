"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReportDefinition, ReportType, AggregateType, ConditionalFormat, LedgerSource, LedgerTile, DatePreset, ReportColumnConfig, FormDefinition, FieldDefinition } from "@/types/schema";
import { DATE_PRESETS } from "@/lib/engine/reportEngine";
import { DEFAULT_LEDGER_TILES } from "@/components/runtime/report/LedgerReport";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Toggle, Tabs, EmptyState, Textarea, Checkbox } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterGroupsEditor, SimpleFilterList, OPERATORS } from "@/components/runtime/report/FilterBuilder";
import { FORMAT_COLORS } from "@/lib/engine/reportEngine";
import { generateId } from "@/lib/utils/idGenerator";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { REPORT_TYPES, defaultConfigFor } from "@/lib/engine/reportTypes";
import { Icon } from "@/components/ui/IconPicker";
import { AiFixModal } from "@/components/builder/AiFixModal";
import { TableProperties, Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, ExternalLink, Copy, LayoutGrid, Layers, Sigma, Palette, Filter, Settings2, Columns, Sparkles } from "lucide-react";

const TYPES = REPORT_TYPES.map((t) => ({ ...t, iconNode: <Icon name={t.icon} className="w-4 h-4" /> }));
const CATEGORY_LABEL: Record<string, string> = { list: "Lists", board: "Boards & tasks", time: "Time & scheduling", analytics: "Analytics", finance: "Finance & stock" };

export const ReportBuilderView: React.FC<{ reportLinkName?: string }> = ({ reportLinkName }) => {
  const { currentApp, updateReport, deleteReport, createReport, duplicateReport } = useAppBuilder();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("general");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newForm, setNewForm] = useState("");
  const [newType, setNewType] = useState<ReportType>("table");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!currentApp) return;
    if (reportLinkName) { const f = currentApp.reports.find((r) => r.linkName === reportLinkName); if (f) { setSelectedId(f.id); return; } }
    if (!selectedId || !currentApp.reports.some((r) => r.id === selectedId)) setSelectedId(currentApp.reports[0]?.id || null);
  }, [currentApp, reportLinkName, selectedId]);

  const report = currentApp?.reports.find((r) => r.id === selectedId) || null;
  const form = report ? currentApp?.forms.find((f) => f.id === report.sourceFormId) : null;

  const columns = useMemo(() => {
    if (!report || !form) return [];
    const cols = [...report.columns];
    form.fields.filter((f) => f.type !== "section").forEach((f) => { if (!cols.some((c) => c.fieldId === f.id)) cols.push({ fieldId: f.id, label: f.label, visible: true, order: cols.length }); });
    return cols.filter((c) => form.fields.some((f) => f.id === c.fieldId) || ["createdAt", "updatedAt", "createdBy"].includes(c.fieldId)).sort((a, b) => a.order - b.order);
  }, [report, form]);

  if (!currentApp) return null;
  const up = (patch: Partial<ReportDefinition>) => report && updateReport(report.id, patch);
  const setCols = (next: typeof columns) => up({ columns: next.map((c, i) => ({ ...c, order: i })) });
  const numericFields = form?.fields.filter((f) => ["number", "currency", "decimal", "percentage", "rollup", "rating"].includes(f.type) || (f.type === "formula" && f.formula?.resultType === "number")) || [];
  const choiceFields = form?.fields.filter((f) => ["dropdown", "radio", "lookup", "checkbox", "users", "text"].includes(f.type)) || [];
  const dateFields = form?.fields.filter((f) => f.type === "date" || f.type === "datetime") || [];

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0">
      {/* list */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reports ({currentApp.reports.length})</span><Button size="xs" onClick={() => { setNewForm(currentApp.forms[0]?.id || ""); setCreateOpen(true); }} icon={<Plus className="w-3 h-3" />}>New</Button></div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {currentApp.reports.map((r) => { const f = currentApp.forms.find((x) => x.id === r.sourceFormId); const t = TYPES.find((x) => x.id === (r.reportType || "table")); return (
            <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 ${selectedId === r.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-slate-700 hover:bg-slate-100"}`}>
              <span className={selectedId === r.id ? "text-blue-600" : "text-slate-400"}>{t?.iconNode}</span>
              <span className="min-w-0"><span className="block truncate">{r.name}</span><span className="block text-[10px] text-slate-400 font-normal truncate">{f?.name || "?"} · {t?.label}</span></span>
            </button>); })}
          {currentApp.reports.length === 0 && <p className="text-[11px] text-slate-400 p-3 text-center">No reports. Create a form first.</p>}
        </div>
      </div>

      {/* editor */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-100/60 p-6">
        {!report || !form ? (
          <EmptyState icon={<TableProperties className="w-6 h-6" />} title="Select a report" description="Choose a report on the left or create a new one." />
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs flex items-center justify-between gap-3">
              <div className="min-w-0"><h1 className="text-lg font-bold text-slate-900 truncate">{report.name}</h1><p className="text-xs text-slate-500">Source: <span className="font-semibold text-slate-700">{form.name}</span> · <span className="font-mono">/{report.linkName}</span></p></div>
              <div className="flex items-center gap-1.5">
                <Button variant="subtle" size="sm" onClick={() => setAiOpen(true)} icon={<Sparkles className="w-3.5 h-3.5 text-indigo-600" />}>Edit with AI</Button>
                <Link href={getLiveAppUrl(currentApp.linkName, { report: report.linkName })} target="_blank"><Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>Open live</Button></Link>
                <IconButton tone="primary" onClick={() => duplicateReport(report.id)} title="Duplicate"><Copy className="w-4 h-4" /></IconButton>
                <IconButton tone="danger" onClick={() => setDeleteId(report.id)} title="Delete"><Trash2 className="w-4 h-4" /></IconButton>
              </div>
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[{ id: "general", label: "General", icon: <Settings2 className="w-3.5 h-3.5" /> }, { id: "columns", label: "Columns", icon: <Columns className="w-3.5 h-3.5" /> }, { id: "filters", label: "Filters", icon: <Filter className="w-3.5 h-3.5" /> }, { id: "view", label: "View config", icon: <LayoutGrid className="w-3.5 h-3.5" /> }, { id: "format", label: "Formatting", icon: <Palette className="w-3.5 h-3.5" /> }]} />

            {tab === "general" && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Report name" value={report.name} onChange={(e) => up({ name: e.target.value })} />
                  <Select label="Source form" value={report.sourceFormId} onChange={(e) => up({ sourceFormId: e.target.value, columns: [] })}>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                </div>
                <Textarea label="Description" rows={2} value={report.description || ""} onChange={(e) => up({ description: e.target.value })} />
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700">Report type <span className="text-slate-400 font-normal">— the default view; users can still switch views at runtime</span></label>
                  {Object.entries(CATEGORY_LABEL).map(([cat, label]) => (
                    <div key={cat}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{TYPES.filter((t) => t.category === cat).map((t) => <button key={t.id} type="button" title={`e.g. ${t.useCases.join(" · ")}`} onClick={() => up({ reportType: t.id, ...defaultConfigFor(t.id, report, form) })} className={`text-left p-2.5 rounded-lg border text-xs ${(report.reportType || "table") === t.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><div className="flex items-center gap-1.5 font-semibold text-slate-900">{t.iconNode}{t.label}</div><div className="text-[10px] text-slate-500 mt-0.5">{t.desc}</div><div className="text-[10px] text-indigo-600/80 mt-1 truncate">{t.useCases[0]}</div></button>)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="Default sort" value={report.defaultSortField || ""} onChange={(e) => up({ defaultSortField: e.target.value || undefined })}><option value="">Newest first</option>{form.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                  <Select label="Order" value={report.defaultSortOrder || "desc"} onChange={(e) => up({ defaultSortOrder: e.target.value as any })}><option value="asc">Ascending</option><option value="desc">Descending</option></Select>
                  <Input label="Page size" type="number" value={report.pageSize || 15} onChange={(e) => up({ pageSize: parseInt(e.target.value) || 15 })} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  <Toggle size="sm" checked={report.showInMenu !== false} onChange={(v) => up({ showInMenu: v })} label="Show in app menu" />
                  <Toggle size="sm" checked={Boolean(report.allowInlineEdit)} onChange={(v) => up({ allowInlineEdit: v })} label="Inline edit (double-click cell)" />
                  <Toggle size="sm" checked={report.allowBulkActions !== false} onChange={(v) => up({ allowBulkActions: v })} label="Bulk select & delete" />
                  <Toggle size="sm" checked={report.allowExport !== false} onChange={(v) => up({ allowExport: v })} label="Export CSV / Excel" />
                  <Toggle size="sm" checked={report.allowImport !== false} onChange={(v) => up({ allowImport: v })} label="Import CSV" />
                  <Toggle size="sm" checked={report.allowPrint !== false} onChange={(v) => up({ allowPrint: v })} label="Print" />
                </div>
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="text-xs font-medium text-slate-700">Quick filter chips (dropdown / checkbox fields)</label>
                  <div className="flex flex-wrap gap-1.5">{form.fields.filter((f) => ["dropdown", "radio", "checkbox", "lookup", "users"].includes(f.type)).map((f) => { const on = report.quickFilterFieldIds?.includes(f.id); return <button key={f.id} type="button" onClick={() => up({ quickFilterFieldIds: on ? (report.quickFilterFieldIds || []).filter((x) => x !== f.id) : [...(report.quickFilterFieldIds || []), f.id] })} className={`px-2.5 py-1 rounded-full text-[11px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div>
                </div>
              </div>
            )}

            {tab === "columns" && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-3xs">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">Columns · order, visibility, width, footer totals</span><div className="flex gap-2"><button type="button" className="text-blue-600 font-semibold" onClick={() => setCols(columns.map((c) => ({ ...c, visible: true })))}>Show all</button><button type="button" className="text-slate-500" onClick={() => setCols(columns.map((c) => ({ ...c, visible: false })))}>Hide all</button></div></div>
                <div className="divide-y divide-slate-100">
                  {[...columns, ...(["createdAt", "createdBy"].filter((s) => !columns.some((c) => c.fieldId === s)).map((s): ReportColumnConfig => ({ fieldId: s, label: s === "createdAt" ? "Created At" : "Created By", visible: false, order: 999 })))].map((c, i, arr) => {
                    const f = form.fields.find((x) => x.id === c.fieldId);
                    const isNum = f && (["number", "currency", "decimal", "percentage", "rollup", "rating"].includes(f.type) || (f.type === "formula" && f.formula?.resultType === "number"));
                    return (
                      <div key={c.fieldId} className={`px-4 py-2 flex items-center gap-3 text-xs ${c.visible ? "" : "opacity-60"}`}>
                        <IconButton size="sm" onClick={() => setCols(arr.map((x) => (x.fieldId === c.fieldId ? { ...x, visible: !x.visible } : x)))}>{c.visible ? <Eye className="w-4 h-4 text-blue-600" /> : <EyeOff className="w-4 h-4" />}</IconButton>
                        <input value={c.label} onChange={(e) => setCols(arr.map((x) => (x.fieldId === c.fieldId ? { ...x, label: e.target.value } : x)))} className="flex-1 font-medium text-slate-800 border border-transparent hover:border-slate-200 rounded px-1.5 py-0.5 min-w-0" />
                        <span className="text-[10px] text-slate-400 font-mono w-20 truncate">{f?.type || "system"}</span>
                        <input type="number" placeholder="width" value={c.width || ""} onChange={(e) => setCols(arr.map((x) => (x.fieldId === c.fieldId ? { ...x, width: e.target.value ? parseInt(e.target.value) : undefined } : x)))} className="w-16 text-[11px] border border-slate-200 rounded px-1.5 py-0.5" />
                        {isNum ? <select value={c.aggregate || ""} onChange={(e) => setCols(arr.map((x) => (x.fieldId === c.fieldId ? { ...x, aggregate: (e.target.value || undefined) as AggregateType } : x)))} className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white"><option value="">no total</option><option value="sum">Σ sum</option><option value="avg">avg</option><option value="min">min</option><option value="max">max</option><option value="count">count</option></select> : <span className="w-[74px]" />}
                        <div className="flex"><IconButton size="sm" disabled={i === 0} onClick={() => { const n = [...arr]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCols(n); }}><ChevronUp className="w-3.5 h-3.5" /></IconButton><IconButton size="sm" disabled={i === arr.length - 1} onClick={() => { const n = [...arr]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setCols(n); }}><ChevronDown className="w-3.5 h-3.5" /></IconButton></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "filters" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-3">
                  <div className="text-xs font-semibold text-slate-700">Default filter (applied every time the report opens)</div>
                  <FilterGroupsEditor form={form} groups={report.filterGroups || []} onChange={(g) => up({ filterGroups: g, filters: [] })} />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-3">
                  <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-700">Saved filters (shared with all users)</div><Button size="xs" variant="outline" onClick={() => up({ savedFilters: [...(report.savedFilters || []), { id: generateId("sf"), name: "New filter", groups: [] }] })} icon={<Plus className="w-3 h-3" />}>Add</Button></div>
                  {(report.savedFilters || []).map((sf) => (
                    <div key={sf.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                      <div className="flex items-center gap-2"><input value={sf.name} onChange={(e) => up({ savedFilters: report.savedFilters!.map((x) => (x.id === sf.id ? { ...x, name: e.target.value } : x)) })} className="flex-1 text-xs font-semibold border border-slate-200 rounded px-2 py-1" /><Checkbox checked={Boolean(sf.isDefault)} onChange={(v) => up({ savedFilters: report.savedFilters!.map((x) => ({ ...x, isDefault: x.id === sf.id ? v : false })) })} label="Default" /><IconButton size="sm" tone="danger" onClick={() => up({ savedFilters: report.savedFilters!.filter((x) => x.id !== sf.id) })}><Trash2 className="w-3.5 h-3.5" /></IconButton></div>
                      <FilterGroupsEditor form={form} groups={sf.groups} onChange={(g) => up({ savedFilters: report.savedFilters!.map((x) => (x.id === sf.id ? { ...x, groups: g } : x)) })} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "view" && (() => {
              const type: ReportType = report.reportType || "table";
              const meta = TYPES.find((t) => t.id === type)!;
              const allFields = form.fields.filter((f) => !["section", "subform"].includes(f.type));
              const cardFieldChips = (selected: string[], onChange: (ids: string[]) => void) => (
                <div className="col-span-2 space-y-1"><label className="text-xs font-medium text-slate-700">Fields shown on each card</label><div className="flex flex-wrap gap-1">{allFields.map((f) => { const on = selected.includes(f.id); return <button key={f.id} type="button" onClick={() => onChange(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div></div>
              );
              return (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="text-blue-600">{meta.iconNode}</span>{meta.label} settings</div>
                    <button type="button" onClick={() => setTab("general")} className="text-[11px] text-blue-600 font-semibold">Change report type in General →</button>
                  </div>
                  <p className="text-[11px] text-slate-500 -mt-2">{meta.desc}. Users can still switch to other views on the live report; those use auto-detected fields.</p>

                  {type === "table" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Select label="Group rows by" value={report.groupByFieldId || ""} onChange={(e) => up({ groupByFieldId: e.target.value || undefined })}><option value="">None</option>{choiceFields.concat(dateFields).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                        <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Group totals</label><div className="flex flex-wrap gap-1">{numericFields.map((f) => { const on = report.groupAggregates?.some((a) => a.fieldId === f.id); return <button key={f.id} type="button" onClick={() => up({ groupAggregates: on ? (report.groupAggregates || []).filter((a) => a.fieldId !== f.id) : [...(report.groupAggregates || []), { fieldId: f.id, aggregate: "sum" }] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"}`}>Σ {f.label}</button>; })}</div></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Toggle size="sm" checked={Boolean(report.showRunningTotal)} onChange={(v) => up({ showRunningTotal: v })} label="Running total column" />
                        {report.showRunningTotal && <Select size="sm" label="Running total of" value={report.runningTotalFieldId || ""} onChange={(e) => up({ runningTotalFieldId: e.target.value })}><option value="">Choose…</option>{numericFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
                      </div>
                      <p className="text-[11px] text-slate-500">Column order, widths and footer totals are under the <button type="button" className="text-blue-600 font-semibold" onClick={() => setTab("columns")}>Columns</button> tab.</p>
                    </>
                  )}

                  {type === "summary" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Select label="Group by" value={report.groupByFieldId || ""} onChange={(e) => up({ groupByFieldId: e.target.value || undefined })}><option value="">Auto (first dropdown / lookup)</option>{choiceFields.concat(dateFields).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Totals per group</label><div className="flex flex-wrap gap-1">{numericFields.map((f) => { const on = report.groupAggregates?.some((a) => a.fieldId === f.id); return <button key={f.id} type="button" onClick={() => up({ groupAggregates: on ? (report.groupAggregates || []).filter((a) => a.fieldId !== f.id) : [...(report.groupAggregates || []), { fieldId: f.id, aggregate: "sum" }] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"}`}>Σ {f.label}</button>; })}</div></div>
                    </div>
                  )}

                  {type === "grid" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Select label="Card title" value={report.grid?.titleFieldId || ""} onChange={(e) => up({ grid: { ...(report.grid || {}), titleFieldId: e.target.value || undefined } })}><option value="">Auto</option>{allFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Subtitle" value={report.grid?.subtitleFieldId || ""} onChange={(e) => up({ grid: { ...(report.grid || {}), subtitleFieldId: e.target.value || undefined } })}><option value="">None</option>{allFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Image field" value={report.grid?.imageFieldId || ""} onChange={(e) => up({ grid: { ...(report.grid || {}), imageFieldId: e.target.value || undefined } })}><option value="">None</option>{form.fields.filter((f) => f.type === "image").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      {cardFieldChips(report.grid?.cardFieldIds || [], (ids) => up({ grid: { ...(report.grid || {}), cardFieldIds: ids } }))}
                    </div>
                  )}

                  {type === "kanban" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Select label="Status field (lanes)" value={report.kanban?.statusFieldId || ""} onChange={(e) => up({ kanban: { ...(report.kanban || {}), statusFieldId: e.target.value } })}><option value="">Auto (first dropdown)</option>{form.fields.filter((f) => f.type === "dropdown" || f.type === "radio").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Card title" value={report.kanban?.titleFieldId || ""} onChange={(e) => up({ kanban: { ...(report.kanban || { statusFieldId: "" }), titleFieldId: e.target.value || undefined } })}><option value="">Auto</option>{allFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      {cardFieldChips(report.kanban?.cardFieldIds || [], (ids) => up({ kanban: { ...(report.kanban || { statusFieldId: "" }), cardFieldIds: ids } }))}
                      <p className="col-span-2 text-[11px] text-slate-500">Lane colours come from the status field&apos;s option colours (Form builder → field → Options).</p>
                    </div>
                  )}

                  {(type === "calendar" || type === "timeline") && (
                    <div className="grid grid-cols-2 gap-3">
                      <Select label={type === "calendar" ? "Date field" : "Date field (order)"} value={report.calendar?.dateFieldId || ""} onChange={(e) => up({ calendar: { ...(report.calendar || {}), dateFieldId: e.target.value } })}><option value="">Auto (first date)</option>{dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      {type === "calendar" && <Select label="End date (multi-day)" value={report.calendar?.endDateFieldId || ""} onChange={(e) => up({ calendar: { ...(report.calendar || { dateFieldId: "" }), endDateFieldId: e.target.value || undefined } })}><option value="">None</option>{dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
                      <Select label="Title" value={report.calendar?.titleFieldId || ""} onChange={(e) => up({ calendar: { ...(report.calendar || { dateFieldId: "" }), titleFieldId: e.target.value || undefined } })}><option value="">Auto</option>{allFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                    </div>
                  )}

                  {type === "pivot" && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Select label="Rows" value={report.pivot?.rowFieldId || ""} onChange={(e) => up({ pivot: { ...(report.pivot || { aggregate: "count" }), rowFieldId: e.target.value } })}><option value="">Choose…</option>{choiceFields.concat(dateFields).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Columns" value={report.pivot?.columnFieldId || ""} onChange={(e) => up({ pivot: { ...(report.pivot || { rowFieldId: "", aggregate: "count" }), columnFieldId: e.target.value || undefined } })}><option value="">None</option>{choiceFields.concat(dateFields).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Value" value={report.pivot?.valueFieldId || ""} onChange={(e) => up({ pivot: { ...(report.pivot || { rowFieldId: "", aggregate: "sum" }), valueFieldId: e.target.value || undefined } })}><option value="">Count</option>{numericFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                      <Select label="Aggregate" value={report.pivot?.aggregate || "count"} onChange={(e) => up({ pivot: { ...(report.pivot || { rowFieldId: "" }), aggregate: e.target.value as AggregateType } })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Avg</option><option value="min">Min</option><option value="max">Max</option></Select>
                    </div>
                  )}

                  {["chart", "ranking", "funnel", "aging", "tree", "list", "checklist", "scheduler", "gantt"].includes(type) && (
                    <AdvancedViewConfig report={report} form={form} up={up} numericFields={numericFields} choiceFields={choiceFields} dateFields={dateFields} only={type} />
                  )}

                  {type === "ledger" && <LedgerConfigEditor report={report} up={up} />}
                </div>
              );
            })()}

            {tab === "format" && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-3">
                <div className="flex items-center justify-between"><div><div className="text-xs font-semibold text-slate-700">Conditional formatting</div><div className="text-[11px] text-slate-500">Colour a cell or the whole row when a condition matches (e.g. balance &lt; min level → red).</div></div><Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => up({ conditionalFormats: [...(report.conditionalFormats || []), { id: generateId("cf"), fieldId: form.fields[0]?.id || "", operator: "less_than", value: "", color: "rose", applyTo: "cell" }] })}>Add rule</Button></div>
                {(report.conditionalFormats || []).map((cf) => (
                  <div key={cf.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-slate-200 p-2.5 text-xs">
                    <span className="text-slate-500">When</span>
                    <select value={cf.fieldId} onChange={(e) => up({ conditionalFormats: report.conditionalFormats!.map((x) => (x.id === cf.id ? { ...x, fieldId: e.target.value } : x)) })} className="border border-slate-300 rounded px-2 py-1 bg-white">{form.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                    <select value={cf.operator} onChange={(e) => up({ conditionalFormats: report.conditionalFormats!.map((x) => (x.id === cf.id ? { ...x, operator: e.target.value as any } : x)) })} className="border border-slate-300 rounded px-2 py-1 bg-white">{OPERATORS.filter((o) => !o.types).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                    <input value={cf.value ?? ""} onChange={(e) => up({ conditionalFormats: report.conditionalFormats!.map((x) => (x.id === cf.id ? { ...x, value: e.target.value } : x)) })} placeholder="value" className="border border-slate-300 rounded px-2 py-1 w-28" />
                    <span className="text-slate-500">→</span>
                    <select value={cf.color} onChange={(e) => up({ conditionalFormats: report.conditionalFormats!.map((x) => (x.id === cf.id ? { ...x, color: e.target.value } : x)) })} className="border border-slate-300 rounded px-2 py-1 bg-white">{Object.entries(FORMAT_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                    <select value={cf.applyTo} onChange={(e) => up({ conditionalFormats: report.conditionalFormats!.map((x) => (x.id === cf.id ? { ...x, applyTo: e.target.value as ConditionalFormat["applyTo"] } : x)) })} className="border border-slate-300 rounded px-2 py-1 bg-white"><option value="cell">cell</option><option value="row">whole row</option></select>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${FORMAT_COLORS[cf.color]?.cell}`}>preview</span>
                    <IconButton size="sm" tone="danger" onClick={() => up({ conditionalFormats: report.conditionalFormats!.filter((x) => x.id !== cf.id) })}><Trash2 className="w-3.5 h-3.5" /></IconButton>
                  </div>
                ))}
                {(report.conditionalFormats || []).length === 0 && <p className="text-xs text-slate-400 text-center py-6 border-2 border-dashed rounded-lg">No formatting rules.</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New report" maxWidth="2xl" footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!newName.trim() || !newForm} onClick={() => { const f = currentApp.forms.find((x) => x.id === newForm)!; const r = createReport(newName.trim(), newForm, { reportType: newType, ...defaultConfigFor(newType, { sourceFormId: newForm }, f) }); setSelectedId(r.id); setCreateOpen(false); setNewName(""); }}>Create</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Pending Purchases" autoFocus />
            <Select label="Source form" value={newForm} onChange={(e) => setNewForm(e.target.value)}><option value="">Choose…</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
          </div>
          {Object.entries(CATEGORY_LABEL).map(([cat, label]) => (
            <div key={cat}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{TYPES.filter((t) => t.category === cat).map((t) => <button key={t.id} type="button" onClick={() => setNewType(t.id)} className={`text-left p-2 rounded-lg border text-xs ${newType === t.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><div className="flex items-center gap-2 font-semibold text-slate-900">{t.iconNode}{t.label}</div><div className="text-[10px] text-slate-500 mt-0.5 truncate">{t.useCases[0]}</div></button>)}</div>
            </div>
          ))}
        </div>
      </Modal>
      {report && form && <AiFixModal isOpen={aiOpen} onClose={() => setAiOpen(false)} kind="report" entity={report} />}
      <ConfirmDialog isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) { deleteReport(deleteId); setSelectedId(null); } }} title="Delete report" message="Delete this report? Records are not affected." />
    </div>
  );
};

/** Config blocks for chart / ranking / funnel / aging / tree / list / checklist / scheduler / gantt. Only the active type is expanded; others collapse. */
const AdvancedViewConfig: React.FC<{ report: ReportDefinition; form: FormDefinition; up: (p: Partial<ReportDefinition>) => void; numericFields: FieldDefinition[]; choiceFields: FieldDefinition[]; dateFields: FieldDefinition[]; only?: ReportType }> = ({ report, form, up, numericFields, choiceFields, dateFields, only }) => {
  const [openType, setOpenType] = useState<ReportType | null>(null);
  const all = form.fields.filter((f) => !["section", "subform"].includes(f.type));
  const opt = (list: FieldDefinition[], none = "Auto") => <><option value="">{none}</option>{list.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</>;
  const set = <K extends "chart" | "ranking" | "funnel" | "aging" | "tree" | "list" | "checklist" | "scheduler" | "gantt">(key: K, patch: Partial<NonNullable<ReportDefinition[K]>>) => up({ [key]: { ...(report[key] || defaultConfigFor(key, report, form)[key] || {}), ...patch } } as Partial<ReportDefinition>);
  const chips = (label: string, selected: string[], onChange: (ids: string[]) => void, list = all) => (
    <div className="col-span-full space-y-1"><label className="text-xs font-medium text-slate-700">{label}</label><div className="flex flex-wrap gap-1">{list.map((f) => { const on = selected.includes(f.id); return <button key={f.id} type="button" onClick={() => onChange(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div></div>
  );
  const sections: Array<{ type: ReportType; body: React.ReactNode }> = [
    { type: "chart", body: <>
      <Select size="sm" label="Chart type" value={report.chart?.chartType || "column"} onChange={(e) => set("chart", { chartType: e.target.value as any })}>{["column", "bar", "stacked", "line", "area", "pie", "donut"].map((t) => <option key={t} value={t}>{t}</option>)}</Select>
      <Select size="sm" label="Group by (X / slices)" value={report.chart?.groupFieldId || ""} onChange={(e) => set("chart", { groupFieldId: e.target.value })}><option value="">Choose…</option><option value="createdAt">Created date</option>{choiceFields.concat(dateFields).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
      <Select size="sm" label="Split series by" value={report.chart?.seriesFieldId || ""} onChange={(e) => set("chart", { seriesFieldId: e.target.value || undefined })}>{opt(choiceFields, "None")}</Select>
      <Select size="sm" label="Value" value={report.chart?.valueFieldId || ""} onChange={(e) => set("chart", { valueFieldId: e.target.value || undefined, aggregate: e.target.value ? "sum" : "count" })}>{opt(numericFields, "Count of records")}</Select>
      <Select size="sm" label="Aggregate" value={report.chart?.aggregate || "count"} onChange={(e) => set("chart", { aggregate: e.target.value as AggregateType })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Avg</option><option value="min">Min</option><option value="max">Max</option></Select>
      <Select size="sm" label="Date bucket" value={report.chart?.dateBucket || "month"} onChange={(e) => set("chart", { dateBucket: e.target.value as any })}>{["day", "week", "month", "year"].map((b) => <option key={b} value={b}>{b}</option>)}</Select>
      <Input size="sm" label="Top N (rest → Other)" type="number" value={report.chart?.limit || ""} onChange={(e) => set("chart", { limit: e.target.value ? parseInt(e.target.value) : undefined })} />
      <Toggle size="sm" checked={Boolean(report.chart?.showTable)} onChange={(v) => set("chart", { showTable: v })} label="Show data table" />
    </> },
    { type: "ranking", body: <>
      <Select size="sm" label="Rank by (group)" value={report.ranking?.groupFieldId || ""} onChange={(e) => set("ranking", { groupFieldId: e.target.value })}>{opt(choiceFields, "Choose…")}</Select>
      <Select size="sm" label="Value" value={report.ranking?.valueFieldId || ""} onChange={(e) => set("ranking", { valueFieldId: e.target.value || undefined, aggregate: e.target.value ? "sum" : "count" })}>{opt(numericFields, "Count of records")}</Select>
      <Select size="sm" label="Aggregate" value={report.ranking?.aggregate || "count"} onChange={(e) => set("ranking", { aggregate: e.target.value as AggregateType })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Avg</option><option value="max">Max</option><option value="min">Min</option></Select>
      <Input size="sm" label="Top N" type="number" value={report.ranking?.top || 10} onChange={(e) => set("ranking", { top: parseInt(e.target.value) || 10 })} />
      <Select size="sm" label="Order" value={report.ranking?.order || "desc"} onChange={(e) => set("ranking", { order: e.target.value as any })}><option value="desc">Highest first</option><option value="asc">Lowest first</option></Select>
      <Input size="sm" label="Target value (optional)" type="number" value={report.ranking?.targetValue ?? ""} onChange={(e) => set("ranking", { targetValue: e.target.value ? parseFloat(e.target.value) : undefined })} />
    </> },
    { type: "funnel", body: <>
      <Select size="sm" label="Stage field" value={report.funnel?.stageFieldId || ""} onChange={(e) => set("funnel", { stageFieldId: e.target.value })}>{opt(form.fields.filter((f) => f.type === "dropdown" || f.type === "radio"), "Choose…")}</Select>
      <Select size="sm" label="Value (sum) instead of count" value={report.funnel?.valueFieldId || ""} onChange={(e) => set("funnel", { valueFieldId: e.target.value || undefined })}>{opt(numericFields, "Count")}</Select>
      {(() => { const sf = form.fields.find((f) => f.id === report.funnel?.stageFieldId); return sf?.options?.length ? <div className="col-span-full space-y-1"><label className="text-xs font-medium text-slate-700">&quot;Won&quot; stages (for conversion %)</label><div className="flex flex-wrap gap-1">{sf.options.map((o) => { const on = report.funnel?.wonStages?.includes(o); return <button key={o} type="button" onClick={() => set("funnel", { wonStages: on ? (report.funnel?.wonStages || []).filter((x) => x !== o) : [...(report.funnel?.wonStages || []), o] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-300"}`}>{o}</button>; })}</div></div> : null; })()}
    </> },
    { type: "aging", body: <>
      <Select size="sm" label="Date (invoice / due)" value={report.aging?.dateFieldId || ""} onChange={(e) => set("aging", { dateFieldId: e.target.value })}>{opt(dateFields, "Choose…")}</Select>
      <Select size="sm" label="Amount" value={report.aging?.amountFieldId || ""} onChange={(e) => set("aging", { amountFieldId: e.target.value })}>{opt(numericFields, "Choose…")}</Select>
      <Select size="sm" label="Less paid amount" value={report.aging?.paidFieldId || ""} onChange={(e) => set("aging", { paidFieldId: e.target.value || undefined })}>{opt(numericFields, "None")}</Select>
      <Select size="sm" label="Party (rows)" value={report.aging?.partyFieldId || ""} onChange={(e) => set("aging", { partyFieldId: e.target.value || undefined })}>{opt(form.fields.filter((f) => ["lookup", "text", "dropdown"].includes(f.type)), "One row per record")}</Select>
      <Input size="sm" label="Buckets (days, comma)" value={(report.aging?.buckets || [30, 60, 90]).join(", ")} onChange={(e) => set("aging", { buckets: e.target.value.split(",").map((x) => parseInt(x.trim())).filter((n) => n > 0) })} />
      <Input size="sm" label="Credit days (grace)" type="number" value={report.aging?.dueDays ?? 0} onChange={(e) => set("aging", { dueDays: parseInt(e.target.value) || 0 })} />
    </> },
    { type: "tree", body: <>
      <Select size="sm" label="Parent field (lookup to this form)" value={report.tree?.parentFieldId || ""} onChange={(e) => set("tree", { parentFieldId: e.target.value })}>{opt(form.fields.filter((f) => f.type === "lookup" && f.lookup?.targetFormId === form.id), "Choose…")}</Select>
      <Select size="sm" label="Title" value={report.tree?.titleFieldId || ""} onChange={(e) => set("tree", { titleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      {chips("Details shown on each node", report.tree?.detailFieldIds || [], (ids) => set("tree", { detailFieldIds: ids }))}
      {!form.fields.some((f) => f.type === "lookup" && f.lookup?.targetFormId === form.id) && <p className="col-span-full text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Add a lookup field in <strong>{form.name}</strong> that points to <strong>{form.name}</strong> itself (e.g. &quot;Parent category&quot;).</p>}
    </> },
    { type: "list", body: <>
      <Select size="sm" label="Title" value={report.list?.titleFieldId || ""} onChange={(e) => set("list", { titleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      <Select size="sm" label="Subtitle" value={report.list?.subtitleFieldId || ""} onChange={(e) => set("list", { subtitleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      <Select size="sm" label="Badge (dropdown)" value={report.list?.badgeFieldId || ""} onChange={(e) => set("list", { badgeFieldId: e.target.value || undefined })}>{opt(form.fields.filter((f) => f.type === "dropdown" || f.type === "radio"), "None")}</Select>
      <Select size="sm" label="Avatar (image)" value={report.list?.avatarFieldId || ""} onChange={(e) => set("list", { avatarFieldId: e.target.value || undefined })}>{opt(form.fields.filter((f) => f.type === "image"), "Initial letter")}</Select>
      {chips("Right-side values", report.list?.metaFieldIds || [], (ids) => set("list", { metaFieldIds: ids }))}
    </> },
    { type: "checklist", body: <>
      <Select size="sm" label="Done (checkbox)" value={report.checklist?.doneFieldId || ""} onChange={(e) => set("checklist", { doneFieldId: e.target.value })}>{opt(form.fields.filter((f) => f.type === "checkbox"), "Choose…")}</Select>
      <Select size="sm" label="Title" value={report.checklist?.titleFieldId || ""} onChange={(e) => set("checklist", { titleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      <Select size="sm" label="Due date" value={report.checklist?.dueFieldId || ""} onChange={(e) => set("checklist", { dueFieldId: e.target.value || undefined })}>{opt(dateFields, "None")}</Select>
      <Select size="sm" label="Assignee" value={report.checklist?.assigneeFieldId || ""} onChange={(e) => set("checklist", { assigneeFieldId: e.target.value || undefined })}>{opt(form.fields.filter((f) => ["users", "lookup", "text"].includes(f.type)), "None")}</Select>
      <Toggle size="sm" checked={Boolean(report.checklist?.hideDone)} onChange={(v) => set("checklist", { hideDone: v })} label="Collapse completed by default" />
      {!form.fields.some((f) => f.type === "checkbox") && <p className="col-span-full text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Add a checkbox field (e.g. &quot;Done&quot;) to <strong>{form.name}</strong> first.</p>}
    </> },
    { type: "scheduler", body: <>
      <Select size="sm" label="Resource (rows)" value={report.scheduler?.resourceFieldId || ""} onChange={(e) => set("scheduler", { resourceFieldId: e.target.value })}>{opt(form.fields.filter((f) => ["lookup", "dropdown", "users", "radio"].includes(f.type)), "Choose…")}</Select>
      <Select size="sm" label="Start date" value={report.scheduler?.dateFieldId || ""} onChange={(e) => set("scheduler", { dateFieldId: e.target.value })}>{opt(dateFields, "Choose…")}</Select>
      <Select size="sm" label="End date" value={report.scheduler?.endDateFieldId || ""} onChange={(e) => set("scheduler", { endDateFieldId: e.target.value || undefined })}>{opt(dateFields, "Same day")}</Select>
      <Select size="sm" label="Title on cell" value={report.scheduler?.titleFieldId || ""} onChange={(e) => set("scheduler", { titleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      <Select size="sm" label="Default view" value={report.scheduler?.mode || "week"} onChange={(e) => set("scheduler", { mode: e.target.value as any })}><option value="week">Week</option><option value="month">Month</option></Select>
    </> },
    { type: "gantt", body: <>
      <Select size="sm" label="Start date" value={report.gantt?.startFieldId || ""} onChange={(e) => set("gantt", { startFieldId: e.target.value })}>{opt(dateFields, "Choose…")}</Select>
      <Select size="sm" label="End date" value={report.gantt?.endFieldId || ""} onChange={(e) => set("gantt", { endFieldId: e.target.value || undefined })}>{opt(dateFields, "Milestone (same as start)")}</Select>
      <Select size="sm" label="Title" value={report.gantt?.titleFieldId || ""} onChange={(e) => set("gantt", { titleFieldId: e.target.value || undefined })}>{opt(all)}</Select>
      <Select size="sm" label="Swimlane (group)" value={report.gantt?.groupFieldId || ""} onChange={(e) => set("gantt", { groupFieldId: e.target.value || undefined })}>{opt(choiceFields, "None")}</Select>
      <Select size="sm" label="Progress % field" value={report.gantt?.progressFieldId || ""} onChange={(e) => set("gantt", { progressFieldId: e.target.value || undefined })}>{opt(numericFields, "None")}</Select>
      <Select size="sm" label="Colour by (dropdown)" value={report.gantt?.colorFieldId || ""} onChange={(e) => set("gantt", { colorFieldId: e.target.value || undefined })}>{opt(form.fields.filter((f) => f.type === "dropdown"), "None")}</Select>
    </> },
  ];
  if (only) {
    const s = sections.find((x) => x.type === only);
    return s ? <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">{s.body}</div> : null;
  }
  return (
    <div className="border-t border-slate-100 pt-4 space-y-2">
      <div className="text-xs font-semibold text-slate-800">Other view settings</div>
      {sections.map((s) => { const meta = TYPES.find((t) => t.id === s.type)!; const active = (report.reportType || "table") === s.type; const open = active || openType === s.type; return (
        <div key={s.type} className={`rounded-lg border ${active ? "border-blue-300 bg-blue-50/30" : "border-slate-200"}`}>
          <button type="button" onClick={() => setOpenType(open && !active ? null : s.type)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800"><span className="text-slate-500">{meta.iconNode}</span>{meta.label}{active && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-px rounded-full">default view</span>}<span className="ml-auto text-slate-400">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span></button>
          {open && <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-3 gap-3 items-end">{s.body}</div>}
        </div>); })}
    </div>
  );
};

const LedgerConfigEditor: React.FC<{ report: ReportDefinition; up: (p: Partial<ReportDefinition>) => void }> = ({ report, up }) => {
  const { currentApp } = useAppBuilder();
  if (!currentApp) return null;
  const cfg = report.ledger || { primaryFormId: report.sourceFormId, displayFieldIds: [], sources: [] };
  const primary = currentApp.forms.find((f) => f.id === cfg.primaryFormId);
  const setCfg = (p: Partial<typeof cfg>) => up({ ledger: { ...cfg, ...p } });
  const setSrc = (id: string, p: Partial<LedgerSource>) => setCfg({ sources: cfg.sources.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const pathOptions = (formId: string, kind: "lookup" | "number") => {
    const f = currentApp.forms.find((x) => x.id === formId);
    if (!f) return [];
    const top = f.fields.filter((x) => (kind === "lookup" ? x.type === "lookup" && x.lookup?.targetFormId === cfg.primaryFormId : ["number", "currency", "decimal"].includes(x.type))).map((x) => ({ id: x.id, label: x.label }));
    const sub = f.fields.filter((x) => x.type === "subform").flatMap((sf) => (sf.subform?.columns || []).filter((c) => (kind === "lookup" ? c.type === "lookup" && c.lookup?.targetFormId === cfg.primaryFormId : ["number", "currency", "decimal", "formula"].includes(c.type))).map((c) => ({ id: `${sf.id}.${c.id}`, label: `${sf.label} › ${c.label}` })));
    return [...top, ...sub];
  };
  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><Layers className="w-4 h-4 text-indigo-600" /> Ledger configuration</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Select size="sm" label="Primary form (items)" value={cfg.primaryFormId} onChange={(e) => setCfg({ primaryFormId: e.target.value, sources: [] })}>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Select size="sm" label="Opening balance field" value={cfg.openingBalanceFieldId || ""} onChange={(e) => setCfg({ openingBalanceFieldId: e.target.value || undefined })}><option value="">None</option>{primary?.fields.filter((f) => ["number", "currency", "decimal"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
        <Select size="sm" label="Minimum level field" value={cfg.minLevelFieldId || ""} onChange={(e) => setCfg({ minLevelFieldId: e.target.value || undefined })}><option value="">None</option>{primary?.fields.filter((f) => ["number", "decimal"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
        <Select size="sm" label="Unit field" value={cfg.unitFieldId || ""} onChange={(e) => setCfg({ unitFieldId: e.target.value || undefined })}><option value="">None</option>{primary?.fields.filter((f) => ["text", "dropdown"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
      </div>
      <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/60">
        <div className="text-xs font-semibold text-slate-800">Summary tiles (above the table)</div>
        <div className="flex flex-wrap gap-1">
          {([
            ["items", "Items tracked"], ["inflow", "Total inflow"], ["outflow", "Total outflow"], ["closing", "Total / closing balance"], ["low", "Low stock"], ["negative", "Negative balance"],
            ...cfg.sources.map((s) => [`source:${s.id}`, `${s.label} total`] as [string, string]),
          ] as Array<[string, string]>).map(([id, label]) => { const current = (cfg.tiles?.length ? cfg.tiles : DEFAULT_LEDGER_TILES) as string[]; const on = current.includes(id); return <button key={id} type="button" onClick={() => setCfg({ tiles: (on ? current.filter((x) => x !== id) : [...current, id]) as LedgerTile[] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"}`}>{label}</button>; })}
        </div>
        <p className="text-[11px] text-slate-500">&quot;Low stock&quot; needs a Minimum level field; &quot;Total inflow&quot; needs at least one inflow source. Tiles that can only be zero say why on the live report.</p>
        <div className="grid grid-cols-2 gap-3 items-end pt-1">
          <Toggle size="sm" checked={cfg.showPeriodFilter !== false} onChange={(v) => setCfg({ showPeriodFilter: v })} label="Period filter (Today, Last 7 days, custom…)" />
          <Select size="sm" label="Default period" value={cfg.defaultPreset || ""} onChange={(e) => setCfg({ defaultPreset: (e.target.value || undefined) as DatePreset | undefined })}><option value="">All time</option>{DATE_PRESETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
        </div>
      </div>
      <div className="space-y-1"><label className="text-xs font-medium text-slate-700">Columns to show from {primary?.name}</label><div className="flex flex-wrap gap-1">{primary?.fields.filter((f) => !["section", "subform"].includes(f.type)).map((f) => { const on = cfg.displayFieldIds.includes(f.id); return <button key={f.id} type="button" onClick={() => setCfg({ displayFieldIds: on ? cfg.displayFieldIds.filter((x) => x !== f.id) : [...cfg.displayFieldIds, f.id] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div></div>
      <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-700">Inflow / outflow sources</span><Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => setCfg({ sources: [...cfg.sources, { id: generateId("src"), label: "Purchases", formId: "", matchFieldId: "", qtyFieldId: "", direction: "in" }] })}>Add source</Button></div>
      {cfg.sources.map((s) => { const sf = currentApp.forms.find((f) => f.id === s.formId); return (
        <div key={s.id} className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/60">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
            <Input size="sm" label="Label" value={s.label} onChange={(e) => setSrc(s.id, { label: e.target.value })} />
            <Select size="sm" label="Direction" value={s.direction} onChange={(e) => setSrc(s.id, { direction: e.target.value as any })}><option value="in">Inflow (+)</option><option value="out">Outflow (−)</option></Select>
            <Select size="sm" label="Form" value={s.formId} onChange={(e) => setSrc(s.id, { formId: e.target.value, matchFieldId: "", qtyFieldId: "" })}><option value="">Choose…</option>{currentApp.forms.filter((f) => f.id !== cfg.primaryFormId).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            <Select size="sm" label="Item lookup" value={s.matchFieldId} onChange={(e) => setSrc(s.id, { matchFieldId: e.target.value })}><option value="">Choose…</option>{pathOptions(s.formId, "lookup").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
            <Select size="sm" label="Quantity" value={s.qtyFieldId} onChange={(e) => setSrc(s.id, { qtyFieldId: e.target.value })}><option value="">Choose…</option>{pathOptions(s.formId, "number").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
            <Select size="sm" label="Date field" value={s.dateFieldId || ""} onChange={(e) => setSrc(s.id, { dateFieldId: e.target.value || undefined })}><option value="">Created at</option>{sf?.fields.filter((f) => f.type === "date" || f.type === "datetime").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
            <Select size="sm" label="Reference field" value={s.refFieldId || ""} onChange={(e) => setSrc(s.id, { refFieldId: e.target.value || undefined })}><option value="">Record id</option>{sf?.fields.filter((f) => ["autonumber", "text", "lookup"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
            <Button size="xs" variant="ghost" className="text-rose-600" onClick={() => setCfg({ sources: cfg.sources.filter((x) => x.id !== s.id) })} icon={<Trash2 className="w-3 h-3" />}>Remove</Button>
          </div>
          {sf && <div><label className="text-[11px] font-medium text-slate-600">Only count records where</label><SimpleFilterList form={sf} filters={s.filters || []} onChange={(f) => setSrc(s.id, { filters: f })} /></div>}
        </div>); })}
      {cfg.sources.length === 0 && <p className="text-xs text-slate-400 text-center py-4 border-2 border-dashed rounded-lg">Add at least one inflow (e.g. Purchase) and one outflow (e.g. Usage) source.</p>}
      <p className="text-[11px] text-slate-500 flex items-center gap-1"><Sigma className="w-3 h-3" /> Balance = opening + Σ inflow − Σ outflow. Sources may point at subform line items (PO items → Item).</p>
    </div>
  );
};
