"use client";

import React, { useMemo, useState } from "react";
import { FieldDefinition, SubformColumn, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { LookupField } from "./LookupField";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FieldLabel } from "@/components/ui/FormControls";
import { generateId } from "@/lib/utils/idGenerator";
import { evaluateRowFormula, coerceFormulaResult, isBlank } from "@/lib/engine/formulaEngine";
import { formatCurrency } from "@/lib/utils/formatters";
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, Download, Table as TableIcon, Sigma } from "lucide-react";

export interface SubformChangeMeta {
  changedColumnId?: string;
  rowIndex?: number;
}

interface SubformFieldProps {
  field: FieldDefinition;
  rows: Record<string, any>[];
  onChange: (rows: Record<string, any>[], meta?: SubformChangeMeta) => void;
  disabled?: boolean;
  error?: string;
  parentValues?: Record<string, any>;
  hideLabel?: boolean;
}

const NUMERIC = ["number", "currency", "percentage", "decimal", "rating", "formula"];

export const SubformField: React.FC<SubformFieldProps> = ({ field, rows = [], onChange, disabled, error, parentValues, hideLabel }) => {
  const { app, recordsMap } = useLiveApp();
  const config = field.subform!;
  const columns = useMemo(() => (config.columns || []).filter((c) => !c.hidden), [config.columns]);
  const [bulkCount, setBulkCount] = useState(3);
  const [importOpen, setImportOpen] = useState(false);

  const formulaOpts = useMemo(() => ({ forms: app?.forms, recordsMap }), [app?.forms, recordsMap]);

  /** Recompute all formula columns for a row. */
  const computeRow = (row: Record<string, any>): Record<string, any> => {
    const out = { ...row };
    const formulaCols = config.columns.filter((c) => c.formula?.expression || c.type === "formula");
    for (let pass = 0; pass < 2; pass++) {
      for (const col of formulaCols) {
        if (!col.formula?.expression) continue;
        const v = evaluateRowFormula(col.formula.expression, out, config.columns, formulaOpts);
        out[col.id] = coerceFormulaResult(v, col.formula.resultType || "number", col.formula.decimalPlaces ?? col.decimalPlaces ?? 2);
      }
    }
    return out;
  };

  const blankRow = (): Record<string, any> => {
    const row: Record<string, any> = { id: generateId("row") };
    for (const col of config.columns) row[col.id] = col.defaultValue !== undefined ? col.defaultValue : col.type === "checkbox" ? false : "";
    return computeRow(row);
  };

  const emit = (next: Record<string, any>[], meta?: SubformChangeMeta) => onChange(next, meta);

  const addRows = (n = 1) => {
    const max = config.maxRows;
    const room = max ? Math.max(0, max - rows.length) : n;
    const count = Math.min(n, room);
    if (count <= 0) return;
    emit([...rows, ...Array.from({ length: count }, blankRow)]);
  };

  const deleteRow = (i: number) => emit(rows.filter((_, idx) => idx !== i));
  const duplicateRow = (i: number) => { /* a duplicate must become a new child record */ const copy = { ...rows[i], id: generateId("row"), __childId: undefined }; const next = [...rows]; next.splice(i + 1, 0, copy); emit(next); };
  const moveRow = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= rows.length) return; const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; emit(next); };

  const handleCellChange = (rowIndex: number, col: SubformColumn, value: any, lookupRecord?: RecordDefinition | RecordDefinition[]) => {
    const next = [...rows];
    let row = { ...next[rowIndex], [col.id]: value };
    // Lookup auto-fill (column-level)
    if (col.type === "lookup" && col.lookup?.autoFill?.length) {
      const rec = Array.isArray(lookupRecord) ? lookupRecord[0] : lookupRecord || (recordsMap[col.lookup.targetFormId] || []).find((r) => r.id === value);
      for (const af of col.lookup.autoFill) {
        const target = config.columns.find((c) => c.id === af.targetFieldId || c.linkName === af.targetFieldId);
        if (target) row[target.id] = rec ? rec.data?.[af.sourceFieldId] ?? "" : "";
      }
    }
    row = computeRow(row);
    next[rowIndex] = row;
    emit(next, { changedColumnId: col.id, rowIndex });
  };

  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cid of config.totalColumnIds || []) out[cid] = rows.reduce((s, r) => s + (Number(r[cid]) || 0), 0);
    return out;
  }, [rows, config.totalColumnIds]);

  const showTotals = config.showTotals && (config.totalColumnIds || []).length > 0;
  const canAdd = !disabled && (!config.maxRows || rows.length < config.maxRows);

  const renderCell = (row: Record<string, any>, rIdx: number, col: SubformColumn) => {
    const val = row[col.id];
    const ro = disabled || col.readonly || col.type === "formula" || Boolean(col.formula?.expression);
    const base = `w-full text-xs px-2 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 bg-white transition-all ${ro ? "bg-slate-50 text-slate-600 border-slate-200" : "border-slate-300"}`;

    if (col.type === "formula" || col.formula?.expression) {
      const num = Number(val);
      return <div className={`${base} text-right font-semibold tabular-nums bg-slate-50`}>{col.type === "currency" || col.currencySymbol ? formatCurrency(num, col.currencySymbol || "₹", col.decimalPlaces ?? 2) : isNaN(num) ? String(val ?? "") : num.toLocaleString("en-IN", { maximumFractionDigits: col.decimalPlaces ?? 2 })}</div>;
    }
    if (col.type === "lookup" && col.lookup) {
      return <LookupField label="" compact value={val || ""} onChange={(v, rec) => handleCellChange(rIdx, col, v, rec)} lookupConfig={col.lookup} disabled={ro} required={col.required} parentValue={col.lookup.cascade?.parentFieldId ? row[col.lookup.cascade.parentFieldId] ?? parentValues?.[col.lookup.cascade.parentFieldId] : undefined} />;
    }
    if (NUMERIC.includes(col.type)) {
      return (
        <div className="relative">
          {col.type === "currency" && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">{col.currencySymbol || "₹"}</span>}
          <input type="number" step="any" disabled={ro} value={val ?? ""} onChange={(e) => handleCellChange(rIdx, col, e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder={col.placeholder || "0"} className={`${base} text-right tabular-nums ${col.type === "currency" ? "pl-6" : ""}`} />
          {col.type === "percentage" && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">%</span>}
        </div>
      );
    }
    if (col.type === "dropdown" || col.type === "radio") {
      return (
        <select disabled={ro} value={val || ""} onChange={(e) => handleCellChange(rIdx, col, e.target.value)} className={`${base} cursor-pointer`}>
          <option value="">Select…</option>
          {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (col.type === "checkbox") {
      return <div className="flex justify-center"><input type="checkbox" disabled={ro} checked={Boolean(val)} onChange={(e) => handleCellChange(rIdx, col, e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600" /></div>;
    }
    if (col.type === "date" || col.type === "datetime" || col.type === "time") {
      return <input type={col.type === "datetime" ? "datetime-local" : col.type} disabled={ro} value={val || ""} onChange={(e) => handleCellChange(rIdx, col, e.target.value)} className={base} />;
    }
    if (col.type === "textarea") {
      return <textarea rows={1} disabled={ro} value={val || ""} onChange={(e) => handleCellChange(rIdx, col, e.target.value)} className={`${base} resize-y min-h-[32px]`} />;
    }
    return <input type={col.type === "email" ? "email" : "text"} disabled={ro} value={val ?? ""} onChange={(e) => handleCellChange(rIdx, col, e.target.value)} placeholder={col.placeholder} className={base} onKeyDown={(e) => { if (e.key === "Enter" && rIdx === rows.length - 1 && canAdd) { e.preventDefault(); addRows(1); } }} />;
  };

  return (
    <div className={`w-full space-y-2 rounded-xl border p-3.5 bg-slate-50/60 shadow-3xs ${error ? "border-rose-300" : "border-slate-200"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!hideLabel && (
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-purple-600" />
            <FieldLabel required={field.required} tooltip={field.tooltip}>{field.label}</FieldLabel>
            <span className="text-[11px] text-slate-400 font-mono">{rows.length}{config.maxRows ? `/${config.maxRows}` : ""} rows</span>
          </div>
        )}
        {!disabled && (
          <div className="flex items-center gap-1.5 ml-auto">
            {config.importFrom && app && (
              <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} icon={<Download className="w-3.5 h-3.5 text-indigo-600" />}>Import rows</Button>
            )}
            {config.allowBulkAdd && (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1 py-0.5 shadow-2xs">
                <input type="number" min={1} max={50} value={bulkCount} onChange={(e) => setBulkCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} className="w-10 text-xs text-center focus:outline-none" />
                <button type="button" disabled={!canAdd} onClick={() => addRows(bulkCount)} className="text-[11px] font-semibold text-blue-600 px-1.5 hover:text-blue-800 disabled:opacity-40">+ rows</button>
              </div>
            )}
            <Button type="button" variant="primary" size="sm" disabled={!canAdd} onClick={() => addRows(1)} icon={<Plus className="w-3.5 h-3.5" />}>Add Row</Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-3xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="w-9 px-2 py-2 text-center text-slate-400 font-mono">#</th>
              {columns.map((col) => (
                <th key={col.id} className={`px-2 py-2 whitespace-nowrap ${NUMERIC.includes(col.type) ? "text-right" : ""}`} style={{ minWidth: col.width || 140, width: col.width }}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.required && <span className="text-rose-500">*</span>}
                    {(col.type === "formula" || col.formula?.expression) && <Sigma className="w-3 h-3 text-indigo-500" />}
                  </span>
                </th>
              ))}
              {!disabled && <th className="w-24 px-2 py-2 text-center">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-slate-400">
                  No line items yet.{!disabled && <button type="button" onClick={() => addRows(1)} className="ml-1 text-blue-600 font-semibold hover:underline">Add the first row</button>}
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => (
                <tr key={row.id || rIdx} className="hover:bg-blue-50/30 group">
                  <td className="px-2 py-1.5 text-center text-slate-400 font-mono text-[11px]">{rIdx + 1}</td>
                  {columns.map((col) => (
                    <td key={col.id} className="px-1.5 py-1 align-top" style={{ minWidth: col.width || 140, width: col.width }}>{renderCell(row, rIdx, col)}</td>
                  ))}
                  {!disabled && (
                    <td className="px-1 py-1 text-center whitespace-nowrap">
                      <div className="inline-flex items-center opacity-60 group-hover:opacity-100 transition-opacity">
                        {config.allowReorder && <><IconButton size="sm" onClick={() => moveRow(rIdx, -1)} disabled={rIdx === 0} title="Move up"><ChevronUp className="w-3.5 h-3.5" /></IconButton><IconButton size="sm" onClick={() => moveRow(rIdx, 1)} disabled={rIdx === rows.length - 1} title="Move down"><ChevronDown className="w-3.5 h-3.5" /></IconButton></>}
                        {config.allowDuplicateRow !== false && <IconButton size="sm" tone="primary" onClick={() => duplicateRow(rIdx)} disabled={!canAdd} title="Duplicate row"><Copy className="w-3.5 h-3.5" /></IconButton>}
                        <IconButton size="sm" tone="danger" onClick={() => deleteRow(rIdx)} disabled={Boolean(config.minRows && rows.length <= config.minRows)} title="Remove row"><Trash2 className="w-3.5 h-3.5" /></IconButton>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {showTotals && rows.length > 0 && (
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
              <tr>
                <td className="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-400">Total</td>
                {columns.map((col) => (
                  <td key={col.id} className="px-2 py-2 text-right tabular-nums text-slate-900">
                    {totals[col.id] !== undefined ? (col.type === "currency" || col.currencySymbol ? formatCurrency(totals[col.id], col.currencySymbol || "₹", col.decimalPlaces ?? 2) : totals[col.id].toLocaleString("en-IN", { maximumFractionDigits: col.decimalPlaces ?? 2 })) : ""}
                  </td>
                ))}
                {!disabled && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && field.description && <p className="text-[11px] text-slate-500">{field.description}</p>}

      {importOpen && config.importFrom && app && (
        <ImportRowsModal
          config={config}
          parentValues={parentValues}
          onClose={() => setImportOpen(false)}
          onImport={(imported) => {
            const mapped = imported.map((src) => {
              const row = blankRow();
              for (const [srcCol, dstCol] of Object.entries(config.importFrom!.columnMap)) row[dstCol] = src[srcCol] ?? "";
              return computeRow(row);
            });
            emit([...rows, ...mapped]);
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
};

/** Pick a source record (e.g. Purchase Order) and import its subform rows. */
const ImportRowsModal: React.FC<{ config: NonNullable<FieldDefinition["subform"]>; parentValues?: Record<string, any>; onClose: () => void; onImport: (rows: Record<string, any>[]) => void }> = ({ config, parentValues, onClose, onImport }) => {
  const { app, recordsMap, getDisplayValue } = useLiveApp();
  const imp = config.importFrom!;
  const srcForm = app?.forms.find((f) => f.id === imp.formId);
  const srcSub = srcForm?.fields.find((f) => f.id === imp.subformFieldId);
  const linked = imp.viaLookupFieldId ? parentValues?.[imp.viaLookupFieldId] : undefined;
  const [selected, setSelected] = useState<string>(linked || "");
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const records = (recordsMap[imp.formId] || []).filter((r) => !r.deleted);
  const rec = records.find((r) => r.id === selected);
  const srcRows: Record<string, any>[] = rec && Array.isArray(rec.data?.[imp.subformFieldId]) ? rec.data[imp.subformFieldId] : [];
  const titleField = srcForm?.titleFieldId || srcForm?.fields.find((f) => f.type !== "section")?.id;

  return (
    <Modal isOpen onClose={onClose} title={`Import rows from ${srcForm?.name || "form"}`} description="Select a source record, then choose the rows to import." maxWidth="3xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onImport(srcRows.filter((_, i) => checked[i] !== false))} disabled={!rec || srcRows.length === 0}>Import {srcRows.filter((_, i) => checked[i] !== false).length} row(s)</Button></>}>
      <div className="space-y-4">
        <select value={selected} onChange={(e) => { setSelected(e.target.value); setChecked({}); }} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white">
          <option value="">Select {srcForm?.name}…</option>
          {records.map((r) => <option key={r.id} value={r.id}>{(srcForm && titleField && getDisplayValue(srcForm, r, titleField)) || r.id}</option>)}
        </select>
        {rec && (
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 w-8"><input type="checkbox" checked={srcRows.every((_, i) => checked[i] !== false)} onChange={(e) => { const all: Record<number, boolean> = {}; srcRows.forEach((_, i) => (all[i] = e.target.checked)); setChecked(all); }} /></th>{srcSub?.subform?.columns.map((c) => <th key={c.id} className="p-2 text-left">{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {srcRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2"><input type="checkbox" checked={checked[i] !== false} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} /></td>
                    {srcSub?.subform?.columns.map((c) => <td key={c.id} className="p-2 text-slate-700">{c.type === "lookup" && c.lookup ? (recordsMap[c.lookup.targetFormId] || []).find((r) => r.id === row[c.id])?.data?.[c.lookup.displayFieldId] ?? row[c.id] : isBlank(row[c.id]) ? "—" : String(row[c.id])}</td>)}
                  </tr>
                ))}
                {srcRows.length === 0 && <tr><td colSpan={99} className="p-4 text-center text-slate-400">This record has no line items.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};
