"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { FormDefinition, FieldDefinition, RecordDefinition, WorkflowDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { DynamicField } from "./DynamicField";
import { QuickCreateContext } from "./LookupField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { validateFormData, ValidationErrors } from "@/lib/engine/validationEngine";
import { executeWorkflows, PopupAlert, WorkflowResult } from "@/lib/engine/workflowEngine";
import { buildFormulaContext, evaluateFormula, coerceFormulaResult, resolveDefaultValue } from "@/lib/engine/formulaEngine";
import { computeRollup } from "@/lib/engine/rollupEngine";
import { useToast } from "@/context/ToastContext";
import { Save, ArrowLeft, AlertCircle, X, ChevronDown, Info, AlertTriangle, HelpCircle, CheckCircle2, Clock } from "lucide-react";

interface DynamicFormProps {
  form: FormDefinition;
  record?: RecordDefinition | null;
  onSuccess?: (rec: RecordDefinition | null) => void;
  onCancel?: () => void;
  prefill?: Record<string, any>;
  embedded?: boolean; // inside modal / page widget: compact header, no redirect
  hideHeader?: boolean;
}

const WIDTH_SPAN: Record<string, string> = { full: "md:col-span-6", half: "md:col-span-3", third: "md:col-span-2", two_thirds: "md:col-span-4" };
const ALWAYS_FULL = new Set(["subform", "section", "richtext", "file", "image", "address", "signature"]);

function spanFor(field: FieldDefinition, columns: 1 | 2 | 3): string {
  if (ALWAYS_FULL.has(field.type)) return "md:col-span-6";
  if (field.width) return WIDTH_SPAN[field.width];
  return columns === 1 ? "md:col-span-6" : columns === 3 ? "md:col-span-2" : "md:col-span-3";
}

export const DynamicForm: React.FC<DynamicFormProps> = ({ form, record, onSuccess, onCancel, prefill, embedded, hideHeader }) => {
  const { app, recordsMap, createRecord, updateRecord, applyWorkflowSideEffects, permissions, noteRecent } = useLiveApp();
  const { user } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const isEditMode = Boolean(record);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>({});
  const [readonlyFields, setReadonlyFields] = useState<Record<string, boolean>>({});
  const [formAlert, setFormAlert] = useState<{ type: "info" | "warning" | "error" | "success"; text: string } | null>(null);
  const [popup, setPopup] = useState<(PopupAlert & { fields?: Array<{ label: string; fieldId: string; error: string }>; onContinue?: () => void; onCancel?: () => void }) | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quickCreate, setQuickCreate] = useState<{ formId: string; onCreated: (rec: RecordDefinition) => void } | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const saveAndNewRef = useRef(false);

  const formPerm = permissions.form(form.id);
  const workflows: WorkflowDefinition[] = useMemo(() => app?.workflows.filter((w) => w.formId === form.id && w.active) || [], [app?.workflows, form.id]);
  const wfCtx = useMemo(() => ({ app, recordsMap, user: user ? { email: user.email, name: user.name } : null, record, isEdit: isEditMode }), [app, recordsMap, user, record, isEditMode]);

  // ── initialise ────────────────────────────────────────────────────────────
  useEffect(() => {
    const initial: Record<string, any> = {};
    const ctx = { __user: user ? { email: user.email, name: user.name } : null };
    const urlPrefill: Record<string, any> = {};
    searchParams?.forEach((v, k) => { if (k.startsWith("prefill_")) urlPrefill[k.slice(8)] = v; });

    const lastRecord = (recordsMap[form.id] || [])[0];
    for (const field of form.fields) {
      if (field.type === "section") continue;
      if (record?.data && field.id in record.data) { initial[field.id] = record.data[field.id]; continue; }
      const pf = prefill?.[field.id] ?? prefill?.[field.linkName] ?? urlPrefill[field.linkName] ?? urlPrefill[field.id];
      if (pf !== undefined) { initial[field.id] = ["number", "currency", "decimal", "percentage"].includes(field.type) ? Number(pf) : field.type === "checkbox" ? pf === "true" || pf === true : pf; continue; }
      let dv = resolveDefaultValue(field, ctx);
      if (typeof field.defaultValue === "string" && field.defaultValue.toLowerCase() === "lastrecord" && lastRecord) dv = lastRecord.data?.[field.id];
      if (dv !== undefined) initial[field.id] = dv;
      else if (field.type === "checkbox") initial[field.id] = false;
      else if (field.type === "subform" || (field.type === "lookup" && field.lookup?.multiple) || field.type === "multiselect") initial[field.id] = [];
      else initial[field.id] = "";
    }
    const loadResult = executeWorkflows(workflows, "onLoad", undefined, initial, form, wfCtx);
    setFormData(loadResult.updatedValues);
    setHiddenFields(loadResult.fieldVisibility);
    setReadonlyFields(loadResult.fieldReadonly);
    if (loadResult.popupAlert) setPopup(loadResult.popupAlert);
    const msg = pickMessage(loadResult);
    setFormAlert(msg);
    setErrors({});
    const col: Record<string, boolean> = {};
    form.fields.forEach((f) => { if (f.type === "section" && f.section?.collapsedByDefault) col[f.id] = true; });
    setCollapsed(col);
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, record?.id, resetKey]);

  // ── computed values (formulas / rollups) ──────────────────────────────────
  const computed = useMemo(() => {
    if (!app) return {};
    const values: Record<string, any> = { ...formData };
    for (const f of form.fields) if (f.type === "rollup" && f.rollup?.sourceFormId && record) values[f.id] = computeRollup(f.rollup, record.id, app, recordsMap);
    const formulaFields = form.fields.filter((f) => f.type === "formula" && f.formula?.expression);
    for (let pass = 0; pass < 2; pass++) {
      const ctx = buildFormulaContext(form, values, { forms: app.forms, recordsMap, user, record });
      for (const f of formulaFields) values[f.id] = coerceFormulaResult(evaluateFormula(f.formula!.expression, ctx), f.formula!.resultType, f.formula!.decimalPlaces);
    }
    const out: Record<string, any> = {};
    for (const f of form.fields) if (f.type === "formula" || f.type === "rollup") out[f.id] = values[f.id];
    return out;
  }, [formData, form, app, recordsMap, user, record]);

  const fullValues = useMemo(() => ({ ...formData, ...computed }), [formData, computed]);
  const formulaCtx = useMemo(() => (app ? buildFormulaContext(form, fullValues, { forms: app.forms, recordsMap, user, record }) : fullValues), [app, form, fullValues, recordsMap, user, record]);

  const isFieldHidden = useCallback(
    (field: FieldDefinition) => {
      if (field.hidden) return true;
      if (hiddenFields[field.id]) return true;
      if (permissions.fieldRule(form.id, field.id) === "hidden") return true;
      if (field.visibilityRule) return !evaluateFormula(field.visibilityRule, formulaCtx);
      return false;
    },
    [hiddenFields, permissions, form.id, formulaCtx]
  );

  const isFieldReadonly = useCallback(
    (field: FieldDefinition) => Boolean(readonlyFields[field.id]) || permissions.fieldRule(form.id, field.id) === "readonly" || (isEditMode && !formPerm.edit),
    [readonlyFields, permissions, form.id, isEditMode, formPerm.edit]
  );

  const applyWorkflowResult = useCallback(
    (res: WorkflowResult, fieldId?: string) => {
      if (Object.keys(res.fieldVisibility).length) setHiddenFields((p) => ({ ...p, ...res.fieldVisibility }));
      if (Object.keys(res.fieldReadonly).length) setReadonlyFields((p) => ({ ...p, ...res.fieldReadonly }));
      setErrors((prev) => {
        const next = { ...prev };
        if (fieldId) delete next[fieldId];
        Object.assign(next, res.validationErrors);
        return next;
      });
      if (res.popupAlert) setPopup(res.popupAlert);
      const msg = pickMessage(res);
      setFormAlert(msg);
      if (msg && (msg.type === "warning" || msg.type === "error")) showToast(msg.text, msg.type);
    },
    [showToast]
  );

  // ── field change ──────────────────────────────────────────────────────────
  const handleFieldChange = (field: FieldDefinition, value: any, meta?: { lookupRecord?: RecordDefinition | RecordDefinition[]; subform?: { changedColumnId?: string; rowIndex?: number } }) => {
    const updated = { ...formData, [field.id]: value };

    // top-level lookup auto-fill
    if (field.type === "lookup" && field.lookup?.autoFill?.length) {
      const rec = Array.isArray(meta?.lookupRecord) ? meta!.lookupRecord[0] : meta?.lookupRecord || (recordsMap[field.lookup.targetFormId] || []).find((r) => r.id === value);
      for (const af of field.lookup.autoFill) {
        const target = form.fields.find((f) => f.id === af.targetFieldId || f.linkName === af.targetFieldId);
        if (target) updated[target.id] = rec ? rec.data?.[af.sourceFieldId] ?? "" : "";
      }
      // cascading children reset
      for (const f of form.fields) if (f.type === "lookup" && f.lookup?.cascade?.parentFieldId === field.id) updated[f.id] = f.lookup.multiple ? [] : "";
    }

    let res = executeWorkflows(workflows, "onUserInput", field.id, updated, form, wfCtx);
    if (meta?.subform?.changedColumnId) {
      const res2 = executeWorkflows(workflows, "onUserInput", `${field.id}.${meta.subform.changedColumnId}`, res.updatedValues, form, wfCtx);
      res = { ...res2, fieldVisibility: { ...res.fieldVisibility, ...res2.fieldVisibility }, fieldReadonly: { ...res.fieldReadonly, ...res2.fieldReadonly }, messages: [...res.messages, ...res2.messages], popupAlert: res2.popupAlert || res.popupAlert, validationErrors: { ...res.validationErrors, ...res2.validationErrors } };
    }
    setFormData(res.updatedValues);
    applyWorkflowResult(res, field.id);
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const persist = async (data: Record<string, any>, wfResults: WorkflowResult[]) => {
    setIsSubmitting(true);
    try {
      let saved: RecordDefinition | null = null;
      if (isEditMode && record) {
        const ok = await updateRecord(form.id, record.id, data);
        saved = ok ? { ...record, data: { ...record.data, ...data } } : null;
      } else {
        saved = await createRecord(form.id, data);
      }
      if (!saved) return;
      const successRes = executeWorkflows(workflows, "onSuccess", undefined, { ...saved.data }, form, { ...wfCtx, record: saved });
      for (const r of [...wfResults, successRes]) await applyWorkflowSideEffects(r, form.id, saved.id);
      const title = form.titleFieldId ? String(saved.data?.[form.titleFieldId] ?? saved.id) : saved.id;
      noteRecent(form.id, saved.id, title);
      const msg = pickMessage(successRes);
      if (msg?.type === "info" || msg?.type === "success") showToast(msg.text, "success");
      if (saveAndNewRef.current) {
        saveAndNewRef.current = false;
        setResetKey((k) => k + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      onSuccess?.(saved);
    } catch (err) {
      console.error("Form submit error:", err);
      showToast("Failed to save record", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;
    setFormAlert(null);
    const existing = recordsMap[form.id] || [];
    const hidden: Record<string, boolean> = {};
    form.fields.forEach((f) => { if (isFieldHidden(f)) hidden[f.id] = true; });

    const validationErrors = validateFormData(form, fullValues, existing, record?.id, { hiddenFields: hidden, context: formulaCtx });
    const wfValidate = executeWorkflows(workflows, "onValidate", undefined, fullValues, form, wfCtx);
    const wfSubmit = executeWorkflows(workflows, "onSubmit", undefined, wfValidate.updatedValues, form, wfCtx);
    const combined: ValidationErrors = { ...validationErrors, ...wfValidate.validationErrors, ...wfSubmit.validationErrors };
    const finalData = stripComputed({ ...wfSubmit.updatedValues });
    setFormData(finalData);

    const fieldIssues = Object.entries(combined).map(([key, err]) => {
      const f = form.fields.find((x) => x.id === key || x.linkName === key);
      return { fieldId: f?.id || key, label: f?.label || key, error: err };
    });
    const popupAlert = wfSubmit.popupAlert || wfValidate.popupAlert;
    const hardBlock = fieldIssues.length > 0 || wfValidate.shouldBlockSubmit || wfSubmit.shouldBlockSubmit || popupAlert?.type === "error";

    if (hardBlock) {
      setErrors(combined);
      const msg = pickMessage({ ...wfSubmit, messages: [...wfValidate.messages, ...wfSubmit.messages] });
      setFormAlert(msg && msg.type !== "info" ? msg : null);
      setPopup({
        type: "error",
        blockSubmit: true,
        title: popupAlert?.title || (fieldIssues.length ? "Please fix the highlighted fields" : "Submission blocked"),
        message: popupAlert?.message || (fieldIssues.length ? `${fieldIssues.length} field${fieldIssues.length > 1 ? "s need" : " needs"} attention before this record can be saved.` : msg?.text || "A workflow rule prevented this record from being saved."),
        fields: fieldIssues,
      });
      focusField(fieldIssues[0]?.fieldId);
      return;
    }

    setErrors({});
    if (popupAlert) {
      // warning / info → acknowledge and continue; confirm → continue or cancel
      setPopup({ ...popupAlert, onContinue: () => { setPopup(null); persist(finalData, [wfValidate, wfSubmit]); }, onCancel: () => setPopup(null) });
      return;
    }
    await persist(finalData, [wfValidate, wfSubmit]);
  };

  const stripComputed = (data: Record<string, any>) => {
    const out = { ...data };
    for (const f of form.fields) if (f.type === "formula" || f.type === "rollup" || f.type === "section") delete out[f.id];
    for (const k of Object.keys(out)) if (k.endsWith("__rec")) delete out[k];
    // keep only known fields
    const known = new Set(form.fields.map((f) => f.id));
    for (const k of Object.keys(out)) if (!known.has(k)) delete out[k];
    return out;
  };

  const focusField = (fieldId?: string) => {
    if (!fieldId) return;
    setTimeout(() => {
      const el = document.getElementById(`field-container-${fieldId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    }, 120);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); handleSubmit(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, fullValues]);

  // ── layout: sections ──────────────────────────────────────────────────────
  const sections = useMemo(() => {
    const groups: Array<{ section?: FieldDefinition; fields: FieldDefinition[] }> = [];
    let current: { section?: FieldDefinition; fields: FieldDefinition[] } = { fields: [] };
    for (const f of form.fields) {
      if (f.type === "section") { if (current.fields.length || current.section) groups.push(current); current = { section: f, fields: [] }; }
      else current.fields.push(f);
    }
    groups.push(current);
    return groups.filter((g) => g.fields.length > 0 || g.section);
  }, [form.fields]);

  if (!initialized) return null;
  if (!isEditMode && !formPerm.create) return <div className="max-w-xl mx-auto p-8 bg-white rounded-xl border border-slate-200 text-center text-sm text-slate-600">You don&apos;t have permission to create {form.name} records.</div>;

  const readonlyMode = isEditMode && !formPerm.edit;

  const renderFields = (fields: FieldDefinition[], columns: 1 | 2 | 3) => (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-x-5 gap-y-4">
      {fields.map((field) => {
        if (isFieldHidden(field)) return null;
        return (
          <div key={field.id} id={`field-container-${field.id}`} className={spanFor(field, columns)}>
            <DynamicField
              field={field}
              value={formData[field.id]}
              computedValue={computed[field.id]}
              onChange={(val, meta) => handleFieldChange(field, val, meta)}
              error={errors[field.id]}
              isReadonly={isFieldReadonly(field)}
              parentValues={fullValues}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <QuickCreateContext.Provider value={{ openQuickCreate: (formId, onCreated) => setQuickCreate({ formId, onCreated }) }}>
      <div className={`${embedded ? "" : "max-w-5xl mx-auto"} space-y-4`}>
        {!hideHeader && (
          <div className={`bg-white rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-4 ${embedded ? "p-4" : "p-5"}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`${embedded ? "text-base" : "text-lg"} font-bold text-slate-900 tracking-tight`}>{isEditMode ? `Edit ${form.name}` : `New ${form.name}`}</h1>
                {readonlyMode && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Read only</span>}
                {record && <span className="text-[11px] font-mono text-slate-400">{record.id}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{form.description || "Fill in the details below and save."}</p>
            </div>
            {onCancel && <Button type="button" variant="outline" size="sm" onClick={onCancel} icon={<ArrowLeft className="w-3.5 h-3.5" />}>Back</Button>}
          </div>
        )}

        {formAlert && (
          <div className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-3xs animate-in fade-in ${formAlert.type === "error" ? "bg-rose-50 border-rose-200 text-rose-900" : formAlert.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-900" : formAlert.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-blue-50 border-blue-200 text-blue-900"}`}>
            <div className="flex items-start gap-2.5">
              {formAlert.type === "error" ? <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5" /> : formAlert.type === "warning" ? <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" /> : formAlert.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" /> : <Info className="w-4 h-4 text-blue-600 mt-0.5" />}
              <p className="font-medium leading-relaxed">{formAlert.text}</p>
            </div>
            <button type="button" onClick={() => setFormAlert(null)} className="text-slate-400 hover:text-slate-600 p-0.5 rounded shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {sections.map((group, gi) => {
            const sec = group.section;
            const isCollapsed = sec ? collapsed[sec.id] : false;
            const cols = (sec?.section?.columns || form.columns || 2) as 1 | 2 | 3;
            if (sec && isFieldHidden(sec)) return null;
            return (
              <div key={sec?.id || `g${gi}`} className="bg-white rounded-xl border border-slate-200 shadow-3xs">
                {sec && (
                  <button type="button" onClick={() => sec.section?.collapsible && setCollapsed((c) => ({ ...c, [sec.id]: !c[sec.id] }))} className={`w-full flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/70 rounded-t-xl text-left ${sec.section?.collapsible ? "hover:bg-slate-100/80 cursor-pointer" : "cursor-default"}`}>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">{sec.label}{sec.tooltip && <HelpCircle className="w-3.5 h-3.5 text-slate-400" />}</div>
                      {(sec.section?.description || sec.description) && <div className="text-[11px] text-slate-500 mt-0.5">{sec.section?.description || sec.description}</div>}
                    </div>
                    {sec.section?.collapsible && <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />}
                  </button>
                )}
                {!isCollapsed && <div className={embedded ? "p-4" : "p-5"}>{renderFields(group.fields, cols)}</div>}
              </div>
            );
          })}

          {record && !embedded && (
            <div className="text-[11px] text-slate-400 flex items-center gap-4 px-1">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {new Date(record.createdAt).toLocaleString()} {record.createdByName || record.createdBy ? `by ${record.createdByName || record.createdBy}` : ""}</span>
              {record.updatedAt !== record.createdAt && <span>Updated {new Date(record.updatedAt).toLocaleString()} {record.updatedBy ? `by ${record.updatedBy}` : ""}</span>}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-3xs">
            <span className="text-[11px] text-slate-400 hidden sm:block">Ctrl + S to save</span>
            <div className="flex items-center gap-2 ml-auto">
              {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>}
              {!readonlyMode && !isEditMode && !embedded && (
                <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => { saveAndNewRef.current = true; handleSubmit(); }}>Save & New</Button>
              )}
              {!readonlyMode && (
                <Button type="submit" variant="primary" loading={isSubmitting} icon={<Save className="w-4 h-4" />}>{isEditMode ? "Update Record" : "Save Record"}</Button>
              )}
            </div>
          </div>
        </form>

        {/* Workflow / validation popup */}
        {popup && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-4">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ring-4 ${popup.type === "error" ? "bg-rose-100 text-rose-600 ring-rose-50" : popup.type === "warning" ? "bg-amber-100 text-amber-600 ring-amber-50" : popup.type === "confirm" ? "bg-blue-100 text-blue-600 ring-blue-50" : "bg-blue-100 text-blue-600 ring-blue-50"}`}>
                  {popup.type === "error" ? <AlertCircle className="w-6 h-6" /> : popup.type === "warning" ? <AlertTriangle className="w-6 h-6" /> : popup.type === "confirm" ? <HelpCircle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${popup.type === "error" ? "bg-rose-100 text-rose-700" : popup.type === "warning" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                    {popup.type === "error" ? "Blocked" : popup.type === "warning" ? "Warning" : popup.type === "confirm" ? "Confirm" : "Notice"}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{popup.title || (popup.type === "confirm" ? "Please confirm" : "Workflow message")}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{popup.message}</p>
                </div>
              </div>
              {popup.fields && popup.fields.length > 0 && (
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-3 space-y-1.5 max-h-56 overflow-y-auto">
                  {popup.fields.map((f) => (
                    <button type="button" key={f.fieldId} onClick={() => { setPopup(null); focusField(f.fieldId); }} className="w-full text-left bg-white p-2.5 rounded-lg border border-rose-200/90 flex items-center justify-between gap-3 text-xs hover:border-rose-400">
                      <span><span className="font-semibold text-slate-900">{f.label}</span><span className="block text-[11px] text-rose-600">{f.error}</span></span>
                      <span className="text-[11px] font-semibold text-blue-600 shrink-0">Fix →</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                {popup.type === "confirm" && <Button variant="outline" onClick={() => popup.onCancel?.() || setPopup(null)}>Cancel</Button>}
                {popup.type === "error" ? (
                  <Button variant="danger" onClick={() => { const first = popup.fields?.[0]?.fieldId; setPopup(null); focusField(first); }}>Understood</Button>
                ) : popup.onContinue ? (
                  <Button variant={popup.type === "warning" ? "primary" : "primary"} onClick={popup.onContinue}>{popup.type === "confirm" ? "Continue anyway" : "OK, continue"}</Button>
                ) : (
                  <Button onClick={() => setPopup(null)}>OK</Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick-create for lookups */}
        {quickCreate && app && (() => {
          const target = app.forms.find((f) => f.id === quickCreate.formId);
          if (!target) return null;
          return (
            <Modal isOpen onClose={() => setQuickCreate(null)} title={`New ${target.name}`} description="Create a record and it will be selected automatically." maxWidth="3xl" bodyClassName="bg-slate-50">
              <DynamicForm form={target} embedded onCancel={() => setQuickCreate(null)} onSuccess={(rec) => { if (rec) quickCreate.onCreated(rec); setQuickCreate(null); }} />
            </Modal>
          );
        })()}
      </div>
    </QuickCreateContext.Provider>
  );
};

function pickMessage(res: WorkflowResult) {
  if (!res.messages.length) return null;
  const err = res.messages.find((m) => m.type === "error");
  const warn = res.messages.find((m) => m.type === "warning");
  const succ = res.messages.find((m) => m.type === "success");
  return err || warn || succ || res.messages[res.messages.length - 1];
}
