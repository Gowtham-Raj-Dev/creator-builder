"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { FieldPalette } from "./FieldPalette";
import { FormBuilderCanvas } from "./FormBuilderCanvas";
import { FieldPropertiesPanel } from "./FieldPropertiesPanel";
import { FieldType, FieldDefinition } from "@/types/schema";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getBuilderUrl } from "@/lib/utils/routes";

interface FormBuilderWrapperProps {
  formLinkName: string;
}

export const FormBuilderWrapper: React.FC<FormBuilderWrapperProps> = ({ formLinkName }) => {
  const router = useRouter();
  const {
    currentApp,
    addFieldToForm,
    updateFieldInForm,
    deleteFieldFromForm,
    duplicateFieldInForm,
    reorderFieldsInForm,
    updateForm,
  } = useAppBuilder();

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);

  if (!currentApp) return null;

  const currentForm = currentApp.forms.find((f) => f.linkName === formLinkName);

  if (!currentForm) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-500">
        <h2 className="text-base font-bold text-slate-800">Form Not Found</h2>
        <p className="text-xs text-slate-400 mt-1">
          No form matching &quot;{formLinkName}&quot; exists in this application.
        </p>
      </div>
    );
  }

  const selectedField = currentForm.fields.find((f) => f.id === selectedFieldId) || null;

  const handleAddField = (type: FieldType, label: string) => {
    const newField = addFieldToForm(currentForm.id, { type, label });
    setSelectedFieldId(newField.id);
  };

  const handleUpdateField = (fieldId: string, updates: Partial<FieldDefinition>) => {
    updateFieldInForm(currentForm.id, fieldId, updates);
  };

  const handleDuplicateField = (fieldId: string) => {
    const dup = duplicateFieldInForm(currentForm.id, fieldId);
    if (dup) setSelectedFieldId(dup.id);
  };

  const handleDeleteField = (fieldId: string) => {
    setDeleteFieldId(fieldId);
  };

  const handleConfirmDeleteField = () => {
    if (deleteFieldId) {
      deleteFieldFromForm(currentForm.id, deleteFieldId);
      if (selectedFieldId === deleteFieldId) {
        setSelectedFieldId(null);
      }
      setDeleteFieldId(null);
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0 min-w-0">
      {/* 1. Left Field Palette (Requirement 7) */}
      <FieldPalette onAddField={handleAddField} />

      {/* 2. Middle Form Canvas (Requirement 7) */}
      <FormBuilderCanvas
        form={currentForm}
        selectedFieldId={selectedFieldId}
        onSelectField={(field) => setSelectedFieldId(field ? field.id : null)}
        onAddField={handleAddField}
        onDuplicateField={handleDuplicateField}
        onDeleteField={handleDeleteField}
        onReorderFields={(from, to) => reorderFieldsInForm(currentForm.id, from, to)}
        onUpdateFormColumns={(cols) => updateForm(currentForm.id, { columns: cols })}
        onNavigateToWorkflows={() => router.push(getBuilderUrl(currentApp.linkName, { tab: "workflows" }))}
      />

      {/* 3. Right Field Properties Panel (Requirement 7 & 10) */}
      <FieldPropertiesPanel
        field={selectedField}
        form={currentForm}
        app={currentApp}
        onUpdateField={handleUpdateField}
        onClose={() => setSelectedFieldId(null)}
      />

      {/* Field Deletion Confirm Modal */}
      <ConfirmDialog
        isOpen={Boolean(deleteFieldId)}
        onClose={() => setDeleteFieldId(null)}
        onConfirm={handleConfirmDeleteField}
        title="Delete Field"
        message="Are you sure you want to remove this field from the form and associated report views?"
        isDestructive={true}
      />
    </div>
  );
};
