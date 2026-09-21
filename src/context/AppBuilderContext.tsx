"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  AppDefinition,
  FormDefinition,
  FieldDefinition,
  ReportDefinition,
  WorkflowDefinition,
  PageDefinition,
  RelationshipDefinition,
  FieldType,
  AppRole,
  AppMember,
  AppVersion,
  RecordDefinition,
  AuditLogEntry,
  CURRENT_APP_SCHEMA_VERSION,
} from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { generateId } from "@/lib/utils/idGenerator";
import { generateUniqueLinkName } from "@/lib/utils/linkName";
import { useToast } from "./ToastContext";
import { useAuth } from "./AuthContext";
import { createDefaultRole } from "@/lib/auth/permissions";
import { runHealthCheck, HealthIssue } from "@/lib/engine/healthCheck";

interface AppBuilderContextValue {
  currentApp: AppDefinition | null;
  loading: boolean;
  isDirty: boolean;
  saving: boolean;
  lastSavedText: string;
  loadApp: (idOrLinkName: string) => Promise<boolean>;
  saveCurrentApp: () => Promise<void>;
  updateCurrentApp: (updater: (prev: AppDefinition) => AppDefinition, opts?: { skipHistory?: boolean }) => void;

  // history
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Form actions
  createForm: (name: string, description?: string, columns?: 1 | 2 | 3, linkName?: string) => FormDefinition;
  updateForm: (formId: string, updates: Partial<FormDefinition>) => void;
  deleteForm: (formId: string) => { success: boolean; warnings?: string[] };
  duplicateForm: (formId: string) => FormDefinition | null;

  // Field actions
  addFieldToForm: (formId: string, fieldData: Partial<FieldDefinition>, atIndex?: number) => FieldDefinition;
  updateFieldInForm: (formId: string, fieldId: string, updates: Partial<FieldDefinition>) => void;
  deleteFieldFromForm: (formId: string, fieldId: string) => void;
  duplicateFieldInForm: (formId: string, fieldId: string) => FieldDefinition | null;
  reorderFieldsInForm: (formId: string, fromIndex: number, toIndex: number) => void;

  // Report actions
  createReport: (name: string, sourceFormId: string, extra?: Partial<ReportDefinition>) => ReportDefinition;
  updateReport: (reportId: string, updates: Partial<ReportDefinition>) => void;
  deleteReport: (reportId: string) => void;
  duplicateReport: (reportId: string) => ReportDefinition | null;

  // Workflow actions
  createWorkflow: (data: Partial<WorkflowDefinition>) => WorkflowDefinition;
  updateWorkflow: (workflowId: string, updates: Partial<WorkflowDefinition>) => void;
  deleteWorkflow: (workflowId: string) => void;
  duplicateWorkflow: (workflowId: string) => WorkflowDefinition | null;

  // Page actions
  createPage: (name: string, description?: string) => PageDefinition;
  updatePage: (pageId: string, updates: Partial<PageDefinition>) => void;
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => PageDefinition | null;

  // Roles & members
  createRole: (name: string, preset?: "full" | "view" | "none") => AppRole;
  updateRole: (roleId: string, updates: Partial<AppRole>) => void;
  deleteRole: (roleId: string) => void;
  duplicateRole: (roleId: string) => AppRole | null;
  addMember: (email: string, roleId: string, name?: string) => { ok: boolean; error?: string };
  updateMember: (email: string, updates: Partial<AppMember>) => void;
  removeMember: (email: string) => void;

  // Publish / versions
  publish: (label?: string) => Promise<AppVersion | null>;
  listVersions: () => Promise<AppVersion[]>;
  rollbackTo: (version: AppVersion) => Promise<void>;

  // Governance
  healthIssues: HealthIssue[];
  refreshHealth: () => void;
  listAudit: () => Promise<AuditLogEntry[]>;
  exportAppJson: () => string;
  importAppJson: (json: string, mode: "replace" | "merge") => { ok: boolean; error?: string };
  saveAsTemplate: (category?: string) => Promise<void>;

  // Data helpers for previews
  loadRecords: (formId: string) => Promise<RecordDefinition[]>;
  getFormRelationships: (formId: string) => { incoming: RelationshipDefinition[]; outgoing: RelationshipDefinition[] };
}

const AppBuilderContext = createContext<AppBuilderContextValue | null>(null);

export const useAppBuilder = () => {
  const ctx = useContext(AppBuilderContext);
  if (!ctx) throw new Error("useAppBuilder must be used within an AppBuilderProvider");
  return ctx;
};

const now = () => new Date().toISOString();
const SAVE_DEBOUNCE_MS = 700;
const MAX_HISTORY = 60;

// Recalculate relationships across forms
export const extractRelationships = (forms: FormDefinition[]): RelationshipDefinition[] => {
  const rels: RelationshipDefinition[] = [];
  for (const form of forms) {
    for (const field of form.fields) {
      if (field.type === "lookup" && field.lookup?.targetFormId) {
        rels.push({ id: `rel_${form.id}_${field.id}`, sourceFormId: form.id, sourceFieldId: field.id, targetFormId: field.lookup.targetFormId, targetFieldId: field.lookup.displayFieldId || "id", type: "lookup" });
      } else if (field.type === "subform" && field.subform) {
        for (const col of field.subform.columns || []) {
          if (col.type === "lookup" && col.lookup?.targetFormId) {
            rels.push({ id: `rel_${form.id}_${field.id}_${col.id}`, sourceFormId: form.id, sourceFieldId: `${field.id}.${col.id}`, targetFormId: col.lookup.targetFormId, targetFieldId: col.lookup.displayFieldId || "id", type: "subform" });
          }
        }
      } else if (field.type === "rollup" && field.rollup?.sourceFormId) {
        rels.push({ id: `rel_${form.id}_${field.id}`, sourceFormId: field.rollup.sourceFormId, sourceFieldId: field.rollup.matchFieldId, targetFormId: form.id, targetFieldId: field.id, type: "rollup" });
      }
    }
  }
  return rels;
};

export const AppBuilderProvider: React.FC<{ initialAppIdOrLink?: string; children: React.ReactNode }> = ({ initialAppIdOrLink, children }) => {
  const [currentApp, setCurrentApp] = useState<AppDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState("Saved");
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);
  const { showToast } = useToast();
  const { user, isOwner } = useAuth();

  const appRef = useRef<AppDefinition | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef(false);
  const undoStack = useRef<AppDefinition[]>([]);
  const redoStack = useRef<AppDefinition[]>([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const syncHistory = () => setHistory({ canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 });

  useEffect(() => { appRef.current = currentApp; }, [currentApp]);

  // ── persistence ─────────────────────────────────────────────────────────

  const flushSave = useCallback(async () => {
    const app = appRef.current;
    if (!app || !pendingSave.current) return;
    pendingSave.current = false;
    setSaving(true);
    try {
      await storageService.saveApp(app);
      setIsDirty(false);
      setLastSavedText(`Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch (err) {
      console.error("Auto-save error:", err);
      showToast("Failed to save changes to Firestore", "error");
      pendingSave.current = true;
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const scheduleSave = useCallback(() => {
    pendingSave.current = true;
    setIsDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => {
    const onUnload = () => { if (pendingSave.current && appRef.current) storageService.saveApp(appRef.current); };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current && appRef.current) storageService.saveApp(appRef.current);
    };
  }, []);

  const loadApp = useCallback(
    async (idOrLinkName: string): Promise<boolean> => {
      setLoading(true);
      try {
        const app = await storageService.getApp(idOrLinkName, { email: user?.email, isOwner });
        if (app) {
          setCurrentApp(app);
          undoStack.current = [];
          redoStack.current = [];
          setIsDirty(false);
          setLastSavedText("Saved");
          setHealthIssues(runHealthCheck(app));
          return true;
        }
        setCurrentApp(null);
        return false;
      } catch (err) {
        console.error("Failed to load app:", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.email, isOwner]
  );

  useEffect(() => {
    if (initialAppIdOrLink && user) loadApp(initialAppIdOrLink);
    else setLoading(false);
  }, [initialAppIdOrLink, loadApp, user]);

  // Remote sync: another tab / device edited the app
  useEffect(() => {
    if (!currentApp?.id) return;
    const unsub = storageService.subscribeApp(currentApp.id, (remote) => {
      if (!remote) return;
      const local = appRef.current;
      if (!local || pendingSave.current) return;
      if (remote.updatedAt > local.updatedAt) setCurrentApp(remote);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApp?.id]);

  const updateCurrentApp = useCallback(
    (updater: (prev: AppDefinition) => AppDefinition, opts?: { skipHistory?: boolean }) => {
      setCurrentApp((prev) => {
        if (!prev) return null;
        const next = updater(prev);
        if (next === prev) return prev;
        if (!opts?.skipHistory) {
          undoStack.current.push(prev);
          if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
          redoStack.current = [];
          syncHistory();
        }
        const withRels: AppDefinition = { ...next, relationships: extractRelationships(next.forms), updatedAt: now(), schemaVersion: CURRENT_APP_SCHEMA_VERSION };
        appRef.current = withRels;
        scheduleSave();
        return withRels;
      });
    },
    [scheduleSave]
  );

  const saveCurrentApp = useCallback(async () => {
    if (!appRef.current) return;
    pendingSave.current = true;
    await flushSave();
    showToast("Application saved", "success");
  }, [flushSave, showToast]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev || !appRef.current) return;
    redoStack.current.push(appRef.current);
    setCurrentApp(prev);
    appRef.current = prev;
    scheduleSave();
    syncHistory();
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next || !appRef.current) return;
    undoStack.current.push(appRef.current);
    setCurrentApp(next);
    appRef.current = next;
    scheduleSave();
    syncHistory();
  }, [scheduleSave]);

  const audit = useCallback(
    (action: string, entityType: string, entityId: string, entityName: string) => {
      const app = appRef.current;
      if (!app || !user) return;
      storageService.addAudit({ appId: app.id, type: "schema", action, entityType, entityId, entityName, user: user.email, userName: user.name });
    },
    [user]
  );

  // ── Forms ───────────────────────────────────────────────────────────────

  const createForm = useCallback(
    (name: string, description?: string, columns: 1 | 2 | 3 = 2, linkNameOverride?: string): FormDefinition => {
      const app = appRef.current;
      if (!app) throw new Error("No active application");
      const linkName = generateUniqueLinkName(linkNameOverride || name, app.forms.map((f) => f.linkName));
      const formId = generateId("form");
      const newForm: FormDefinition = { id: formId, name, linkName, description, columns, fields: [], createdAt: now(), updatedAt: now() };
      const reportName = `${name} Report`;
      const defaultReport: ReportDefinition = {
        id: generateId("rep"),
        name: reportName,
        linkName: generateUniqueLinkName(reportName, app.reports.map((r) => r.linkName)),
        sourceFormId: formId,
        reportType: "table",
        columns: [],
        pageSize: 15,
        allowInlineEdit: false,
        allowBulkActions: true,
        allowExport: true,
        allowImport: true,
        allowPrint: true,
        showInMenu: true,
        createdAt: now(),
        updatedAt: now(),
      };
      updateCurrentApp((prev) => ({
        ...prev,
        forms: [...prev.forms, newForm],
        reports: [...prev.reports, defaultReport],
        roles: prev.roles.map((r) => ({ ...r, forms: { ...r.forms, [formId]: r.forms[formId] || r.defaultForm || { view: false, create: false, edit: false, delete: false, print: false, export: false, import: false, recordScope: "all" } } })),
      }));
      audit("created", "form", formId, name);
      showToast(`Form "${name}" created with default report`, "success");
      return newForm;
    },
    [updateCurrentApp, showToast, audit]
  );

  const updateForm = useCallback(
    (formId: string, updates: Partial<FormDefinition>) => {
      updateCurrentApp((prev) => ({ ...prev, forms: prev.forms.map((f) => (f.id === formId ? { ...f, ...updates, updatedAt: now() } : f)) }));
    },
    [updateCurrentApp]
  );

  const deleteForm = useCallback(
    (formId: string) => {
      const app = appRef.current;
      if (!app) return { success: false };
      const target = app.forms.find((f) => f.id === formId);
      const incoming = app.relationships.filter((r) => r.targetFormId === formId);
      const warnings: string[] = [];
      if (incoming.length > 0) {
        const names = incoming.map((r) => app.forms.find((f) => f.id === r.sourceFormId)?.name || r.sourceFormId).join(", ");
        warnings.push(`This form is referenced as a lookup in: ${names}. Those lookups will break.`);
      }
      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.filter((f) => f.id !== formId),
        reports: prev.reports.filter((r) => r.sourceFormId !== formId),
        workflows: prev.workflows.filter((w) => w.formId !== formId),
      }));
      audit("deleted", "form", formId, target?.name || formId);
      showToast("Form deleted", "info");
      return { success: true, warnings: warnings.length ? warnings : undefined };
    },
    [updateCurrentApp, showToast, audit]
  );

  const duplicateForm = useCallback(
    (formId: string): FormDefinition | null => {
      const app = appRef.current;
      if (!app) return null;
      const original = app.forms.find((f) => f.id === formId);
      if (!original) return null;
      const dupName = `${original.name} Copy`;
      const newFormId = generateId("form");
      const idMap: Record<string, string> = {};
      const clonedFields = original.fields.map((f) => {
        const nid = generateId("field");
        idMap[f.id] = nid;
        return { ...f, id: nid, subform: f.subform ? { ...f.subform, columns: f.subform.columns.map((c) => ({ ...c, id: generateId("col") })) } : undefined };
      });
      const newForm: FormDefinition = { ...original, id: newFormId, name: dupName, linkName: generateUniqueLinkName(dupName, app.forms.map((f) => f.linkName)), fields: clonedFields, createdAt: now(), updatedAt: now() };
      const defaultReport: ReportDefinition = {
        id: generateId("rep"),
        name: `${dupName} Report`,
        linkName: generateUniqueLinkName(`${dupName} Report`, app.reports.map((r) => r.linkName)),
        sourceFormId: newFormId,
        reportType: "table",
        columns: clonedFields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: true, order: i })),
        pageSize: 15,
        createdAt: now(),
        updatedAt: now(),
      };
      updateCurrentApp((prev) => ({ ...prev, forms: [...prev.forms, newForm], reports: [...prev.reports, defaultReport] }));
      showToast(`Form duplicated as "${dupName}"`, "success");
      return newForm;
    },
    [updateCurrentApp, showToast]
  );

  // ── Fields ──────────────────────────────────────────────────────────────

  const addFieldToForm = useCallback(
    (formId: string, fieldData: Partial<FieldDefinition>, atIndex?: number): FieldDefinition => {
      const app = appRef.current;
      if (!app) throw new Error("No active application");
      const targetForm = app.forms.find((f) => f.id === formId);
      if (!targetForm) throw new Error("Form not found");
      const label = fieldData.label || "New Field";
      const existingLinkNames = targetForm.fields.map((f) => f.linkName);
      const linkName = generateUniqueLinkName(fieldData.linkName || label, existingLinkNames);
      const type: FieldType = fieldData.type || "text";
      const isChoice = ["dropdown", "radio", "multiselect"].includes(type);
      const isNumeric = ["number", "currency", "percentage", "decimal"].includes(type);
      const otherForm = app.forms.find((f) => f.id !== formId);

      const newField: FieldDefinition = {
        id: fieldData.id || generateId("field"),
        label,
        linkName,
        type,
        required: fieldData.required || false,
        placeholder: fieldData.placeholder,
        description: fieldData.description,
        defaultValue: fieldData.defaultValue,
        width: fieldData.width || (type === "subform" || type === "section" || type === "richtext" ? "full" : undefined),
        options: fieldData.options || (isChoice ? ["Option 1", "Option 2", "Option 3"] : undefined),
        currencySymbol: fieldData.currencySymbol || (type === "currency" ? app.settings?.currencySymbol || "₹" : undefined),
        decimalPlaces: fieldData.decimalPlaces ?? (isNumeric ? 2 : undefined),
        ratingMax: type === "rating" ? 5 : undefined,
        lookup: fieldData.lookup || (type === "lookup" && otherForm ? { targetFormId: otherForm.id, displayFieldId: otherForm.fields.find((f) => f.type !== "section")?.id || "", valueFieldId: "id", relationshipType: "lookup", displayStyle: "dropdown" } : undefined),
        subform:
          fieldData.subform ||
          (type === "subform"
            ? {
                sourceType: "inline",
                showTotals: true,
                allowBulkAdd: true,
                allowDuplicateRow: true,
                columns: [
                  { id: generateId("col"), label: "Item", linkName: "item", type: "text", required: true, width: 220 },
                  { id: generateId("col"), label: "Quantity", linkName: "quantity", type: "number", required: true, defaultValue: 1, width: 110 },
                  { id: generateId("col"), label: "Rate", linkName: "rate", type: "currency", currencySymbol: "₹", required: true, defaultValue: 0, width: 130 },
                  { id: generateId("col"), label: "Amount", linkName: "amount", type: "currency", currencySymbol: "₹", readonly: true, width: 140, formula: { expression: "quantity * rate", resultType: "number", decimalPlaces: 2 } },
                ],
                totalColumnIds: [],
              }
            : undefined),
        autonumber: fieldData.autonumber || (type === "autonumber" ? { prefix: (targetForm.linkName.slice(0, 3) || "REC").toUpperCase() + "-", startNumber: 1, digits: 5, resetEvery: "never" } : undefined),
        formula: fieldData.formula || (type === "formula" ? { expression: "", resultType: "number", decimalPlaces: 2 } : undefined),
        rollup: fieldData.rollup || (type === "rollup" ? { sourceFormId: "", matchFieldId: "", aggregate: "sum", decimalPlaces: 2 } : undefined),
        validation: fieldData.validation,
        section: fieldData.section || (type === "section" ? { collapsible: true, collapsedByDefault: false, columns: 2 } : undefined),
        readonly: fieldData.readonly ?? (type === "formula" || type === "rollup" || type === "autonumber" ? true : undefined),
      };
      if (newField.subform) newField.subform.totalColumnIds = newField.subform.columns.filter((c) => c.linkName === "amount").map((c) => c.id);

      updateCurrentApp((prev) => {
        const updatedReports = prev.reports.map((rep) => {
          if (rep.sourceFormId !== formId || type === "section") return rep;
          const maxOrder = rep.columns.reduce((m, c) => Math.max(m, c.order), -1);
          return { ...rep, columns: [...rep.columns, { fieldId: newField.id, label: newField.label, visible: true, order: maxOrder + 1 }] };
        });
        return {
          ...prev,
          forms: prev.forms.map((f) => {
            if (f.id !== formId) return f;
            const fields = [...f.fields];
            if (atIndex !== undefined && atIndex >= 0 && atIndex <= fields.length) fields.splice(atIndex, 0, newField);
            else fields.push(newField);
            return { ...f, fields, updatedAt: now() };
          }),
          reports: updatedReports,
        };
      });
      return newField;
    },
    [updateCurrentApp]
  );

  const updateFieldInForm = useCallback(
    (formId: string, fieldId: string, updates: Partial<FieldDefinition>) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm) return prev;
        const updatedFields = targetForm.fields.map((field) => (field.id === fieldId ? { ...field, ...updates } : field));
        const updatedReports = updates.label
          ? prev.reports.map((rep) => (rep.sourceFormId === formId ? { ...rep, columns: rep.columns.map((c) => (c.fieldId === fieldId ? { ...c, label: updates.label! } : c)) } : rep))
          : prev.reports;
        return { ...prev, forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields: updatedFields, updatedAt: now() } : f)), reports: updatedReports };
      });
    },
    [updateCurrentApp]
  );

  const deleteFieldFromForm = useCallback(
    (formId: string, fieldId: string) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm) return prev;
        return {
          ...prev,
          forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields: f.fields.filter((x) => x.id !== fieldId), updatedAt: now() } : f)),
          reports: prev.reports.map((rep) => (rep.sourceFormId === formId ? { ...rep, columns: rep.columns.filter((c) => c.fieldId !== fieldId) } : rep)),
        };
      });
      showToast("Field removed", "info");
    },
    [updateCurrentApp, showToast]
  );

  const duplicateFieldInForm = useCallback(
    (formId: string, fieldId: string): FieldDefinition | null => {
      const app = appRef.current;
      const targetForm = app?.forms.find((f) => f.id === formId);
      const original = targetForm?.fields.find((f) => f.id === fieldId);
      if (!targetForm || !original) return null;
      const copyLabel = `${original.label} Copy`;
      const duplicated: FieldDefinition = {
        ...original,
        id: generateId("field"),
        label: copyLabel,
        linkName: generateUniqueLinkName(copyLabel, targetForm.fields.map((f) => f.linkName)),
        subform: original.subform ? { ...original.subform, columns: original.subform.columns.map((c) => ({ ...c, id: generateId("col") })) } : undefined,
      };
      const index = targetForm.fields.findIndex((f) => f.id === fieldId);
      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.map((f) => {
          if (f.id !== formId) return f;
          const fields = [...f.fields];
          fields.splice(index + 1, 0, duplicated);
          return { ...f, fields };
        }),
        reports: prev.reports.map((rep) => (rep.sourceFormId === formId ? { ...rep, columns: [...rep.columns, { fieldId: duplicated.id, label: duplicated.label, visible: true, order: rep.columns.length }] } : rep)),
      }));
      showToast(`Field duplicated as "${copyLabel}"`, "success");
      return duplicated;
    },
    [updateCurrentApp, showToast]
  );

  const reorderFieldsInForm = useCallback(
    (formId: string, fromIndex: number, toIndex: number) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm || fromIndex === toIndex) return prev;
        const fields = [...targetForm.fields];
        const [moved] = fields.splice(fromIndex, 1);
        fields.splice(toIndex, 0, moved);
        return { ...prev, forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields } : f)) };
      });
    },
    [updateCurrentApp]
  );

  // ── Reports ─────────────────────────────────────────────────────────────

  const createReport = useCallback(
    (name: string, sourceFormId: string, extra: Partial<ReportDefinition> = {}): ReportDefinition => {
      const app = appRef.current;
      if (!app) throw new Error("No active application");
      const targetForm = app.forms.find((f) => f.id === sourceFormId);
      if (!targetForm) throw new Error("Source form not found");
      const newReport: ReportDefinition = {
        id: generateId("rep"),
        name,
        linkName: generateUniqueLinkName(name, app.reports.map((r) => r.linkName)),
        sourceFormId,
        reportType: "table",
        columns: targetForm.fields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: true, order: i })),
        pageSize: 15,
        allowBulkActions: true,
        allowExport: true,
        allowPrint: true,
        showInMenu: true,
        createdAt: now(),
        updatedAt: now(),
        ...extra,
      };
      updateCurrentApp((prev) => ({
        ...prev,
        reports: [...prev.reports, newReport],
        roles: prev.roles.map((r) => ({ ...r, reports: { ...r.reports, [newReport.id]: r.reports[newReport.id] || { view: true, print: true, export: false } } })),
      }));
      audit("created", "report", newReport.id, name);
      showToast(`Report "${name}" created`, "success");
      return newReport;
    },
    [updateCurrentApp, showToast, audit]
  );

  const updateReport = useCallback(
    (reportId: string, updates: Partial<ReportDefinition>) => {
      updateCurrentApp((prev) => ({ ...prev, reports: prev.reports.map((r) => (r.id === reportId ? { ...r, ...updates, updatedAt: now() } : r)) }));
    },
    [updateCurrentApp]
  );

  const deleteReport = useCallback(
    (reportId: string) => {
      const name = appRef.current?.reports.find((r) => r.id === reportId)?.name;
      updateCurrentApp((prev) => ({ ...prev, reports: prev.reports.filter((r) => r.id !== reportId) }));
      audit("deleted", "report", reportId, name || reportId);
      showToast("Report deleted", "info");
    },
    [updateCurrentApp, showToast, audit]
  );

  const duplicateReport = useCallback(
    (reportId: string) => {
      const app = appRef.current;
      const orig = app?.reports.find((r) => r.id === reportId);
      if (!app || !orig) return null;
      const name = `${orig.name} Copy`;
      const copy: ReportDefinition = { ...orig, id: generateId("rep"), name, linkName: generateUniqueLinkName(name, app.reports.map((r) => r.linkName)), createdAt: now(), updatedAt: now() };
      updateCurrentApp((prev) => ({ ...prev, reports: [...prev.reports, copy] }));
      showToast(`Report duplicated as "${name}"`, "success");
      return copy;
    },
    [updateCurrentApp, showToast]
  );

  // ── Workflows ───────────────────────────────────────────────────────────

  const createWorkflow = useCallback(
    (data: Partial<WorkflowDefinition>): WorkflowDefinition => {
      const newWf: WorkflowDefinition = {
        id: data.id || generateId("wf"),
        name: data.name || "New Workflow",
        description: data.description || "",
        formId: data.formId || appRef.current?.forms[0]?.id || "",
        mode: data.mode || "visual",
        codeScript: data.codeScript,
        trigger: data.trigger || { type: "onUserInput" },
        actions: data.actions || [],
        active: data.active !== undefined ? data.active : true,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      };
      updateCurrentApp((prev) => ({ ...prev, workflows: [...prev.workflows, newWf] }));
      audit("created", "workflow", newWf.id, newWf.name);
      showToast("Workflow created", "success");
      return newWf;
    },
    [updateCurrentApp, showToast, audit]
  );

  const updateWorkflow = useCallback(
    (workflowId: string, updates: Partial<WorkflowDefinition>) => {
      updateCurrentApp((prev) => ({ ...prev, workflows: prev.workflows.map((w) => (w.id === workflowId ? { ...w, ...updates, version: (w.version || 1) + (updates.actions || updates.codeScript !== undefined ? 1 : 0), updatedAt: now() } : w)) }));
    },
    [updateCurrentApp]
  );

  const deleteWorkflow = useCallback(
    (workflowId: string) => {
      const name = appRef.current?.workflows.find((w) => w.id === workflowId)?.name;
      updateCurrentApp((prev) => ({ ...prev, workflows: prev.workflows.filter((w) => w.id !== workflowId) }));
      audit("deleted", "workflow", workflowId, name || workflowId);
      showToast("Workflow deleted", "info");
    },
    [updateCurrentApp, showToast, audit]
  );

  const duplicateWorkflow = useCallback(
    (workflowId: string) => {
      const orig = appRef.current?.workflows.find((w) => w.id === workflowId);
      if (!orig) return null;
      const copy: WorkflowDefinition = { ...orig, id: generateId("wf"), name: `${orig.name} Copy`, actions: orig.actions.map((a) => ({ ...a, id: generateId("act") })), createdAt: now(), updatedAt: now() };
      updateCurrentApp((prev) => ({ ...prev, workflows: [...prev.workflows, copy] }));
      return copy;
    },
    [updateCurrentApp]
  );

  // ── Pages ───────────────────────────────────────────────────────────────

  const createPage = useCallback(
    (name: string, description?: string): PageDefinition => {
      const app = appRef.current;
      if (!app) throw new Error("No active application");
      const newPage: PageDefinition = {
        id: generateId("page"),
        name,
        linkName: generateUniqueLinkName(name, app.pages.map((p) => p.linkName)),
        description,
        isHome: app.pages.length === 0,
        components: [{ id: generateId("comp"), type: "heading", width: 12, props: { title: name, subtitle: description || "" } }],
        createdAt: now(),
        updatedAt: now(),
      };
      updateCurrentApp((prev) => ({
        ...prev,
        pages: [...prev.pages, newPage],
        roles: prev.roles.map((r) => ({ ...r, pages: { ...r.pages, [newPage.id]: r.pages[newPage.id] || { view: true } } })),
      }));
      audit("created", "page", newPage.id, name);
      showToast(`Page "${name}" created`, "success");
      return newPage;
    },
    [updateCurrentApp, showToast, audit]
  );

  const updatePage = useCallback(
    (pageId: string, updates: Partial<PageDefinition>) => {
      updateCurrentApp((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id === pageId) return { ...p, ...updates, updatedAt: now() };
          return updates.isHome ? { ...p, isHome: false } : p;
        }),
      }));
    },
    [updateCurrentApp]
  );

  const deletePage = useCallback(
    (pageId: string) => {
      updateCurrentApp((prev) => ({ ...prev, pages: prev.pages.filter((p) => p.id !== pageId) }));
      showToast("Page deleted", "info");
    },
    [updateCurrentApp, showToast]
  );

  const duplicatePage = useCallback(
    (pageId: string) => {
      const app = appRef.current;
      const orig = app?.pages.find((p) => p.id === pageId);
      if (!app || !orig) return null;
      const name = `${orig.name} Copy`;
      const cloneComps = (cs: any[]): any[] => cs.map((c) => ({ ...c, id: generateId("comp"), children: c.children ? cloneComps(c.children) : undefined }));
      const copy: PageDefinition = { ...orig, id: generateId("page"), name, linkName: generateUniqueLinkName(name, app.pages.map((p) => p.linkName)), isHome: false, components: cloneComps(orig.components), createdAt: now(), updatedAt: now() };
      updateCurrentApp((prev) => ({ ...prev, pages: [...prev.pages, copy] }));
      return copy;
    },
    [updateCurrentApp]
  );

  // ── Roles & members ─────────────────────────────────────────────────────

  const createRole = useCallback(
    (name: string, preset: "full" | "view" | "none" = "view") => {
      const app = appRef.current!;
      const role = createDefaultRole(name, app, preset);
      updateCurrentApp((prev) => ({ ...prev, roles: [...prev.roles, role] }));
      audit("created", "role", role.id, name);
      showToast(`Role "${name}" created`, "success");
      return role;
    },
    [updateCurrentApp, showToast, audit]
  );

  const updateRole = useCallback(
    (roleId: string, updates: Partial<AppRole>) => {
      updateCurrentApp((prev) => ({ ...prev, roles: prev.roles.map((r) => (r.id === roleId ? { ...r, ...updates } : r)) }));
    },
    [updateCurrentApp]
  );

  const deleteRole = useCallback(
    (roleId: string) => {
      const inUse = appRef.current?.members.filter((m) => m.roleId === roleId).length || 0;
      if (inUse > 0) { showToast(`Cannot delete: ${inUse} member(s) still use this role`, "error"); return; }
      updateCurrentApp((prev) => ({ ...prev, roles: prev.roles.filter((r) => r.id !== roleId) }));
      audit("deleted", "role", roleId, roleId);
      showToast("Role deleted", "info");
    },
    [updateCurrentApp, showToast, audit]
  );

  const duplicateRole = useCallback(
    (roleId: string) => {
      const orig = appRef.current?.roles.find((r) => r.id === roleId);
      if (!orig) return null;
      const copy: AppRole = { ...JSON.parse(JSON.stringify(orig)), id: generateId("role"), name: `${orig.name} Copy`, createdAt: now() };
      updateCurrentApp((prev) => ({ ...prev, roles: [...prev.roles, copy] }));
      return copy;
    },
    [updateCurrentApp]
  );

  const addMember = useCallback(
    (email: string, roleId: string, name?: string) => {
      const app = appRef.current;
      if (!app) return { ok: false, error: "No app" };
      const lower = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return { ok: false, error: "Enter a valid email address" };
      if (app.members.some((m) => m.email === lower)) return { ok: false, error: "This email is already a member" };
      if (!app.roles.some((r) => r.id === roleId)) return { ok: false, error: "Select a designation / role" };
      const member: AppMember = { email: lower, name: name?.trim() || undefined, roleId, status: "active", addedAt: now(), addedBy: user?.email };
      updateCurrentApp((prev) => ({ ...prev, members: [...prev.members, member], memberEmails: Array.from(new Set([...prev.memberEmails, lower])) }));
      storageService.addAudit({ appId: app.id, type: "member", action: "added", entityType: "member", entityId: lower, entityName: lower, user: user?.email || "", userName: user?.name });
      showToast(`${lower} added`, "success");
      return { ok: true };
    },
    [updateCurrentApp, showToast, user]
  );

  const updateMember = useCallback(
    (email: string, updates: Partial<AppMember>) => {
      updateCurrentApp((prev) => {
        const members = prev.members.map((m) => (m.email === email ? { ...m, ...updates } : m));
        return { ...prev, members, memberEmails: members.filter((m) => m.status !== "disabled").map((m) => m.email) };
      });
    },
    [updateCurrentApp]
  );

  const removeMember = useCallback(
    (email: string) => {
      const app = appRef.current;
      updateCurrentApp((prev) => {
        const members = prev.members.filter((m) => m.email !== email);
        return { ...prev, members, memberEmails: members.filter((m) => m.status !== "disabled").map((m) => m.email) };
      });
      if (app) storageService.addAudit({ appId: app.id, type: "member", action: "removed", entityType: "member", entityId: email, entityName: email, user: user?.email || "", userName: user?.name });
      showToast("Member removed", "info");
    },
    [updateCurrentApp, showToast, user]
  );

  // ── Publish / versions ──────────────────────────────────────────────────

  const publish = useCallback(
    async (label?: string) => {
      const app = appRef.current;
      if (!app || !user) return null;
      pendingSave.current = true;
      await flushSave();
      const version = await storageService.createVersion(app, label || `Publish ${new Date().toLocaleString()}`, user.email);
      updateCurrentApp((prev) => ({ ...prev, publishedVersion: version.version, publishedAt: now() }), { skipHistory: true });
      storageService.addAudit({ appId: app.id, type: "publish", action: "published", entityType: "app", entityId: app.id, entityName: `v${version.version}`, user: user.email, userName: user.name });
      showToast(`Published version ${version.version}`, "success");
      return version;
    },
    [flushSave, updateCurrentApp, showToast, user]
  );

  const listVersions = useCallback(async () => {
    const app = appRef.current;
    return app ? storageService.listVersions(app.id) : [];
  }, []);

  const rollbackTo = useCallback(
    async (version: AppVersion) => {
      const app = appRef.current;
      if (!app || !user) return;
      updateCurrentApp((prev) => ({ ...prev, ...version.snapshot, roles: version.snapshot.roles || prev.roles }));
      storageService.addAudit({ appId: app.id, type: "publish", action: "rollback", entityType: "app", entityId: app.id, entityName: `v${version.version}`, user: user.email, userName: user.name });
      showToast(`Rolled back to version ${version.version} (unpublished draft)`, "success");
    },
    [updateCurrentApp, showToast, user]
  );

  // ── Governance ──────────────────────────────────────────────────────────

  const refreshHealth = useCallback(() => {
    if (appRef.current) setHealthIssues(runHealthCheck(appRef.current));
  }, []);

  useEffect(() => {
    if (!currentApp) return;
    const t = setTimeout(() => setHealthIssues(runHealthCheck(currentApp)), 1500);
    return () => clearTimeout(t);
  }, [currentApp]);

  const listAudit = useCallback(async () => (appRef.current ? storageService.listAudit(appRef.current.id) : []), []);

  const exportAppJson = useCallback(() => {
    const app = appRef.current;
    if (!app) return "";
    const rest: Partial<AppDefinition> = { ...app };
    delete rest.members; delete rest.memberEmails; delete rest.builders; delete rest.builderEmails; delete rest.ownerEmail;
    return JSON.stringify({ ...rest, exportedAt: now(), exportFormat: "yourbuilder/app/v1" }, null, 2);
  }, []);

  const importAppJson = useCallback(
    (json: string, mode: "replace" | "merge") => {
      try {
        const parsed = JSON.parse(json);
        if (!parsed || !Array.isArray(parsed.forms)) return { ok: false, error: "Not a valid app export (missing forms)" };
        updateCurrentApp((prev) => {
          if (mode === "replace") {
            return { ...prev, forms: parsed.forms || [], reports: parsed.reports || [], pages: parsed.pages || [], workflows: parsed.workflows || [], printTemplates: parsed.printTemplates || [], roles: parsed.roles || prev.roles, settings: { ...prev.settings, ...(parsed.settings || {}) } };
          }
          const merged = (a: any[], b: any[]) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
          return { ...prev, forms: merged(prev.forms, parsed.forms || []), reports: merged(prev.reports, parsed.reports || []), pages: merged(prev.pages, parsed.pages || []), workflows: merged(prev.workflows, parsed.workflows || []), printTemplates: merged(prev.printTemplates || [], parsed.printTemplates || []), roles: merged(prev.roles, parsed.roles || []) };
        });
        showToast("Schema imported", "success");
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || "Invalid JSON" };
      }
    },
    [updateCurrentApp, showToast]
  );

  const saveAsTemplate = useCallback(
    async (category?: string) => {
      const app = appRef.current;
      if (!app) return;
      await storageService.saveTemplate(app, category);
      showToast("Saved to template gallery", "success");
    },
    [showToast]
  );

  const loadRecords = useCallback(async (formId: string) => (appRef.current ? storageService.getRecords(appRef.current.id, formId) : []), []);

  const getFormRelationships = useCallback(
    (formId: string) => {
      const app = appRef.current;
      if (!app) return { incoming: [], outgoing: [] };
      return { incoming: app.relationships.filter((r) => r.targetFormId === formId), outgoing: app.relationships.filter((r) => r.sourceFormId === formId) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentApp]
  );

  const value = useMemo<AppBuilderContextValue>(
    () => ({
      currentApp, loading, isDirty, saving, lastSavedText, loadApp, saveCurrentApp, updateCurrentApp,
      canUndo: history.canUndo, canRedo: history.canRedo, undo, redo,
      createForm, updateForm, deleteForm, duplicateForm,
      addFieldToForm, updateFieldInForm, deleteFieldFromForm, duplicateFieldInForm, reorderFieldsInForm,
      createReport, updateReport, deleteReport, duplicateReport,
      createWorkflow, updateWorkflow, deleteWorkflow, duplicateWorkflow,
      createPage, updatePage, deletePage, duplicatePage,
      createRole, updateRole, deleteRole, duplicateRole, addMember, updateMember, removeMember,
      publish, listVersions, rollbackTo,
      healthIssues, refreshHealth, listAudit, exportAppJson, importAppJson, saveAsTemplate,
      loadRecords, getFormRelationships,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentApp, loading, isDirty, saving, lastSavedText, healthIssues, history, loadApp, saveCurrentApp, updateCurrentApp, undo, redo, createForm, updateForm, deleteForm, duplicateForm, addFieldToForm, updateFieldInForm, deleteFieldFromForm, duplicateFieldInForm, reorderFieldsInForm, createReport, updateReport, deleteReport, duplicateReport, createWorkflow, updateWorkflow, deleteWorkflow, duplicateWorkflow, createPage, updatePage, deletePage, duplicatePage, createRole, updateRole, deleteRole, duplicateRole, addMember, updateMember, removeMember, publish, listVersions, rollbackTo, refreshHealth, listAudit, exportAppJson, importAppJson, saveAsTemplate, loadRecords, getFormRelationships]
  );

  return <AppBuilderContext.Provider value={value}>{children}</AppBuilderContext.Provider>;
};
