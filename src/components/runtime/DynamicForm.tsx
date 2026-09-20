"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FormDefinition, RecordDefinition, WorkflowDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicField } from "./DynamicField";
import { Button } from "@/components/ui/Button";
import { validateFormData, ValidationErrors } from "@/lib/engine/validationEngine";
import { executeWorkflows } from "@/lib/engine/workflowEngine";
import { useToast } from "@/context/ToastContext";
import { Save, ArrowLeft, AlertCircle, X } from "lucide-react";
import { getLiveAppUrl } from "@/lib/utils/routes";

interface DynamicFormProps {
  form: FormDefinition;
  record?: RecordDefinition | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({
  form,
  record,
  onSuccess,
  onCancel,
}) => {
  const router = useRouter();
  const { app, recordsMap, createRecord, updateRecord } = useLiveApp();
  const { showToast } = useToast();

  const isEditMode = Boolean(record);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [hiddenFields, setHiddenFields] = useState<Record<string, boolean>>({});
  const [readonlyFields, setReadonlyFields] = useState<Record<string, boolean>>({});
  const [formAlert, setFormAlert] = useState<{
    type: "info" | "warning" | "error";
    text: string;
  } | null>(null);
  const [popupModal, setPopupModal] = useState<{
    title?: string;
    message: string;
    fields?: Array<{ label: string; linkName?: string; fieldId: string; error: string }>;
    type?: "warning" | "error" | "info";
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workflows: WorkflowDefinition[] = useMemo(
    () => app?.workflows.filter((w) => w.formId === form.id && w.active) || [],
    [app?.workflows, form.id]
  );

  // Initialize form state
  useEffect(() => {
    const initial: Record<string, any> = {};

    for (const field of form.fields) {
      if (record && record.data && field.id in record.data) {
        initial[field.id] = record.data[field.id];
      } else {
        if (field.defaultValue !== undefined) {
          initial[field.id] = field.defaultValue;
        } else if (field.type === "checkbox") {
          initial[field.id] = false;
        } else if (field.type === "subform") {
          initial[field.id] = [];
        } else {
          initial[field.id] = "";
        }
      }
    }

    // Run onLoad workflows
    const loadResult = executeWorkflows(workflows, "onLoad", undefined, initial, form, app?.forms);
    setFormData(loadResult.updatedValues);
    setHiddenFields(loadResult.fieldVisibility);
    setReadonlyFields(loadResult.fieldReadonly);

    if (loadResult.popupAlert) {
      setPopupModal(loadResult.popupAlert);
    }

    if (loadResult.messages.length > 0) {
      const err = loadResult.messages.find((m) => m.type === "error");
      const warn = loadResult.messages.find((m) => m.type === "warning");
      setFormAlert(err || warn || loadResult.messages[0]);
    } else {
      setFormAlert(null);
    }
  }, [form, record, workflows, app?.forms]);

  // Handle field change and run onUserInput workflows
  const handleFieldChange = (fieldId: string, value: any) => {
    const updatedValues = { ...formData, [fieldId]: value };

    // Automatic subtotal & total calculation if form contains subform items, subtotal, and tax
    const subformField = form.fields.find((f) => f.type === "subform");
    const subtotalField = form.fields.find(
      (f) => f.linkName === "subtotal" || f.label.toLowerCase().includes("subtotal")
    );
    const taxField = form.fields.find(
      (f) => f.linkName.includes("tax") || f.label.toLowerCase().includes("tax")
    );
    const totalField = form.fields.find(
      (f) => f.linkName.includes("total") || f.label.toLowerCase().includes("total")
    );

    if (subformField && (fieldId === subformField.id || fieldId === taxField?.id)) {
      const rows = Array.isArray(updatedValues[subformField.id])
        ? updatedValues[subformField.id]
        : [];
      let sum = 0;
      for (const r of rows) {
        // Find amount column or rate * qty
        const amtVal = r.col_item_amount ?? r.amount;
        if (amtVal !== undefined && !isNaN(Number(amtVal))) {
          sum += Number(amtVal);
        } else {
          const q = Number(r.col_item_quantity ?? r.quantity) || 0;
          const rt = Number(r.col_item_rate ?? r.rate) || 0;
          sum += q * rt;
        }
      }

      if (subtotalField) {
        updatedValues[subtotalField.id] = sum;
      }

      if (totalField) {
        const taxRate = taxField ? Number(updatedValues[taxField.id]) || 0 : 0;
        const total = sum + (sum * taxRate) / 100;
        updatedValues[totalField.id] = Math.round(total * 100) / 100;
      }
    }

    // Run onUserInput workflows (Requirement 31-34)
    const wfResult = executeWorkflows(
      workflows,
      "onUserInput",
      fieldId,
      updatedValues,
      form,
      app?.forms
    );

    setFormData(wfResult.updatedValues);

    // Update visibility and readonly
    if (Object.keys(wfResult.fieldVisibility).length > 0) {
      setHiddenFields((prev) => ({ ...prev, ...wfResult.fieldVisibility }));
    }
    if (Object.keys(wfResult.fieldReadonly).length > 0) {
      setReadonlyFields((prev) => ({ ...prev, ...wfResult.fieldReadonly }));
    }

    // Clear previous error for this field
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }

    // If workflow generated errors or messages
    if (wfResult.validationErrors[fieldId]) {
      setErrors((prev) => ({ ...prev, [fieldId]: wfResult.validationErrors[fieldId] }));
    }

    if (wfResult.popupAlert) {
      setPopupModal(wfResult.popupAlert);
    }

    if (wfResult.messages.length > 0) {
      const err = wfResult.messages.find((m) => m.type === "error");
      const warn = wfResult.messages.find((m) => m.type === "warning");
      const displayMsg = err || warn || wfResult.messages[0];
      setFormAlert(displayMsg);
      if (displayMsg.type === "warning" || displayMsg.type === "error") {
        showToast(displayMsg.text, displayMsg.type);
      }
    } else {
      setFormAlert(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormAlert(null);
    setIsSubmitting(true);

    // 1. Validate Form Data
    const existingRecords = recordsMap[form.id] || [];
    const validationErrors = validateFormData(form, formData, existingRecords, record?.id);

    // 2. Run onValidate & onSubmit workflows
    const wfValidate = executeWorkflows(workflows, "onValidate", undefined, formData, form, app?.forms);
    const wfSubmit = executeWorkflows(workflows, "onSubmit", undefined, formData, form, app?.forms);
    const combinedErrors = {
      ...validationErrors,
      ...wfValidate.validationErrors,
      ...wfSubmit.validationErrors,
    };

    if (wfSubmit.messages.length > 0 || wfValidate.messages.length > 0) {
      const allMsgs = [...wfSubmit.messages, ...wfValidate.messages];
      const err = allMsgs.find((m) => m.type === "error");
      const warn = allMsgs.find((m) => m.type === "warning");
      setFormAlert(err || warn || allMsgs[0]);
    }

    const popup = wfSubmit.popupAlert || wfValidate.popupAlert;

    // Collect all field-level issues
    const fieldIssues: Array<{ label: string; linkName?: string; fieldId: string; error: string }> = [];

    // Check mandatory & validation errors
    for (const [key, errMsg] of Object.entries(combinedErrors)) {
      const matchedField = form.fields.find((f) => f.id === key || f.linkName === key);
      fieldIssues.push({
        fieldId: matchedField?.id || key,
        label: matchedField?.label || key,
        linkName: matchedField?.linkName,
        error: errMsg,
      });
    }

    // Also check if popup message references any form field that is empty
    if (popup) {
      for (const field of form.fields) {
        const val = formData[field.id];
        const isBlank =
          val === undefined ||
          val === null ||
          (typeof val === "string" && val.trim() === "") ||
          (Array.isArray(val) && val.length === 0);

        if (
          isBlank &&
          (popup.message.toLowerCase().includes(field.label.toLowerCase()) ||
            popup.message.toLowerCase().includes(field.linkName.toLowerCase()))
        ) {
          if (!fieldIssues.some((issue) => issue.fieldId === field.id)) {
            fieldIssues.push({
              fieldId: field.id,
              label: field.label,
              linkName: field.linkName,
              error: `${field.label} cannot be empty. Please fill in or select a valid value.`,
            });
            combinedErrors[field.id] = `${field.label} cannot be empty`;
          }
        }
      }
    }

    const shouldBlock =
      fieldIssues.length > 0 ||
      Boolean(popup) ||
      wfValidate.shouldBlockSubmit ||
      wfSubmit.shouldBlockSubmit;

    if (shouldBlock) {
      setErrors(combinedErrors);
      setIsSubmitting(false);

      const modalTitle =
        popup?.title ||
        (fieldIssues.length > 0
          ? "Form Submission Blocked: Mandatory Fields Missing"
          : "Workflow Validation Alert");

      const modalMessage =
        popup?.message ||
        (fieldIssues.length > 0
          ? `Data was not submitted. The following mandatory field${fieldIssues.length > 1 ? "s" : ""} cannot be empty. Please complete the required field${fieldIssues.length > 1 ? "s" : ""} to proceed.`
          : "Form submission has been blocked by workflow rules. Please review and correct your input.");

      setPopupModal({
        title: modalTitle,
        message: modalMessage,
        fields: fieldIssues,
        type: "error",
      });

      // Highlight & smoothly scroll to the first invalid field
      if (fieldIssues.length > 0) {
        const firstFieldId = fieldIssues[0].fieldId;
        setTimeout(() => {
          const el = document.getElementById(`field-container-${firstFieldId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            const inputEl = el.querySelector<HTMLElement>("input, select, textarea, button");
            if (inputEl) inputEl.focus();
          }
        }, 150);
      }

      // CRITICAL: Stop here. Data MUST NOT be submitted.
      return;
    }

    // 3. Save / Update Record
    try {
      if (isEditMode && record) {
        await updateRecord(form.id, record.id, formData);
      } else {
        await createRecord(form.id, formData);
      }

      // 4. Run onSuccess workflows
      executeWorkflows(workflows, "onSuccess", undefined, formData, form);

      if (onSuccess) {
        onSuccess();
      } else if (app) {
        // Find default report to redirect
        const defaultRep = app.reports.find((r) => r.sourceFormId === form.id);
        if (defaultRep) {
          router.push(getLiveAppUrl(app.linkName, { report: defaultRep.linkName }));
        } else {
          router.push(getLiveAppUrl(app.linkName));
        }
      }
    } catch (err) {
      console.error("Form submit error:", err);
      showToast("Failed to save record", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">
              {isEditMode ? `Edit ${form.name}` : `New ${form.name}`}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {form.description || "Enter all required details and save your record."}
          </p>
        </div>

        {onCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Back
          </Button>
        )}
      </div>

      {/* Alert banner if workflow message */}
      {formAlert && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-3xs animate-in fade-in ${
            formAlert.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : formAlert.type === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                formAlert.type === "error"
                  ? "text-rose-600"
                  : formAlert.type === "warning"
                  ? "text-amber-600"
                  : "text-blue-600"
              }`}
            />
            <div className="space-y-0.5">
              <span className="font-bold block uppercase tracking-wider text-[10px]">
                {formAlert.type === "error"
                  ? "Workflow Error"
                  : formAlert.type === "warning"
                  ? "Workflow Warning"
                  : "Workflow Notice"}
              </span>
              <p className="font-medium leading-relaxed">{formAlert.text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFormAlert(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors shrink-0"
            title="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-6"
      >
        <div
          className={`grid gap-4 ${
            form.columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {form.fields.map((field) => {
            const isFullWidth = field.type === "subform" || form.columns === 1;

            return (
              <div
                key={field.id}
                id={`field-container-${field.id}`}
                className={isFullWidth && form.columns === 2 ? "md:col-span-2" : ""}
              >
                <DynamicField
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => handleFieldChange(field.id, val)}
                  error={errors[field.id]}
                  isHidden={hiddenFields[field.id]}
                  isReadonly={readonlyFields[field.id]}
                  workflows={workflows}
                />
              </div>
            );
          })}
        </div>

        {/* Submit Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            icon={<Save className="w-4 h-4" />}
          >
            {isSubmitting ? "Saving..." : isEditMode ? "Update Record" : "Save Record"}
          </Button>
        </div>
      </form>

      {/* Workflow Popup Dialog */}
      {popupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-xs ring-4 ring-rose-50">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">
                    Validation Blocked
                  </span>
                  <span className="text-[11px] text-rose-600 font-semibold">
                    Data Not Submitted
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {popupModal.title || "Form Validation Alert"}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {popupModal.message}
                </p>
              </div>
            </div>

            {/* Field-Level Issues List */}
            {popupModal.fields && popupModal.fields.length > 0 && (
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-4 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
                  <span>Empty / Invalid Fields ({popupModal.fields.length})</span>
                  <span className="text-[10px] font-medium text-rose-600">Action Required</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {popupModal.fields.map((f, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-lg border border-rose-200/90 shadow-3xs flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span className="font-bold text-slate-900 truncate">
                            {f.label}
                          </span>
                          {f.linkName && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({f.linkName})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-rose-600 font-medium mt-1 pl-3.5">
                          {f.error || "This field cannot be empty. Please enter or select a valid value."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = f.fieldId;
                          setPopupModal(null);
                          setTimeout(() => {
                            const el = document.getElementById(`field-container-${targetId}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              const inputEl = el.querySelector<HTMLElement>("input, select, textarea, button");
                              if (inputEl) inputEl.focus();
                            }
                          }, 100);
                        }}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline shrink-0 pt-0.5"
                      >
                        Fix Now &rarr;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200/70 flex items-center gap-2.5 text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Submission was aborted. No changes have been written to the database.</span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <Button
                variant="primary"
                onClick={() => {
                  const targetId = popupModal.fields?.[0]?.fieldId;
                  setPopupModal(null);
                  if (targetId) {
                    setTimeout(() => {
                      const el = document.getElementById(`field-container-${targetId}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        const inputEl = el.querySelector<HTMLElement>("input, select, textarea, button");
                        if (inputEl) inputEl.focus();
                      }
                    }, 100);
                  }
                }}
              >
                Understood, Fix Fields
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
