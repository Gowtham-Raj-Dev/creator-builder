"use client";

import React, { useState } from "react";
import { AppDefinition, AppMember, AppCollaborator } from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Badge } from "@/components/ui/FormControls";
import { getShareUrl, getBuilderUrl } from "@/lib/utils/routes";
import { createDefaultRole, computePermissions } from "@/lib/auth/permissions";
import { Share2, Copy, Check, Globe, Lock, UserPlus, Trash2, Mail, QrCode, Wrench } from "lucide-react";

/**
 * Share an app: copy the live link, toggle public/private, add members with a designation.
 * Works standalone (app list) — persists directly to Firestore.
 */
export const ShareModal: React.FC<{ app: AppDefinition; onClose: () => void; onChange?: (app: AppDefinition) => void }> = ({ app: initial, onClose, onChange }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [app, setApp] = useState<AppDefinition>(initial);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(initial.roles[0]?.id || "");
  const [builderEmail, setBuilderEmail] = useState("");
  const [builderName, setBuilderName] = useState("");
  const [busy, setBusy] = useState(false);
  const url = getShareUrl(app.linkName);
  // Only the app owner (or platform owner) may hand out builder access — Firestore rules enforce the same.
  const isAppOwner = computePermissions(app, user?.email).isOwner;
  const builders = app.builders || [];

  const persist = async (next: AppDefinition) => {
    setBusy(true);
    try {
      await storageService.saveApp(next);
      setApp(next);
      onChange?.(next);
    } catch (err) {
      console.error(err);
      showToast("Failed to save sharing settings", "error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  const addMember = async () => {
    const lower = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return showToast("Enter a valid email", "error");
    if (app.members.some((m) => m.email === lower)) return showToast("Already a member", "warning");
    let roles = app.roles;
    let rid = roleId;
    if (!rid) {
      const r = createDefaultRole("Staff", app, "view");
      roles = [...roles, r];
      rid = r.id;
      setRoleId(rid);
    }
    const member: AppMember = { email: lower, name: name.trim() || undefined, roleId: rid, status: "active", addedAt: new Date().toISOString(), addedBy: user?.email };
    const next = { ...app, roles, members: [...app.members, member], memberEmails: Array.from(new Set([...app.memberEmails, lower])) };
    await persist(next);
    if (user) storageService.addAudit({ appId: app.id, type: "member", action: "added", entityType: "member", entityId: lower, entityName: lower, user: user.email, userName: user.name });
    storageService.addNotification({ appId: app.id, toEmail: lower, title: `You were added to ${app.name}`, body: `${user?.name || "The owner"} gave you access as ${roles.find((r) => r.id === rid)?.name}.`, link: url });
    setEmail(""); setName("");
    showToast(`${lower} added`, "success");
  };

  const removeMember = async (m: string) => {
    const members = app.members.filter((x) => x.email !== m);
    await persist({ ...app, members, memberEmails: members.filter((x) => x.status !== "disabled").map((x) => x.email) });
  };

  const setMemberRole = async (m: string, rid: string) => persist({ ...app, members: app.members.map((x) => (x.email === m ? { ...x, roleId: rid } : x)) });
  const toggleStatus = async (m: string) => {
    const members = app.members.map((x) => (x.email === m ? { ...x, status: (x.status === "active" ? "disabled" : "active") as AppMember["status"] } : x));
    await persist({ ...app, members, memberEmails: members.filter((x) => x.status !== "disabled").map((x) => x.email) });
  };

  const addBuilder = async () => {
    const lower = builderEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return showToast("Enter a valid email", "error");
    if (lower === (app.ownerEmail || user?.email || "").toLowerCase()) return showToast("That email already owns this app", "warning");
    if (builders.some((b) => b.email === lower)) return showToast("Already has builder access", "warning");
    const collaborator: AppCollaborator = { email: lower, name: builderName.trim() || undefined, addedAt: new Date().toISOString(), addedBy: user?.email };
    const nextBuilders = [...builders, collaborator];
    await persist({ ...app, builders: nextBuilders, builderEmails: nextBuilders.map((b) => b.email) });
    if (user) storageService.addAudit({ appId: app.id, type: "member", action: "builder_added", entityType: "builder", entityId: lower, entityName: lower, user: user.email, userName: user.name });
    const builderUrl = typeof window !== "undefined" ? `${window.location.origin}${getBuilderUrl(app.linkName)}` : getBuilderUrl(app.linkName);
    storageService.addNotification({ appId: app.id, toEmail: lower, title: `You can now edit ${app.name} in the builder`, body: `${user?.name || "The owner"} gave you builder access. Open the builder to edit forms, reports, workflows and publish.`, link: builderUrl });
    setBuilderEmail(""); setBuilderName("");
    showToast(`${lower} can now open the builder`, "success");
  };

  const removeBuilder = async (email: string) => {
    const nextBuilders = builders.filter((b) => b.email !== email);
    await persist({ ...app, builders: nextBuilders, builderEmails: nextBuilders.map((b) => b.email) });
    if (user) storageService.addAudit({ appId: app.id, type: "member", action: "builder_removed", entityType: "builder", entityId: email, entityName: email, user: user.email, userName: user.name });
    showToast("Builder access removed", "info");
  };

  const mailto = `mailto:?subject=${encodeURIComponent(`Access to ${app.name}`)}&body=${encodeURIComponent(`Open the app here: ${url}\n\nSign in with the email address that was given access.`)}`;

  return (
    <Modal isOpen onClose={onClose} title={`Share "${app.name}"`} description="Members sign in with Google or email/password using the address you add here. Only configured emails can log in." maxWidth="2xl" icon={<Share2 className="w-4 h-4" />} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        {/* Link */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">App link</div>
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-700" onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="sm" onClick={copy} icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}>{copied ? "Copied" : "Copy"}</Button>
            <a href={mailto} className="inline-flex"><Button variant="outline" size="sm" icon={<Mail className="w-3.5 h-3.5" />}>Email</Button></a>
            <a href={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="inline-flex"><Button variant="outline" size="sm" icon={<QrCode className="w-3.5 h-3.5" />}>QR</Button></a>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => persist({ ...app, sharing: { ...(app.sharing || { mode: "private" }), mode: "private" } })} className={`flex-1 text-left p-3 rounded-xl border text-xs ${app.sharing?.mode !== "public_view" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><div className="font-semibold flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private</div><div className="text-[11px] text-slate-500 mt-0.5">Only members listed below can open the app.</div></button>
            <button type="button" onClick={() => persist({ ...app, sharing: { ...(app.sharing || { mode: "private" }), mode: "public_view", defaultRoleId: app.sharing?.defaultRoleId || app.roles[0]?.id } })} className={`flex-1 text-left p-3 rounded-xl border text-xs ${app.sharing?.mode === "public_view" ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}><div className="font-semibold flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Public link</div><div className="text-[11px] text-slate-500 mt-0.5">Anyone with the link can view (read-only). Requires the public rule in firestore.rules.</div></button>
          </div>
          {app.sharing?.mode === "public_view" && (
            <Select size="sm" label="Permissions for public viewers" value={app.sharing.defaultRoleId || ""} onChange={(e) => persist({ ...app, sharing: { ...app.sharing!, defaultRoleId: e.target.value } })}><option value="">View everything (read-only)</option>{app.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          )}
        </div>

        {/* Add member */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Add member</div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr_auto] gap-2 items-end">
            <Input size="sm" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" onKeyDown={(e) => e.key === "Enter" && addMember()} />
            <Input size="sm" label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi" />
            <Select size="sm" label="Designation / role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{app.roles.length === 0 && <option value="">Staff (auto-create)</option>}{app.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Button size="sm" onClick={addMember} loading={busy} icon={<UserPlus className="w-3.5 h-3.5" />}>Add</Button>
          </div>
          <p className="text-[11px] text-slate-400">Fine-tune what each designation can see/edit under Builder → Users & Roles.</p>
        </div>

        {/* Builder access */}
        {isAppOwner && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> Builder access</div>
            <p className="text-[11px] text-slate-500">People listed here can open <span className="font-semibold">this app</span> in the builder — edit forms, reports, workflows, pages, members and publish. They cannot delete the app, change its owner or manage this list.</p>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_auto] gap-2 items-end">
              <Input size="sm" label="Email" type="email" value={builderEmail} onChange={(e) => setBuilderEmail(e.target.value)} placeholder="developer@company.com" onKeyDown={(e) => e.key === "Enter" && addBuilder()} />
              <Input size="sm" label="Name (optional)" value={builderName} onChange={(e) => setBuilderName(e.target.value)} placeholder="Priya" />
              <Button size="sm" variant="outline" onClick={addBuilder} loading={busy} icon={<Wrench className="w-3.5 h-3.5" />}>Give builder access</Button>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between"><span>Builders ({builders.length})</span><span className="font-normal normal-case">Owner: {app.ownerEmail || user?.email}</span></div>
              <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {builders.length === 0 && <div className="px-4 py-4 text-center text-xs text-slate-400">No builder collaborators. Only the owner can edit this app.</div>}
                {builders.map((b) => (
                  <div key={b.email} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                    <div className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">{(b.name || b.email).charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><div className="font-semibold text-slate-800 truncate">{b.name || b.email}</div>{b.name && <div className="text-[11px] text-slate-400 truncate">{b.email}</div>}</div>
                    <Badge variant="purple">Builder</Badge>
                    <IconButton tone="danger" size="sm" onClick={() => removeBuilder(b.email)} title="Remove builder access"><Trash2 className="w-3.5 h-3.5" /></IconButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Members list */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between"><span>Members ({app.members.length})</span><span className="font-normal normal-case">Owner: {app.ownerEmail || user?.email}</span></div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {app.members.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">No members yet. Only you can open this app.</div>}
            {app.members.map((m) => (
              <div key={m.email} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-[11px] shrink-0">{(m.name || m.email).charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><div className="font-semibold text-slate-800 truncate">{m.name || m.email}</div>{m.name && <div className="text-[11px] text-slate-400 truncate">{m.email}</div>}</div>
                <select value={m.roleId} onChange={(e) => setMemberRole(m.email, e.target.value)} className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white">{app.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                <button type="button" onClick={() => toggleStatus(m.email)}><Badge variant={m.status === "active" ? "success" : "default"} dot>{m.status}</Badge></button>
                <IconButton tone="danger" size="sm" onClick={() => removeMember(m.email)} title="Remove"><Trash2 className="w-3.5 h-3.5" /></IconButton>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
