"use client";

import React, { useState } from "react";
import { FieldDefinition, FormDefinition, AppDefinition, SubformColumn, FieldType, LookupConfig, FieldWidth, AggregateType } from "@/types/schema";
import { Input, Select, Toggle, Checkbox } from "@/components/ui/FormControls";
import { IconButton } from "@/components/ui/Button";
import { toLinkName } from "@/lib/utils/linkName";
import { suggestDefaultDisplayField } from "@/lib/engine/lookupEngine";
import { buildAutoNumberPreview } from "@/lib/engine/autoNumberEngine";
import { generateId } from "@/lib/utils/idGenerator";
import { FormulaEditor } from "./FormulaEditor";
import { SimpleFilterList } from "@/components/runtime/report/FilterBuilder";
import { FIELD_TYPES } from "./FieldPalette";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { linkableFields, buildLinkedColumns, ensureParentLink, withParentLinkColumns } from "@/lib/engine/subformLink";
import { X, Lock, Unlock, Plus, Trash2, Table, Search, Sliders, ChevronDown, ChevronRight, Sigma, Database, Sparkles, ShieldCheck, Palette } from "lucide-react";

interface Props {
  field: FieldDefinition | null;
  form: FormDefinition;
  app: AppDefinition;
  onUpdateField: (fieldId: string, updates: Partial<FieldDefinition>) => void;
  onClose: () => void;
}

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; tone?: string }> = ({ title, icon, children, defaultOpen = true, tone = "" }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border ${tone || "border-slate-200 bg-white"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
        <span className="flex items-center gap-1.5">{icon}{title}</span>{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
};

const NUMERIC = ["number", "currency", "percentage", "decimal"];
const CHOICE = ["dropdown", "radio", "multiselect"];
const TEXTY = ["text", "textarea", "richtext", "barcode"];
const SUBFORM_COL_TYPES: FieldType[] = ["text", "textarea", "number", "decimal", "currency", "percentage", "lookup", "dropdown", "date", "datetime", "time", "checkbox", "formula", "email", "phone"];

export const FieldPropertiesPanel: React.FC<Props> = ({ field, form, app, onUpdateField, onClose }) => {
  const [linkNameLocked, setLinkNameLocked] = useState(true);
  const { updateCurrentApp } = useAppBuilder();
  const otherForms = app.forms.filter((f) => f.id !== form.id);

  if (!field) {
    return (
      <div className="w-[340px] border-l border-slate-200 bg-white h-full p-6 flex flex-col items-center justify-center text-center select-none text-slate-400 shrink-0">
        <Sliders className="w-10 h-10 mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No field selected</p>
        <p className="text-xs text-slate-400 mt-1 max-w-[220px]">Click a field on the canvas to configure label, validation, formulas, lookups and more.</p>
      </div>
    );
  }

  const up = (updates: Partial<FieldDefinition>) => onUpdateField(field.id, updates);
  const targetForm = field.lookup?.targetFormId ? app.forms.find((f) => f.id === field.lookup?.targetFormId) : undefined;

  const handleTypeChange = (newType: FieldType) => {
    if (newType === field.type) return;
    const updates: Partial<FieldDefinition> = { type: newType };
    if (CHOICE.includes(newType) && !field.options?.length) updates.options = ["Option 1", "Option 2", "Option 3"];
    if (newType === "currency" && !field.currencySymbol) updates.currencySymbol = app.settings?.currencySymbol || "₹";
    if (NUMERIC.includes(newType) && field.decimalPlaces === undefined) updates.decimalPlaces = 2;
    if (newType === "rating" && !field.ratingMax) updates.ratingMax = 5;
    if (newType === "autonumber" && !field.autonumber) updates.autonumber = { prefix: (field.linkName.slice(0, 3) || "REC").toUpperCase() + "-", startNumber: 1, digits: 5, resetEvery: "never" };
    if (newType === "lookup" && !field.lookup && otherForms[0]) updates.lookup = { targetFormId: otherForms[0].id, displayFieldId: suggestDefaultDisplayField(otherForms[0]), valueFieldId: "id", relationshipType: "lookup", displayStyle: "dropdown" };
    if (newType === "formula" && !field.formula) { updates.formula = { expression: "", resultType: "number", decimalPlaces: 2 }; updates.readonly = true; }
    if (newType === "rollup" && !field.rollup) { updates.rollup = { sourceFormId: "", matchFieldId: "", aggregate: "sum", decimalPlaces: 2 }; updates.readonly = true; }
    if (newType === "section" && !field.section) updates.section = { collapsible: true, columns: 2 };
    if (newType === "subform" && !field.subform) updates.subform = { sourceType: "inline", showTotals: true, allowBulkAdd: true, columns: [{ id: generateId("col"), label: "Item", linkName: "item", type: "text", required: true, width: 220 }, { id: generateId("col"), label: "Quantity", linkName: "quantity", type: "number", defaultValue: 1, width: 110 }, { id: generateId("col"), label: "Rate", linkName: "rate", type: "currency", currencySymbol: "₹", width: 130 }, { id: generateId("col"), label: "Amount", linkName: "amount", type: "currency", currencySymbol: "₹", readonly: true, width: 140, formula: { expression: "quantity * rate", resultType: "number", decimalPlaces: 2 } }], totalColumnIds: [] };
    up(updates);
  };

  // ── option helpers ─────────────────────────────────────────────────────────
  const setOptions = (options: string[]) => up({ options });
  const setOptionColor = (opt: string, color: string) => up({ optionColors: { ...(field.optionColors || {}), [opt]: color } });

  // ── subform column helpers ─────────────────────────────────────────────────
  const cols = field.subform?.columns || [];
  const setSub = (patch: Partial<NonNullable<FieldDefinition["subform"]>>) => up({ subform: { sourceType: "inline", columns: cols, ...(field.subform || {}), ...patch } });
  const updateCol = (id: string, patch: Partial<SubformColumn>) => setSub({ columns: cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addCol = () => setSub({ columns: [...cols, { id: generateId("col"), label: `Column ${cols.length + 1}`, linkName: `col_${cols.length + 1}`, type: "text", width: 140 }] });
  const removeCol = (id: string) => setSub({ columns: cols.filter((c) => c.id !== id), totalColumnIds: (field.subform?.totalColumnIds || []).filter((x) => x !== id) });
  const moveCol = (i: number, d: -1 | 1) => { const n = [...cols]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setSub({ columns: n }); };
  // existing-form subforms: columns mirror the chosen child fields; the child form gets a parent lookup automatically
  const linkedTarget = field.subform?.sourceType === "existing_form" ? app.forms.find((f) => f.id === field.subform?.targetFormId) : undefined;
  const linkExistingForm = (targetFormId: string) => {
    if (!targetFormId) { setSub({ targetFormId: undefined, parentLinkFieldId: undefined, linkedFieldIds: [], columns: [] }); return; }
    updateCurrentApp((prev) => {
      const parent = prev.forms.find((f) => f.id === form.id)!;
      const { app: next, fieldId } = ensureParentLink(prev, parent, targetFormId);
      const target = next.forms.find((f) => f.id === targetFormId)!;
      const ids = linkableFields(target, fieldId).slice(0, 6).map((f) => f.id);
      const columns = buildLinkedColumns(target, ids);
      const subform = { ...(field.subform || { sourceType: "existing_form" as const, columns: [] }), sourceType: "existing_form" as const, targetFormId, parentLinkFieldId: fieldId, linkedFieldIds: ids, columns, totalColumnIds: columns.filter((c) => ["number", "currency", "decimal"].includes(c.type) || c.formula).map((c) => c.id) };
      return withParentLinkColumns({ ...next, forms: next.forms.map((f) => (f.id === form.id ? { ...f, fields: f.fields.map((x) => (x.id === field.id ? { ...x, subform } : x)) } : f)) });
    });
  };
  const setLinkedFields = (ids: string[]) => { if (!linkedTarget) return; setSub({ linkedFieldIds: ids, columns: buildLinkedColumns(linkedTarget, ids), totalColumnIds: (field.subform?.totalColumnIds || []).filter((x) => ids.includes(x)) }); };

  // ── lookup helpers ─────────────────────────────────────────────────────────
  const setLookup = (patch: Partial<LookupConfig>) => up({ lookup: { ...(field.lookup as LookupConfig), ...patch } });

  // rollup: candidate match fields = lookups (top-level or subform columns) in the source form pointing to THIS form
  const rollupSource = app.forms.find((f) => f.id === field.rollup?.sourceFormId);
  const rollupMatchOptions = rollupSource ? [
    ...rollupSource.fields.filter((f) => f.type === "lookup" && f.lookup?.targetFormId === form.id).map((f) => ({ id: f.id, label: f.label })),
    ...rollupSource.fields.filter((f) => f.type === "subform").flatMap((sf) => (sf.subform?.columns || []).filter((c) => c.type === "lookup" && c.lookup?.targetFormId === form.id).map((c) => ({ id: `${sf.id}.${c.id}`, label: `${sf.label} › ${c.label}` }))),
  ] : [];
  const rollupValueOptions = rollupSource ? [
    ...rollupSource.fields.filter((f) => ["number", "currency", "decimal", "percentage", "formula", "rating"].includes(f.type)).map((f) => ({ id: f.id, label: f.label })),
    ...rollupSource.fields.filter((f) => f.type === "subform").flatMap((sf) => (sf.subform?.columns || []).filter((c) => ["number", "currency", "decimal", "percentage", "formula"].includes(c.type)).map((c) => ({ id: `${sf.id}.${c.id}`, label: `${sf.label} › ${c.label}` }))),
  ] : [];

  const isComputed = field.type === "formula" || field.type === "rollup" || field.type === "autonumber";

  return (
    <div className="w-[340px] border-l border-slate-200 bg-slate-50/60 h-full flex flex-col shrink-0 select-none shadow-xs min-h-0">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-900 truncate">{field.label}</h3>
          <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{field.type}</span>
        </div>
        <IconButton onClick={onClose}><X className="w-4 h-4" /></IconButton>
      </div>

      <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-3 text-xs">
        {/* Type */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-blue-900">Field type</label>
          <select value={field.type} onChange={(e) => handleTypeChange(e.target.value as FieldType)} className="w-full text-xs font-medium rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/25">
            {["Layout", "Basic", "Numeric", "Choice", "Date", "Relationship", "Computed", "Media", "Advanced"].map((cat) => (
              <optgroup key={cat} label={cat}>{FIELD_TYPES.filter((t) => t.category === cat).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</optgroup>
            ))}
          </select>
        </div>

        {/* Basic */}
        <Section title="Basic" icon={<Sliders className="w-3.5 h-3.5" />}>
          <Input size="sm" label="Label" value={field.label} onChange={(e) => up({ label: e.target.value, ...(linkNameLocked ? { linkName: toLinkName(e.target.value) } : {}) })} />
          <div className="space-y-1">
            <div className="flex items-center justify-between"><label className="text-xs font-medium text-slate-700">Link name</label><button onClick={() => setLinkNameLocked(!linkNameLocked)} className="text-[10px] text-slate-500 hover:text-blue-600 flex items-center gap-1">{linkNameLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-amber-500" />}{linkNameLocked ? "Auto" : "Custom"}</button></div>
            <input value={field.linkName} disabled={linkNameLocked} onChange={(e) => up({ linkName: toLinkName(e.target.value) })} className="w-full bg-white disabled:bg-slate-100 border border-slate-300 font-mono text-xs rounded-lg px-2.5 py-1.5" />
            <p className="text-[10px] text-slate-400">Used in formulas & scripts: <code>{field.linkName}</code></p>
          </div>
          {field.type !== "section" && <>
            {!isComputed && <Input size="sm" label="Placeholder" value={field.placeholder || ""} onChange={(e) => up({ placeholder: e.target.value })} />}
            <Input size="sm" label="Help text (below field)" value={field.description || ""} onChange={(e) => up({ description: e.target.value })} />
            <Input size="sm" label="Tooltip (ⓘ icon)" value={field.tooltip || ""} onChange={(e) => up({ tooltip: e.target.value })} />
            <Select size="sm" label="Width" value={field.width || ""} onChange={(e) => up({ width: (e.target.value || undefined) as FieldWidth })}><option value="">Auto (form layout)</option><option value="full">Full width</option><option value="half">Half</option><option value="third">One third</option><option value="two_thirds">Two thirds</option></Select>
          </>}
          {field.type === "section" && <>
            <Input size="sm" label="Description" value={field.section?.description || ""} onChange={(e) => up({ section: { ...field.section, description: e.target.value } })} />
            <Select size="sm" label="Columns in this section" value={field.section?.columns || 2} onChange={(e) => up({ section: { ...field.section, columns: Number(e.target.value) as 1 | 2 | 3 } })}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></Select>
            <Toggle size="sm" checked={field.section?.collapsible !== false} onChange={(v) => up({ section: { ...field.section, collapsible: v } })} label="Collapsible" />
            <Toggle size="sm" checked={Boolean(field.section?.collapsedByDefault)} onChange={(v) => up({ section: { ...field.section, collapsedByDefault: v } })} label="Collapsed by default" />
          </>}
        </Section>

        {/* Default value */}
        {!isComputed && field.type !== "section" && field.type !== "subform" && (
          <Section title="Default value" defaultOpen={Boolean(field.defaultValue)}>
            {field.type === "checkbox" ? (
              <Toggle size="sm" checked={Boolean(field.defaultValue)} onChange={(v) => up({ defaultValue: v })} label="Checked by default" />
            ) : CHOICE.includes(field.type) && field.type !== "multiselect" ? (
              <Select size="sm" value={field.defaultValue || ""} onChange={(e) => up({ defaultValue: e.target.value || undefined })}><option value="">None</option>{(field.options || []).map((o) => <option key={o}>{o}</option>)}</Select>
            ) : (
              <>
                <input value={field.defaultValue ?? ""} onChange={(e) => up({ defaultValue: e.target.value === "" ? undefined : NUMERIC.includes(field.type) && !isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} placeholder={field.type === "date" ? "today()" : "Static value or =formula"} className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono" />
                <div className="flex flex-wrap gap-1">{["today()", "now()", "currentUser", "currentUserName", "lastRecord"].map((d) => <button key={d} type="button" onClick={() => up({ defaultValue: d })} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono hover:bg-blue-50">{d}</button>)}</div>
                <p className="text-[10px] text-slate-400">Dynamic: today(), now(), currentUser, lastRecord (copies from last saved record) or =expression. URL prefill: ?prefill_{field.linkName}=value</p>
              </>
            )}
          </Section>
        )}

        {/* Rules */}
        {field.type !== "section" && (
          <Section title="Rules & behaviour" icon={<ShieldCheck className="w-3.5 h-3.5" />}>
            {!isComputed && <Checkbox checked={Boolean(field.required)} onChange={(v) => up({ required: v })} label={<span className="font-medium">Mandatory / required</span>} />}
            {!isComputed && field.type !== "subform" && <Checkbox checked={Boolean(field.unique)} onChange={(v) => up({ unique: v })} label="Unique (no duplicate values)" />}
            {!isComputed && <Checkbox checked={Boolean(field.readonly)} onChange={(v) => up({ readonly: v })} label="Read only" />}
            <Checkbox checked={Boolean(field.hidden)} onChange={(v) => up({ hidden: v })} label="Hidden in form" />
            <Checkbox checked={field.showInReport !== false} onChange={(v) => up({ showInReport: v })} label="Show in reports by default" />
            {!isComputed && (
              <div className="space-y-1 pt-1">
                <label className="text-[11px] font-medium text-slate-700">Required when (expression)</label>
                <input value={field.validation?.requiredIf || ""} onChange={(e) => up({ validation: { ...field.validation, requiredIf: e.target.value } })} placeholder='e.g. status == "Approved"' className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">Show only when (expression)</label>
              <input value={field.visibilityRule || ""} onChange={(e) => up({ visibilityRule: e.target.value })} placeholder='e.g. payment_mode == "Cheque"' className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono" />
            </div>
          </Section>
        )}

        {/* Numeric */}
        {NUMERIC.includes(field.type) && (
          <Section title="Number settings">
            {field.type === "currency" && <Input size="sm" label="Currency symbol" value={field.currencySymbol || "₹"} onChange={(e) => up({ currencySymbol: e.target.value })} />}
            <div className="grid grid-cols-3 gap-2">
              <Input size="sm" label="Decimals" type="number" min={0} max={6} value={field.decimalPlaces ?? 2} onChange={(e) => up({ decimalPlaces: parseInt(e.target.value) || 0 })} />
              <Input size="sm" label="Min" type="number" value={field.min ?? ""} onChange={(e) => up({ min: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
              <Input size="sm" label="Max" type="number" value={field.max ?? ""} onChange={(e) => up({ max: e.target.value === "" ? undefined : parseFloat(e.target.value) })} />
            </div>
          </Section>
        )}
        {field.type === "rating" && <Section title="Rating"><Input size="sm" label="Max stars" type="number" min={3} max={10} value={field.ratingMax || 5} onChange={(e) => up({ ratingMax: parseInt(e.target.value) || 5 })} /></Section>}

        {/* Text */}
        {TEXTY.includes(field.type) && (
          <Section title="Text validation" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2"><Input size="sm" label="Min length" type="number" value={field.minLength ?? ""} onChange={(e) => up({ minLength: e.target.value === "" ? undefined : parseInt(e.target.value) })} /><Input size="sm" label="Max length" type="number" value={field.maxLength ?? ""} onChange={(e) => up({ maxLength: e.target.value === "" ? undefined : parseInt(e.target.value) })} /></div>
            <Input size="sm" label="Regex pattern" value={field.validation?.pattern || ""} onChange={(e) => up({ validation: { ...field.validation, pattern: e.target.value } })} placeholder="^[A-Z]{3}-\d{4}$" className="font-mono" />
            <Input size="sm" label="Pattern error message" value={field.validation?.patternMessage || ""} onChange={(e) => up({ validation: { ...field.validation, patternMessage: e.target.value } })} />
          </Section>
        )}

        {/* Choices */}
        {CHOICE.includes(field.type) && (
          <Section title="Options" icon={<Palette className="w-3.5 h-3.5" />}>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {(field.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="color" value={field.optionColors?.[opt] || "#e2e8f0"} onChange={(e) => setOptionColor(opt, e.target.value)} className="w-6 h-6 rounded border border-slate-200 p-0 cursor-pointer" title="Badge / kanban colour" />
                  <input value={opt} onChange={(e) => { const n = [...(field.options || [])]; n[i] = e.target.value; setOptions(n); }} className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-md bg-white" />
                  <IconButton size="sm" tone="danger" onClick={() => setOptions((field.options || []).filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></IconButton>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setOptions([...(field.options || []), `Option ${(field.options || []).length + 1}`])} className="text-[11px] font-semibold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add option</button>
              <button type="button" onClick={() => { const txt = prompt("Paste options, one per line:"); if (txt) setOptions(txt.split("\n").map((s) => s.trim()).filter(Boolean)); }} className="text-[11px] text-slate-500 hover:text-blue-600">Bulk paste</button>
            </div>
          </Section>
        )}

        {/* Files */}
        {(field.type === "file" || field.type === "image") && (
          <Section title="Upload settings">
            <Toggle size="sm" checked={Boolean(field.multipleFiles)} onChange={(v) => up({ multipleFiles: v })} label="Allow multiple files" />
            <Input size="sm" label="Max size (MB)" type="number" value={field.validation?.maxFileSizeMb ?? 10} onChange={(e) => up({ validation: { ...field.validation, maxFileSizeMb: parseFloat(e.target.value) || 10 } })} />
            {field.type === "file" && <Input size="sm" label="Allowed extensions (comma)" value={(field.validation?.allowedFileTypes || []).join(", ")} onChange={(e) => up({ validation: { ...field.validation, allowedFileTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} placeholder=".pdf, .xlsx, .jpg" />}
          </Section>
        )}

        {/* Autonumber */}
        {field.type === "autonumber" && (
          <Section title="Auto number" icon={<Sparkles className="w-3.5 h-3.5 text-amber-600" />} tone="border-amber-200 bg-amber-50/40">
            <Input size="sm" label="Pattern (optional)" value={field.autonumber?.pattern || ""} onChange={(e) => up({ autonumber: { ...field.autonumber!, pattern: e.target.value } })} placeholder="INV/{YYYY}/{MM}/{0000}" className="font-mono" helperText="Tokens: {PREFIX} {YYYY} {YY} {MM} {DD} {0000} (sequence width)" />
            <div className="grid grid-cols-3 gap-2">
              <Input size="sm" label="Prefix" value={field.autonumber?.prefix || ""} onChange={(e) => up({ autonumber: { ...field.autonumber!, prefix: e.target.value } })} />
              <Input size="sm" label="Start" type="number" value={field.autonumber?.startNumber || 1} onChange={(e) => up({ autonumber: { ...field.autonumber!, startNumber: parseInt(e.target.value) || 1 } })} />
              <Input size="sm" label="Digits" type="number" value={field.autonumber?.digits || 5} onChange={(e) => up({ autonumber: { ...field.autonumber!, digits: parseInt(e.target.value) || 5 } })} />
            </div>
            <Select size="sm" label="Reset sequence" value={field.autonumber?.resetEvery || "never"} onChange={(e) => up({ autonumber: { ...field.autonumber!, resetEvery: e.target.value as any } })}><option value="never">Never</option><option value="yearly">Every year</option><option value="monthly">Every month</option></Select>
            <div className="text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded">Preview: <span className="font-mono font-bold">{field.autonumber ? buildAutoNumberPreview(field.autonumber, 42) : ""}</span></div>
          </Section>
        )}

        {/* Formula */}
        {field.type === "formula" && (
          <Section title="Formula" icon={<Sigma className="w-3.5 h-3.5 text-indigo-600" />} tone="border-indigo-200 bg-indigo-50/40">
            <FormulaEditor value={field.formula?.expression || ""} onChange={(v) => up({ formula: { ...(field.formula || { resultType: "number" }), expression: v } })} form={form} app={app} placeholder="quantity * rate  |  sum(items.amount) * (1 + tax / 100)  |  if(total > 1000, 'Big', 'Small')" />
            <div className="grid grid-cols-2 gap-2">
              <Select size="sm" label="Result type" value={field.formula?.resultType || "number"} onChange={(e) => up({ formula: { ...(field.formula || { expression: "" }), resultType: e.target.value as any } })}><option value="number">Number</option><option value="text">Text</option><option value="date">Date</option><option value="boolean">Yes / No</option></Select>
              {field.formula?.resultType === "number" && <Input size="sm" label="Decimals" type="number" value={field.formula?.decimalPlaces ?? 2} onChange={(e) => up({ formula: { ...(field.formula || { expression: "", resultType: "number" }), decimalPlaces: parseInt(e.target.value) || 0 } })} />}
            </div>
            {field.formula?.resultType === "number" && <Input size="sm" label="Currency symbol (display)" value={field.currencySymbol || ""} onChange={(e) => up({ currencySymbol: e.target.value || undefined })} placeholder="₹ (optional)" />}
          </Section>
        )}

        {/* Rollup */}
        {field.type === "rollup" && (
          <Section title="Rollup / aggregate" icon={<Database className="w-3.5 h-3.5 text-emerald-600" />} tone="border-emerald-200 bg-emerald-50/40">
            <Select size="sm" label="Source form (records to aggregate)" value={field.rollup?.sourceFormId || ""} onChange={(e) => up({ rollup: { ...field.rollup!, sourceFormId: e.target.value, matchFieldId: "", valueFieldId: undefined } })}><option value="">Choose form…</option>{otherForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            {rollupSource && (
              <>
                <Select size="sm" label={`Lookup in ${rollupSource.name} that points to ${form.name}`} value={field.rollup?.matchFieldId || ""} onChange={(e) => up({ rollup: { ...field.rollup!, matchFieldId: e.target.value } })}><option value="">Choose…</option>{rollupMatchOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
                {rollupMatchOptions.length === 0 && <p className="text-[10px] text-rose-600">No lookup in {rollupSource.name} points to {form.name}. Add one first.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Select size="sm" label="Aggregate" value={field.rollup?.aggregate || "sum"} onChange={(e) => up({ rollup: { ...field.rollup!, aggregate: e.target.value as AggregateType } })}><option value="sum">SUM</option><option value="count">COUNT</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option></Select>
                  <Select size="sm" label="Value field" value={field.rollup?.valueFieldId || ""} onChange={(e) => up({ rollup: { ...field.rollup!, valueFieldId: e.target.value || undefined } })}><option value="">— (count)</option>{rollupValueOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
                </div>
                <div className="space-y-1"><label className="text-[11px] font-medium text-slate-700">Only include records where</label><SimpleFilterList form={rollupSource} filters={field.rollup?.filters || []} onChange={(f) => up({ rollup: { ...field.rollup!, filters: f } })} /></div>
                <div className="grid grid-cols-2 gap-2"><Input size="sm" label="Decimals" type="number" value={field.rollup?.decimalPlaces ?? 2} onChange={(e) => up({ rollup: { ...field.rollup!, decimalPlaces: parseInt(e.target.value) || 0 } })} /><Input size="sm" label="Currency (display)" value={field.currencySymbol || ""} onChange={(e) => up({ currencySymbol: e.target.value || undefined })} placeholder="optional" /></div>
                <p className="text-[10px] text-emerald-800">Tip: add a Formula field like <code>opening + total_purchased - total_used</code> for a live balance.</p>
              </>
            )}
          </Section>
        )}

        {/* Lookup */}
        {field.type === "lookup" && (
          <Section title="Lookup relationship" icon={<Search className="w-3.5 h-3.5 text-blue-600" />} tone="border-blue-200 bg-blue-50/40">
            <Select size="sm" label="Related form" value={field.lookup?.targetFormId || ""} onChange={(e) => { const t = app.forms.find((f) => f.id === e.target.value); up({ lookup: { targetFormId: e.target.value, displayFieldId: t ? suggestDefaultDisplayField(t) : "", valueFieldId: "id", relationshipType: "lookup", displayStyle: field.lookup?.displayStyle || "dropdown" } }); }}><option value="">Select form…</option>{otherForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            {targetForm && (
              <>
                <Select size="sm" label="Display field" value={field.lookup?.displayFieldId || ""} onChange={(e) => setLookup({ displayFieldId: e.target.value })}>{targetForm.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Extra columns in picker</label>
                  <div className="flex flex-wrap gap-1">{targetForm.fields.filter((f) => f.type !== "section" && f.type !== "subform" && f.id !== field.lookup?.displayFieldId).map((f) => { const on = field.lookup?.secondaryDisplayFieldIds?.includes(f.id); return <button key={f.id} type="button" onClick={() => setLookup({ secondaryDisplayFieldIds: on ? (field.lookup?.secondaryDisplayFieldIds || []).filter((x) => x !== f.id) : [...(field.lookup?.secondaryDisplayFieldIds || []), f.id] })} className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select size="sm" label="Sort by" value={field.lookup?.sortFieldId || ""} onChange={(e) => setLookup({ sortFieldId: e.target.value || undefined })}><option value="">Display field</option>{targetForm.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                  <Select size="sm" label="Order" value={field.lookup?.sortOrder || "asc"} onChange={(e) => setLookup({ sortOrder: e.target.value as any })}><option value="asc">A → Z</option><option value="desc">Z → A</option></Select>
                </div>
                <Toggle size="sm" checked={Boolean(field.lookup?.multiple)} onChange={(v) => setLookup({ multiple: v })} label="Allow multiple selections" />
                <Toggle size="sm" checked={Boolean(field.lookup?.allowAddNew)} onChange={(v) => setLookup({ allowAddNew: v })} label='"+ Add new" inline from the picker' />
                <div className="space-y-1"><label className="text-[11px] font-medium text-slate-700">Filter records (e.g. active vendors only)</label><SimpleFilterList form={targetForm} filters={field.lookup?.filters || []} onChange={(f) => setLookup({ filters: f })} /></div>
                <div className="rounded-lg border border-blue-200 bg-white p-2 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Cascading (depends on another field)</div>
                  <Select size="sm" label="Parent field in this form" value={field.lookup?.cascade?.parentFieldId || ""} onChange={(e) => setLookup({ cascade: e.target.value ? { parentFieldId: e.target.value, targetMatchFieldId: field.lookup?.cascade?.targetMatchFieldId || "" } : undefined })}><option value="">None</option>{form.fields.filter((f) => f.id !== field.id && f.type !== "section" && f.type !== "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                  {field.lookup?.cascade?.parentFieldId && <Select size="sm" label={`Field in ${targetForm.name} that must equal parent`} value={field.lookup.cascade.targetMatchFieldId} onChange={(e) => setLookup({ cascade: { ...field.lookup!.cascade!, targetMatchFieldId: e.target.value } })}><option value="">Choose…</option>{targetForm.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
                </div>
                <div className="rounded-lg border border-blue-200 bg-white p-2 space-y-1.5">
                  <div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Auto-fill fields on select</div><button type="button" onClick={() => setLookup({ autoFill: [...(field.lookup?.autoFill || []), { sourceFieldId: "", targetFieldId: "" }] })} className="text-[10px] text-blue-600 font-semibold">+ Add</button></div>
                  {(field.lookup?.autoFill || []).map((af, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 items-center">
                      <select value={af.sourceFieldId} onChange={(e) => setLookup({ autoFill: field.lookup!.autoFill!.map((x, j) => (j === i ? { ...x, sourceFieldId: e.target.value } : x)) })} className="text-[10px] border border-slate-300 rounded px-1 py-1 bg-white"><option value="">{targetForm.name} field…</option>{targetForm.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                      <span className="text-slate-400">→</span>
                      <select value={af.targetFieldId} onChange={(e) => setLookup({ autoFill: field.lookup!.autoFill!.map((x, j) => (j === i ? { ...x, targetFieldId: e.target.value } : x)) })} className="text-[10px] border border-slate-300 rounded px-1 py-1 bg-white"><option value="">This form field…</option>{form.fields.filter((f) => f.id !== field.id && f.type !== "section" && f.type !== "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                      <IconButton size="sm" tone="danger" onClick={() => setLookup({ autoFill: field.lookup!.autoFill!.filter((_, j) => j !== i) })}><Trash2 className="w-3 h-3" /></IconButton>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

        {/* Subform */}
        {field.type === "subform" && (
          <Section title="Subform source" icon={<Database className="w-3.5 h-3.5 text-purple-600" />} tone="border-purple-200 bg-purple-50/40">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setSub({ sourceType: "inline", targetFormId: undefined, parentLinkFieldId: undefined, linkedFieldIds: undefined })} className={`text-left p-2 rounded-lg border text-[11px] ${field.subform?.sourceType !== "existing_form" ? "border-purple-500 bg-white" : "border-slate-200 bg-white/60"}`}><div className="font-semibold text-slate-900">Blank subform</div><div className="text-[10px] text-slate-500">Define columns here; rows live inside this record only.</div></button>
              <button type="button" onClick={() => setSub({ sourceType: "existing_form" })} className={`text-left p-2 rounded-lg border text-[11px] ${field.subform?.sourceType === "existing_form" ? "border-purple-500 bg-white" : "border-slate-200 bg-white/60"}`}><div className="font-semibold text-slate-900">Use existing form</div><div className="text-[10px] text-slate-500">Each row is also saved as a record of that form, linked to this one.</div></button>
            </div>
            {field.subform?.sourceType === "existing_form" && (
              <div className="space-y-2">
                <Select size="sm" label="Child form" value={field.subform.targetFormId || ""} onChange={(e) => linkExistingForm(e.target.value)}><option value="">Choose…</option>{otherForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                {linkedTarget && (
                  <>
                    <div className="space-y-1"><label className="text-[11px] font-medium text-slate-700">Columns from {linkedTarget.name}</label><div className="flex flex-wrap gap-1">{linkableFields(linkedTarget, field.subform.parentLinkFieldId).map((f) => { const on = (field.subform?.linkedFieldIds || []).includes(f.id); return <button key={f.id} type="button" onClick={() => setLinkedFields(on ? (field.subform?.linkedFieldIds || []).filter((x) => x !== f.id) : [...(field.subform?.linkedFieldIds || []), f.id])} className={`px-2 py-0.5 rounded-full text-[10px] border ${on ? "bg-purple-600 text-white border-purple-600" : "bg-white border-slate-300"}`}>{f.label}</button>; })}</div></div>
                    <p className="text-[10px] text-purple-800 bg-white border border-purple-200 rounded-lg px-2 py-1.5">Rows entered here are saved as <strong>{linkedTarget.name}</strong> records with the lookup <strong>&quot;{linkedTarget.fields.find((f) => f.id === field.subform?.parentLinkFieldId)?.label || form.name}&quot;</strong> pointing at this {form.name}. Open {linkedTarget.name} to see every row and where it was entered from.</p>
                  </>
                )}
              </div>
            )}
          </Section>
        )}
        {field.type === "subform" && (
          <Section title={field.subform?.sourceType === "existing_form" ? "Column settings" : "Subform columns"} icon={<Table className="w-3.5 h-3.5 text-purple-600" />} tone="border-purple-200 bg-purple-50/40">
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
              {cols.map((col, idx) => (
                <SubformColumnEditor key={col.id} col={col} idx={idx} total={cols.length} form={form} app={app} otherForms={otherForms} allCols={cols} onUpdate={(p) => updateCol(col.id, p)} onRemove={() => removeCol(col.id)} onMove={(d) => moveCol(idx, d)} />
              ))}
            </div>
            {field.subform?.sourceType !== "existing_form" && <button type="button" onClick={addCol} className="text-[11px] font-semibold text-purple-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Add column</button>}
            <div className="border-t border-purple-200 pt-2 space-y-2">
              <Toggle size="sm" checked={field.subform?.showTotals !== false} onChange={(v) => setSub({ showTotals: v })} label="Show totals row" />
              {field.subform?.showTotals !== false && <div className="flex flex-wrap gap-1">{cols.filter((c) => ["number", "currency", "decimal", "percentage", "formula"].includes(c.type) || c.formula).map((c) => { const on = field.subform?.totalColumnIds?.includes(c.id); return <button key={c.id} type="button" onClick={() => setSub({ totalColumnIds: on ? (field.subform?.totalColumnIds || []).filter((x) => x !== c.id) : [...(field.subform?.totalColumnIds || []), c.id] })} className={`px-1.5 py-0.5 rounded text-[10px] border ${on ? "bg-purple-600 text-white border-purple-600" : "bg-white border-slate-300"}`}>Σ {c.label}</button>; })}</div>}
              <div className="grid grid-cols-2 gap-2"><Input size="sm" label="Min rows" type="number" value={field.subform?.minRows ?? ""} onChange={(e) => setSub({ minRows: e.target.value === "" ? undefined : parseInt(e.target.value) })} /><Input size="sm" label="Max rows" type="number" value={field.subform?.maxRows ?? ""} onChange={(e) => setSub({ maxRows: e.target.value === "" ? undefined : parseInt(e.target.value) })} /></div>
              <Toggle size="sm" checked={field.subform?.allowBulkAdd !== false} onChange={(v) => setSub({ allowBulkAdd: v })} label="Bulk add rows" />
              <Toggle size="sm" checked={Boolean(field.subform?.allowReorder)} onChange={(v) => setSub({ allowReorder: v })} label="Reorder rows" />
              <Toggle size="sm" checked={field.subform?.allowDuplicateRow !== false} onChange={(v) => setSub({ allowDuplicateRow: v })} label="Duplicate row" />
              <div className="rounded-lg border border-purple-200 bg-white p-2 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Import rows from another form (PO → GRN)</div>
                <Select size="sm" value={field.subform?.importFrom?.formId || ""} onChange={(e) => { const f = app.forms.find((x) => x.id === e.target.value); const sf = f?.fields.find((x) => x.type === "subform"); setSub({ importFrom: e.target.value ? { formId: e.target.value, subformFieldId: sf?.id || "", columnMap: {}, viaLookupFieldId: form.fields.find((x) => x.type === "lookup" && x.lookup?.targetFormId === e.target.value)?.id } : undefined }); }}><option value="">Disabled</option>{otherForms.filter((f) => f.fields.some((x) => x.type === "subform")).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                {field.subform?.importFrom && (() => { const sf = app.forms.find((x) => x.id === field.subform!.importFrom!.formId); const srcSub = sf?.fields.find((x) => x.id === field.subform!.importFrom!.subformFieldId) || sf?.fields.find((x) => x.type === "subform"); return srcSub ? (
                  <div className="space-y-1">
                    <Select size="sm" label="Source subform" value={field.subform.importFrom.subformFieldId} onChange={(e) => setSub({ importFrom: { ...field.subform!.importFrom!, subformFieldId: e.target.value } })}>{sf!.fields.filter((x) => x.type === "subform").map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
                    <div className="text-[10px] text-slate-500">Map columns:</div>
                    {(srcSub.subform?.columns || []).map((sc) => (
                      <div key={sc.id} className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center text-[10px]"><span className="truncate">{sc.label}</span><span className="text-slate-400">→</span><select value={field.subform!.importFrom!.columnMap[sc.id] || ""} onChange={(e) => setSub({ importFrom: { ...field.subform!.importFrom!, columnMap: { ...field.subform!.importFrom!.columnMap, [sc.id]: e.target.value } } })} className="border border-slate-300 rounded px-1 py-0.5 bg-white"><option value="">skip</option>{cols.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                    ))}
                  </div>
                ) : null; })()}
              </div>
            </div>
          </Section>
        )}

        {/* Cross-field validation */}
        {!isComputed && field.type !== "section" && (
          <Section title="Validation rules" icon={<ShieldCheck className="w-3.5 h-3.5" />} defaultOpen={Boolean(field.validation?.rules?.length)}>
            <p className="text-[10px] text-slate-500">Each rule must evaluate to true. Example: <code>end_date &gt;= start_date</code></p>
            {(field.validation?.rules || []).map((r, i) => (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
                <input value={r.expression} onChange={(e) => up({ validation: { ...field.validation, rules: field.validation!.rules!.map((x, j) => (j === i ? { ...x, expression: e.target.value } : x)) } })} placeholder="expression" className="w-full text-xs px-2 py-1 rounded border border-slate-300 font-mono" />
                <div className="flex gap-1"><input value={r.message} onChange={(e) => up({ validation: { ...field.validation, rules: field.validation!.rules!.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)) } })} placeholder="Error message" className="flex-1 text-xs px-2 py-1 rounded border border-slate-300" /><IconButton size="sm" tone="danger" onClick={() => up({ validation: { ...field.validation, rules: field.validation!.rules!.filter((_, j) => j !== i) } })}><Trash2 className="w-3.5 h-3.5" /></IconButton></div>
              </div>
            ))}
            <button type="button" onClick={() => up({ validation: { ...field.validation, rules: [...(field.validation?.rules || []), { id: generateId("rule"), expression: "", message: "" }] } })} className="text-[11px] font-semibold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Add rule</button>
            <Input size="sm" label="Custom 'required' message" value={field.validation?.customMessage || ""} onChange={(e) => up({ validation: { ...field.validation, customMessage: e.target.value } })} placeholder={`${field.label} is required`} />
          </Section>
        )}
      </div>
    </div>
  );
};

const SubformColumnEditor: React.FC<{ col: SubformColumn; idx: number; total: number; form: FormDefinition; app: AppDefinition; otherForms: FormDefinition[]; allCols: SubformColumn[]; onUpdate: (p: Partial<SubformColumn>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }> = ({ col, idx, total, form, app, otherForms, allCols, onUpdate, onRemove, onMove }) => {
  const [open, setOpen] = useState(false);
  const target = col.lookup?.targetFormId ? app.forms.find((f) => f.id === col.lookup!.targetFormId) : undefined;
  const isFormula = col.type === "formula" || Boolean(col.formula?.expression);
  return (
    <div className="rounded-lg border border-purple-200 bg-white shadow-3xs">
      <div className="flex items-center gap-1 p-1.5">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
        <input value={col.label} onChange={(e) => onUpdate({ label: e.target.value, linkName: toLinkName(e.target.value) })} className="flex-1 text-xs font-medium border border-slate-200 rounded px-1.5 py-1 min-w-0" />
        <select value={col.type} onChange={(e) => onUpdate({ type: e.target.value as FieldType, formula: e.target.value === "formula" ? col.formula || { expression: "", resultType: "number", decimalPlaces: 2 } : col.formula, readonly: e.target.value === "formula" ? true : col.readonly })} className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-slate-50">{SUBFORM_COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <IconButton size="sm" tone="danger" onClick={onRemove}><Trash2 className="w-3 h-3" /></IconButton>
      </div>
      {open && (
        <div className="px-2 pb-2 space-y-2 border-t border-purple-100 pt-2">
          <div className="grid grid-cols-3 gap-1.5">
            <Input size="sm" label="Width px" type="number" value={col.width ?? ""} onChange={(e) => onUpdate({ width: e.target.value === "" ? undefined : parseInt(e.target.value) })} />
            <Input size="sm" label="Default" value={col.defaultValue ?? ""} onChange={(e) => onUpdate({ defaultValue: e.target.value === "" ? undefined : isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })} />
            <div className="flex flex-col gap-1 pt-4"><Checkbox checked={Boolean(col.required)} onChange={(v) => onUpdate({ required: v })} label="Req." /><Checkbox checked={Boolean(col.readonly)} onChange={(v) => onUpdate({ readonly: v })} label="RO" /></div>
          </div>
          <div className="flex gap-1"><button type="button" onClick={() => onMove(-1)} disabled={idx === 0} className="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-40">↑</button><button type="button" onClick={() => onMove(1)} disabled={idx === total - 1} className="text-[10px] px-1.5 py-0.5 border rounded disabled:opacity-40">↓</button></div>
          {(col.type === "currency" || col.type === "number" || col.type === "decimal" || col.type === "percentage") && <div className="grid grid-cols-2 gap-1.5">{col.type === "currency" && <Input size="sm" label="Symbol" value={col.currencySymbol || "₹"} onChange={(e) => onUpdate({ currencySymbol: e.target.value })} />}<Input size="sm" label="Decimals" type="number" value={col.decimalPlaces ?? 2} onChange={(e) => onUpdate({ decimalPlaces: parseInt(e.target.value) || 0 })} /></div>}
          {col.type === "dropdown" && <Input size="sm" label="Options (comma separated)" value={(col.options || []).join(", ")} onChange={(e) => onUpdate({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />}
          {(col.type === "formula" || col.formula) && (
            <div className="space-y-1">
              <FormulaEditor value={col.formula?.expression || ""} onChange={(v) => onUpdate({ formula: { ...(col.formula || { resultType: "number", decimalPlaces: 2 }), expression: v } })} form={form} app={app} rowColumns={allCols.filter((c) => c.id !== col.id).map((c) => ({ id: c.id, linkName: c.linkName, label: c.label, type: c.type }))} rows={2} placeholder="quantity * rate" label="Row formula" />
              {col.type !== "formula" && <button type="button" onClick={() => onUpdate({ formula: undefined })} className="text-[10px] text-rose-600">Remove formula</button>}
            </div>
          )}
          {!isFormula && ["number", "currency", "decimal", "percentage"].includes(col.type) && !col.formula && <button type="button" onClick={() => onUpdate({ formula: { expression: "", resultType: "number", decimalPlaces: col.decimalPlaces ?? 2 }, readonly: true })} className="text-[10px] font-semibold text-indigo-600 flex items-center gap-1"><Sigma className="w-3 h-3" /> Make this a row formula</button>}
          {col.type === "lookup" && (
            <div className="space-y-1.5 rounded border border-blue-100 bg-blue-50/40 p-1.5">
              <Select size="sm" label="Form" value={col.lookup?.targetFormId || ""} onChange={(e) => { const t = app.forms.find((f) => f.id === e.target.value); onUpdate({ lookup: { targetFormId: e.target.value, displayFieldId: t ? suggestDefaultDisplayField(t) : "", relationshipType: "lookup", displayStyle: "dropdown" } }); }}><option value="">Select…</option>{otherForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
              {target && <>
                <Select size="sm" label="Display field" value={col.lookup?.displayFieldId || ""} onChange={(e) => onUpdate({ lookup: { ...col.lookup!, displayFieldId: e.target.value } })}>{target.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
                <div className="space-y-1"><label className="text-[10px] font-medium text-slate-600">Filter records</label><SimpleFilterList form={target} filters={col.lookup?.filters || []} onChange={(f) => onUpdate({ lookup: { ...col.lookup!, filters: f } })} /></div>
                <Checkbox checked={Boolean(col.lookup?.allowAddNew)} onChange={(v) => onUpdate({ lookup: { ...col.lookup!, allowAddNew: v } })} label="Allow add new" />
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><label className="text-[10px] font-medium text-slate-600">Auto-fill columns (Item → rate)</label><button type="button" onClick={() => onUpdate({ lookup: { ...col.lookup!, autoFill: [...(col.lookup?.autoFill || []), { sourceFieldId: "", targetFieldId: "" }] } })} className="text-[10px] text-blue-600 font-semibold">+ Add</button></div>
                  {(col.lookup?.autoFill || []).map((af, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 items-center">
                      <select value={af.sourceFieldId} onChange={(e) => onUpdate({ lookup: { ...col.lookup!, autoFill: col.lookup!.autoFill!.map((x, j) => (j === i ? { ...x, sourceFieldId: e.target.value } : x)) } })} className="text-[10px] border rounded px-1 py-0.5 bg-white"><option value="">{target.name}…</option>{target.fields.filter((f) => f.type !== "section").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                      <span className="text-slate-400">→</span>
                      <select value={af.targetFieldId} onChange={(e) => onUpdate({ lookup: { ...col.lookup!, autoFill: col.lookup!.autoFill!.map((x, j) => (j === i ? { ...x, targetFieldId: e.target.value } : x)) } })} className="text-[10px] border rounded px-1 py-0.5 bg-white"><option value="">column…</option>{allCols.filter((c) => c.id !== col.id).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                      <IconButton size="sm" tone="danger" onClick={() => onUpdate({ lookup: { ...col.lookup!, autoFill: col.lookup!.autoFill!.filter((_, j) => j !== i) } })}><Trash2 className="w-3 h-3" /></IconButton>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

