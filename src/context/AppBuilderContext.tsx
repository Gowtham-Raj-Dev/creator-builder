"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  AppDefinition,
  FormDefinition,
  FieldDefinition,
  ReportDefinition,
  WorkflowDefinition,
  PageDefinition,
  RelationshipDefinition,
  FieldType,
} from "@/types/schema";
import { storageService } from "@/lib/storage/localStorageProvider";
import { generateId } from "@/lib/utils/idGenerator";
import { generateUniqueLinkName, toLinkName } from "@/lib/utils/linkName";
import { useToast } from "./ToastContext";

interface AppBuilderContextValue {
  currentApp: AppDefinition | null;
  loading: boolean;
  isDirty: boolean;
  lastSavedText: string;
  loadApp: (idOrLinkName: string) => Promise<boolean>;
  saveCurrentApp: () => Promise<void>;
  updateCurrentApp: (updater: (prev: AppDefinition) => AppDefinition) => void;

  // Form actions
  createForm: (name: string, description?: string, columns?: 1 | 2) => FormDefinition;
  updateForm: (formId: string, updates: Partial<FormDefinition>) => void;
  deleteForm: (formId: string) => { success: boolean; warnings?: string[] };
  duplicateForm: (formId: string) => FormDefinition | null;

  // Field actions
  addFieldToForm: (formId: string, fieldData: Partial<FieldDefinition>) => FieldDefinition;
  updateFieldInForm: (formId: string, fieldId: string, updates: Partial<FieldDefinition>) => void;
  deleteFieldFromForm: (formId: string, fieldId: string) => void;
  duplicateFieldInForm: (formId: string, fieldId: string) => FieldDefinition | null;
  reorderFieldsInForm: (formId: string, fromIndex: number, toIndex: number) => void;

  // Report actions
  createReport: (name: string, sourceFormId: string) => ReportDefinition;
  updateReport: (reportId: string, updates: Partial<ReportDefinition>) => void;
  deleteReport: (reportId: string) => void;

  // Workflow actions
  createWorkflow: (data: Partial<WorkflowDefinition>) => WorkflowDefinition;
  updateWorkflow: (workflowId: string, updates: Partial<WorkflowDefinition>) => void;
  deleteWorkflow: (workflowId: string) => void;

  // Page actions
  createPage: (name: string, description?: string) => PageDefinition;
  updatePage: (pageId: string, updates: Partial<PageDefinition>) => void;
  deletePage: (pageId: string) => void;

  // Relationships
  getFormRelationships: (formId: string) => { incoming: RelationshipDefinition[]; outgoing: RelationshipDefinition[] };
}

const AppBuilderContext = createContext<AppBuilderContextValue | null>(null);

export const useAppBuilder = () => {
  const ctx = useContext(AppBuilderContext);
  if (!ctx) {
    throw new Error("useAppBuilder must be used within an AppBuilderProvider");
  }
  return ctx;
};

export const AppBuilderProvider: React.FC<{
  initialAppIdOrLink?: string;
  children: React.ReactNode;
}> = ({ initialAppIdOrLink, children }) => {
  const [currentApp, setCurrentApp] = useState<AppDefinition | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSavedText, setLastSavedText] = useState<string>("Saved");
  const { showToast } = useToast();

  const loadApp = useCallback(
    async (idOrLinkName: string): Promise<boolean> => {
      setLoading(true);
      try {
        const app = await storageService.getApp(idOrLinkName);
        if (app) {
          setCurrentApp(app);
          setIsDirty(false);
          setLastSavedText("Saved");
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to load app:", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (initialAppIdOrLink) {
      loadApp(initialAppIdOrLink);
    } else {
      setLoading(false);
    }
  }, [initialAppIdOrLink, loadApp]);

  // Recalculate relationships across forms
  const extractRelationships = (forms: FormDefinition[]): RelationshipDefinition[] => {
    const rels: RelationshipDefinition[] = [];
    for (const form of forms) {
      for (const field of form.fields) {
        if (field.type === "lookup" && field.lookup?.targetFormId) {
          rels.push({
            id: `rel_${form.id}_${field.id}`,
            sourceFormId: form.id,
            sourceFieldId: field.id,
            targetFormId: field.lookup.targetFormId,
            targetFieldId: field.lookup.displayFieldId || "id",
            type: "lookup",
          });
        } else if (field.type === "subform" && field.subform) {
          // Check columns inside subform for lookups as well
          for (const col of field.subform.columns || []) {
            if (col.type === "lookup" && col.lookup?.targetFormId) {
              rels.push({
                id: `rel_${form.id}_${field.id}_${col.id}`,
                sourceFormId: form.id,
                sourceFieldId: `${field.id}.${col.id}`,
                targetFormId: col.lookup.targetFormId,
                targetFieldId: col.lookup.displayFieldId || "id",
                type: "subform",
              });
            }
          }
        }
      }
    }
    return rels;
  };

  const updateCurrentApp = useCallback((updater: (prev: AppDefinition) => AppDefinition) => {
    setCurrentApp((prev) => {
      if (!prev) return null;
      const next = updater(prev);
      const withRels = {
        ...next,
        relationships: extractRelationships(next.forms),
        updatedAt: new Date().toISOString(),
      };
      setIsDirty(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSavedText(`Saved at ${timeStr}`);

      // Automatically persist to localStorage so changes are stored immediately
      try {
        storageService.saveApp(withRels);
      } catch (err) {
        console.error("Auto-save to localStorage error:", err);
      }

      return withRels;
    });
  }, []);

  const saveCurrentApp = useCallback(async () => {
    if (!currentApp) return;
    try {
      await storageService.saveApp(currentApp);
      setIsDirty(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastSavedText(`Saved at ${timeStr}`);
      showToast("Application saved successfully", "success");
    } catch (err) {
      console.error("Save error:", err);
      showToast("Failed to save application", "error");
    }
  }, [currentApp, showToast]);

  // Form operations
  const createForm = useCallback(
    (name: string, description?: string, columns: 1 | 2 = 2): FormDefinition => {
      if (!currentApp) throw new Error("No active application");

      const existingLinkNames = currentApp.forms.map((f) => f.linkName);
      const linkName = generateUniqueLinkName(name, existingLinkNames);
      const formId = generateId("form");

      const newForm: FormDefinition = {
        id: formId,
        name,
        linkName,
        description,
        columns,
        fields: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Requirement 6 & 24: Automatically create default report
      const reportName = `${name} Report`;
      const reportLinkName = generateUniqueLinkName(
        reportName,
        currentApp.reports.map((r) => r.linkName)
      );

      const defaultReport: ReportDefinition = {
        id: generateId("rep"),
        name: reportName,
        linkName: reportLinkName,
        sourceFormId: formId,
        columns: [],
        pageSize: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      updateCurrentApp((prev) => ({
        ...prev,
        forms: [...prev.forms, newForm],
        reports: [...prev.reports, defaultReport],
      }));

      showToast(`Form "${name}" created with default report`, "success");
      return newForm;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const updateForm = useCallback(
    (formId: string, updates: Partial<FormDefinition>) => {
      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.map((f) => (f.id === formId ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f)),
      }));
    },
    [updateCurrentApp]
  );

  const deleteForm = useCallback(
    (formId: string): { success: boolean; warnings?: string[] } => {
      if (!currentApp) return { success: false };

      // Requirement 47: Check if form has incoming relationships
      const incoming = currentApp.relationships.filter((r) => r.targetFormId === formId);
      const warnings: string[] = [];
      if (incoming.length > 0) {
        const sourceFormNames = incoming
          .map((r) => currentApp.forms.find((f) => f.id === r.sourceFormId)?.name || r.sourceFormId)
          .join(", ");
        warnings.push(`This form is referenced as a lookup in: ${sourceFormNames}. Deleting it will affect those relationships.`);
      }

      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.filter((f) => f.id !== formId),
        reports: prev.reports.filter((r) => r.sourceFormId !== formId),
        workflows: prev.workflows.filter((w) => w.formId !== formId),
      }));

      showToast("Form deleted", "info");
      return { success: true, warnings: warnings.length > 0 ? warnings : undefined };
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const duplicateForm = useCallback(
    (formId: string): FormDefinition | null => {
      if (!currentApp) return null;
      const original = currentApp.forms.find((f) => f.id === formId);
      if (!original) return null;

      const dupName = `${original.name} Copy`;
      const linkName = generateUniqueLinkName(
        dupName,
        currentApp.forms.map((f) => f.linkName)
      );
      const newFormId = generateId("form");

      const clonedFields = original.fields.map((f) => ({
        ...f,
        id: generateId("field"),
        linkName: generateUniqueLinkName(f.label, []),
      }));

      const newForm: FormDefinition = {
        ...original,
        id: newFormId,
        name: dupName,
        linkName,
        fields: clonedFields,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const defaultReport: ReportDefinition = {
        id: generateId("rep"),
        name: `${dupName} Report`,
        linkName: generateUniqueLinkName(`${dupName} Report`, currentApp.reports.map((r) => r.linkName)),
        sourceFormId: newFormId,
        columns: clonedFields.map((f, i) => ({
          fieldId: f.id,
          label: f.label,
          visible: true,
          order: i,
        })),
        pageSize: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      updateCurrentApp((prev) => ({
        ...prev,
        forms: [...prev.forms, newForm],
        reports: [...prev.reports, defaultReport],
      }));

      showToast(`Form duplicated as "${dupName}"`, "success");
      return newForm;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  // Field operations
  const addFieldToForm = useCallback(
    (formId: string, fieldData: Partial<FieldDefinition>): FieldDefinition => {
      if (!currentApp) throw new Error("No active application");
      const targetForm = currentApp.forms.find((f) => f.id === formId);
      if (!targetForm) throw new Error("Form not found");

      const label = fieldData.label || "New Field";
      const existingLinkNames = targetForm.fields.map((f) => f.linkName);
      const linkName = fieldData.linkName
        ? generateUniqueLinkName(fieldData.linkName, existingLinkNames)
        : generateUniqueLinkName(label, existingLinkNames);

      const fieldId = fieldData.id || generateId("field");
      const type: FieldType = fieldData.type || "text";

      const newField: FieldDefinition = {
        id: fieldId,
        label,
        linkName,
        type,
        required: fieldData.required || false,
        placeholder: fieldData.placeholder,
        description: fieldData.description,
        defaultValue: fieldData.defaultValue,
        options: fieldData.options || (["dropdown", "radio", "multiselect"].includes(type) ? ["Option 1", "Option 2", "Option 3"] : undefined),
        currencySymbol: fieldData.currencySymbol || (type === "currency" ? "₹" : undefined),
        decimalPlaces: fieldData.decimalPlaces ?? (["number", "currency", "percentage", "decimal"].includes(type) ? 2 : undefined),
        lookup: fieldData.lookup,
        subform: fieldData.subform || (type === "subform" ? {
          sourceType: "inline",
          columns: [
            { id: generateId("col"), label: "Item", linkName: "item", type: "text", required: true },
            { id: generateId("col"), label: "Quantity", linkName: "quantity", type: "number", required: true, defaultValue: 1 },
            { id: generateId("col"), label: "Rate", linkName: "rate", type: "currency", currencySymbol: "₹", required: true, defaultValue: 0 },
            { id: generateId("col"), label: "Amount", linkName: "amount", type: "currency", currencySymbol: "₹", readonly: true },
          ],
        } : undefined),
        autonumber: fieldData.autonumber || (type === "autonumber" ? {
          prefix: "REC-",
          startNumber: 1,
          digits: 5,
        } : undefined),
        validation: fieldData.validation,
      };

      updateCurrentApp((prev) => {
        // Requirement 64: Automatically update reports for this form to include this new field
        const updatedReports = prev.reports.map((rep) => {
          if (rep.sourceFormId === formId) {
            const maxOrder = rep.columns.reduce((m, c) => Math.max(m, c.order), -1);
            return {
              ...rep,
              columns: [
                ...rep.columns,
                {
                  fieldId: newField.id,
                  label: newField.label,
                  visible: true,
                  order: maxOrder + 1,
                },
              ],
            };
          }
          return rep;
        });

        return {
          ...prev,
          forms: prev.forms.map((f) =>
            f.id === formId ? { ...f, fields: [...f.fields, newField] } : f
          ),
          reports: updatedReports,
        };
      });

      showToast(`Field "${newField.label}" added`, "success");
      return newField;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const updateFieldInForm = useCallback(
    (formId: string, fieldId: string, updates: Partial<FieldDefinition>) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm) return prev;

        const updatedFields = targetForm.fields.map((field) => {
          if (field.id === fieldId) {
            return { ...field, ...updates };
          }
          return field;
        });

        // Also update report column label if label changed
        const updatedReports = updates.label
          ? prev.reports.map((rep) => {
              if (rep.sourceFormId === formId) {
                return {
                  ...rep,
                  columns: rep.columns.map((c) =>
                    c.fieldId === fieldId ? { ...c, label: updates.label! } : c
                  ),
                };
              }
              return rep;
            })
          : prev.reports;

        return {
          ...prev,
          forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields: updatedFields } : f)),
          reports: updatedReports,
        };
      });
    },
    [updateCurrentApp]
  );

  const deleteFieldFromForm = useCallback(
    (formId: string, fieldId: string) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm) return prev;

        const filteredFields = targetForm.fields.filter((f) => f.id !== fieldId);

        // Requirement 64: Safely remove from report columns
        const updatedReports = prev.reports.map((rep) => {
          if (rep.sourceFormId === formId) {
            return {
              ...rep,
              columns: rep.columns.filter((c) => c.fieldId !== fieldId),
            };
          }
          return rep;
        });

        return {
          ...prev,
          forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields: filteredFields } : f)),
          reports: updatedReports,
        };
      });

      showToast("Field removed", "info");
    },
    [updateCurrentApp, showToast]
  );

  const duplicateFieldInForm = useCallback(
    (formId: string, fieldId: string): FieldDefinition | null => {
      if (!currentApp) return null;
      const targetForm = currentApp.forms.find((f) => f.id === formId);
      if (!targetForm) return null;

      const original = targetForm.fields.find((f) => f.id === fieldId);
      if (!original) return null;

      const copyLabel = `${original.label} Copy`;
      const copyLinkName = generateUniqueLinkName(
        copyLabel,
        targetForm.fields.map((f) => f.linkName)
      );

      const duplicated: FieldDefinition = {
        ...original,
        id: generateId("field"),
        label: copyLabel,
        linkName: copyLinkName,
      };

      const index = targetForm.fields.findIndex((f) => f.id === fieldId);
      const newFields = [...targetForm.fields];
      newFields.splice(index + 1, 0, duplicated);

      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields: newFields } : f)),
      }));

      showToast(`Field duplicated as "${copyLabel}"`, "success");
      return duplicated;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const reorderFieldsInForm = useCallback(
    (formId: string, fromIndex: number, toIndex: number) => {
      updateCurrentApp((prev) => {
        const targetForm = prev.forms.find((f) => f.id === formId);
        if (!targetForm) return prev;

        const fields = [...targetForm.fields];
        const [moved] = fields.splice(fromIndex, 1);
        fields.splice(toIndex, 0, moved);

        return {
          ...prev,
          forms: prev.forms.map((f) => (f.id === formId ? { ...f, fields } : f)),
        };
      });
    },
    [updateCurrentApp]
  );

  // Report operations
  const createReport = useCallback(
    (name: string, sourceFormId: string): ReportDefinition => {
      if (!currentApp) throw new Error("No active application");
      const targetForm = currentApp.forms.find((f) => f.id === sourceFormId);
      if (!targetForm) throw new Error("Source form not found");

      const linkName = generateUniqueLinkName(
        name,
        currentApp.reports.map((r) => r.linkName)
      );

      const newReport: ReportDefinition = {
        id: generateId("rep"),
        name,
        linkName,
        sourceFormId,
        columns: targetForm.fields.map((f, i) => ({
          fieldId: f.id,
          label: f.label,
          visible: true,
          order: i,
        })),
        pageSize: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      updateCurrentApp((prev) => ({
        ...prev,
        reports: [...prev.reports, newReport],
      }));

      showToast(`Report "${name}" created`, "success");
      return newReport;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const updateReport = useCallback(
    (reportId: string, updates: Partial<ReportDefinition>) => {
      updateCurrentApp((prev) => ({
        ...prev,
        reports: prev.reports.map((r) => (r.id === reportId ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r)),
      }));
    },
    [updateCurrentApp]
  );

  const deleteReport = useCallback(
    (reportId: string) => {
      updateCurrentApp((prev) => ({
        ...prev,
        reports: prev.reports.filter((r) => r.id !== reportId),
      }));
      showToast("Report deleted", "info");
    },
    [updateCurrentApp, showToast]
  );

  // Workflow operations
  const createWorkflow = useCallback(
    (data: Partial<WorkflowDefinition>): WorkflowDefinition => {
      const newWf: WorkflowDefinition = {
        id: data.id || generateId("wf"),
        name: data.name || "New Workflow",
        description: data.description || "",
        formId: data.formId || "",
        mode: data.mode || "visual",
        trigger: data.trigger || { type: "onUserInput" },
        actions: data.actions || [],
        active: data.active !== undefined ? data.active : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      updateCurrentApp((prev) => ({
        ...prev,
        workflows: [...prev.workflows, newWf],
      }));

      showToast("Workflow created", "success");
      return newWf;
    },
    [updateCurrentApp, showToast]
  );

  const updateWorkflow = useCallback(
    (workflowId: string, updates: Partial<WorkflowDefinition>) => {
      updateCurrentApp((prev) => ({
        ...prev,
        workflows: prev.workflows.map((w) => (w.id === workflowId ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w)),
      }));
    },
    [updateCurrentApp]
  );

  const deleteWorkflow = useCallback(
    (workflowId: string) => {
      updateCurrentApp((prev) => ({
        ...prev,
        workflows: prev.workflows.filter((w) => w.id !== workflowId),
      }));
      showToast("Workflow deleted", "info");
    },
    [updateCurrentApp, showToast]
  );

  // Page operations
  const createPage = useCallback(
    (name: string, description?: string): PageDefinition => {
      if (!currentApp) throw new Error("No active application");
      const linkName = generateUniqueLinkName(name, currentApp.pages.map((p) => p.linkName));

      const newPage: PageDefinition = {
        id: generateId("page"),
        name,
        linkName,
        description,
        components: [
          {
            id: generateId("comp"),
            type: "heading",
            props: { title: name, subtitle: description || "Custom page view" },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      updateCurrentApp((prev) => ({
        ...prev,
        pages: [...prev.pages, newPage],
      }));

      showToast(`Page "${name}" created`, "success");
      return newPage;
    },
    [currentApp, updateCurrentApp, showToast]
  );

  const updatePage = useCallback(
    (pageId: string, updates: Partial<PageDefinition>) => {
      updateCurrentApp((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.id === pageId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p)),
      }));
    },
    [updateCurrentApp]
  );

  const deletePage = useCallback(
    (pageId: string) => {
      updateCurrentApp((prev) => ({
        ...prev,
        pages: prev.pages.filter((p) => p.id !== pageId),
      }));
      showToast("Page deleted", "info");
    },
    [updateCurrentApp, showToast]
  );

  const getFormRelationships = useCallback(
    (formId: string) => {
      if (!currentApp) return { incoming: [], outgoing: [] };
      return {
        incoming: currentApp.relationships.filter((r) => r.targetFormId === formId),
        outgoing: currentApp.relationships.filter((r) => r.sourceFormId === formId),
      };
    },
    [currentApp]
  );

  return (
    <AppBuilderContext.Provider
      value={{
        currentApp,
        loading,
        isDirty,
        lastSavedText,
        loadApp,
        saveCurrentApp,
        updateCurrentApp,
        createForm,
        updateForm,
        deleteForm,
        duplicateForm,
        addFieldToForm,
        updateFieldInForm,
        deleteFieldFromForm,
        duplicateFieldInForm,
        reorderFieldsInForm,
        createReport,
        updateReport,
        deleteReport,
        createWorkflow,
        updateWorkflow,
        deleteWorkflow,
        createPage,
        updatePage,
        deletePage,
        getFormRelationships,
      }}
    >
      {children}
    </AppBuilderContext.Provider>
  );
};
