"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useRouter } from "next/navigation";
import { AppDefinition, CURRENT_APP_SCHEMA_VERSION } from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { useAuth } from "@/context/AuthContext";
import { AuthGate } from "@/components/auth/AuthGate";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea, Toggle, Tabs, Badge } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { ShareModal } from "@/components/builder/ShareModal";
import { AppIcon, AppIconPicker } from "@/components/ui/AppIcon";
import { toLinkName, isValidLinkName } from "@/lib/utils/linkName";
import { generateId } from "@/lib/utils/idGenerator";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";
import { useToast } from "@/context/ToastContext";
import { createDefaultRole, computePermissions } from "@/lib/auth/permissions";
import { Layers, Plus, ExternalLink, Edit, Trash2, Table, Zap, FileText, Share2, Copy, MoreHorizontal, LogOut, Search, Upload, LayoutTemplate, Sparkles, Users, Globe, Lock, Grid2X2, Home, BookOpen, Wrench } from "lucide-react";

/** short unique suffix for duplicated app link names (event-time, not render-time) */
const copySuffix = () => Date.now().toString(36).slice(-4);

const ACCENTS = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#db2777", "#0891b2", "#4f46e5", "#0f172a"];

function BuilderHome() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, signOut, isOwner } = useAuth();
  const [apps, setApps] = useState<AppDefinition[]>([]);
  const [templates, setTemplates] = useState<AppDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [shareApp, setShareApp] = useState<AppDefinition | null>(null);
  const [deleteApp, setDeleteApp] = useState<AppDefinition | null>(null);

  const loadApps = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [list, tpls] = await Promise.all([storageService.getApps(user.email, isOwner), isOwner ? storageService.listTemplates() : Promise.resolve([])]);
      // Builder collaborators only see the apps they were given builder access to (members-only apps stay in /app)
      setApps(isOwner ? list : list.filter((a) => computePermissions(a, user.email).canEditBuilder));
      setTemplates(tpls);
    } catch (err) {
      console.error(err);
      showToast("Failed to load applications from Firestore", "error");
    } finally {
      setLoading(false);
    }
  }, [user, isOwner, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; loadApps flips the loading flag before awaiting Firestore
  useEffect(() => { loadApps(); }, [loadApps]);

  const duplicate = async (app: AppDefinition) => {
    const copy: AppDefinition = { ...JSON.parse(JSON.stringify(app)), id: generateId("app"), name: `${app.name} Copy`, linkName: `${app.linkName}_copy_${copySuffix()}`, ownerEmail: user?.email, members: [], memberEmails: [], builders: [], builderEmails: [], publishedVersion: undefined, publishedAt: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await storageService.saveApp(copy);
    showToast(`Duplicated as "${copy.name}"`, "success");
    loadApps();
  };

  const filtered = apps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.linkName.includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={34} />
            <div><span className="text-sm font-bold text-slate-900 tracking-tight">YourBuilder</span><span className="block text-[10px] text-slate-400 font-medium -mt-0.5">Low-code platform · {isOwner ? "Owner console" : "Builder console"}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100"><Home className="w-3.5 h-3.5" /> Home</Link>
          <Link href="/docs" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100"><BookOpen className="w-3.5 h-3.5" /> Docs</Link>
          <Link href="/app" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100"><Grid2X2 className="w-3.5 h-3.5" /> My apps</Link>
          {isOwner && <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="w-4 h-4" />}>Create Application</Button>}
          <Dropdown align="right" trigger={<button className="w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">{user?.name.charAt(0).toUpperCase()}</button>} items={[{ id: "u", label: user?.name || "", description: user?.email, disabled: true }, { id: "d", label: "", divider: true }, { id: "out", label: "Sign out", icon: <LogOut className="w-3.5 h-3.5" />, danger: true, onClick: async () => { await signOut(); router.push("/login"); } }]} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Applications</h1>
            <p className="text-xs text-slate-500 mt-1">{isOwner ? "Every app is built from scratch in the builder and stored in Firestore. Share each app with members by designation." : "Applications you have builder access to. Ask the app owner for access to more."}</p>
          </div>
          <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps…" className="w-56 text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25" /></div>
        </div>

        {loading ? (
          <div className="py-24 text-center text-slate-400 text-xs"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />Loading your applications…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white p-14 rounded-2xl border-2 border-dashed border-slate-300 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto"><Layers className="w-7 h-7" /></div>
            <div><h2 className="text-base font-semibold text-slate-800">{apps.length === 0 ? "No applications yet" : "No matches"}</h2><p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{isOwner ? "Create your first application — forms, reports, workflows and dashboards are all designed in the builder." : "No app owner has given you builder access yet."}</p></div>
            {isOwner && <Button size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>Create Application</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((app) => {
              const appOwner = computePermissions(app, user?.email).isOwner;
              return (
              <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-3xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-2xs shrink-0" style={{ background: app.settings?.accentColor || "#2563eb" }}><AppIcon icon={app.settings?.icon} name={app.name} size={20} /></div>
                      <div className="min-w-0"><h2 className="text-sm font-bold text-slate-900 truncate">{app.name}</h2><span className="text-[11px] font-mono text-slate-400">/{app.linkName}</span></div>
                    </div>
                    <Dropdown align="right" trigger={<IconButton><MoreHorizontal className="w-4 h-4" /></IconButton>} items={[
                      { id: "share", label: "Share & members", icon: <Share2 className="w-3.5 h-3.5" />, onClick: () => setShareApp(app) },
                      // creating apps / templates / deleting stay with the platform owner (Firestore rules enforce this too)
                      ...(isOwner ? [
                        { id: "dup", label: "Duplicate app", icon: <Copy className="w-3.5 h-3.5" />, onClick: () => duplicate(app) },
                        { id: "tpl", label: "Save as template", icon: <LayoutTemplate className="w-3.5 h-3.5" />, onClick: async () => { await storageService.saveTemplate(app); showToast("Saved to template gallery", "success"); loadApps(); } },
                      ] : []),
                      ...(appOwner ? [
                        { id: "d", label: "", divider: true },
                        { id: "del", label: "Delete app", icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: () => setDeleteApp(app) },
                      ] : []),
                    ]} />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">{app.description || "No description."}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1 font-medium"><FileText className="w-3.5 h-3.5 text-blue-500" />{app.forms.length} forms</span>
                    <span className="flex items-center gap-1 font-medium"><Table className="w-3.5 h-3.5 text-emerald-500" />{app.reports.length} reports</span>
                    <span className="flex items-center gap-1 font-medium"><Zap className="w-3.5 h-3.5 text-amber-500" />{app.workflows.length} workflows</span>
                    <span className="flex items-center gap-1 font-medium"><Users className="w-3.5 h-3.5 text-purple-500" />{app.members.length}</span>
                    {(app.builders?.length || 0) > 0 && <span className="flex items-center gap-1 font-medium" title="Builder collaborators"><Wrench className="w-3.5 h-3.5 text-violet-500" />{app.builders!.length}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {app.sharing?.mode === "public_view" ? <Badge variant="warning" dot><Globe className="w-3 h-3" /> Public link</Badge> : <Badge variant="default"><Lock className="w-3 h-3" /> Private</Badge>}
                    {app.publishedVersion ? <Badge variant="success">Published v{app.publishedVersion}</Badge> : <Badge variant="warning">Draft</Badge>}
                    {!appOwner && <Badge variant="purple"><Wrench className="w-3 h-3" /> Builder access</Badge>}
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                  <Link href={getLiveAppUrl(app.linkName)} target="_blank" className="flex-1"><Button variant="outline" size="sm" className="w-full" icon={<ExternalLink className="w-3.5 h-3.5 text-slate-500" />}>Live App</Button></Link>
                  <Button variant="outline" size="sm" onClick={() => setShareApp(app)} icon={<Share2 className="w-3.5 h-3.5 text-slate-500" />}>Share</Button>
                  <Link href={getBuilderUrl(app.linkName)} className="flex-1"><Button variant="primary" size="sm" className="w-full" icon={<Edit className="w-3.5 h-3.5" />}>Builder</Button></Link>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>

      {createOpen && <CreateAppModal apps={apps} templates={templates} onClose={() => setCreateOpen(false)} onCreated={(app) => { setCreateOpen(false); router.push(getBuilderUrl(app.linkName)); }} />}
      {shareApp && <ShareModal app={shareApp} onClose={() => { setShareApp(null); loadApps(); }} />}
      <ConfirmDialog isOpen={Boolean(deleteApp)} onClose={() => setDeleteApp(null)} onConfirm={async () => { if (deleteApp) { await storageService.deleteApp(deleteApp.id); showToast("Application deleted", "info"); loadApps(); } }} title={`Delete "${deleteApp?.name}"?`} message="All forms, reports, workflows, records, versions and audit logs of this application will be permanently deleted from Firestore. This cannot be undone." confirmText="Delete permanently" isDestructive />
    </div>
  );
}

const CreateAppModal: React.FC<{ apps: AppDefinition[]; templates: AppDefinition[]; onClose: () => void; onCreated: (app: AppDefinition) => void }> = ({ apps, templates, onClose, onCreated }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState("blank");
  const [name, setName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("building");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [currency, setCurrency] = useState("₹");
  const [dateFormat, setDateFormat] = useState("DD MMM YYYY");
  const [columns, setColumns] = useState<1 | 2 | 3>(2);
  const [sharingMode, setSharingMode] = useState<"private" | "public_view">("private");
  const [defaultRole, setDefaultRole] = useState(true);
  const [enableTrash, setEnableTrash] = useState(true);
  const [enableAudit, setEnableAudit] = useState(true);
  const [enableComments, setEnableComments] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError("");
    if (!name.trim()) return setError("Application name is required");
    const clean = toLinkName(linkName || name);
    if (!clean || !isValidLinkName(clean)) return setError("Link name may only contain lowercase letters, numbers and underscores.");
    if (apps.some((a) => a.linkName === clean)) return setError(`Link name "${clean}" is already used.`);
    setBusy(true);
    try {
      const now = new Date().toISOString();
      let base: Partial<AppDefinition> = {};
      if (tab === "template" || tab === "duplicate") {
        const src = (tab === "template" ? templates : apps).find((a) => a.id === sourceId);
        if (!src) { setError("Choose a source"); setBusy(false); return; }
        const rest = JSON.parse(JSON.stringify(src));
        for (const k of ["id", "name", "linkName", "members", "memberEmails", "builders", "builderEmails", "ownerEmail", "publishedVersion", "createdAt", "isTemplate"]) delete rest[k];
        base = rest;
      } else if (tab === "import") {
        try { const parsed = JSON.parse(importJson); if (!Array.isArray(parsed.forms)) throw new Error("no forms"); base = { forms: parsed.forms, reports: parsed.reports || [], pages: parsed.pages || [], workflows: parsed.workflows || [], relationships: parsed.relationships || [], roles: parsed.roles || [], settings: parsed.settings }; }
        catch { setError("Invalid app JSON (expects a YourBuilder export)."); setBusy(false); return; }
      }
      const app: AppDefinition = {
        id: generateId("app"),
        name: name.trim(),
        linkName: clean,
        description: description.trim(),
        ownerEmail: user?.email,
        roles: base.roles || [],
        members: [],
        memberEmails: [],
        builders: [],
        builderEmails: [],
        sharing: { mode: sharingMode, shareToken: generateId("tok") },
        forms: base.forms || [],
        reports: base.reports || [],
        pages: base.pages || [],
        workflows: base.workflows || [],
        relationships: base.relationships || [],
        schemaVersion: CURRENT_APP_SCHEMA_VERSION,
        settings: { ...(base.settings || {}), theme, accentColor: accent, icon, currencySymbol: currency, dateFormat, showGlobalSearch: true, enableTrash, enableAudit, enableComments, compactMode: false, defaultFormColumns: columns } as any,
        createdAt: now,
        updatedAt: now,
      };
      if (defaultRole && app.roles.length === 0) app.roles = [createDefaultRole("Staff", app, "view"), createDefaultRole("Manager", app, "full")];
      if (sharingMode === "public_view") app.sharing!.defaultRoleId = app.roles[0]?.id;
      await storageService.saveApp(app);
      if (user) storageService.addAudit({ appId: app.id, type: "schema", action: "created", entityType: "app", entityId: app.id, entityName: app.name, user: user.email, userName: user.name });
      showToast(`Application "${app.name}" created`, "success");
      onCreated(app);
    } catch (err) {
      console.error(err);
      setError("Failed to create app. Check Firestore rules / connectivity.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Create new application" description="Set up the workspace, branding and defaults. Everything can be changed later in Settings." maxWidth="3xl" icon={<Sparkles className="w-4 h-4" />}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy}>Create & open builder</Button></>}>
      <div className="space-y-5">
        <Tabs active={tab} onChange={setTab} tabs={[{ id: "blank", label: "Blank", icon: <Plus className="w-3.5 h-3.5" /> }, { id: "template", label: "From template", icon: <LayoutTemplate className="w-3.5 h-3.5" />, count: templates.length }, { id: "duplicate", label: "Duplicate app", icon: <Copy className="w-3.5 h-3.5" /> }, { id: "import", label: "Import JSON", icon: <Upload className="w-3.5 h-3.5" /> }]} />

        {tab === "template" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {templates.length === 0 && <p className="col-span-full text-xs text-slate-400 p-4 text-center border border-dashed rounded-lg">No templates yet. Save any app as a template from its menu.</p>}
            {templates.map((t) => <button key={t.id} type="button" onClick={() => setSourceId(t.id)} className={`text-left p-3 rounded-lg border text-xs ${sourceId === t.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><div className="font-semibold text-slate-900">{t.name}</div><div className="text-[11px] text-slate-500">{t.templateCategory} · {t.forms.length} forms</div></button>)}
          </div>
        )}
        {tab === "duplicate" && <Select label="Source application" value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">Choose…</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        {tab === "import" && <Textarea label="App export JSON" rows={5} value={importJson} onChange={(e) => setImportJson(e.target.value)} placeholder='{"forms":[…],"reports":[…]}' helperText="Paste the JSON exported from Settings → Export. Records are not included." />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Application name" required value={name} onChange={(e) => { setName(e.target.value); if (!touched) setLinkName(toLinkName(e.target.value)); }} placeholder="e.g. Sweet Purchase Tracker" />
          <Input label="Link name (URL)" required value={linkName} onChange={(e) => { setLinkName(toLinkName(e.target.value)); setTouched(true); }} placeholder="sweet_purchase" helperText={`Live URL: /app?app=${linkName || "…"}`} />
          <div className="md:col-span-2"><Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this application for?" /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Icon</label>
            <AppIconPicker value={icon} onChange={setIcon} accent={accent} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Accent colour</label>
            <div className="flex flex-wrap gap-1.5 items-center">{ACCENTS.map((c) => <button key={c} type="button" onClick={() => setAccent(c)} className={`w-7 h-7 rounded-full border-2 ${accent === c ? "border-slate-900 scale-110" : "border-white"} shadow`} style={{ background: c }} />)}<input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-7 h-7 rounded border border-slate-300 p-0 bg-white cursor-pointer" /></div>
          </div>
          <Select label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as any)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select>
          <Select label="Currency symbol" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="₹">₹ Indian Rupee</option><option value="$">$ Dollar</option><option value="€">€ Euro</option><option value="£">£ Pound</option><option value="AED">AED Dirham</option></Select>
          <Select label="Date format" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></Select>
          <Select label="Default form layout" value={columns} onChange={(e) => setColumns(Number(e.target.value) as 1 | 2 | 3)}><option value={1}>1 column</option><option value={2}>2 columns</option><option value={3}>3 columns</option></Select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Access & governance</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select label="Sharing" value={sharingMode} onChange={(e) => setSharingMode(e.target.value as any)}><option value="private">Private — members only</option><option value="public_view">Public link — anyone can view (read-only)</option></Select>
            <div className="space-y-2 pt-5">
              <Toggle size="sm" checked={defaultRole} onChange={setDefaultRole} label="Create starter roles (Staff, Manager)" />
              <Toggle size="sm" checked={enableTrash} onChange={setEnableTrash} label="Soft delete (trash & restore)" />
              <Toggle size="sm" checked={enableAudit} onChange={setEnableAudit} label="Audit log" />
              <Toggle size="sm" checked={enableComments} onChange={setEnableComments} label="Record comments & @mentions" />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">{error}</p>}
      </div>
    </Modal>
  );
};

export default function BuilderHomePage() {
  return (
    <AuthGate ownerOnly>
      <BuilderHome />
    </AuthGate>
  );
}
