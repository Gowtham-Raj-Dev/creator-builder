"use client";

import React, { useMemo, useState } from "react";
import { FieldDefinition, FormDefinition, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DynamicField } from "../DynamicField";
import { executeWorkflows } from "@/lib/engine/workflowEngine";
import { Pencil, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/** Field types that cannot be mass-assigned (layout, computed, per-record media, row data). */
const NOT_BULK = new Set(["section", "subform", "formula", "rollup", "autonumber", "file", "image", "signature", "geolocation"]);

interface Props {
  form: FormDefinition;
  records: RecordDefinition[];
  onClose: () => void;
  /** called after the run with the number of records actually updated */
  onDone?: (updated: number) => void;
}

/**
 * Right-side panel for editing several records at once: tick the fields to change, enter the new values,
 * apply. Each record goes through the form's validate/submit/after-save workflows, exactly like a normal save,
 * so blocked records are skipped and reported instead of silently written.
 */
export const BulkEditPanel: React.FC<Props> = ({ form, records, onClose, onDone }) => {
  const { app, recordsMap, updateRecord, applyWorkflowSideEffects, permissions } = useLiveApp();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<{ updated: number; skipped: Array<{ rec: RecordDefinition; reason: string }>; failed: number } | null>(null);

  const editable = useMemo(
    () => form.fields.filter((f) => !NOT_BULK.has(f.type) && !f.readonly && permissions.fieldRule(form.id, f.id) !== "hidden" && permissions.fieldRule(form.id, f.id) !== "readonly"),
    [form, permissions]
  );
  const chosen = editable.filter((f) => picked[f.id]);
  const titleId = form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
  const titleOf = (r: RecordDefinition) => (titleId ? String(r.data?.[titleId] ?? r.id) : r.id);

  const toggle = (f: FieldDefinition) => setPicked((p) => {
    const on = !p[f.id];
    if (on && !(f.id in values)) setValues((v) => ({ ...v, [f.id]: f.type === "checkbox" ? false : f.type === "multiselect" || (f.type === "lookup" && f.lookup?.multiple) || f.type === "users" ? [] : "" }));
    return { ...p, [f.id]: on };
  });

  const apply = async () => {
    if (!app || !chosen.length) return;
    const patch: Record<string, any> = {};
    for (const f of chosen) patch[f.id] = values[f.id];
    const workflows = app.workflows || [];
    const ctxBase = { app, recordsMap, user: user ? { email: user.email, name: user.name } : null, isEdit: true };
    const result = { updated: 0, skipped: [] as Array<{ rec: RecordDefinition; reason: string }>, failed: 0 };
    setBusy({ done: 0, total: records.length });
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const merged = { ...(rec.data || {}), ...patch };
      // same gates as a normal save: validate → submit (a blocking workflow skips this record)
      const v = executeWorkflows(workflows, "onValidate", undefined, merged, form, { ...ctxBase, record: rec });
      const s = executeWorkflows(workflows, "onSubmit", undefined, v.updatedValues, form, { ...ctxBase, record: rec });
      if (v.shouldBlockSubmit || s.shouldBlockSubmit) {
        const reason = [...v.messages, ...s.messages].find((m) => m.type === "error")?.text || v.popupAlert?.message || s.popupAlert?.message || Object.values({ ...v.validationErrors, ...s.validationErrors })[0] || "blocked by a workflow";
        result.skipped.push({ rec, reason });
      } else {
        const ok = await updateRecord(form.id, rec.id, s.updatedValues, { silent: true });
        if (ok) {
          result.updated++;
          const saved: RecordDefinition = { ...rec, data: { ...rec.data, ...s.updatedValues } };
          const after = executeWorkflows(workflows, "onSuccess", undefined, { ...saved.data }, form, { ...ctxBase, record: saved });
          for (const r of [v, s, after]) await applyWorkflowSideEffects(r, form.id, saved.id);
        } else result.failed++;
      }
      setBusy({ done: i + 1, total: records.length });
    }
    setBusy(null);
    setOutcome(result);
    if (result.updated) showToast(`${result.updated} record${result.updated === 1 ? "" : "s"} updated`, "success");
    if (!result.skipped.length && !result.failed) { onDone?.(result.updated); onClose(); }
    else onDone?.(result.updated);
  };

  return (
    <Drawer
      isOpen
      onClose={() => { if (!busy) onClose(); }}
      width="max-w-xl"
      header={
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{form.name}</div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Pencil className="w-4 h-4 text-blue-600" /> Edit {records.length} record{records.length === 1 ? "" : "s"}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Tick the fields to change and enter the new value. Untouched fields keep their current values on every record.</p>
        </div>
      }
      footer={
        <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            {busy ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving {busy.done} / {busy.total}…</span> : chosen.length ? `${chosen.length} field${chosen.length === 1 ? "" : "s"} → ${records.length} record${records.length === 1 ? "" : "s"}` : "No field selected yet"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={Boolean(busy)}>{outcome ? "Close" : "Cancel"}</Button>
            {!outcome && <Button size="sm" onClick={apply} disabled={!chosen.length || Boolean(busy)} loading={Boolean(busy)} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Apply to {records.length}</Button>}
          </div>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        {outcome && (
          <div className={`rounded-xl border p-3 text-xs space-y-2 ${outcome.skipped.length || outcome.failed ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">{outcome.skipped.length || outcome.failed ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />} {outcome.updated} updated{outcome.skipped.length ? ` · ${outcome.skipped.length} skipped` : ""}{outcome.failed ? ` · ${outcome.failed} failed` : ""}</div>
            {outcome.skipped.length > 0 && <ul className="list-disc pl-4 text-slate-700 space-y-0.5">{outcome.skipped.slice(0, 8).map(({ rec, reason }) => <li key={rec.id}><span className="font-medium">{titleOf(rec)}</span>: {reason}</li>)}{outcome.skipped.length > 8 && <li>…and {outcome.skipped.length - 8} more</li>}</ul>}
          </div>
        )}
        {editable.length === 0 && <p className="text-xs text-slate-500">No editable fields in this form.</p>}
        {editable.map((f) => {
          const on = Boolean(picked[f.id]);
          return (
            <div key={f.id} className={`rounded-xl border transition-colors ${on ? "border-blue-300 bg-blue-50/30" : "border-slate-200 bg-white"}`}>
              <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none">
                <input type="checkbox" checked={on} disabled={Boolean(busy) || Boolean(outcome)} onChange={() => toggle(f)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600" />
                <span className={`text-xs font-semibold ${on ? "text-blue-800" : "text-slate-700"}`}>{f.label}</span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">{f.type}</span>
                {on && <span className="ml-auto text-[10px] text-slate-400">leave empty to clear</span>}
              </label>
              {on && (
                <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                  <DynamicField field={{ ...f, label: "", required: false }} value={values[f.id]} onChange={(val) => setValues((v) => ({ ...v, [f.id]: val }))} isReadonly={Boolean(busy) || Boolean(outcome)} parentValues={values} />
                </div>
              )}
            </div>
          );
        })}
        {records.length > 0 && (
          <div className="pt-2 text-[11px] text-slate-400">
            Applies to: {records.slice(0, 6).map(titleOf).join(", ")}{records.length > 6 ? ` +${records.length - 6} more` : ""}
          </div>
        )}
      </div>
    </Drawer>
  );
};
