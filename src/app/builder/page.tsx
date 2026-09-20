"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppDefinition } from "@/types/schema";
import { storageService } from "@/lib/storage/localStorageProvider";
import { createSeedApp, createSeedRecords } from "@/lib/storage/seedData";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toLinkName, isValidLinkName, generateUniqueLinkName } from "@/lib/utils/linkName";
import { generateId } from "@/lib/utils/idGenerator";
import { useToast } from "@/context/ToastContext";
import {
  Layers,
  Plus,
  ExternalLink,
  Edit,
  Trash2,
  Table,
  Zap,
  Sparkles,
  FileText,
  RotateCcw,
} from "lucide-react";

export default function BuilderHomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Create App Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [description, setDescription] = useState("");
  const [linkNameTouched, setLinkNameTouched] = useState(false);
  const [withSampleData, setWithSampleData] = useState(true);
  const [formError, setFormError] = useState("");

  // Delete App Dialog
  const [deleteAppId, setDeleteAppId] = useState<string | null>(null);

  const loadApps = async () => {
    setLoading(true);
    try {
      const list = await storageService.getApps();
      setApps(list);
    } catch (err) {
      console.error("Failed to load apps:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleNameChange = (val: string) => {
    setAppName(val);
    if (!linkNameTouched) {
      setLinkName(toLinkName(val));
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!appName.trim()) {
      setFormError("Application name is required");
      return;
    }

    const cleanLink = toLinkName(linkName || appName);
    if (!cleanLink || !isValidLinkName(cleanLink)) {
      setFormError("Link name can only contain lowercase letters, numbers, and underscores.");
      return;
    }

    const duplicate = apps.some((a) => a.linkName.toLowerCase() === cleanLink.toLowerCase());
    if (duplicate) {
      setFormError(`Link name "${cleanLink}" is already used by another application.`);
      return;
    }

    let newApp: AppDefinition;
    const appId = generateId("app");

    if (withSampleData) {
      // Create clone of seed app with new metadata
      const template = createSeedApp();
      newApp = {
        ...template,
        id: appId,
        name: appName.trim(),
        linkName: cleanLink,
        description: description.trim() || template.description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Populate records
      const seedRecs = createSeedRecords(newApp.id);
      for (const [formKey, recs] of Object.entries(seedRecs)) {
        const fId = formKey.replace(`${newApp.id}_`, "");
        for (const r of recs) {
          await storageService.saveRecord(newApp.id, fId, r);
        }
      }
    } else {
      newApp = {
        id: appId,
        name: appName.trim(),
        linkName: cleanLink,
        description: description.trim(),
        forms: [],
        reports: [],
        pages: [],
        workflows: [],
        relationships: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    await storageService.saveApp(newApp);
    showToast(`Application "${newApp.name}" created!`, "success");
    setCreateModalOpen(false);
    router.push(`/builder/${newApp.linkName}`);
  };

  const handleDeleteConfirm = async () => {
    if (deleteAppId) {
      await storageService.deleteApp(deleteAppId);
      setDeleteAppId(null);
      showToast("Application deleted", "info");
      loadApps();
    }
  };

  const handleResetToSeed = async () => {
    await storageService.resetToSeedData();
    showToast("Re-initialized with Gowtham Test sample application", "success");
    loadApps();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Platform Header (Requirement 3) */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-2xs font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 tracking-tight">YourBuilder</span>
              <span className="block text-[10px] text-slate-400 font-medium -mt-0.5">
                Zoho Creator Low-Code Platform
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-600">
            <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold">
              Applications
            </span>
            <span className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer">
              Templates
            </span>
            <span className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer">
              Platform Settings
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToSeed}
            icon={<RotateCcw className="w-3.5 h-3.5 text-slate-500" />}
          >
            Reload Sample Data
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            + Create Application
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Applications</h1>
            <p className="text-xs text-slate-500 mt-1">
              Select an application to edit in the visual builder, or preview its generated live runtime.
            </p>
          </div>

          <Button
            size="md"
            onClick={() => setCreateModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            + Create Application
          </Button>
        </div>

        {/* Application Cards Grid */}
        {loading ? (
          <div className="py-24 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading your applications...
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border-2 border-dashed border-slate-300 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">No applications found</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Create your first application or reload the sample Gowtham Test workspace to test lookups, subforms, and workflows.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => setCreateModalOpen(true)}>
                + Create Application
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetToSeed}>
                Load Sample Data
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map((app) => (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-3xs hover:border-slate-300 hover:shadow-2xs transition-all flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shadow-3xs">
                        {app.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">{app.name}</h2>
                        <span className="text-[11px] font-mono text-slate-400">/{app.linkName}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setDeleteAppId(app.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50"
                      title="Delete Application"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {app.description || "Dynamic low-code business application."}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1 font-medium">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      {app.forms.length} Forms
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <Table className="w-3.5 h-3.5 text-emerald-500" />
                      {app.reports.length} Reports
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      {app.workflows.length} Workflows
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link href={`/${app.linkName}`} target="_blank" className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      icon={<ExternalLink className="w-3.5 h-3.5 text-slate-500" />}
                    >
                      Open Live App
                    </Button>
                  </Link>

                  <Link href={`/builder/${app.linkName}`} className="flex-1">
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      icon={<Edit className="w-3.5 h-3.5" />}
                    >
                      Open Builder
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Application Modal (Requirement 3) */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Application"
        description="Configure your new application workspace and unique route link."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateApp}>
              Create & Open Builder
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateApp} className="space-y-4">
          <Input
            label="Application Name"
            value={appName}
            required
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Gowtham Test or Sales CRM"
          />

          <Input
            label="Link Name (URL Slug)"
            value={linkName}
            required
            onChange={(e) => {
              setLinkName(toLinkName(e.target.value));
              setLinkNameTouched(true);
            }}
            placeholder="e.g. gowthamtest"
            helperText="Used as the URL route for both builder (/builder/gowthamtest) and live app (/gowthamtest)."
          />

          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this application for?"
          />

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={withSampleData}
                onChange={(e) => setWithSampleData(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Start with sample data (Customers, Products, Orders, Invoices, Subforms & Workflows)
              </span>
            </label>
          </div>

          {formError && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      {/* Delete Application Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deleteAppId)}
        onClose={() => setDeleteAppId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Application"
        message="Are you sure you want to permanently delete this application? All forms, reports, workflows, and records will be deleted."
        isDestructive={true}
      />
    </div>
  );
}
