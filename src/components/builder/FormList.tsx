"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toLinkName, isValidLinkName } from "@/lib/utils/linkName";
import {
  FileText,
  Plus,
  TableProperties,
  Copy,
  Trash2,
  ExternalLink,
  Edit,
  ArrowRight,
  Layers,
} from "lucide-react";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";

export const FormList: React.FC = () => {
  const { currentApp, createForm, deleteForm, duplicateForm } = useAppBuilder();
  const [newFormModalOpen, setNewFormModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [description, setDescription] = useState("");
  const [linkNameTouched, setLinkNameTouched] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);

  if (!currentApp) return null;

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!linkNameTouched) {
      setLinkName(toLinkName(val));
    }
  };

  const handleCreateForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formName.trim()) {
      setFormError("Form name is required");
      return;
    }

    const cleanLink = toLinkName(linkName || formName);
    if (!cleanLink || !isValidLinkName(cleanLink)) {
      setFormError("Link name can only contain lowercase letters, numbers, and underscores.");
      return;
    }

    const duplicate = currentApp.forms.some((f) => f.linkName === cleanLink);
    if (duplicate) {
      setFormError(`Link name "${cleanLink}" already exists in this application.`);
      return;
    }

    const newForm = createForm(formName.trim(), description.trim());
    setNewFormModalOpen(false);
    setFormName("");
    setLinkName("");
    setDescription("");
    setLinkNameTouched(false);
  };

  const handleDeleteClick = (formId: string) => {
    const target = currentApp.forms.find((f) => f.id === formId);
    if (!target) return;

    // Check relationship warnings
    const incoming = currentApp.relationships.filter((r) => r.targetFormId === formId);
    const warnings: string[] = [];
    if (incoming.length > 0) {
      const sourceNames = incoming
        .map((r) => currentApp.forms.find((f) => f.id === r.sourceFormId)?.name || r.sourceFormId)
        .join(", ");
      warnings.push(`This form is referenced as a lookup in: ${sourceNames}. Deleting it will affect those relationships.`);
    }

    setDeleteTargetId(formId);
    setDeleteWarnings(warnings);
  };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-8 select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-3xs">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Application Forms</h1>
            <p className="text-xs text-slate-500 mt-1">
              Create and manage dynamic form schemas, subforms, and field specifications for {currentApp.name}.
            </p>
          </div>
          <Button
            size="md"
            onClick={() => setNewFormModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            + New Form
          </Button>
        </div>

        {/* Forms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentApp.forms.length === 0 ? (
            <div className="col-span-2 bg-white p-12 text-center rounded-xl border-2 border-dashed border-slate-300 space-y-3">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-semibold text-slate-700">No forms yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Create your first form to start collecting data and building workflows.
              </p>
              <Button
                size="sm"
                onClick={() => setNewFormModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Create Form
              </Button>
            </div>
          ) : (
            currentApp.forms.map((form) => {
              const defaultReport = currentApp.reports.find((r) => r.sourceFormId === form.id);

              return (
                <div
                  key={form.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs hover:border-slate-300 hover:shadow-2xs transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{form.name}</h3>
                          <span className="text-[11px] font-mono text-slate-400">/{form.linkName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => duplicateForm(form.id)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Duplicate Form"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(form.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete Form"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2">
                      {form.description || "No description provided."}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600 font-mono">
                      {form.fields.length} fields
                    </span>

                    <div className="flex items-center gap-2">
                      {defaultReport && (
                        <Link
                          href={getLiveAppUrl(currentApp.linkName, { report: defaultReport.linkName })}
                          target="_blank"
                          className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1"
                        >
                          <TableProperties className="w-3.5 h-3.5" /> Report
                        </Link>
                      )}

                      <Link href={getBuilderUrl(currentApp.linkName, { tab: "forms", form: form.linkName })}>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Edit className="w-3.5 h-3.5" />}
                        >
                          Edit Builder
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Form Modal */}
      <Modal
        isOpen={newFormModalOpen}
        onClose={() => setNewFormModalOpen(false)}
        title="Create New Form"
        description="Define a new schema entity with automatic report generation."
        footer={
          <>
            <Button variant="outline" onClick={() => setNewFormModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateForm}>
              Create Form
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateForm} className="space-y-4">
          <Input
            label="Form Name"
            value={formName}
            required
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Customer, Order, Inventory Item"
          />

          <Input
            label="Link Name"
            value={linkName}
            required
            onChange={(e) => {
              setLinkName(toLinkName(e.target.value));
              setLinkNameTouched(true);
            }}
            placeholder="e.g. customer"
            helperText="Lowercase, numbers and underscore only. Used for API and URL routes."
          />

          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional form description"
          />

          {formError && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {formError}
            </p>
          )}

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-800">
            A default report (<span className="font-semibold">{formName ? `${formName} Report` : "Form Report"}</span>) will automatically be created to display and search records.
          </div>
        </form>
      </Modal>

      {/* Delete Form Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetId)}
        onClose={() => {
          setDeleteTargetId(null);
          setDeleteWarnings([]);
        }}
        onConfirm={() => {
          if (deleteTargetId) {
            deleteForm(deleteTargetId);
            setDeleteTargetId(null);
            setDeleteWarnings([]);
          }
        }}
        title="Delete Form"
        message="Are you sure you want to delete this form? All fields and associated report views will be permanently removed."
        warnings={deleteWarnings}
      />
    </div>
  );
};
