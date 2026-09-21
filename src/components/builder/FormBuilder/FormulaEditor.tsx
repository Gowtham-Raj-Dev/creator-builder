"use client";

import React, { useMemo, useState } from "react";
import { FormDefinition, AppDefinition } from "@/types/schema";
import { FUNCTION_DOCS, validateFormulaSyntax, evaluateFormula, buildFormulaContext } from "@/lib/engine/formulaEngine";
import { CheckCircle2, AlertCircle, ChevronDown, Sigma } from "lucide-react";

/**
 * Expression editor with field pickers, function reference and a live sample evaluation.
 * Used for formula fields, subform row formulas, visibility rules, validation rules and workflow conditions.
 */
export const FormulaEditor: React.FC<{
  value: string;
  onChange: (v: string) => void;
  form: FormDefinition;
  app: AppDefinition;
  rowColumns?: Array<{ id: string; linkName: string; label: string; type: string }>; // subform row context
  placeholder?: string;
  rows?: number;
  label?: string;
  sample?: boolean;
}> = ({ value, onChange, form, app, rowColumns, placeholder, rows = 3, label, sample = true }) => {
  const [showFns, setShowFns] = useState(false);
  const [sampleVals, setSampleVals] = useState<Record<string, string>>({});
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const syntax = useMemo(() => (value.trim() ? validateFormulaSyntax(value) : { ok: true }), [value]);

  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return onChange(value + text);
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length); }, 0);
  };

  const fields = rowColumns || form.fields.filter((f) => f.type !== "section").map((f) => ({ id: f.id, linkName: f.linkName, label: f.label, type: f.type }));
  const subforms = rowColumns ? [] : form.fields.filter((f) => f.type === "subform");
  const lookups = rowColumns ? rowColumns.filter((c) => c.type === "lookup") : form.fields.filter((f) => f.type === "lookup");

  const sampleResult = useMemo(() => {
    if (!sample || !value.trim() || !syntax.ok) return null;
    try {
      const vals: Record<string, any> = {};
      for (const f of fields) { const raw = sampleVals[f.linkName]; vals[f.id] = raw === undefined || raw === "" ? (["number", "currency", "decimal", "percentage", "rating"].includes(f.type) ? 1 : "") : isNaN(Number(raw)) ? raw : Number(raw); }
      const ctx = rowColumns ? Object.fromEntries(fields.flatMap((f) => [[f.id, vals[f.id]], [f.linkName, vals[f.id]]])) : buildFormulaContext(form, vals, { forms: app.forms });
      const r = evaluateFormula(value, ctx);
      return r === undefined ? "undefined" : typeof r === "object" ? JSON.stringify(r) : String(r);
    } catch (e: any) { return `Error: ${e?.message}`; }
  }, [value, syntax.ok, sampleVals, fields, form, app.forms, rowColumns, sample]);

  const groups = Array.from(new Set(FUNCTION_DOCS.map((d) => d.group)));

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Sigma className="w-3.5 h-3.5 text-indigo-500" />{label}</label>}
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder || "e.g. quantity * rate"} spellCheck={false} className={`w-full font-mono text-xs p-2.5 rounded-lg border bg-slate-900 text-emerald-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${syntax.ok ? "border-slate-700" : "border-rose-500"}`} />
      <div className="flex items-center justify-between text-[11px]">
        {syntax.ok ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />{value.trim() ? "Valid expression" : "Enter an expression"}</span> : <span className="flex items-center gap-1 text-rose-600"><AlertCircle className="w-3.5 h-3.5" />{syntax.error}</span>}
        <button type="button" onClick={() => setShowFns((s) => !s)} className="text-indigo-600 font-semibold flex items-center gap-1">Functions <ChevronDown className={`w-3 h-3 transition-transform ${showFns ? "rotate-180" : ""}`} /></button>
      </div>

      <div className="flex flex-wrap gap-1">
        {fields.slice(0, 40).map((f) => <button key={f.id} type="button" onClick={() => insert(f.linkName)} className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-[10px] font-mono text-slate-700 border border-slate-200" title={f.label}>{f.linkName}</button>)}
        {subforms.map((sf) => (sf.subform?.columns || []).map((c) => <button key={`${sf.id}.${c.id}`} type="button" onClick={() => insert(`sum(${sf.linkName}.${c.linkName})`)} className="px-1.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-[10px] font-mono text-purple-700 border border-purple-200" title={`Sum of ${sf.label} › ${c.label}`}>sum({sf.linkName}.{c.linkName})</button>))}
        {lookups.map((lk: any) => { const tf = app.forms.find((f) => f.id === lk.lookup?.targetFormId); return (tf?.fields || []).filter((f) => f.type !== "section" && f.type !== "subform").slice(0, 6).map((tfld) => <button key={`${lk.id}.${tfld.id}`} type="button" onClick={() => insert(`${lk.linkName}.${tfld.linkName}`)} className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[10px] font-mono text-blue-700 border border-blue-200" title={`${lk.label} › ${tfld.label}`}>{lk.linkName}.{tfld.linkName}</button>); })}
      </div>

      {showFns && (
        <div className="rounded-lg border border-slate-200 bg-white max-h-56 overflow-y-auto divide-y divide-slate-100">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">{g}</div>
              {FUNCTION_DOCS.filter((d) => d.group === g).map((d) => (
                <button key={d.name} type="button" onClick={() => insert(d.sig.includes("(") ? d.sig.replace(/\(.*\)/, "(") : d.sig)} className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 flex items-start gap-2">
                  <code className="text-[10px] text-indigo-700 font-mono shrink-0">{d.sig}</code><span className="text-[10px] text-slate-500">{d.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {sample && value.trim() && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Test with sample values</div>
          <div className="flex flex-wrap gap-1.5">
            {fields.filter((f) => new RegExp(`\\b${f.linkName}\\b`, "i").test(value)).slice(0, 6).map((f) => (
              <input key={f.id} value={sampleVals[f.linkName] ?? ""} onChange={(e) => setSampleVals({ ...sampleVals, [f.linkName]: e.target.value })} placeholder={f.linkName} className="w-24 text-[11px] px-1.5 py-1 rounded border border-slate-300 bg-white font-mono" />
            ))}
          </div>
          <div className="text-[11px]">Result: <code className="font-mono font-semibold text-indigo-700">{sampleResult}</code></div>
        </div>
      )}
    </div>
  );
};
