"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReportDefinition,
  FormDefinition,
  RecordDefinition,
  FieldDefinition,
  ReportColumnConfig,
  ReportFilter,
} from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PrintModal } from "./PrintModal";
import { ReconciliationReport } from "./ReconciliationReport";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Printer,
  X,
  ExternalLink,
  SlidersHorizontal,
  Eye,
  EyeOff,
  ChevronDown,
  Filter,
  Check,
  RotateCcw,
} from "lucide-react";

interface DynamicReportProps {
  report: ReportDefinition;
  form: FormDefinition;
  onAddRecord?: () => void;
  onEditRecord?: (recordId: string) => void;
}

export const DynamicReport: React.FC<DynamicReportProps> = ({
  report,
  form,
  onAddRecord,
  onEditRecord,
}) => {
  const router = useRouter();
  const { app, recordsMap, deleteRecord, updateReportColumns } = useLiveApp();

  // If this report is configured as a cross-form reconciliation report, delegate to ReconciliationReport!
  if (report.reportType === "reconciliation") {
    return (
      <ReconciliationReport
        report={report}
        primaryForm={form}
        onAddPurchase={onAddRecord}
        onAddUsage={onAddRecord}
      />
    );
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string | null>(report.defaultSortField || null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(report.defaultSortOrder || "asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Quick Filters state: fieldId -> selected value
  const [quickFilters, setQuickFilters] = useState<Record<string, string>>({});

  // Custom Filter Modal & rules state
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [customFilterLogic, setCustomFilterLogic] = useState<"AND" | "OR">("AND");
  const [customFilters, setCustomFilters] = useState<ReportFilter[]>(report.filters || []);
  const [draftFilters, setDraftFilters] = useState<ReportFilter[]>(report.filters || []);

  // Slide-Over Detail Drawer state
  const [selectedRecord, setSelectedRecord] = useState<RecordDefinition | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Print Modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printRecordTarget, setPrintRecordTarget] = useState<RecordDefinition | null>(null);

  // Column Management Popover state
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setIsColumnMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const rawRecords = recordsMap[form.id] || [];
  const pageSize = report.pageSize || 15;

  // Complete column configuration: merged form.fields & report.columns
  const allColumns = useMemo(() => {
    const configured = report.columns || [];
    const cols: ReportColumnConfig[] = [];

    // Keep configured columns with order and visible state
    configured.forEach((c) => {
      const field = form.fields.find((f) => f.id === c.fieldId);
      if (field) {
        cols.push({
          fieldId: c.fieldId,
          label: c.label || field.label,
          visible: c.visible !== false,
          order: c.order ?? cols.length,
        });
      }
    });

    // Add any fields in form that are not yet in report.columns
    form.fields.forEach((f) => {
      if (!cols.some((c) => c.fieldId === f.id)) {
        cols.push({
          fieldId: f.id,
          label: f.label,
          visible: true,
          order: cols.length,
        });
      }
    });

    return cols.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [form.fields, report.columns]);

  // Active columns to display
  const displayColumns = useMemo(() => {
    const visibleCols = allColumns.filter((c) => c.visible);
    return visibleCols.length > 0 ? visibleCols : allColumns.slice(0, 1);
  }, [allColumns]);

  // Determine Quick-Filterable fields (status, category, dropdowns, lookups)
  const quickFilterFields = useMemo(() => {
    if (report.quickFilterFieldIds && report.quickFilterFieldIds.length > 0) {
      return report.quickFilterFieldIds
        .map((id) => form.fields.find((f) => f.id === id))
        .filter((f): f is FieldDefinition => Boolean(f));
    }
    // Auto-detect candidate fields: dropdowns, lookups
    return form.fields
      .filter((f) => f.type === "dropdown" || f.type === "lookup" || f.type === "checkbox")
      .slice(0, 3);
  }, [form.fields, report.quickFilterFieldIds]);

  // Toggle single column visibility (persisted to storage)
  const handleToggleColumnVisibility = async (fieldId: string) => {
    const updated = allColumns.map((c) =>
      c.fieldId === fieldId ? { ...c, visible: !c.visible } : c
    );
    await updateReportColumns(report.id, updated);
  };

  // Show all columns
  const handleShowAllColumns = async () => {
    const updated = allColumns.map((c) => ({ ...c, visible: true }));
    await updateReportColumns(report.id, updated);
  };

  // Reset to default columns
  const handleResetColumns = async () => {
    const updated: ReportColumnConfig[] = form.fields.map((f, i) => ({
      fieldId: f.id,
      label: f.label,
      visible: true,
      order: i,
    }));
    await updateReportColumns(report.id, updated);
  };

  // Resolve cell display value
  const getCellValue = (rec: RecordDefinition, fieldId: string): string => {
    const field = form.fields.find((f) => f.id === fieldId);
    if (!field) return "-";

    const val = rec.data?.[field.id];
    if (val === undefined || val === null || val === "") return "-";

    if (field.type === "lookup" && field.lookup) {
      const targetRecords = recordsMap[field.lookup.targetFormId] || [];
      return resolveLookupDisplay(val, targetRecords, field.lookup.displayFieldId);
    }

    if (field.type === "currency") {
      return formatCurrency(val, field.currencySymbol || "₹", field.decimalPlaces ?? 2);
    }

    if (field.type === "percentage") {
      return `${val}%`;
    }

    if (field.type === "date") {
      return formatDate(val);
    }

    if (field.type === "checkbox") {
      return val ? "Yes" : "No";
    }

    if (field.type === "subform") {
      const count = Array.isArray(val) ? val.length : 0;
      return `${count} line item(s)`;
    }

    return String(val);
  };

  // Filter & Search records (evaluates Quick Filters + Custom Filters + Search Query)
  const filteredRecords = useMemo(() => {
    let result = rawRecords;

    // 1. Quick Filters
    const activeQuick = Object.entries(quickFilters).filter(([_, v]) => v && v !== "ALL");
    if (activeQuick.length > 0) {
      result = result.filter((rec) => {
        for (const [fId, val] of activeQuick) {
          const recVal = rec.data?.[fId];
          if (recVal === undefined || recVal === null) return false;
          if (String(recVal).toLowerCase() !== String(val).toLowerCase()) {
            return false;
          }
        }
        return true;
      });
    }

    // 2. Custom Filter Rules
    if (customFilters.length > 0) {
      result = result.filter((rec) => {
        const matchesRule = (filter: ReportFilter): boolean => {
          const val = rec.data?.[filter.fieldId];
          const target = filter.value;
          const op = filter.operator;

          if (op === "is_empty") {
            return (
              val === undefined ||
              val === null ||
              val === "" ||
              (Array.isArray(val) && val.length === 0)
            );
          }
          if (op === "is_not_empty") {
            return (
              val !== undefined &&
              val !== null &&
              val !== "" &&
              (!Array.isArray(val) || val.length > 0)
            );
          }

          if (val === undefined || val === null) return false;

          const numVal = typeof val === "number" ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
          const numTarget = typeof target === "number" ? target : parseFloat(String(target).replace(/[^0-9.-]+/g, ""));

          if (!isNaN(numVal) && !isNaN(numTarget) && (op === "greater_than" || op === "less_than")) {
            return op === "greater_than" ? numVal > numTarget : numVal < numTarget;
          }

          const sVal = String(val).toLowerCase().trim();
          const sTarget = String(target || "").toLowerCase().trim();

          switch (op) {
            case "equals":
              return sVal === sTarget;
            case "not_equals":
              return sVal !== sTarget;
            case "contains":
              return sVal.includes(sTarget);
            case "starts_with":
              return sVal.startsWith(sTarget);
            case "greater_than":
              return sVal > sTarget;
            case "less_than":
              return sVal < sTarget;
            default:
              return true;
          }
        };

        if (customFilterLogic === "AND") {
          return customFilters.every(matchesRule);
        } else {
          return customFilters.some(matchesRule);
        }
      });
    }

    // 3. Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((rec) => {
        for (const col of displayColumns) {
          const strVal = getCellValue(rec, col.fieldId).toLowerCase();
          if (strVal.includes(query)) return true;
        }
        return false;
      });
    }

    return result;
  }, [
    rawRecords,
    quickFilters,
    customFilters,
    customFilterLogic,
    searchQuery,
    displayColumns,
    form.fields,
    recordsMap,
  ]);

  // Sort records
  const sortedRecords = useMemo(() => {
    if (!sortField) return filteredRecords;

    return [...filteredRecords].sort((a, b) => {
      const valA = getCellValue(a, sortField);
      const valB = getCellValue(b, sortField);

      const numA = parseFloat(valA.replace(/[^0-9.-]+/g, ""));
      const numB = parseFloat(valB.replace(/[^0-9.-]+/g, ""));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === "asc" ? numA - numB : numB - numA;
      }

      return sortOrder === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [filteredRecords, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const handleSortClick = (fieldId: string) => {
    if (sortField === fieldId) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(fieldId);
      setSortOrder("asc");
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteTargetId) {
      await deleteRecord(form.id, deleteTargetId);
      setDeleteTargetId(null);
      if (selectedRecord?.id === deleteTargetId) {
        setIsDrawerOpen(false);
        setSelectedRecord(null);
      }
    }
  };

  const handleOpenRowDetail = (rec: RecordDefinition) => {
    setSelectedRecord(rec);
    setIsDrawerOpen(true);
  };

  const handleOpenPrintRecord = (rec: RecordDefinition, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPrintRecordTarget(rec);
    setIsPrintModalOpen(true);
  };

  const handleOpenPrintReport = () => {
    setPrintRecordTarget(null);
    setIsPrintModalOpen(true);
  };

  // Navigate to target form report when clicking a lookup field
  const handleLookupClick = (field: FieldDefinition, targetRecId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!app || !field.lookup) return;

    const targetForm = app.forms.find((f) => f.id === field.lookup?.targetFormId);
    if (!targetForm) return;

    const targetRep = app.reports.find((r) => r.sourceFormId === targetForm.id);
    if (targetRep) {
      router.push(`/${app.linkName}/reports/${targetRep.linkName}`);
    } else {
      router.push(`/${app.linkName}/${targetForm.linkName}`);
    }
  };

  // Custom filter handlers
  const handleAddDraftFilter = () => {
    const firstField = form.fields.find((f) => f.type !== "subform") || form.fields[0];
    if (!firstField) return;

    setDraftFilters((prev) => [
      ...prev,
      {
        fieldId: firstField.id,
        operator: "equals",
        value: "",
      },
    ]);
  };

  const handleUpdateDraftFilter = (index: number, updates: Partial<ReportFilter>) => {
    setDraftFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const handleRemoveDraftFilter = (index: number) => {
    setDraftFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyCustomFilters = () => {
    setCustomFilters([...draftFilters]);
    setIsFilterModalOpen(false);
    setCurrentPage(1);
  };

  const handleClearAllCustomFilters = () => {
    setDraftFilters([]);
    setCustomFilters([]);
    setIsFilterModalOpen(false);
    setCurrentPage(1);
  };

  const handleRemoveSingleCustomFilter = (index: number) => {
    setCustomFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearQuickFilter = (fieldId: string) => {
    setQuickFilters((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setQuickFilters({});
    setCustomFilters([]);
    setSearchQuery("");
    setCurrentPage(1);
  };

  const activeQuickCount = Object.values(quickFilters).filter((v) => v && v !== "ALL").length;
  const totalActiveFilters = activeQuickCount + customFilters.length;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Unified Enterprise Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Top Header & Search Bar */}
        <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{report.name}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                {sortedRecords.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Live records table for <span className="font-semibold text-slate-700">{form.name}</span>. Click any row to inspect details.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search bar */}
            <div className="relative w-full md:w-60">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={`Search ${form.name}...`}
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400 shadow-2xs"
              />
            </div>

            {/* Custom Filter Settings Button */}
            <Button
              variant={customFilters.length > 0 ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setDraftFilters([...customFilters]);
                setIsFilterModalOpen(true);
              }}
              icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
              title="Configure custom filter conditions"
            >
              Filter Options
              {customFilters.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-white/20 text-white rounded-full text-[10px] font-bold">
                  {customFilters.length}
                </span>
              )}
            </Button>

            {/* Print Report Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenPrintReport}
              icon={<Printer className="w-3.5 h-3.5 text-slate-600" />}
              title="Print entire report"
            >
              Print Report
            </Button>

            {/* Columns Visibility Eye Dropdown */}
            <div className="relative" ref={columnDropdownRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsColumnMenuOpen((prev) => !prev)}
                icon={<Eye className="w-3.5 h-3.5 text-slate-600" />}
                title="Toggle Columns Visibility"
              >
                Columns ({displayColumns.length}/{allColumns.length})
                <ChevronDown className="w-3 h-3 ml-1 text-slate-400" />
              </Button>

              {isColumnMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-3 space-y-2.5 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900">Show / Hide Columns</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleShowAllColumns}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        Show All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleResetColumns}
                        className="text-[11px] font-medium text-slate-500 hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {allColumns.map((c) => {
                      const isVisible = c.visible;
                      return (
                        <div
                          key={c.fieldId}
                          onClick={() => handleToggleColumnVisibility(c.fieldId)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                            isVisible
                              ? "bg-blue-50/50 hover:bg-blue-50 text-slate-900"
                              : "hover:bg-slate-100 text-slate-400 opacity-70"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isVisible ? (
                              <Eye className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate font-medium">{c.label}</span>
                          </div>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isVisible
                                ? "bg-blue-100/70 text-blue-700"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {isVisible ? "Visible" : "Hidden"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Click eye to toggle column</span>
                    <span>Auto-saved</span>
                  </div>
                </div>
              )}
            </div>

            {onAddRecord ? (
              <Button size="sm" onClick={onAddRecord} icon={<Plus className="w-4 h-4" />}>
                + Add {form.name}
              </Button>
            ) : (
              app && (
                <Link href={`/${app.linkName}/${form.linkName}/new`}>
                  <Button size="sm" icon={<Plus className="w-4 h-4" />}>
                    + Add {form.name}
                  </Button>
                </Link>
              )
            )}
          </div>
        </div>

        {/* Quick Filter Bar (Instant 1-click Filter Options) */}
        {quickFilterFields.length > 0 && (
          <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-4 flex-wrap">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              Quick Filters:
            </span>

            {quickFilterFields.map((field) => {
              const activeVal = quickFilters[field.id] || "ALL";

              // 1. Dropdown fields with <= 4 options: Render Quick Pill buttons
              if (field.type === "dropdown" && field.options && field.options.length <= 4) {
                return (
                  <div key={field.id} className="flex items-center gap-1 p-0.5 bg-white border border-slate-200 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-400 px-2">{field.label}:</span>
                    <button
                      onClick={() => {
                        handleClearQuickFilter(field.id);
                      }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors font-medium ${
                        activeVal === "ALL"
                          ? "bg-slate-900 text-white font-semibold shadow-3xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All
                    </button>
                    {field.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setQuickFilters((prev) => ({ ...prev, [field.id]: opt }));
                          setCurrentPage(1);
                        }}
                        className={`px-2 py-0.5 rounded text-xs transition-colors font-medium ${
                          activeVal === opt
                            ? "bg-blue-600 text-white font-semibold shadow-3xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                );
              }

              // 2. Dropdown or Lookup fields with more options: Render Quick Select
              if (field.type === "dropdown" && field.options) {
                return (
                  <div key={field.id} className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-slate-500">{field.label}:</span>
                    <select
                      value={activeVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "ALL") {
                          handleClearQuickFilter(field.id);
                        } else {
                          setQuickFilters((prev) => ({ ...prev, [field.id]: val }));
                          setCurrentPage(1);
                        }
                      }}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">All {field.label}s</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              // 3. Lookup field: Render Quick Select of target records
              if (field.type === "lookup" && field.lookup) {
                const targetRecs = recordsMap[field.lookup.targetFormId] || [];
                return (
                  <div key={field.id} className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-slate-500">{field.label}:</span>
                    <select
                      value={activeVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "ALL") {
                          handleClearQuickFilter(field.id);
                        } else {
                          setQuickFilters((prev) => ({ ...prev, [field.id]: val }));
                          setCurrentPage(1);
                        }
                      }}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">All {field.label}s</option>
                      {targetRecs.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {resolveLookupDisplay(tr.id, targetRecs, field.lookup!.displayFieldId)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}

        {/* Active Filter Chips Bar (Visible when any filter is active) */}
        {totalActiveFilters > 0 && (
          <div className="px-5 py-2.5 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between gap-3 flex-wrap animate-in fade-in">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                Applied Filters ({totalActiveFilters}):
              </span>

              {/* Quick filter chips */}
              {Object.entries(quickFilters).map(([fId, val]) => {
                if (!val || val === "ALL") return null;
                const field = form.fields.find((f) => f.id === fId);
                let displayVal = val;
                if (field?.type === "lookup" && field.lookup) {
                  const targetRecs = recordsMap[field.lookup.targetFormId] || [];
                  displayVal = resolveLookupDisplay(val, targetRecs, field.lookup.displayFieldId);
                }

                return (
                  <span
                    key={`quick-${fId}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-blue-700 border border-blue-200 shadow-3xs"
                  >
                    <span className="text-slate-400">{field?.label || fId}:</span>
                    <span className="font-semibold">{displayVal}</span>
                    <button
                      type="button"
                      onClick={() => handleClearQuickFilter(fId)}
                      className="text-blue-400 hover:text-blue-700 ml-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                );
              })}

              {/* Custom filter chips */}
              {customFilters.map((cf, idx) => {
                const field = form.fields.find((f) => f.id === cf.fieldId);
                return (
                  <span
                    key={`custom-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white text-indigo-700 border border-indigo-200 shadow-3xs"
                  >
                    <span className="text-slate-400">{field?.label || cf.fieldId}</span>
                    <span className="font-mono text-[11px] text-indigo-500">{cf.operator}</span>
                    {cf.operator !== "is_empty" && cf.operator !== "is_not_empty" && (
                      <span className="font-semibold">{String(cf.value)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveSingleCustomFilter(idx)}
                      className="text-indigo-400 hover:text-indigo-700 ml-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>

            <button
              onClick={handleClearAllFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear All Filters
            </button>
          </div>
        )}

        {/* Scrollable Table Area with Horizontal Scroll for all fields */}
        <div className="overflow-x-auto min-w-full pb-2">
          <table className="w-full min-w-[850px] text-left text-xs text-slate-700 border-collapse">
            <thead className="bg-[#f8fafc] text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="w-12 px-4 py-3.5 text-center text-slate-400 font-mono text-[11px] sticky left-0 bg-[#f8fafc] z-10">
                  #
                </th>
                {displayColumns.map((col) => {
                  const isSorted = sortField === col.fieldId;

                  return (
                    <th
                      key={col.fieldId}
                      className="group px-4 py-3.5 whitespace-nowrap select-none font-semibold text-slate-700 min-w-[130px] transition-colors hover:bg-slate-100/80"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div
                          onClick={() => handleSortClick(col.fieldId)}
                          className="flex items-center gap-1.5 cursor-pointer flex-1"
                        >
                          <span>{col.label}</span>
                          <ArrowUpDown
                            className={`w-3.5 h-3.5 ${
                              isSorted ? "text-blue-600 font-bold" : "text-slate-300"
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleColumnVisibility(col.fieldId);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-rose-500 transition-all"
                          title={`Hide ${col.label} column`}
                        >
                          <EyeOff className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="w-28 px-4 py-3.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayColumns.length + 2}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    <p className="font-medium text-slate-600">No records found</p>
                    <p className="text-xs mt-1">
                      {searchQuery || totalActiveFilters > 0
                        ? "Try clearing your search query or custom filters"
                        : `No records entered yet for ${form.name}.`}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec, index) => {
                  const rowNum = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr
                      key={rec.id}
                      onClick={() => handleOpenRowDetail(rec)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3.5 text-center font-mono text-[11px] text-slate-400 sticky left-0 bg-white group-hover:bg-blue-50/50 z-10">
                        {rowNum}
                      </td>

                      {displayColumns.map((col) => {
                        const field = form.fields.find((f) => f.id === col.fieldId);
                        const cellVal = getCellValue(rec, col.fieldId);
                        const isLookup = field?.type === "lookup" && rec.data?.[col.fieldId];

                        return (
                          <td
                            key={col.fieldId}
                            className="px-4 py-3.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs font-medium text-slate-800"
                          >
                            {isLookup ? (
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleLookupClick(field!, rec.data?.[col.fieldId], e)
                                }
                                className="text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-1 group/lookup"
                                title="Click to view related record"
                              >
                                <span>{cellVal}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover/lookup:opacity-100 transition-opacity text-blue-500" />
                              </button>
                            ) : (
                              cellVal
                            )}
                          </td>
                        );
                      })}

                      <td
                        className="px-4 py-3.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {/* Print record button */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenPrintRecord(rec, e)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                            title="Print Record"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit record button */}
                          {onEditRecord ? (
                            <button
                              type="button"
                              onClick={() => onEditRecord(rec.id)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                              title="Edit Record"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            app && (
                              <Link
                                href={`/${app.linkName}/${form.linkName}/${rec.id}`}
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                                title="Edit Record"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Link>
                            )
                          )}

                          {/* Delete record button */}
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(rec.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Enterprise Pagination Bar */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-[#f8fafc]">
          <div>
            Showing <span className="font-semibold text-slate-700">{paginatedRecords.length}</span> of{" "}
            <span className="font-semibold text-slate-700">{sortedRecords.length}</span> records
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Previous
            </Button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              icon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Custom Filter Settings Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Custom Filter Settings</h3>
                  <p className="text-xs text-slate-500">Configure multi-rule criteria for {report.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Match Condition Logic (AND / OR) */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">Condition Logic:</span>
                <div className="flex items-center gap-1 bg-white p-0.5 border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCustomFilterLogic("AND")}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      customFilterLogic === "AND"
                        ? "bg-blue-600 text-white shadow-3xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Match ALL Rules (AND)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFilterLogic("OR")}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      customFilterLogic === "OR"
                        ? "bg-blue-600 text-white shadow-3xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Match ANY Rule (OR)
                  </button>
                </div>
              </div>

              {/* Filter Rules List */}
              <div className="space-y-2.5">
                {draftFilters.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                    <p className="text-xs text-slate-500 font-medium">No custom filter rules defined yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click &quot;+ Add Filter Rule&quot; below to add criteria
                    </p>
                  </div>
                ) : (
                  draftFilters.map((filter, idx) => {
                    const selectedField = form.fields.find((f) => f.id === filter.fieldId);

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-3xs"
                      >
                        {/* 1. Field Select */}
                        <div className="w-1/3">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Column
                          </label>
                          <select
                            value={filter.fieldId}
                            onChange={(e) =>
                              handleUpdateDraftFilter(idx, { fieldId: e.target.value, value: "" })
                            }
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {form.fields
                              .filter((f) => f.type !== "subform")
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label} ({f.type})
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* 2. Operator Select */}
                        <div className="w-1/4">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Operator
                          </label>
                          <select
                            value={filter.operator}
                            onChange={(e) =>
                              handleUpdateDraftFilter(idx, {
                                operator: e.target.value as any,
                              })
                            }
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                          >
                            <option value="equals">equals (=)</option>
                            <option value="not_equals">not equals (!=)</option>
                            <option value="contains">contains</option>
                            <option value="starts_with">starts with</option>
                            <option value="greater_than">greater than (&gt;)</option>
                            <option value="less_than">less than (&lt;)</option>
                            <option value="is_empty">is empty</option>
                            <option value="is_not_empty">is not empty</option>
                          </select>
                        </div>

                        {/* 3. Value Input */}
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Value
                          </label>
                          {filter.operator === "is_empty" || filter.operator === "is_not_empty" ? (
                            <div className="text-xs text-slate-400 italic py-1.5 px-2 bg-slate-50 rounded-lg border border-slate-200">
                              (No value needed)
                            </div>
                          ) : selectedField?.type === "dropdown" && selectedField.options ? (
                            <select
                              value={filter.value || ""}
                              onChange={(e) => handleUpdateDraftFilter(idx, { value: e.target.value })}
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">-- Select Option --</option>
                              {selectedField.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : selectedField?.type === "lookup" && selectedField.lookup ? (
                            <select
                              value={filter.value || ""}
                              onChange={(e) => handleUpdateDraftFilter(idx, { value: e.target.value })}
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                              <option value="">-- Select Record --</option>
                              {(recordsMap[selectedField.lookup.targetFormId] || []).map((tr) => (
                                <option key={tr.id} value={tr.id}>
                                  {resolveLookupDisplay(
                                    tr.id,
                                    recordsMap[selectedField.lookup!.targetFormId] || [],
                                    selectedField.lookup!.displayFieldId
                                  )}
                                </option>
                              ))}
                            </select>
                          ) : selectedField?.type === "number" ||
                            selectedField?.type === "currency" ||
                            selectedField?.type === "percentage" ? (
                            <input
                              type="number"
                              value={filter.value ?? ""}
                              onChange={(e) =>
                                handleUpdateDraftFilter(idx, { value: e.target.value })
                              }
                              placeholder="e.g. 50000"
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          ) : selectedField?.type === "date" ? (
                            <input
                              type="date"
                              value={filter.value || ""}
                              onChange={(e) =>
                                handleUpdateDraftFilter(idx, { value: e.target.value })
                              }
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          ) : (
                            <input
                              type="text"
                              value={filter.value || ""}
                              onChange={(e) =>
                                handleUpdateDraftFilter(idx, { value: e.target.value })
                              }
                              placeholder="Filter criteria..."
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          )}
                        </div>

                        {/* Delete Rule Button */}
                        <div className="pt-4">
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftFilter(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                            title="Delete rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddDraftFilter}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  + Add Filter Rule
                </Button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClearAllCustomFilters}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Clear All
              </button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsFilterModalOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApplyCustomFilters} icon={<Check className="w-3.5 h-3.5" />}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Record Detail Drawer */}
      {isDrawerOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs animate-in fade-in">
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-900">{form.name} Details</h2>
                <span className="font-mono text-xs text-slate-400">ID: {selectedRecord.id}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleOpenPrintRecord(selectedRecord, e)}
                  icon={<Printer className="w-3.5 h-3.5" />}
                  title="Print this record"
                >
                  Print
                </Button>
                {onEditRecord && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      onEditRecord(selectedRecord.id);
                    }}
                    icon={<Edit className="w-3.5 h-3.5" />}
                  >
                    Edit
                  </Button>
                )}
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body - All Form Fields */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Record Fields
                </span>

                <div className="space-y-3">
                  {form.fields.map((field) => {
                    const cellVal = getCellValue(selectedRecord, field.id);
                    const isLookup = field.type === "lookup" && selectedRecord.data?.[field.id];

                    return (
                      <div
                        key={field.id}
                        className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1 hover:border-slate-200 transition-colors"
                      >
                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          {field.label}
                        </div>

                        {isLookup ? (
                          <div
                            onClick={(e) =>
                              handleLookupClick(field, selectedRecord.data?.[field.id], e)
                            }
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1.5 transition-colors"
                          >
                            <span>{cellVal}</span>
                            <ExternalLink className="w-3 h-3 text-blue-500" />
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-slate-900 break-words">
                            {cellVal}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Document Modal */}
      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        form={form}
        record={printRecordTarget}
        records={printRecordTarget ? undefined : sortedRecords}
        reportName={report.name}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Record"
        message="Are you sure you want to permanently delete this record? If this record contains subforms, its child rows will also be removed."
        isDestructive={true}
      />
    </div>
  );
};
