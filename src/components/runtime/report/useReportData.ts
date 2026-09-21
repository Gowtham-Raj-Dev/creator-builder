"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterGroup, FormDefinition, RecordDefinition, ReportDefinition, ReportColumnConfig, SavedFilter } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { recordMatchesFilters, recordMatchesGroups, sortRecords, groupRecords, RecordGroup, SYSTEM_FIELDS } from "@/lib/engine/reportEngine";
import { generateId } from "@/lib/utils/idGenerator";

export interface ReportDataState {
  records: RecordDefinition[]; // filtered + sorted (all pages)
  paginated: RecordDefinition[];
  groups: RecordGroup[] | null;
  allColumns: ReportColumnConfig[];
  visibleColumns: ReportColumnConfig[];
  search: string;
  setSearch: (v: string) => void;
  quickFilters: Record<string, string>;
  setQuickFilter: (fieldId: string, value: string) => void;
  quickFilterFields: { id: string; label: string; options: string[] }[];
  filterGroups: FilterGroup[];
  setFilterGroups: (g: FilterGroup[]) => void;
  activeSavedFilterId: string | null;
  applySavedFilter: (id: string | null) => void;
  savedFilters: SavedFilter[];
  saveCurrentFilter: (name: string) => void;
  deleteSavedFilter: (id: string) => void;
  myRecordsOnly: boolean;
  setMyRecordsOnly: (v: boolean) => void;
  sortField: string | null;
  sortOrder: "asc" | "desc";
  toggleSort: (fieldId: string) => void;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalPages: number;
  activeFilterCount: number;
  clearAll: () => void;
  groupBy: string | null;
  setGroupBy: (f: string | null) => void;
  displayValue: (rec: RecordDefinition, fieldId: string) => string;
}

export function useReportData(report: ReportDefinition, form: FormDefinition, opts: { recordFilter?: (rec: RecordDefinition) => boolean } = {}): ReportDataState {
  const { recordFilter } = opts;
  const { recordsMap, getDisplayValue, permissions } = useLiveApp();
  const { user } = useAuth();
  const raw = recordsMap[form.id] || [];

  const [search, setSearch] = useState("");
  const [quickFilters, setQuickFilters] = useState<Record<string, string>>({});
  const [filterGroups, setFilterGroupsState] = useState<FilterGroup[]>(report.filterGroups?.length ? report.filterGroups : report.filters?.length ? [{ id: "g1", logic: "AND", filters: report.filters }] : []);
  const [activeSavedFilterId, setActiveSaved] = useState<string | null>(report.savedFilters?.find((s) => s.isDefault)?.id || null);
  const [localSaved, setLocalSaved] = useState<SavedFilter[]>([]);
  const [myRecordsOnly, setMyRecordsOnly] = useState(false);
  const [sortField, setSortField] = useState<string | null>(report.defaultSortField || null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(report.defaultSortOrder || "desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(report.pageSize || 15);
  const [groupBy, setGroupBy] = useState<string | null>(report.groupByFieldId || null);

  useEffect(() => {
    try { setLocalSaved(JSON.parse(localStorage.getItem(`yb_savedfilters_${report.id}`) || "[]")); } catch { /* ignore */ }
  }, [report.id]);

  useEffect(() => {
    if (activeSavedFilterId) {
      const sf = [...(report.savedFilters || []), ...localSaved].find((s) => s.id === activeSavedFilterId);
      if (sf) setFilterGroupsState(sf.groups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSavedFilterId, localSaved.length]);

  const displayValue = useCallback((rec: RecordDefinition, fieldId: string) => getDisplayValue(form, rec, fieldId), [getDisplayValue, form]);

  const allColumns = useMemo(() => {
    const cols: ReportColumnConfig[] = [];
    (report.columns || []).forEach((c) => {
      const field = form.fields.find((f) => f.id === c.fieldId) || SYSTEM_FIELDS.find((s) => s.id === c.fieldId);
      if (field) cols.push({ ...c, label: c.label || field.label, visible: c.visible !== false, order: c.order ?? cols.length });
    });
    form.fields.forEach((f) => {
      if (f.type === "section") return;
      if (!cols.some((c) => c.fieldId === f.id)) cols.push({ fieldId: f.id, label: f.label, visible: f.showInReport !== false && f.type !== "subform" && f.type !== "richtext" && f.type !== "signature", order: cols.length });
    });
    return cols.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((c) => permissions.fieldRule(form.id, c.fieldId) !== "hidden");
  }, [report.columns, form, permissions]);

  const visibleColumns = useMemo(() => allColumns.filter((c) => c.visible), [allColumns]);

  const quickFilterFields = useMemo(() => {
    const ids = report.quickFilterFieldIds?.length ? report.quickFilterFieldIds : form.fields.filter((f) => ["dropdown", "radio", "checkbox"].includes(f.type)).slice(0, 3).map((f) => f.id);
    return ids
      .map((id) => form.fields.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => {
        const options = f!.type === "checkbox" ? ["Yes", "No"] : f!.options?.length ? f!.options : Array.from(new Set(raw.map((r) => displayValue(r, f!.id)).filter(Boolean))).sort();
        return { id: f!.id, label: f!.label, options };
      });
  }, [report.quickFilterFieldIds, form.fields, raw, displayValue]);

  const records = useMemo(() => {
    let out = raw.filter((r) => permissions.canSeeRecord(form.id, r, user?.email));
    if (recordFilter) out = out.filter(recordFilter); // e.g. a dashboard's date range
    if (myRecordsOnly && user) out = out.filter((r) => (r.createdBy || "").toLowerCase() === user.email);
    // quick filters
    const active = Object.entries(quickFilters).filter(([, v]) => v && v !== "ALL");
    if (active.length) out = out.filter((r) => active.every(([fid, v]) => { const f = form.fields.find((x) => x.id === fid); if (f?.type === "checkbox") return (r.data?.[fid] ? "Yes" : "No") === v; return displayValue(r, fid) === v; }));
    // filter groups
    out = out.filter((r) => recordMatchesGroups(r, filterGroups, form));
    // legacy simple filters that are not in groups
    if (report.filters?.length && !report.filterGroups?.length && filterGroups.length === 0) out = out.filter((r) => recordMatchesFilters(r, report.filters!, form));
    // search
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => r.id.toLowerCase().includes(q) || visibleColumns.some((c) => displayValue(r, c.fieldId).toLowerCase().includes(q)));
    return sortRecords(out, sortField, sortOrder, form);
  }, [raw, permissions, form, user, recordFilter, myRecordsOnly, quickFilters, filterGroups, report.filters, report.filterGroups, search, visibleColumns, displayValue, sortField, sortOrder]);

  const groups = useMemo(() => (groupBy ? groupRecords(records, groupBy, displayValue, report.groupAggregates || []) : null), [groupBy, records, displayValue, report.groupAggregates]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const paginated = useMemo(() => records.slice((page - 1) * pageSize, page * pageSize), [records, page, pageSize]);

  useEffect(() => { setPage(1); }, [search, quickFilters, filterGroups, myRecordsOnly, pageSize, sortField, sortOrder]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleSort = (fieldId: string) => {
    if (sortField === fieldId) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(fieldId); setSortOrder("asc"); }
  };

  const setFilterGroups = (g: FilterGroup[]) => { setFilterGroupsState(g); setActiveSaved(null); };

  const saveCurrentFilter = (name: string) => {
    const sf: SavedFilter = { id: generateId("sf"), name, groups: filterGroups };
    const next = [...localSaved, sf];
    setLocalSaved(next);
    try { localStorage.setItem(`yb_savedfilters_${report.id}`, JSON.stringify(next)); } catch { /* ignore */ }
    setActiveSaved(sf.id);
  };
  const deleteSavedFilter = (id: string) => {
    const next = localSaved.filter((s) => s.id !== id);
    setLocalSaved(next);
    try { localStorage.setItem(`yb_savedfilters_${report.id}`, JSON.stringify(next)); } catch { /* ignore */ }
    if (activeSavedFilterId === id) setActiveSaved(null);
  };

  const activeFilterCount = Object.values(quickFilters).filter((v) => v && v !== "ALL").length + filterGroups.reduce((s, g) => s + g.filters.length, 0) + (myRecordsOnly ? 1 : 0);

  return {
    records, paginated, groups, allColumns, visibleColumns,
    search, setSearch, quickFilters, setQuickFilter: (f, v) => setQuickFilters((p) => ({ ...p, [f]: v })), quickFilterFields,
    filterGroups, setFilterGroups, activeSavedFilterId, applySavedFilter: (id) => { setActiveSaved(id); if (!id) setFilterGroupsState([]); },
    savedFilters: [...(report.savedFilters || []), ...localSaved], saveCurrentFilter, deleteSavedFilter,
    myRecordsOnly, setMyRecordsOnly, sortField, sortOrder, toggleSort, page, setPage, pageSize, setPageSize, totalPages, activeFilterCount,
    clearAll: () => { setSearch(""); setQuickFilters({}); setFilterGroupsState([]); setActiveSaved(null); setMyRecordsOnly(false); },
    groupBy, setGroupBy, displayValue,
  };
}
