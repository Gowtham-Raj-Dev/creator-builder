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
import { linkableFields, buildLinkedColumns, ensureParentLink, withParentLinkColumns } from "@/lib/engine/subformLink";
import { Table, Link2 } from "lucide-react";
import { Settings2 } from "lucide-react";

export const FormBuilderWrapper: React.FC<{ formLinkName: string }> = ({ formLinkName }) => {
  const router = useRouter();
  const { currentApp, addFieldToForm, updateFieldInForm, deleteFieldFromForm, duplicateFieldInForm, reorderFieldsInForm, updateForm, updateCurrentApp, healthIssues } = useAppBuilder();
  const [subformPrompt, setSubformPrompt] = useState<{ label: string; atIndex?: number; source: "inline" | "existing_form"; targetFormId: string } | null>(null);
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
  const handleAddField = (type: FieldType, label: string, atIndex?: number) => {
    // a subform first asks: blank columns, or rows backed by an existing form?
    if (type === "subform") { setSubformPrompt({ label, atIndex, source: "inline", targetFormId: currentApp.forms.find((f) => f.id !== currentForm.id)?.id || "" }); return; }
    const f = addFieldToForm(currentForm.id, { type, label }, atIndex); setSelectedFieldId(f.id);
  };
  const confirmSubform = () => {
    if (!subformPrompt) return;
    const f = addFieldToForm(currentForm.id, { type: "subform", label: subformPrompt.label }, subformPrompt.atIndex);
    if (subformPrompt.source === "existing_form" && subformPrompt.targetFormId) {
      const targetId = subformPrompt.targetFormId;
      updateCurrentApp((prev) => {
        const parent = prev.forms.find((x) => x.id === currentForm.id)!;
        const { app: next, fieldId } = ensureParentLink(prev, parent, targetId);
        const target = next.forms.find((x) => x.id === targetId)!;
        const ids = linkableFields(target, fieldId).slice(0, 6).map((x) => x.id);
        const columns = buildLinkedColumns(target, ids);
        const subform = { sourceType: "existing_form" as const, targetFormId: targetId, parentLinkFieldId: fieldId, linkedFieldIds: ids, columns, showTotals: true, allowBulkAdd: true, allowDuplicateRow: true, totalColumnIds: columns.filter((c) => ["number", "currency", "decimal"].includes(c.type) || c.formula).map((c) => c.id) };
        return withParentLinkColumns({ ...next, forms: next.forms.map((x) => (x.id === currentForm.id ? { ...x, fields: x.fields.map((y) => (y.id === f.id ? { ...y, label: target.name, subform } : y)) } : x)) });
      });
    }
    setSelectedFieldId(f.id); setSubformPrompt(null);
  };

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
      <Modal isOpen={Boolean(subformPrompt)} onClose={() => setSubformPrompt(null)} title="Add subform" description="How should the rows of this subform be stored?" icon={<Table className="w-4 h-4" />} footer={<><Button variant="outline" onClick={() => setSubformPrompt(null)}>Cancel</Button><Button disabled={subformPrompt?.source === "existing_form" && !subformPrompt.targetFormId} onClick={confirmSubform}>Add subform</Button></>}>
        {subformPrompt && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setSubformPrompt({ ...subformPrompt, source: "inline" })} className={`text-left p-3.5 rounded-xl border ${subformPrompt.source === "inline" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Table className="w-4 h-4 text-purple-600" />Blank subform</div>
                <div className="text-xs text-slate-500 mt-1">You define the columns (Item, Qty, Rate, Amount…). Rows live only inside this record.</div>
              </button>
              <button type="button" onClick={() => setSubformPrompt({ ...subformPrompt, source: "existing_form" })} className={`text-left p-3.5 rounded-xl border ${subformPrompt.source === "existing_form" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Link2 className="w-4 h-4 text-indigo-600" />Use an existing form</div>
                <div className="text-xs text-slate-500 mt-1">Columns come from that form&apos;s fields. Every row is saved as a record there, linked back to this {currentForm.name}.</div>
              </button>
            </div>
            {subformPrompt.source === "existing_form" && (
              <div className="space-y-2">
                <Select label="Child form" value={subformPrompt.targetFormId} onChange={(e) => setSubformPrompt({ ...subformPrompt, targetFormId: e.target.value })}><option value="">Choose…</option>{currentApp.forms.filter((f) => f.id !== currentForm.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">A read-only lookup <strong>&quot;{currentForm.name}&quot;</strong> is added to the child form automatically, so each child record shows which {currentForm.name} it was entered from. You can pick the columns afterwards in the field settings.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
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
