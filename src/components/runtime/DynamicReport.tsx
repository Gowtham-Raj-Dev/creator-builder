"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormDefinition, RecordDefinition, ReportDefinition, ReportType } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { Button, IconButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { LivePrintModal as PrintModal } from "./LivePrintModal";
import { useReportData } from "./report/useReportData";
import { FilterGroupsEditor } from "./report/FilterBuilder";
import { TableView, GridView, KanbanView, CalendarView, SummaryView, PivotView, TimelineView, TrashView } from "./report/views";
import { ListView, TreeView, ChecklistView, FunnelView, SchedulerView, GanttView, ChartView, RankingView, AgingView } from "./report/advancedViews";
import { RecordDrawer } from "./report/RecordDrawer";
import { ImportModal } from "./report/ImportModal";
import { BulkEditPanel } from "./report/BulkEditPanel";
import { LedgerReport } from "./report/LedgerReport";
import { toCsv, downloadText, downloadExcel } from "@/lib/engine/reportEngine";
import { REPORT_TYPES, REPORT_TYPE_META, AUTO_CONFIG_VIEWS } from "@/lib/engine/reportTypes";
import { Icon } from "@/components/ui/IconPicker";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { useToast } from "@/context/ToastContext";
import {
  Search, Plus, Printer, SlidersHorizontal, Eye, EyeOff, ChevronDown, Filter, X, Download, Upload, Trash2,
  ChevronLeft, ChevronRight, Bookmark, User, RotateCcw, MoreHorizontal, LayoutGrid, Edit,
} from "lucide-react";

interface DynamicReportProps {
  report: ReportDefinition;
  form: FormDefinition;
  onAddRecord?: () => void;
  onEditRecord?: (recordId: string) => void;
  embedded?: boolean;
  initialView?: string;
  /** Extra always-on predicate (a dashboard's date range, for example). */
  recordFilter?: (rec: RecordDefinition) => boolean;
  /** Short note shown next to the record count when `recordFilter` is active, e.g. "Last 7 days". */
  filterNote?: string;
}

const VIEW_ICONS: Record<ReportType, React.ReactNode> = Object.fromEntries(REPORT_TYPES.map((t) => [t.id, <Icon key={t.id} name={t.icon} className="w-3.5 h-3.5" />])) as Record<ReportType, React.ReactNode>;
/** Views shown as icons in the strip; everything else sits under "More views". */
const PRIMARY_VIEWS: ReportType[] = ["table", "grid", "kanban", "calendar", "summary", "chart"];

export const DynamicReport: React.FC<DynamicReportProps> = ({ report, form, onAddRecord, onEditRecord, embedded, initialView, recordFilter, filterNote }) => {
  const router = useRouter();
  const { app, recordsMap, trashMap, deleteRecord, deleteRecords, restoreRecord, purgeRecord, duplicateRecord, updateRecord, updateReportColumns, updateReportSettings, permissions, getDisplayValue } = useLiveApp();

  if (report.reportType === "ledger" || (report as any).reportType === "reconciliation") {
    return <LedgerReport key={report.id} report={report} form={form} />;
  }
  // key by report id so switching reports never carries view/selection/filter state across
  return <StandardReport key={report.id} report={report} form={form} onAddRecord={onAddRecord} onEditRecord={onEditRecord} embedded={embedded} initialView={initialView} recordFilter={recordFilter} filterNote={filterNote} ctx={{ router, app, recordsMap, trashMap, deleteRecord, deleteRecords, restoreRecord, purgeRecord, duplicateRecord, updateRecord, updateReportColumns, updateReportSettings, permissions, getDisplayValue }} />;
};

const StandardReport: React.FC<DynamicReportProps & { ctx: any }> = ({ report, form, onAddRecord, onEditRecord, embedded, initialView, recordFilter, filterNote, ctx }) => {
  const { showToast } = useToast();
  const { router, app, trashMap, deleteRecord, deleteRecords, restoreRecord, purgeRecord, duplicateRecord, updateRecord, updateReportColumns, updateReportSettings, permissions } = ctx;
  const data = useReportData(report, form, { recordFilter });
  const rawPerm = permissions.form(form.id);
  // the Print button appears only when the owner marked a default print design for this form (Builder → Print designs)
  const hasDesign = Boolean((app?.printTemplates || []).some((t: any) => t.formId === form.id && t.isDefault));
  const perm = { ...rawPerm, print: rawPerm.print && hasDesign };
  const rperm = permissions.report(report.id);
  const defaultView: ReportType = report.reportType || "table";
  const [view, setView] = useState<ReportType | "trash">((initialView as ReportType) || defaultView);
  const [savingView, setSavingView] = useState(false);
  // the switcher is a preview until saved; a non-trash view that differs from the report's default is "unsaved"
  const viewDirty = view !== "trash" && view !== defaultView;
  const saveView = async () => {
    if (!viewDirty) return;
    setSavingView(true);
    try { await updateReportSettings(report.id, { reportType: view as ReportType }); } finally { setSavingView(false); }
  };
  const discardView = () => setView(defaultView);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerRecord, setDrawerRecord] = useState<RecordDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordDefinition | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftGroups, setDraftGroups] = useState(data.filterGroups);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [print, setPrint] = useState<{ record?: RecordDefinition | null; open: boolean }>({ open: false });
  const colRef = React.useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  React.useEffect(() => {
    const q = searchParams.get("q");
    if (q) data.setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => { if (colRef.current && !colRef.current.contains(e.target as Node)) setColumnsOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const actions = useMemo(
    () => ({
      onOpen: (rec: RecordDefinition) => setDrawerRecord(rec),
      onEdit: perm.edit ? (rec: RecordDefinition) => { setDrawerRecord(null); if (onEditRecord) onEditRecord(rec.id); else if (app) router.push(getLiveAppUrl(app.linkName, { form: form.linkName, recordId: rec.id })); } : undefined,
      onDelete: perm.delete ? (rec: RecordDefinition) => setDeleteTarget(rec) : undefined,
      onPrint: perm.print ? (rec: RecordDefinition) => setPrint({ record: rec, open: true }) : undefined,
      onDuplicate: perm.create ? async (rec: RecordDefinition) => { const r = await duplicateRecord(form.id, rec.id); if (r) setDrawerRecord(r); } : undefined,
      onCopyLink: app ? async (rec: RecordDefinition) => {
        const url = `${window.location.origin}${getLiveAppUrl(app.linkName, { form: form.linkName, recordId: rec.id })}`;
        try { await navigator.clipboard.writeText(url); showToast("Record link copied", "success"); } catch { showToast(url, "info"); }
      } : undefined,
      onLookupClick: (fieldId: string, targetId: string) => {
        const f = form.fields.find((x) => x.id === fieldId);
        const tf = f?.lookup && app?.forms.find((x: FormDefinition) => x.id === f.lookup!.targetFormId);
        if (tf && app) router.push(getLiveAppUrl(app.linkName, { form: tf.linkName, recordId: targetId }));
      },
    }),
    [perm, onEditRecord, app, router, form, duplicateRecord, showToast]
  );

  const exportRows = () => {
    const headers = data.visibleColumns.map((c) => c.label);
    return { headers, rows: data.records.map((r) => data.visibleColumns.map((c) => data.displayValue(r, c.fieldId))) };
  };

  // icon strip: the primary views plus this report's default; the rest are reachable from "More views"
  const stripViews: ReportType[] = PRIMARY_VIEWS.includes(defaultView) ? PRIMARY_VIEWS : [defaultView, ...PRIMARY_VIEWS];
  const moreViews = REPORT_TYPES.filter((t) => t.id !== "ledger" && !stripViews.includes(t.id));
  const needsConfig = (v: ReportType) => !AUTO_CONFIG_VIEWS.includes(v) && v !== defaultView && !(report as any)[v];
  const toggleColumn = async (fieldId: string) => {
    const cols = data.allColumns.map((c) => (c.fieldId === fieldId ? { ...c, visible: !c.visible } : c));
    await updateReportColumns(report.id, cols);
  };
  const resizeColumn = (fieldId: string, width: number) => updateReportColumns(report.id, data.allColumns.map((c) => (c.fieldId === fieldId ? { ...c, width } : c)));

  const trashRecords: RecordDefinition[] = trashMap[form.id] || [];
  const permsForViews = { edit: perm.edit, delete: perm.delete, print: perm.print, create: perm.create };
  const common = { report, form, records: data.records, displayValue: data.displayValue, actions, perms: permsForViews };

  return (
    <div className={`${embedded ? "" : "max-w-[1600px] mx-auto"} space-y-4`}>
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Header */}
        <div className={`${embedded ? "p-4" : "p-5"} flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className={`${embedded ? "text-base" : "text-lg"} font-bold text-slate-900 tracking-tight`}>{report.name}</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{data.records.length} records</span>
              {recordFilter && filterNote && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">{filterNote}</span>}
              {selected.size > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-white">{selected.size} selected</span>}
            </div>
            {!embedded && <p className="text-xs text-slate-500 mt-0.5">{report.description || <>Records of <span className="font-semibold text-slate-700">{form.name}</span>. Click a row for details.</>}</p>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input value={data.search} onChange={(e) => data.setSearch(e.target.value)} placeholder={`Search ${form.name}…`} className="w-48 md:w-56 text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/25 bg-white shadow-2xs" />
            </div>

            {/* view switcher */}
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {stripViews.map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} title={`${REPORT_TYPE_META[v]?.label || v}${v === defaultView ? " (default)" : ""}`} className={`relative p-1.5 rounded-md transition-all ${view === v ? "bg-white text-blue-700 shadow-3xs" : "text-slate-500 hover:text-slate-800"}`}>
                  {VIEW_ICONS[v]}
                  {v === defaultView && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" aria-hidden />}
                </button>
              ))}
              <Dropdown
                trigger={<button type="button" title="More views" className={`p-1.5 rounded-md transition-all flex items-center ${view !== "trash" && !stripViews.includes(view as ReportType) ? "bg-white text-blue-700 shadow-3xs" : "text-slate-500 hover:text-slate-800"}`}>{view !== "trash" && !stripViews.includes(view as ReportType) ? VIEW_ICONS[view as ReportType] : <LayoutGrid className="w-3.5 h-3.5" />}<ChevronDown className="w-3 h-3 ml-0.5" /></button>}
                width="w-64"
                items={moreViews.map((t) => ({ id: t.id, label: t.label, description: needsConfig(t.id) ? "Needs setup in the builder" : t.desc, icon: <Icon name={t.icon} className="w-3.5 h-3.5" />, onClick: () => setView(t.id) }))}
              />
              {app?.settings?.enableTrash !== false && perm.delete && (
                <button type="button" onClick={() => setView("trash")} title="Trash" className={`p-1.5 rounded-md transition-all ${view === "trash" ? "bg-white text-rose-600 shadow-3xs" : "text-slate-500 hover:text-rose-600"}`}><Trash2 className="w-3.5 h-3.5" />{trashRecords.length > 0 && <span className="sr-only">{trashRecords.length}</span>}</button>
              )}
            </div>

            <Button variant={data.filterGroups.length ? "subtle" : "outline"} size="sm" onClick={() => { setDraftGroups(data.filterGroups); setFilterOpen(true); }} icon={<SlidersHorizontal className="w-3.5 h-3.5" />}>
              Filters{data.activeFilterCount > 0 && <span className="ml-1 px-1.5 py-px bg-blue-600 text-white rounded-full text-[10px] font-bold">{data.activeFilterCount}</span>}
            </Button>

            {view === "table" && (
              <div className="relative" ref={colRef}>
                <Button variant="outline" size="sm" onClick={() => setColumnsOpen((o) => !o)} icon={<Eye className="w-3.5 h-3.5" />}>Columns<ChevronDown className="w-3 h-3 ml-1 text-slate-400" /></Button>
                {columnsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95">
                    <div className="px-2 py-1.5 text-[11px] font-bold text-slate-900 flex items-center justify-between border-b border-slate-100 mb-1">
                      <span>Show / hide columns</span>
                      <button type="button" className="text-blue-600" onClick={() => updateReportColumns(report.id, data.allColumns.map((c) => ({ ...c, visible: true })))}>Show all</button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {data.allColumns.map((c) => (
                        <button key={c.fieldId} type="button" onClick={() => toggleColumn(c.fieldId)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left ${c.visible ? "text-slate-900 hover:bg-blue-50" : "text-slate-400 hover:bg-slate-50"}`}>
                          {c.visible ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5" />}<span className="truncate">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Dropdown
              trigger={<Button variant="outline" size="sm" icon={<MoreHorizontal className="w-3.5 h-3.5" />} />}
              items={[
                { id: "print", label: hasDesign ? "Print report" : "Print report (no print design set)", icon: <Printer className="w-3.5 h-3.5" />, onClick: () => setPrint({ open: true }), disabled: !rperm.print || !hasDesign },
                { id: "csv", label: "Export CSV", icon: <Download className="w-3.5 h-3.5" />, onClick: () => { const { headers, rows } = exportRows(); downloadText(`${report.linkName}.csv`, toCsv(headers, rows)); }, disabled: !rperm.export },
                { id: "xls", label: "Export Excel", icon: <Download className="w-3.5 h-3.5" />, onClick: () => { const { headers, rows } = exportRows(); downloadExcel(`${report.linkName}.xlsx`, headers, rows, report.name); }, disabled: !rperm.export },
                { id: "d1", label: "", divider: true },
                { id: "import", label: "Import CSV", icon: <Upload className="w-3.5 h-3.5" />, onClick: () => setImportOpen(true), disabled: !perm.import },
                { id: "d2", label: "", divider: true },
                { id: "reset", label: "Reset filters & sort", icon: <RotateCcw className="w-3.5 h-3.5" />, onClick: data.clearAll },
              ]}
            />

            {perm.create && (onAddRecord ? (
              <Button size="sm" onClick={onAddRecord} icon={<Plus className="w-4 h-4" />}>Add {form.name}</Button>
            ) : app ? (
              <Button size="sm" onClick={() => router.push(getLiveAppUrl(app.linkName, { form: form.linkName, action: "new" }))} icon={<Plus className="w-4 h-4" />}>Add {form.name}</Button>
            ) : null)}
          </div>
        </div>

        {/* Unsaved view bar: the switcher only previews until saved */}
        {viewDirty && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap text-xs">
            <span className="flex items-center gap-1.5 text-amber-900 font-medium">
              <span className="text-amber-600">{VIEW_ICONS[view as ReportType]}</span>
              Previewing <span className="font-bold capitalize">{view}</span> view — default for this report is <span className="font-bold capitalize">{defaultView}</span>.
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={discardView} icon={<RotateCcw className="w-3.5 h-3.5" />}>Remove changes</Button>
              <Button size="sm" loading={savingView} onClick={saveView} icon={<Bookmark className="w-3.5 h-3.5" />}>{permissions.canEditBuilder ? "Save as default view" : "Save for me"}</Button>
            </div>
          </div>
        )}

        {/* Quick filter bar */}
        {(data.quickFilterFields.length > 0 || data.savedFilters.length > 0) && view !== "trash" && (
          <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center gap-3 flex-wrap text-xs">
            <span className="font-semibold text-slate-600 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5 text-blue-600" />Quick:</span>
            <button type="button" onClick={() => data.setMyRecordsOnly(!data.myRecordsOnly)} className={`px-2.5 py-1 rounded-full border text-[11px] font-medium flex items-center gap-1 ${data.myRecordsOnly ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"}`}><User className="w-3 h-3" /> My records</button>
            {data.quickFilterFields.map((qf) => (
              <select key={qf.id} value={data.quickFilters[qf.id] || "ALL"} onChange={(e) => data.setQuickFilter(qf.id, e.target.value)} className={`text-[11px] border rounded-full px-2.5 py-1 bg-white ${data.quickFilters[qf.id] && data.quickFilters[qf.id] !== "ALL" ? "border-blue-500 text-blue-700 font-semibold" : "border-slate-300 text-slate-600"}`}>
                <option value="ALL">{qf.label}: All</option>
                {qf.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {data.savedFilters.length > 0 && (
              <select value={data.activeSavedFilterId || ""} onChange={(e) => data.applySavedFilter(e.target.value || null)} className="text-[11px] border border-slate-300 rounded-full px-2.5 py-1 bg-white ml-auto">
                <option value="">Saved filters…</option>
                {data.savedFilters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {data.activeFilterCount > 0 && <button type="button" onClick={data.clearAll} className="text-[11px] text-rose-600 font-semibold flex items-center gap-1"><X className="w-3 h-3" />Clear</button>}
          </div>
        )}

        {/* Bulk bar */}
        {selected.size > 0 && view === "table" && (
          <div className="px-5 py-2 bg-slate-900 text-white text-xs flex items-center justify-between">
            <span className="font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              {rperm.export && <Button size="xs" variant="secondary" onClick={() => { const rows = data.records.filter((r) => selected.has(r.id)); downloadText(`${report.linkName}_selected.csv`, toCsv(data.visibleColumns.map((c) => c.label), rows.map((r) => data.visibleColumns.map((c) => data.displayValue(r, c.fieldId))))); }} icon={<Download className="w-3 h-3" />}>Export</Button>}
              {perm.edit && <Button size="xs" variant="secondary" onClick={() => setBulkEditOpen(true)} icon={<Edit className="w-3 h-3" />}>Edit</Button>}
              {perm.delete && <Button size="xs" variant="danger" onClick={() => setBulkDeleteOpen(true)} icon={<Trash2 className="w-3 h-3" />}>Delete</Button>}
              <IconButton size="sm" className="text-white/70 hover:text-white hover:bg-white/10" onClick={() => setSelected(new Set())}><X className="w-4 h-4" /></IconButton>
            </div>
          </div>
        )}

        {/* Body */}
        {view === "table" && (
          <TableView {...common} records={data.groups ? data.records : data.paginated} columns={data.visibleColumns} groups={data.groups} sortField={data.sortField} sortOrder={data.sortOrder} onSort={data.toggleSort} selected={selected} onToggleSelect={(id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} onToggleAll={(ids) => setSelected(new Set(ids))} inlineEdit={report.allowInlineEdit} onInlineSave={async (rec, fid, val) => { await updateRecord(form.id, rec.id, { [fid]: val }, { silent: true }); }} onResizeColumn={resizeColumn} />
        )}
        {view === "grid" && <GridView {...common} records={data.paginated} />}
        {view === "kanban" && <KanbanView {...common} onMove={perm.edit ? async (rec, status) => { const sf = form.fields.find((f) => f.id === report.kanban?.statusFieldId) || form.fields.find((f) => f.type === "dropdown" || f.type === "radio"); if (sf) await updateRecord(form.id, rec.id, { [sf.id]: status }, { silent: true }); } : undefined} />}
        {view === "calendar" && <CalendarView {...common} />}
        {view === "timeline" && <TimelineView {...common} />}
        {view === "summary" && (
          <div>
            <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2 text-xs"><span className="font-semibold text-slate-600">Group by</span>
              <select value={data.groupBy || report.groupByFieldId || ""} onChange={(e) => data.setGroupBy(e.target.value || null)} className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"><option value="">Choose field…</option>{form.fields.filter((f) => !["section", "subform"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
            <SummaryView {...common} groupBy={data.groupBy} />
          </div>
        )}
        {view === "pivot" && <PivotView {...common} />}
        {view === "list" && <ListView {...common} records={data.paginated} />}
        {view === "tree" && <TreeView {...common} />}
        {view === "checklist" && <ChecklistView {...common} onToggle={perm.edit ? async (rec, done) => { const df = form.fields.find((f) => f.id === report.checklist?.doneFieldId) || form.fields.find((f) => f.type === "checkbox"); if (df) await updateRecord(form.id, rec.id, { [df.id]: done }, { silent: true }); } : undefined} />}
        {view === "funnel" && <FunnelView {...common} />}
        {view === "scheduler" && <SchedulerView {...common} />}
        {view === "gantt" && <GanttView {...common} />}
        {view === "chart" && <ChartView {...common} />}
        {view === "ranking" && <RankingView {...common} />}
        {view === "aging" && <AgingView {...common} />}
        {view === "trash" && <TrashView form={form} records={trashRecords} displayValue={data.displayValue} onRestore={(r) => restoreRecord(form.id, r.id)} onPurge={(r) => purgeRecord(form.id, r.id)} canDelete={permissions.isAdmin} />}

        {/* Pagination */}
        {(view === "table" || view === "grid" || view === "list") && !data.groups && (
          <div className="p-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-[#f8fafc]">
            <div className="flex items-center gap-3">
              <span>Showing <strong className="text-slate-700">{data.paginated.length}</strong> of <strong className="text-slate-700">{data.records.length}</strong></span>
              <select value={data.pageSize} onChange={(e) => data.setPageSize(Number(e.target.value))} className="border border-slate-300 rounded-md px-1.5 py-1 bg-white text-[11px]">{[10, 15, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
              {view === "table" && <label className="flex items-center gap-1.5"><span>Group by</span><select value={data.groupBy || ""} onChange={(e) => data.setGroupBy(e.target.value || null)} className="border border-slate-300 rounded-md px-1.5 py-1 bg-white text-[11px]"><option value="">None</option>{form.fields.filter((f) => ["dropdown", "radio", "lookup", "checkbox", "date", "users", "text"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={data.page === 1} onClick={() => data.setPage(data.page - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />}>Prev</Button>
              <span className="px-3 py-1 font-semibold text-slate-700">{data.page} / {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={data.page === data.totalPages} onClick={() => data.setPage(data.page + 1)} iconRight={<ChevronRight className="w-3.5 h-3.5" />}>Next</Button>
            </div>
          </div>
        )}
        {view === "table" && data.groups && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-[#f8fafc]">
            <span>{data.groups.length} groups · {data.records.length} records</span>
            <button type="button" className="text-blue-600 font-semibold" onClick={() => data.setGroupBy(null)}>Ungroup</button>
          </div>
        )}
      </div>

      {/* Filter modal */}
      <Modal isOpen={filterOpen} onClose={() => setFilterOpen(false)} title="Filter records" description="Conditions inside a group use AND/OR; separate groups are combined with OR." maxWidth="3xl" icon={<SlidersHorizontal className="w-4 h-4" />}
        footer={<>
          <div className="mr-auto flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5 text-slate-400" />
            <input value={saveFilterName} onChange={(e) => setSaveFilterName(e.target.value)} placeholder="Save as…" className="text-xs border border-slate-300 rounded-md px-2 py-1.5 w-36" />
            <Button variant="outline" size="sm" disabled={!saveFilterName.trim() || draftGroups.length === 0} onClick={() => { data.setFilterGroups(draftGroups); data.saveCurrentFilter(saveFilterName.trim()); setSaveFilterName(""); setFilterOpen(false); }}>Save</Button>
          </div>
          <Button variant="outline" onClick={() => { setDraftGroups([]); data.setFilterGroups([]); setFilterOpen(false); }}>Clear</Button>
          <Button onClick={() => { data.setFilterGroups(draftGroups); setFilterOpen(false); }}>Apply</Button>
        </>}>
        <FilterGroupsEditor form={form} groups={draftGroups} onChange={setDraftGroups} />
        {data.savedFilters.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Saved filters</div>
            <div className="flex flex-wrap gap-1.5">{data.savedFilters.map((s) => <span key={s.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200"><button type="button" onClick={() => { setDraftGroups(s.groups); }}>{s.name}</button><button type="button" onClick={() => data.deleteSavedFilter(s.id)} className="text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button></span>)}</div>
          </div>
        )}
      </Modal>

      <RecordDrawer form={form} record={drawerRecord} onClose={() => setDrawerRecord(null)} onEdit={actions.onEdit} onDelete={(rec) => { setDrawerRecord(null); setDeleteTarget(rec); }} onPrint={actions.onPrint} onDuplicate={actions.onDuplicate} onLookupClick={actions.onLookupClick} />

      {importOpen && <ImportModal form={form} onClose={() => setImportOpen(false)} />}

      <PrintModal isOpen={print.open} onClose={() => setPrint({ open: false })} form={form} record={print.record} records={print.record ? undefined : data.records} reportName={report.name} />

      <ConfirmDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (deleteTarget) { await deleteRecord(form.id, deleteTarget.id); setDrawerRecord(null); } }} title="Delete record" message={app?.settings?.enableTrash !== false ? "This record will be moved to the trash. You can restore it later." : "This record will be permanently deleted."} isDestructive />
      {bulkEditOpen && <BulkEditPanel form={form} records={data.records.filter((r) => selected.has(r.id))} onClose={() => setBulkEditOpen(false)} onDone={(n) => { if (n) setSelected(new Set()); }} />}
      <ConfirmDialog isOpen={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} onConfirm={async () => { await deleteRecords(form.id, Array.from(selected)); setSelected(new Set()); }} title={`Delete ${selected.size} records`} message="Selected records will be moved to the trash." isDestructive />
    </div>
  );
};
