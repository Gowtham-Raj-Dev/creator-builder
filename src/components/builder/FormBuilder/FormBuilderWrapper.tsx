"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { FieldPalette } from "./FieldPalette";
import { FormBuilderCanvas } from "./FormBuilderCanvas";
import { FieldPropertiesPanel } from "./FieldPropertiesPanel";
import { FieldType } from "@/types/schema";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Toggle, Textarea } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { getBuilderUrl, getLiveAppUrl } from "@/lib/utils/routes";
import { AiFixModal } from "@/components/builder/AiFixModal";
import { Settings2 } from "lucide-react";

export const FormBuilderWrapper: React.FC<{ formLinkName: string }> = ({ formLinkName }) => {
  const router = useRouter();
  const { currentApp, addFieldToForm, updateFieldInForm, deleteFieldFromForm, duplicateFieldInForm, reorderFieldsInForm, updateForm, healthIssues } = useAppBuilder();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const currentForm = currentApp?.forms.find((f) => f.linkName === formLinkName);
  const issues = useMemo(() => {
    const map: Record<string, string> = {};
    if (!currentForm) return map;
    for (const i of healthIssues) if (i.area === "form" && i.entityId === currentForm.id && i.severity === "error") { const fld = currentForm.fields.find((f) => i.entityName.endsWith(f.label)); if (fld) map[fld.id] = i.message; }
    return map;
  }, [healthIssues, currentForm]);

  if (!currentApp) return null;
  if (!currentForm) return <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500"><h2 className="text-base font-bold text-slate-800">Form not found</h2><p className="text-xs text-slate-400 mt-1">No form matching &quot;{formLinkName}&quot; exists.</p></div>;

  const selectedField = currentForm.fields.find((f) => f.id === selectedFieldId) || null;
  const handleAddField = (type: FieldType, label: string, atIndex?: number) => { const f = addFieldToForm(currentForm.id, { type, label }, atIndex); setSelectedFieldId(f.id); };

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0 min-w-0">
      <FieldPalette onAddField={handleAddField} />
      <FormBuilderCanvas
        form={currentForm}
        selectedFieldId={selectedFieldId}
        onSelectField={(f) => setSelectedFieldId(f ? f.id : null)}
        onAddField={handleAddField}
        onDuplicateField={(id) => { const d = duplicateFieldInForm(currentForm.id, id); if (d) setSelectedFieldId(d.id); }}
        onDeleteField={(id) => setDeleteFieldId(id)}
        onReorderFields={(from, to) => reorderFieldsInForm(currentForm.id, from, to)}
        onUpdateFormColumns={(cols) => updateForm(currentForm.id, { columns: cols })}
        onOpenFormSettings={() => setSettingsOpen(true)}
        onPreview={() => window.open(getLiveAppUrl(currentApp.linkName, { form: currentForm.linkName, action: "new" }), "_blank")}
        onNavigateToWorkflows={() => router.push(getBuilderUrl(currentApp.linkName, { tab: "workflows" }))}
        onEditWithAi={() => setAiOpen(true)}
        issues={issues}
      />
      <AiFixModal isOpen={aiOpen} onClose={() => setAiOpen(false)} kind="form" entity={currentForm} />
      <FieldPropertiesPanel field={selectedField} form={currentForm} app={currentApp} onUpdateField={(id, u) => updateFieldInForm(currentForm.id, id, u)} onClose={() => setSelectedFieldId(null)} />

      <ConfirmDialog isOpen={Boolean(deleteFieldId)} onClose={() => setDeleteFieldId(null)} onConfirm={() => { if (deleteFieldId) { deleteFieldFromForm(currentForm.id, deleteFieldId); if (selectedFieldId === deleteFieldId) setSelectedFieldId(null); } }} title="Delete field" message="Remove this field from the form and its report columns? Existing record data for this field will no longer be shown." isDestructive />

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Form settings" description="Behaviour and metadata of this form." maxWidth="lg" icon={<Settings2 className="w-4 h-4" />} footer={<Button onClick={() => setSettingsOpen(false)}>Done</Button>}>
        <div className="space-y-4">
          <Input label="Form name" value={currentForm.name} onChange={(e) => updateForm(currentForm.id, { name: e.target.value })} />
          <Textarea label="Description" rows={2} value={currentForm.description || ""} onChange={(e) => updateForm(currentForm.id, { description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Record title field" value={currentForm.titleFieldId || ""} onChange={(e) => updateForm(currentForm.id, { titleFieldId: e.target.value || undefined })} helperText="Used in search, recent items and related lists."><option value="">Auto (first field)</option>{currentForm.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
            <Select label="Default layout" value={currentForm.columns} onChange={(e) => updateForm(currentForm.id, { columns: Number(e.target.value) as 1 | 2 | 3 })}><option value={1}>1 column</option><option value={2}>2 columns</option><option value={3}>3 columns</option></Select>
          </div>
          <Input label="Success message" value={currentForm.successMessage || ""} onChange={(e) => updateForm(currentForm.id, { successMessage: e.target.value })} placeholder="Record saved successfully" />
          <Select label="After submit go to" value={currentForm.redirectAfterSubmit || "report"} onChange={(e) => updateForm(currentForm.id, { redirectAfterSubmit: e.target.value as any })}><option value="report">Report (list)</option><option value="form">New blank form</option><option value="record">The saved record</option></Select>
          <Toggle checked={currentForm.allowDuplicateRecord !== false} onChange={(v) => updateForm(currentForm.id, { allowDuplicateRecord: v })} label="Allow 'Duplicate record' action" />
          <div className="text-[11px] text-slate-400 font-mono">id: {currentForm.id} · link: {currentForm.linkName}</div>
        </div>
      </Modal>
    </div>
  );
};
