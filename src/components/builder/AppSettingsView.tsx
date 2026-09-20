"use client";

import React, { useState } from "react";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { storageService } from "@/lib/storage/localStorageProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  Settings,
  RotateCcw,
  Download,
  Upload,
  Sparkles,
  Palette,
  Layers,
} from "lucide-react";

export const AppSettingsView: React.FC = () => {
  const { currentApp, updateCurrentApp, saveCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [schemaJson, setSchemaJson] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);

  if (!currentApp) return null;

  const handleExportJson = () => {
    const dataStr = JSON.stringify(currentApp, null, 2);
    setSchemaJson(dataStr);
    setShowJsonModal(true);

    // Also download file
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentApp.linkName}_schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Schema exported as JSON", "success");
  };

  const handleResetToSeed = async () => {
    try {
      await storageService.resetToSeedData();
      showToast("App restored to original seed demo dataset", "success");
      window.location.reload();
    } catch (err) {
      console.error("Reset error:", err);
      showToast("Failed to reset application data", "error");
    }
  };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-8 select-none">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Application Settings</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage metadata, appearance, and schema migrations.
              </p>
            </div>
          </div>
        </div>

        {/* General Metadata */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            General Configuration
          </h3>

          <div className="space-y-4">
            <Input
              label="Application Name"
              value={currentApp.name}
              onChange={(e) => updateCurrentApp((prev) => ({ ...prev, name: e.target.value }))}
            />

            <Input
              label="Link Name (Slug URL)"
              value={currentApp.linkName}
              disabled
              helperText="Link name cannot be changed after creation to protect URL routing stability."
            />

            <Input
              label="Description"
              value={currentApp.description || ""}
              onChange={(e) =>
                updateCurrentApp((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Application purpose or notes..."
            />
          </div>
        </div>

        {/* Theme & Styling */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Appearance & Theme
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Theme Mode"
              value={currentApp.settings?.theme || "light"}
              onChange={(e) =>
                updateCurrentApp((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    theme: e.target.value as any,
                  },
                }))
              }
            >
              <option value="light">Light (Clean Enterprise)</option>
              <option value="dark">Dark Mode</option>
              <option value="system">System Preference</option>
            </Select>

            <Select
              label="Brand Accent Color"
              value={currentApp.settings?.accentColor || "#2563eb"}
              onChange={(e) =>
                updateCurrentApp((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    accentColor: e.target.value,
                    theme: prev.settings?.theme || "light",
                  },
                }))
              }
            >
              <option value="#2563eb">Zoho Blue (#2563eb)</option>
              <option value="#059669">Emerald Green (#059669)</option>
              <option value="#7c3aed">Royal Purple (#7c3aed)</option>
              <option value="#ea580c">Warm Amber (#ea580c)</option>
            </Select>
          </div>
        </div>

        {/* Schema Portability & Backup */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Schema Portability (JSON)
          </h3>
          <p className="text-xs text-slate-500">
            Export the complete schema specification including Forms, Fields, Reports, Relationships,
            and Workflows.
          </p>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              icon={<Download className="w-3.5 h-3.5 text-slate-500" />}
            >
              Export Schema JSON
            </Button>
          </div>
        </div>

        {/* Reset / Demo Data Seed */}
        <div className="bg-white p-6 rounded-xl border border-rose-200 shadow-3xs space-y-3">
          <div className="flex items-center gap-2 text-rose-700">
            <RotateCcw className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              Reset & Demo Data Reload
            </h3>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Need to restore the sample Gowtham Test dataset (Customer, City, Products, Invoices,
            Subform & Workflows)? This will reset your local database to the pristine demo state.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setResetDialogOpen(true)}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset to Seed Demo State
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        onConfirm={handleResetToSeed}
        title="Reset Local Data to Seed?"
        message="This will overwrite local changes and repopulate the sample Gowtham Test application with pre-built forms, records, lookups and subforms."
        confirmText="Confirm Reset"
        isDestructive={true}
      />
    </div>
  );
};
