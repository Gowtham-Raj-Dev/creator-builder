"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ReportDefinition, FormDefinition, RecordDefinition } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { storageService } from "@/lib/storage/localStorageProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import {
  TableProperties,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Settings2,
} from "lucide-react";
import Link from "next/link";

export const ReportBuilderView: React.FC<{ reportLinkName?: string }> = ({ reportLinkName }) => {
  const { currentApp, updateReport, deleteReport, createReport } = useAppBuilder();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [previewRecords, setPreviewRecords] = useState<RecordDefinition[]>([]);
  const [allAppRecords, setAllAppRecords] = useState<Record<string, RecordDefinition[]>>({});

  useEffect(() => {
    if (currentApp && currentApp.reports.length > 0) {
      if (reportLinkName) {
        const found = currentApp.reports.find((r) => r.linkName === reportLinkName);
        if (found) setSelectedReportId(found.id);
        else setSelectedReportId(currentApp.reports[0].id);
      } else if (!selectedReportId) {
        setSelectedReportId(currentApp.reports[0].id);
      }
    }
  }, [currentApp, reportLinkName, selectedReportId]);

  const activeReport = currentApp?.reports.find((r) => r.id === selectedReportId) || null;
  const sourceForm = activeReport
    ? currentApp?.forms.find((f) => f.id === activeReport.sourceFormId)
    : null;

  // Load preview records
  useEffect(() => {
    async function loadData() {
      if (currentApp && sourceForm) {
        const recs = await storageService.getRecords(currentApp.id, sourceForm.id);
        setPreviewRecords(recs);

        // Also load records for lookups
        const allMap: Record<string, RecordDefinition[]> = {};
        for (const f of currentApp.forms) {
          allMap[f.id] = await storageService.getRecords(currentApp.id, f.id);
        }
        setAllAppRecords(allMap);
      }
    }
    loadData();
  }, [currentApp, sourceForm]);

  // Synchronized active columns
  const activeColumns = useMemo(() => {
    if (!activeReport || !sourceForm) return [];
    const cols = [...activeReport.columns];
    sourceForm.fields.forEach((f) => {
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
  }, [activeReport, sourceForm]);

  if (!currentApp) return null;

  const handleToggleColumn = (fieldId: string) => {
    if (!activeReport) return;
    const exists = activeReport.columns.find((c) => c.fieldId === fieldId);

    if (exists) {
      const updated = activeReport.columns.map((c) =>
        c.fieldId === fieldId ? { ...c, visible: !c.visible } : c
      );
      updateReport(activeReport.id, { columns: updated });
    } else {
      const field = sourceForm?.fields.find((f) => f.id === fieldId);
      const newCol = {
        fieldId,
        label: field?.label || "Field",
        visible: false,
        order: activeReport.columns.length,
      };
      updateReport(activeReport.id, { columns: [...activeReport.columns, newCol] });
    }
  };

  const handleMoveColumn = (index: number, direction: "up" | "down") => {
    if (!activeReport) return;
    const cols = [...activeReport.columns];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= cols.length) return;

    const temp = cols[index];
    cols[index] = cols[targetIdx];
    cols[targetIdx] = temp;

    // update orders
    const updated = cols.map((c, i) => ({ ...c, order: i }));
    updateReport(activeReport.id, { columns: updated });
  };

  const handleCreateNewReport = () => {
    const defaultForm = currentApp.forms[0];
    if (!defaultForm) return;
    const newRep = createReport(`${defaultForm.name} Custom Report`, defaultForm.id);
    setSelectedReportId(newRep.id);
  };

  // Helper to render cell preview
  const renderCellPreview = (rec: RecordDefinition, fieldId: string) => {
    const field = sourceForm?.fields.find((f) => f.id === fieldId);
    if (!field) return "-";
    const val = rec.data?.[field.id];

    if (val === undefined || val === null || val === "") return <span className="text-slate-300">-</span>;

    if (field.type === "lookup" && field.lookup) {
      const targetRecords = allAppRecords[field.lookup.targetFormId] || [];
      return resolveLookupDisplay(val, targetRecords, field.lookup.displayFieldId);
    }

    if (field.type === "currency") {
      return formatCurrency(val, field.currencySymbol || "₹", field.decimalPlaces ?? 2);
    }

    if (field.type === "date") {
      return formatDate(val);
    }

    if (field.type === "checkbox") {
      return val ? "Yes" : "No";
    }

    if (field.type === "subform") {
      const count = Array.isArray(val) ? val.length : 0;
      return <span className="text-purple-600 font-medium">{count} row(s)</span>;
    }

    return String(val);
  };

  return (
    <div className="flex-1 bg-[#f8fafc] h-full flex overflow-hidden select-none min-h-0 min-w-0">
      {/* Reports List */}
      <div className="w-80 border-r border-slate-200 bg-white h-full flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Reports
            </h2>
            <span className="text-[11px] text-slate-400">
              {currentApp.reports.length} report views
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleCreateNewReport}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Report
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
          {currentApp.reports.map((rep) => {
            const form = currentApp.forms.find((f) => f.id === rep.sourceFormId);
            const isSelected = selectedReportId === rep.id;

            return (
              <div
                key={rep.id}
                onClick={() => setSelectedReportId(rep.id)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/70 border-blue-400 shadow-2xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-900 truncate">
                      {rep.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Source: <span className="font-medium text-slate-700">{form?.name || "None"}</span>
                    </p>
                  </div>
                  <Link
                    href={`/${currentApp.linkName}/reports/${rep.linkName}`}
                    target="_blank"
                    className="text-slate-400 hover:text-blue-600 p-1"
                    title="Open Live Report"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Report Configuration & Data Preview (Independent Scroll Pane) */}
      {activeReport ? (
        <div className="flex-1 h-full overflow-y-auto min-h-0 min-w-0 p-6 md:p-8 flex flex-col space-y-6 bg-[#f8fafc]">
          <div className="max-w-5xl mx-auto w-full space-y-6">
            {/* Header & Settings */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-start justify-between">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 pr-6">
                <Input
                  label="Report Name"
                  value={activeReport.name}
                  onChange={(e) => updateReport(activeReport.id, { name: e.target.value })}
                />
                <Select
                  label="Source Form"
                  value={activeReport.sourceFormId}
                  onChange={(e) => updateReport(activeReport.id, { sourceFormId: e.target.value })}
                >
                  {currentApp.forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/${currentApp.linkName}/reports/${activeReport.linkName}`}
                  target="_blank"
                >
                  <Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    Open Live
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteReport(activeReport.id)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>

            {/* Column Visibility & Order Configurator (Requirement 25) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Columns Configuration (Available & Selected)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {sourceForm?.fields.map((field) => {
                  const colConfig = activeReport.columns.find((c) => c.fieldId === field.id);
                  const isVisible = colConfig ? colConfig.visible : true;
                  const orderIdx = activeReport.columns.findIndex((c) => c.fieldId === field.id);

                  return (
                    <div
                      key={field.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${
                        isVisible
                          ? "bg-blue-50/50 border-blue-200 text-slate-800"
                          : "bg-slate-50 border-slate-200 text-slate-400 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <button
                          onClick={() => handleToggleColumn(field.id)}
                          className={`p-1 rounded hover:bg-slate-200/60 ${
                            isVisible ? "text-blue-600" : "text-slate-400"
                          }`}
                          title={isVisible ? "Hide Column" : "Show Column"}
                        >
                          {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <span className="font-medium truncate">{field.label}</span>
                      </div>

                      {orderIdx >= 0 && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleMoveColumn(orderIdx, "up")}
                            disabled={orderIdx === 0}
                            className="p-1 hover:bg-slate-200/60 rounded disabled:opacity-30"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveColumn(orderIdx, "down")}
                            disabled={orderIdx === activeReport.columns.length - 1}
                            className="p-1 hover:bg-slate-200/60 rounded disabled:opacity-30"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Data Preview Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TableProperties className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Live Record Data Preview ({previewRecords.length} records)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      {activeColumns
                        .filter((c) => c.visible)
                        .map((c) => (
                          <th key={c.fieldId} className="px-4 py-3 whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRecords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={activeColumns.filter((c) => c.visible).length || 1}
                          className="px-4 py-8 text-center text-slate-400"
                        >
                          No records created in {sourceForm?.name} yet.
                        </td>
                      </tr>
                    ) : (
                      previewRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                          {activeColumns
                            .filter((c) => c.visible)
                            .map((c) => (
                              <td key={c.fieldId} className="px-4 py-3 whitespace-nowrap">
                                {renderCellPreview(rec, c.fieldId)}
                              </td>
                            ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
