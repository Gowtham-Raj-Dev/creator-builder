"use client";

import React from "react";
import { SubformConfig, SubformColumn, WorkflowDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { LookupField } from "./LookupField";
import { Button } from "@/components/ui/Button";
import { generateId } from "@/lib/utils/idGenerator";
import { evaluateSafeExpression } from "@/lib/engine/evaluator";
import { Plus, Trash2 } from "lucide-react";

interface SubformFieldProps {
  label: string;
  columns: SubformColumn[];
  rows: Record<string, any>[];
  onChange: (updatedRows: Record<string, any>[]) => void;
  workflows?: WorkflowDefinition[];
  disabled?: boolean;
}

export const SubformField: React.FC<SubformFieldProps> = ({
  label,
  columns,
  rows = [],
  onChange,
  workflows = [],
  disabled,
}) => {
  const handleAddRow = () => {
    const newRow: Record<string, any> = { id: generateId("row") };
    for (const col of columns) {
      newRow[col.id] = col.defaultValue !== undefined ? col.defaultValue : "";
    }
    onChange([...rows, newRow]);
  };

  const handleDeleteRow = (index: number) => {
    const updated = rows.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleCellChange = (rowIndex: number, colId: string, value: any) => {
    const nextRows = [...rows];
    const targetRow = { ...nextRows[rowIndex], [colId]: value };

    // Run row-level workflows (e.g. amount = quantity * rate)
    // Build context with column IDs and column linkNames
    const rowCtx: Record<string, any> = { ...targetRow };
    for (const col of columns) {
      if (col.id in targetRow) {
        rowCtx[col.linkName] = targetRow[col.id];
      }
    }

    // Check relevant workflows
    for (const wf of workflows) {
      if (!wf.active) continue;
      // Match trigger field (either column ID or column linkName)
      const matchesTrigger =
        !wf.trigger.fieldId ||
        wf.trigger.fieldId === colId ||
        columns.find((c) => c.id === wf.trigger.fieldId || c.linkName === wf.trigger.fieldId)?.id === colId;

      if (matchesTrigger) {
        for (const act of wf.actions) {
          if (act.type === "calculateValue" && act.targetFieldId && act.expression) {
            // Find target column in this subform
            const targetCol = columns.find(
              (c) => c.id === act.targetFieldId || c.linkName === act.targetFieldId
            );
            if (targetCol) {
              const computed = evaluateSafeExpression(act.expression, rowCtx);
              if (computed !== undefined) {
                targetRow[targetCol.id] = computed;
                rowCtx[targetCol.id] = computed;
                rowCtx[targetCol.linkName] = computed;
              }
            }
          }
        }
      }
    }

    // Default fallback calculation: if columns contain quantity, rate, amount and no explicit workflow fired
    const qtyCol = columns.find((c) => c.linkName === "quantity" || c.label.toLowerCase() === "quantity");
    const rateCol = columns.find((c) => c.linkName === "rate" || c.label.toLowerCase() === "rate");
    const amtCol = columns.find((c) => c.linkName === "amount" || c.label.toLowerCase() === "amount");

    if (qtyCol && rateCol && amtCol && (colId === qtyCol.id || colId === rateCol.id)) {
      const q = parseFloat(targetRow[qtyCol.id]) || 0;
      const r = parseFloat(targetRow[rateCol.id]) || 0;
      targetRow[amtCol.id] = Math.round(q * r * 100) / 100;
    }

    nextRows[rowIndex] = targetRow;
    onChange(nextRows);
  };

  return (
    <div className="w-full space-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50/50 shadow-3xs">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {label} ({rows.length} rows)
        </label>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            icon={<Plus className="w-3.5 h-3.5 text-blue-600" />}
          >
            + Add Row
          </Button>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-3xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center text-slate-400">#</th>
              {columns.map((col) => (
                <th key={col.id} className="px-3 py-2.5 whitespace-nowrap min-w-[140px]">
                  {col.label}
                  {col.required && <span className="text-rose-500 ml-0.5">*</span>}
                </th>
              ))}
              {!disabled && <th className="w-12 px-3 py-2.5 text-center">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (disabled ? 1 : 2)}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  No items added yet. Click &quot;+ Add Row&quot; above to add rows to this subform.
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => (
                <tr key={row.id || rIdx} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                    {rIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const cellVal = row[col.id];

                    if (col.type === "lookup" && col.lookup) {
                      return (
                        <td key={col.id} className="px-3 py-2">
                          <LookupField
                            label=""
                            value={cellVal || ""}
                            onChange={(val) => handleCellChange(rIdx, col.id, val)}
                            lookupConfig={col.lookup}
                            disabled={disabled}
                            required={col.required}
                          />
                        </td>
                      );
                    }

                    if (["number", "currency", "percentage"].includes(col.type)) {
                      return (
                        <td key={col.id} className="px-3 py-2">
                          <input
                            type="number"
                            disabled={disabled}
                            value={cellVal !== undefined ? cellVal : ""}
                            onChange={(e) =>
                              handleCellChange(
                                rIdx,
                                col.id,
                                e.target.value === "" ? "" : parseFloat(e.target.value)
                              )
                            }
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        </td>
                      );
                    }

                    if (col.type === "dropdown" && col.options) {
                      return (
                        <td key={col.id} className="px-3 py-2">
                          <select
                            disabled={disabled}
                            value={cellVal || ""}
                            onChange={(e) => handleCellChange(rIdx, col.id, e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">Select...</option>
                            {col.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    // Default text
                    return (
                      <td key={col.id} className="px-3 py-2">
                        <input
                          type="text"
                          disabled={disabled}
                          value={cellVal || ""}
                          onChange={(e) => handleCellChange(rIdx, col.id, e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </td>
                    );
                  })}

                  {!disabled && (
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rIdx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remove Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
