"use client";

import React from "react";
import { FilterGroup, FormDefinition, ReportFilter, ReportOperator } from "@/types/schema";
import { DATE_PRESETS, SYSTEM_FIELDS } from "@/lib/engine/reportEngine";
import { generateId } from "@/lib/utils/idGenerator";
import { Button, IconButton } from "@/components/ui/Button";
import { Plus, Trash2, X } from "lucide-react";

export const OPERATORS: Array<{ id: ReportOperator; label: string; types?: string[]; noValue?: boolean }> = [
  { id: "equals", label: "equals" },
  { id: "not_equals", label: "not equals" },
  { id: "contains", label: "contains" },
  { id: "not_contains", label: "does not contain" },
  { id: "starts_with", label: "starts with" },
  { id: "ends_with", label: "ends with" },
  { id: "greater_than", label: "greater than" },
  { id: "greater_or_equal", label: "≥" },
  { id: "less_than", label: "less than" },
  { id: "less_or_equal", label: "≤" },
  { id: "between", label: "between" },
  { id: "in", label: "is one of (comma list)" },
  { id: "date_preset", label: "date is…", types: ["date", "datetime"] },
  { id: "is_true", label: "is checked", types: ["checkbox"], noValue: true },
  { id: "is_false", label: "is unchecked", types: ["checkbox"], noValue: true },
  { id: "is_empty", label: "is empty", noValue: true },
  { id: "is_not_empty", label: "is not empty", noValue: true },
];

export const fieldOptionsFor = (form: FormDefinition) => [
  ...form.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options })),
  ...SYSTEM_FIELDS.map((s) => ({ id: s.id, label: s.label, type: s.type, options: undefined as string[] | undefined })),
];

/** A single filter row (field · operator · value). Reused by reports, lookups, rollups and workflows. */
export const FilterRow: React.FC<{ form: FormDefinition; filter: ReportFilter; onChange: (f: ReportFilter) => void; onRemove: () => void; compact?: boolean }> = ({ form, filter, onChange, onRemove, compact }) => {
  const fields = fieldOptionsFor(form);
  const field = fields.find((f) => f.id === filter.fieldId);
  const type = field?.type || "text";
  const ops = OPERATORS.filter((o) => !o.types || o.types.includes(type));
  const op = OPERATORS.find((o) => o.id === filter.operator);
  const sel = `text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${compact ? "" : ""}`;
  const inputType = ["number", "currency", "decimal", "percentage", "rating"].includes(type) ? "number" : type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={filter.fieldId} onChange={(e) => onChange({ ...filter, fieldId: e.target.value, value: "" })} className={`${sel} min-w-[140px]`}>
        <option value="">Field…</option>
        {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <select value={filter.operator} onChange={(e) => onChange({ ...filter, operator: e.target.value as ReportOperator })} className={`${sel} min-w-[120px]`}>
        {ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {!op?.noValue && filter.operator === "date_preset" ? (
        <select value={filter.preset || ""} onChange={(e) => onChange({ ...filter, preset: e.target.value as any })} className={`${sel} min-w-[130px]`}>
          <option value="">Choose…</option>
          {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      ) : !op?.noValue && field?.options?.length && (filter.operator === "equals" || filter.operator === "not_equals") ? (
        <select value={filter.value ?? ""} onChange={(e) => onChange({ ...filter, value: e.target.value })} className={`${sel} min-w-[130px]`}>
          <option value="">Value…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : !op?.noValue ? (
        <>
          <input type={inputType} value={filter.value ?? ""} onChange={(e) => onChange({ ...filter, value: e.target.value })} placeholder="Value" className={`${sel} min-w-[130px]`} />
          {filter.operator === "between" && <input type={inputType} value={filter.value2 ?? ""} onChange={(e) => onChange({ ...filter, value2: e.target.value })} placeholder="and" className={`${sel} min-w-[110px]`} />}
        </>
      ) : null}
      <IconButton tone="danger" size="sm" onClick={onRemove} title="Remove"><Trash2 className="w-3.5 h-3.5" /></IconButton>
    </div>
  );
};

/** AND/OR group editor. Groups are OR-ed; each group's filters use its own logic. */
export const FilterGroupsEditor: React.FC<{ form: FormDefinition; groups: FilterGroup[]; onChange: (g: FilterGroup[]) => void }> = ({ form, groups, onChange }) => {
  const newFilter = (): ReportFilter => ({ id: generateId("flt"), fieldId: form.fields.find((f) => f.type !== "section")?.id || "", operator: "equals", value: "" });
  const addGroup = () => onChange([...groups, { id: generateId("grp"), logic: "AND", filters: [newFilter()] }]);
  const update = (gi: number, patch: Partial<FilterGroup>) => onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  return (
    <div className="space-y-3">
      {groups.length === 0 && <p className="text-xs text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-lg">No conditions. Add a group to filter records.</p>}
      {groups.map((g, gi) => (
        <div key={g.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span>Match</span>
              <select value={g.logic} onChange={(e) => update(gi, { logic: e.target.value as "AND" | "OR" })} className="text-[11px] border border-slate-300 rounded px-1.5 py-0.5 bg-white font-bold">
                <option value="AND">ALL (AND)</option>
                <option value="OR">ANY (OR)</option>
              </select>
              <span>of these conditions</span>
            </div>
            <IconButton size="sm" tone="danger" onClick={() => onChange(groups.filter((_, i) => i !== gi))} title="Remove group"><X className="w-3.5 h-3.5" /></IconButton>
          </div>
          <div className="space-y-1.5">
            {g.filters.map((f, fi) => (
              <FilterRow key={f.id || fi} form={form} filter={f} onChange={(nf) => update(gi, { filters: g.filters.map((x, i) => (i === fi ? nf : x)) })} onRemove={() => update(gi, { filters: g.filters.filter((_, i) => i !== fi) })} />
            ))}
          </div>
          <button type="button" onClick={() => update(gi, { filters: [...g.filters, newFilter()] })} className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add condition</button>
          {gi < groups.length - 1 && <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">— OR —</div>}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addGroup} icon={<Plus className="w-3.5 h-3.5" />}>{groups.length ? "Add OR group" : "Add condition group"}</Button>
    </div>
  );
};

/** Simple AND list of filters (used in lookups / rollups / ledger sources). */
export const SimpleFilterList: React.FC<{ form: FormDefinition; filters: ReportFilter[]; onChange: (f: ReportFilter[]) => void }> = ({ form, filters, onChange }) => (
  <div className="space-y-1.5">
    {filters.map((f, i) => (
      <FilterRow key={f.id || i} form={form} filter={f} compact onChange={(nf) => onChange(filters.map((x, j) => (j === i ? nf : x)))} onRemove={() => onChange(filters.filter((_, j) => j !== i))} />
    ))}
    <button type="button" onClick={() => onChange([...filters, { id: generateId("flt"), fieldId: form.fields.find((x) => x.type !== "section")?.id || "", operator: "equals", value: "" }])} className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add filter</button>
  </div>
);
