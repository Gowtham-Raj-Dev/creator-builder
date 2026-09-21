"use client";

import React, { useState } from "react";
import { FormPermission } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Toggle, Tabs, Badge, EmptyState, Checkbox } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ShareModal } from "./ShareModal";
import { Users, Shield, Plus, Trash2, Copy, UserPlus, Eye, EyeOff, Lock, Check, X, Share2 } from "lucide-react";

const FORM_KEYS: Array<{ key: keyof Omit<FormPermission, "recordScope" | "fieldRules">; label: string }> = [
  { key: "view", label: "View" }, { key: "create", label: "Create" }, { key: "edit", label: "Edit" }, { key: "delete", label: "Delete" }, { key: "print", label: "Print" }, { key: "export", label: "Export" }, { key: "import", label: "Import" },
];

export const UsersRolesView: React.FC = () => {
  const { currentApp, createRole, updateRole, deleteRole, duplicateRole, addMember, updateMember, removeMember, updateCurrentApp } = useAppBuilder();
  const [tab, setTab] = useState("roles");
  const [selectedRole, setSelectedRole] = useState<string | null>(currentApp?.roles[0]?.id || null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [preset, setPreset] = useState<"full" | "view" | "none">("view");
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [fieldRulesForm, setFieldRulesForm] = useState<string | null>(null);

  if (!currentApp) return null;
  const role = currentApp.roles.find((r) => r.id === selectedRole) || null;
  const setForm = (formId: string, patch: Partial<FormPermission>) => role && updateRole(role.id, { forms: { ...role.forms, [formId]: { ...(role.forms[formId] || role.defaultForm || { view: false, create: false, edit: false, delete: false, print: false, export: false, import: false, recordScope: "all" }), ...patch } } });
  const setAllForms = (patch: Partial<FormPermission>) => role && updateRole(role.id, { forms: Object.fromEntries(currentApp.forms.map((f) => [f.id, { ...(role.forms[f.id] || role.defaultForm || { view: false, create: false, edit: false, delete: false, print: false, export: false, import: false, recordScope: "all" }), ...patch }])) });

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-3xs gap-4">
          <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> Users & Roles</h1><p className="text-xs text-slate-500 mt-0.5">Designations control which forms, reports and pages members can see, and what they can do. Only the owner can open the builder.</p></div>
          <div className="flex items-center gap-2"><Tabs active={tab} onChange={setTab} tabs={[{ id: "roles", label: "Designations", icon: <Shield className="w-3.5 h-3.5" />, count: currentApp.roles.length }, { id: "members", label: "Members", icon: <Users className="w-3.5 h-3.5" />, count: currentApp.members.length }]} /><Button variant="outline" size="sm" onClick={() => setShareOpen(true)} icon={<Share2 className="w-3.5 h-3.5" />}>Share link</Button></div>
        </div>

        {tab === "roles" && (
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden self-start">
              <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Designations</span><Button size="xs" onClick={() => setNewRoleOpen(true)} icon={<Plus className="w-3 h-3" />}>New</Button></div>
              <div className="p-2 space-y-0.5">
                {currentApp.roles.map((r) => <button key={r.id} onClick={() => setSelectedRole(r.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${selectedRole === r.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-slate-700 hover:bg-slate-100"}`}><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color || "#2563eb" }} /><span className="flex-1 truncate">{r.name}</span><span className="text-[10px] text-slate-400">{currentApp.members.filter((m) => m.roleId === r.id).length}</span></button>)}
                {currentApp.roles.length === 0 && <p className="text-[11px] text-slate-400 p-3 text-center">No designations yet.</p>}
              </div>
            </div>

            {!role ? <EmptyState icon={<Shield className="w-6 h-6" />} title="Create a designation" description="e.g. Store Manager, Purchase Executive, Accountant, Viewer." action={<Button size="sm" onClick={() => setNewRoleOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>New designation</Button>} /> : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-3 flex-1 items-end">
                      <Input size="sm" label="Designation name" value={role.name} onChange={(e) => updateRole(role.id, { name: e.target.value })} />
                      <Input size="sm" label="Description" value={role.description || ""} onChange={(e) => updateRole(role.id, { description: e.target.value })} placeholder="What this role does" />
                      <input type="color" value={role.color || "#2563eb"} onChange={(e) => updateRole(role.id, { color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-300 p-0.5 bg-white" />
                    </div>
                    <div className="flex items-center gap-1"><IconButton tone="primary" onClick={() => duplicateRole(role.id)} title="Duplicate"><Copy className="w-4 h-4" /></IconButton><IconButton tone="danger" onClick={() => setDeleteRoleId(role.id)} title="Delete"><Trash2 className="w-4 h-4" /></IconButton></div>
                  </div>
                  <Toggle checked={Boolean(role.isAdmin)} onChange={(v) => updateRole(role.id, { isAdmin: v })} label="App administrator" description="Full access to all data in the live app (no builder access). Overrides the matrix below." />
                </div>

                {!role.isAdmin && (
                  <>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs"><span className="font-semibold text-slate-800">Forms</span><div className="flex items-center gap-2 text-[11px]"><button type="button" className="text-blue-600 font-semibold" onClick={() => setAllForms({ view: true, create: true, edit: true, delete: true, print: true, export: true, import: true })}>All</button><button type="button" className="text-slate-500" onClick={() => setAllForms({ view: true, create: false, edit: false, delete: false, print: true, export: false, import: false })}>View only</button><button type="button" className="text-rose-600" onClick={() => setAllForms({ view: false, create: false, edit: false, delete: false, print: false, export: false, import: false })}>None</button></div></div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="text-left px-4 py-2">Form</th>{FORM_KEYS.map((k) => <th key={k.key} className="px-2 py-2 text-center">{k.label}</th>)}<th className="px-2 py-2 text-center">Records</th><th className="px-2 py-2 text-center">Fields</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {currentApp.forms.map((f) => { const p = role.forms[f.id] || role.defaultForm || { view: false, create: false, edit: false, delete: false, print: false, export: false, import: false, recordScope: "all" as const }; const rules = Object.keys(p.fieldRules || {}).length; return (
                              <tr key={f.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 font-medium text-slate-800">{f.name}</td>
                                {FORM_KEYS.map((k) => <td key={k.key} className="px-2 py-2 text-center"><button type="button" onClick={() => setForm(f.id, { [k.key]: !p[k.key] })} className={`w-6 h-6 rounded-md inline-flex items-center justify-center border ${p[k.key] ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-300 text-slate-300"}`}>{p[k.key] ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}</button></td>)}
                                <td className="px-2 py-2 text-center"><select value={p.recordScope} onChange={(e) => setForm(f.id, { recordScope: e.target.value as any })} className="text-[11px] border border-slate-300 rounded px-1.5 py-0.5 bg-white"><option value="all">All records</option><option value="own">Own only</option></select></td>
                                <td className="px-2 py-2 text-center"><button type="button" onClick={() => setFieldRulesForm(f.id)} className={`text-[11px] px-2 py-0.5 rounded-md border ${rules ? "bg-amber-50 border-amber-200 text-amber-800" : "border-slate-200 text-slate-500"}`}>{rules ? `${rules} rule(s)` : "Configure"}</button></td>
                              </tr>); })}
                            {currentApp.forms.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">No forms yet.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-800">Reports</div>
                        <div className="divide-y divide-slate-100">
                          {currentApp.reports.map((r) => { const p = role.reports[r.id] || { view: true, print: true, export: false }; const set = (patch: any) => updateRole(role.id, { reports: { ...role.reports, [r.id]: { ...p, ...patch } } }); return (
                            <div key={r.id} className="px-4 py-2 flex items-center gap-3 text-xs"><span className="flex-1 font-medium text-slate-800 truncate">{r.name}</span><Checkbox checked={p.view} onChange={(v) => set({ view: v })} label="View" /><Checkbox checked={p.print} onChange={(v) => set({ print: v })} label="Print" /><Checkbox checked={p.export} onChange={(v) => set({ export: v })} label="Export" /></div>); })}
                          {currentApp.reports.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">No reports.</div>}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-800">Pages & dashboards</div>
                        <div className="divide-y divide-slate-100">
                          {currentApp.pages.map((p) => { const v = role.pages[p.id]?.view ?? true; return <div key={p.id} className="px-4 py-2 flex items-center justify-between text-xs"><span className="font-medium text-slate-800">{p.name}</span><button type="button" onClick={() => updateRole(role.id, { pages: { ...role.pages, [p.id]: { view: !v } } })} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${v ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>{v ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}{v ? "Visible" : "Hidden"}</button></div>; })}
                          {currentApp.pages.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">No pages.</div>}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "members" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3"><UserPlus className="w-3.5 h-3.5" /> Add member</div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr_auto] gap-2 items-end">
                <Input size="sm" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" />
                <Input size="sm" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Select size="sm" label="Designation" value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">Choose…</option>{currentApp.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
                <Button size="sm" icon={<UserPlus className="w-3.5 h-3.5" />} onClick={() => { const res = addMember(email, roleId, name); if (res.ok) { setEmail(""); setName(""); } else alert(res.error); }}>Add</Button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Members log in with Google or email/password using this exact address. Any other email sees “This email is not configured”.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="text-left px-4 py-2">Member</th><th className="text-left px-4 py-2">Designation</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-left">Added</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {currentApp.members.map((m) => (
                    <tr key={m.email} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5"><div className="font-semibold text-slate-800">{m.name || m.email}</div>{m.name && <div className="text-[11px] text-slate-400">{m.email}</div>}</td>
                      <td className="px-4 py-2.5"><select value={m.roleId} onChange={(e) => updateMember(m.email, { roleId: e.target.value })} className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white">{currentApp.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
                      <td className="px-4 py-2.5 text-center"><button type="button" onClick={() => updateMember(m.email, { status: m.status === "active" ? "disabled" : "active" })}><Badge variant={m.status === "active" ? "success" : "default"} dot>{m.status}</Badge></button></td>
                      <td className="px-4 py-2.5 text-slate-500">{new Date(m.addedAt).toLocaleDateString()}{m.lastLoginAt && <span className="block text-[10px] text-slate-400">last login {new Date(m.lastLoginAt).toLocaleDateString()}</span>}</td>
                      <td className="px-4 py-2.5 text-right"><IconButton tone="danger" onClick={() => removeMember(m.email)}><Trash2 className="w-4 h-4" /></IconButton></td>
                    </tr>
                  ))}
                  {currentApp.members.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No members yet. Only <span className="font-semibold">{currentApp.ownerEmail}</span> can open this app.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={newRoleOpen} onClose={() => setNewRoleOpen(false)} title="New designation" footer={<><Button variant="outline" onClick={() => setNewRoleOpen(false)}>Cancel</Button><Button disabled={!newRoleName.trim()} onClick={() => { const r = createRole(newRoleName.trim(), preset); setSelectedRole(r.id); setNewRoleOpen(false); setNewRoleName(""); }}>Create</Button></>}>
        <div className="space-y-3">
          <Input label="Name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Store Manager" autoFocus />
          <Select label="Starting permissions" value={preset} onChange={(e) => setPreset(e.target.value as any)}><option value="view">View only (all forms & reports)</option><option value="full">Full access (create/edit/delete)</option><option value="none">Nothing (configure manually)</option></Select>
        </div>
      </Modal>
      <ConfirmDialog isOpen={Boolean(deleteRoleId)} onClose={() => setDeleteRoleId(null)} onConfirm={() => { if (deleteRoleId) { deleteRole(deleteRoleId); setSelectedRole(null); } }} title="Delete designation" message="Members must be reassigned first." />
      {shareOpen && <ShareModal app={currentApp} onClose={() => setShareOpen(false)} onChange={(next) => updateCurrentApp(() => next, { skipHistory: true })} />}
      {fieldRulesForm && role && (() => { const f = currentApp.forms.find((x) => x.id === fieldRulesForm)!; const p = role.forms[f.id] || role.defaultForm!; const rules = p?.fieldRules || {}; return (
        <Modal isOpen onClose={() => setFieldRulesForm(null)} title={`Field rules · ${f.name} · ${role.name}`} description="Hide sensitive fields or make them read-only for this designation." maxWidth="lg" icon={<Lock className="w-4 h-4" />} footer={<Button onClick={() => setFieldRulesForm(null)}>Done</Button>}>
          <div className="divide-y divide-slate-100">
            {f.fields.filter((x) => x.type !== "section").map((fld) => { const r = rules[fld.id]; return (
              <div key={fld.id} className="py-2 flex items-center justify-between text-xs"><span className="font-medium text-slate-800">{fld.label} <span className="text-slate-400 font-normal">({fld.type})</span></span><div className="inline-flex bg-slate-100 rounded-lg p-0.5">{[["", "Normal"], ["readonly", "Read only"], ["hidden", "Hidden"]].map(([v, l]) => <button key={v} type="button" onClick={() => { const next = { ...rules }; if (v) next[fld.id] = v as any; else delete next[fld.id]; setForm(f.id, { fieldRules: next }); }} className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${(r || "") === v ? "bg-white shadow-3xs text-blue-700" : "text-slate-500"}`}>{l}</button>)}</div></div>); })}
          </div>
        </Modal>); })()}
    </div>
  );
};
