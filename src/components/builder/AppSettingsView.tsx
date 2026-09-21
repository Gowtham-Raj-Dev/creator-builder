"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { storageService } from "@/lib/storage/firestoreProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select, Toggle, Textarea } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { ShareModal } from "./ShareModal";
import { AppIconPicker } from "@/components/ui/AppIcon";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { computePermissions } from "@/lib/auth/permissions";
import { Settings, Download, Upload, Palette, Layers, Trash2, Share2, LayoutTemplate, Database, Info } from "lucide-react";

const ACCENTS = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#db2777", "#0891b2", "#4f46e5", "#0f172a"];

export const AppSettingsView: React.FC = () => {
  const { currentApp, updateCurrentApp, exportAppJson, importAppJson, saveAsTemplate } = useAppBuilder();
  const { user, isOwner: isPlatformOwner } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [shareOpen, setShareOpen] = useState(false);
  const [tplCat, setTplCat] = useState("General");
  const fileRef = useRef<HTMLInputElement>(null);
  if (!currentApp) return null;
  // builder collaborators can edit everything except delete the app / publish templates (Firestore rules enforce both)
  const isAppOwner = computePermissions(currentApp, user?.email).isOwner;
  const s = currentApp.settings || { theme: "light" as const };
  const setS = (patch: Partial<typeof s>) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), ...patch } }));

  const exportJson = () => {
    const blob = new Blob([exportAppJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${currentApp.linkName}_app.json`; a.click(); URL.revokeObjectURL(url);
    showToast("App schema exported", "success");
  };
  const uploadLogo = async (file: File) => { try { const r = await storageService.uploadFile(currentApp.id, file); setS({ logo: r.url }); } catch { showToast("Logo upload failed (check Storage rules)", "error"); } };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600"><Settings className="w-5 h-5" /></div>
          <div><h1 className="text-base font-bold text-slate-900">Application settings</h1><p className="text-xs text-slate-500">Branding, defaults, governance, portability.</p></div>
        </div>

        <Card title="General">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Application name" value={currentApp.name} onChange={(e) => updateCurrentApp((prev) => ({ ...prev, name: e.target.value }))} />
            <Input label="Link name" value={currentApp.linkName} disabled helperText="Cannot be changed — it is the app's URL." />
            <div className="md:col-span-2"><Textarea label="Description" rows={2} value={currentApp.description || ""} onChange={(e) => updateCurrentApp((prev) => ({ ...prev, description: e.target.value }))} /></div>
            <Input label="Owner email" value={currentApp.ownerEmail || ""} onChange={(e) => updateCurrentApp((prev) => ({ ...prev, ownerEmail: e.target.value.toLowerCase() }))} helperText="Gets builder access to this app (in addition to the platform owner)." />
          </div>
        </Card>

        <Card title="Branding & theme" icon={<Palette className="w-4 h-4 text-purple-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Icon</label><AppIconPicker value={s.icon} onChange={(k) => setS({ icon: k })} accent={s.accentColor || "#2563eb"} /></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Accent colour</label><div className="flex flex-wrap gap-1.5 items-center">{ACCENTS.map((c) => <button key={c} type="button" onClick={() => setS({ accentColor: c })} className={`w-7 h-7 rounded-full border-2 ${s.accentColor === c ? "border-slate-900 scale-110" : "border-white"} shadow`} style={{ background: c }} />)}<input type="color" value={s.accentColor || "#2563eb"} onChange={(e) => setS({ accentColor: e.target.value })} className="w-7 h-7 rounded border border-slate-300 p-0 bg-white" /></div></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-slate-700">Logo</label><div className="flex items-center gap-3">{s.logo ? <img src={s.logo} alt="logo" className="w-10 h-10 rounded-lg object-cover border border-slate-200" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200" />}<input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} icon={<Upload className="w-3.5 h-3.5" />}>Upload</Button>{s.logo && <button type="button" className="text-xs text-rose-600" onClick={() => setS({ logo: undefined })}>Remove</button>}</div></div>
            <Select label="Theme" value={s.theme || "light"} onChange={(e) => setS({ theme: e.target.value as any })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select>
            <Select label="Currency symbol" value={s.currencySymbol || "₹"} onChange={(e) => setS({ currencySymbol: e.target.value })}><option value="₹">₹ Rupee</option><option value="$">$ Dollar</option><option value="€">€ Euro</option><option value="£">£ Pound</option><option value="AED">AED</option></Select>
            <Select label="Date format" value={s.dateFormat || "DD MMM YYYY"} onChange={(e) => setS({ dateFormat: e.target.value })}><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></Select>
          </div>
        </Card>

        <Card title="Governance" icon={<Database className="w-4 h-4 text-emerald-600" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle checked={s.enableTrash !== false} onChange={(v) => setS({ enableTrash: v })} label="Soft delete (trash & restore)" description="Deleted records go to the trash instead of disappearing." />
            <Toggle checked={s.showRecentInSidebar === true} onChange={(v) => setS({ showRecentInSidebar: v })} label="Recent records in sidebar" description="Show the last opened records under the menu (off by default)." />
            <Toggle checked={s.allowMembersAi === true} onChange={(v) => setS({ allowMembersAi: v })} label="Members can use 'Discuss with AI'" description="Shows the AI consultant in the live app for members. Requires app-specific AI keys (AI Assistant → Provider & keys → This app only) — those keys become readable by members of this app." />
            <Toggle checked={s.enableAudit !== false} onChange={(v) => setS({ enableAudit: v })} label="Audit log" description="Track record & schema changes with user and diff." />
            <Toggle checked={s.enableComments !== false} onChange={(v) => setS({ enableComments: v })} label="Comments & @mentions" description="Discussion thread on every record." />
            <Toggle checked={s.showGlobalSearch !== false} onChange={(v) => setS({ showGlobalSearch: v })} label="Global search (Ctrl+K)" />
          </div>
        </Card>

        <Card title="Sharing & access" icon={<Share2 className="w-4 h-4 text-blue-600" />}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <div><div className="font-medium text-slate-800">{currentApp.sharing?.mode === "public_view" ? "Public link — anyone can view" : "Private — members only"}</div><div className="text-slate-500">{currentApp.members.length} member(s), {currentApp.roles.length} designation(s)</div></div>
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} icon={<Share2 className="w-3.5 h-3.5" />}>Manage sharing</Button>
          </div>
        </Card>

        <Card title="Portability" icon={<Layers className="w-4 h-4 text-indigo-600" />}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportJson} icon={<Download className="w-3.5 h-3.5" />}>Export app JSON</Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} icon={<Upload className="w-3.5 h-3.5" />}>Import JSON</Button>
            {isPlatformOwner && <div className="flex items-center gap-1.5 ml-auto"><input value={tplCat} onChange={(e) => setTplCat(e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 w-32" placeholder="Category" /><Button variant="outline" size="sm" onClick={() => saveAsTemplate(tplCat)} icon={<LayoutTemplate className="w-3.5 h-3.5" />}>Save as template</Button></div>}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1"><Info className="w-3 h-3" /> Exports contain schema only (forms, reports, pages, workflows, roles, settings) — not records or members. Duplicate the app from the Applications list to copy everything except data.</p>
        </Card>

        {isAppOwner && (
          <div className="bg-white p-5 rounded-xl border border-rose-200 shadow-3xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Danger zone</h3>
            <p className="text-xs text-slate-500">Permanently delete this application, its records, versions and logs from Firestore.</p>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="w-3.5 h-3.5" />}>Delete application</Button>
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={async () => { await storageService.deleteApp(currentApp.id); showToast("Application deleted", "info"); router.push("/builder"); }} title={`Delete "${currentApp.name}"?`} message="This cannot be undone. All forms, records, versions, audit logs and members will be removed." confirmText="Delete permanently" />
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import app JSON" description="Paste an export. Merge keeps existing items and adds new ones; Replace overwrites the schema (records untouched)." footer={<><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={() => { const r = importAppJson(importText, importMode); if (r.ok) { setImportOpen(false); setImportText(""); } else showToast(r.error || "Import failed", "error"); }}>Import</Button></>}>
        <div className="space-y-3"><Select label="Mode" value={importMode} onChange={(e) => setImportMode(e.target.value as any)}><option value="merge">Merge</option><option value="replace">Replace schema</option></Select><Textarea rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} className="font-mono" placeholder='{"forms":[…]}' /></div>
      </Modal>
      {shareOpen && <ShareModal app={currentApp} onClose={() => setShareOpen(false)} onChange={(next) => updateCurrentApp(() => next, { skipHistory: true })} />}
    </div>
  );
};

const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">{icon}{title}</h3>{children}</div>
);
