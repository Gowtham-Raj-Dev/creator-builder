"use client";

import React, { useState } from "react";
import { NavItem } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Select, Toggle } from "@/components/ui/FormControls";
import { generateId } from "@/lib/utils/idGenerator";
import { Menu, Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw, Home, FolderTree } from "lucide-react";
import { getMenuSections, defaultSectionFor } from "@/lib/utils/menu";
import { Icon, IconPicker } from "@/components/ui/IconPicker";
import { MenuSection } from "@/types/schema";
import { Modal } from "@/components/ui/Modal";

/** Custom menu builder: sections, forms/reports/pages, external links, ordering & visibility. */
export const NavigationView: React.FC = () => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const [iconFor, setIconFor] = useState<string | null>(null);
  if (!currentApp) return null;
  const nav = currentApp.settings?.navigation || [];
  const setNav = (navigation: NavItem[]) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), navigation } }));
  const sections = getMenuSections(currentApp);
  const setSections = (menuSections: MenuSection[]) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), menuSections } }));
  const assign = (kind: "form" | "report" | "page", id: string, sectionId: string | undefined) => updateCurrentApp((prev) => ({ ...prev, forms: kind === "form" ? prev.forms.map((f) => (f.id === id ? { ...f, menuSectionId: sectionId } : f)) : prev.forms, reports: kind === "report" ? prev.reports.map((r) => (r.id === id ? { ...r, menuSectionId: sectionId } : r)) : prev.reports, pages: kind === "page" ? prev.pages.map((x) => (x.id === id ? { ...x, menuSectionId: sectionId } : x)) : prev.pages }));
  const setHome = (homePageId: string) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), homePageId: homePageId || undefined } }));

  const autoGenerate = () => {
    const items: NavItem[] = [];
    if (currentApp.pages.length) items.push({ id: generateId("nav"), type: "section", label: "Dashboards", children: currentApp.pages.map((p) => ({ id: generateId("nav"), type: "page", refId: p.id })) });
    if (currentApp.forms.length) items.push({ id: generateId("nav"), type: "section", label: "Modules", children: currentApp.forms.map((f) => ({ id: generateId("nav"), type: "form", refId: f.id })) });
    const extra = currentApp.reports.filter((r) => r.reportType === "ledger" || !currentApp.forms.some((f) => currentApp.reports.find((x) => x.sourceFormId === f.id && x.reportType !== "ledger")?.id === r.id));
    if (extra.length) items.push({ id: generateId("nav"), type: "section", label: "Reports", children: extra.map((r) => ({ id: generateId("nav"), type: "report", refId: r.id })) });
    setNav(items);
  };

  const labelOf = (it: NavItem) => it.label || (it.type === "form" ? currentApp.forms.find((f) => f.id === it.refId)?.name : it.type === "report" ? currentApp.reports.find((r) => r.id === it.refId)?.name : it.type === "page" ? currentApp.pages.find((p) => p.id === it.refId)?.name : it.url) || "(untitled)";
  const updateItem = (id: string, patch: Partial<NavItem>) => { const walk = (items: NavItem[]): NavItem[] => items.map((it) => (it.id === id ? { ...it, ...patch } : it.children ? { ...it, children: walk(it.children) } : it)); setNav(walk(nav)); };
  const removeItem = (id: string) => { const walk = (items: NavItem[]): NavItem[] => items.filter((it) => it.id !== id).map((it) => (it.children ? { ...it, children: walk(it.children) } : it)); setNav(walk(nav)); };
  const moveItem = (list: NavItem[], i: number, d: -1 | 1, parentId?: string) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; if (!parentId) setNav(n); else updateItem(parentId, { children: n }); };
  const addChild = (parentId: string | undefined, type: NavItem["type"]) => {
    const refId = type === "form" ? currentApp.forms[0]?.id : type === "report" ? currentApp.reports[0]?.id : type === "page" ? currentApp.pages[0]?.id : undefined;
    const item: NavItem = { id: generateId("nav"), type, refId, label: type === "section" ? "New section" : type === "link" ? "External link" : undefined, url: type === "link" ? "https://" : undefined, children: type === "section" ? [] : undefined };
    if (!parentId) setNav([...nav, item]); else { const parent = nav.find((x) => x.id === parentId); if (parent) updateItem(parentId, { children: [...(parent.children || []), item] }); }
  };

  const renderItem = (it: NavItem, i: number, list: NavItem[], parentId?: string) => (
    <div key={it.id} className={`rounded-lg border ${it.type === "section" ? "border-slate-300 bg-slate-50/70" : "border-slate-200 bg-white"} p-2.5 space-y-2`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[10px] uppercase font-bold text-slate-400 w-14">{it.type}</span>
        {it.type === "section" || it.type === "link" ? <input value={it.label || ""} onChange={(e) => updateItem(it.id, { label: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 font-medium" placeholder="Label" /> : (
          <><select value={it.refId || ""} onChange={(e) => updateItem(it.id, { refId: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 bg-white">{(it.type === "form" ? currentApp.forms : it.type === "report" ? currentApp.reports : currentApp.pages).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><input value={it.label || ""} onChange={(e) => updateItem(it.id, { label: e.target.value || undefined })} placeholder={`Label (default: ${labelOf({ ...it, label: undefined })})`} className="flex-1 border border-slate-300 rounded px-2 py-1" /></>
        )}
        {it.type === "link" && <input value={it.url || ""} onChange={(e) => updateItem(it.id, { url: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 font-mono" placeholder="https://" />}
        <IconButton size="sm" onClick={() => updateItem(it.id, { hidden: !it.hidden })} title="Toggle visibility">{it.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-emerald-600" />}</IconButton>
        <IconButton size="sm" onClick={() => moveItem(list, i, -1, parentId)}><ChevronUp className="w-3.5 h-3.5" /></IconButton>
        <IconButton size="sm" onClick={() => moveItem(list, i, 1, parentId)}><ChevronDown className="w-3.5 h-3.5" /></IconButton>
        <IconButton size="sm" tone="danger" onClick={() => removeItem(it.id)}><Trash2 className="w-3.5 h-3.5" /></IconButton>
      </div>
      {it.type === "section" && (
        <div className="pl-4 space-y-2">
          {(it.children || []).map((c, ci) => renderItem(c, ci, it.children || [], it.id))}
          <div className="flex gap-1.5">{(["form", "report", "page", "link"] as const).map((t) => <button key={t} type="button" onClick={() => addChild(it.id, t)} className="text-[11px] px-2 py-1 rounded border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600">+ {t}</button>)}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-3">
          <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Menu className="w-5 h-5 text-blue-600" /> Menu & navigation</h1><p className="text-xs text-slate-500 mt-0.5">Control the live app sidebar: sections, order, labels, hidden items. Sections below drive the automatic menu; the custom builder further down overrides it entirely.</p></div>
          <div className="flex gap-2">{nav.length > 0 && <Button variant="outline" size="sm" onClick={() => setNav([])} icon={<RotateCcw className="w-3.5 h-3.5" />}>Use automatic</Button>}<Button size="sm" onClick={autoGenerate} icon={<Plus className="w-3.5 h-3.5" />}>Generate from app</Button></div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs grid grid-cols-2 gap-3">
          <Select label="Home page (landing)" value={currentApp.settings?.homePageId || ""} onChange={(e) => setHome(e.target.value)}><option value="">Auto (first page / first form)</option>{currentApp.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <div className="pt-5 space-y-2"><Toggle size="sm" checked={currentApp.settings?.showGlobalSearch !== false} onChange={(v) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), showGlobalSearch: v } }))} label="Global search (Ctrl+K)" /><Toggle size="sm" checked={Boolean(currentApp.settings?.compactMode)} onChange={(v) => updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), compactMode: v } }))} label="Compact spacing" /></div>
        </div>
        {/* Menu sections: rename / reorder / add, and assign every form, report and page */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between"><span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5"><FolderTree className="w-4 h-4 text-blue-600" /> Menu sections (automatic menu)</span><Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => setSections([...sections, { id: generateId("sec"), label: "New section", icon: "folder" }])}>Add section</Button></div>
          <div className="divide-y divide-slate-100">
            {sections.map((sec, i) => {
              const members = [
                ...currentApp.pages.filter((p) => (p.menuSectionId || "pages") === sec.id).map((p) => ({ kind: "page" as const, id: p.id, name: p.name, icon: p.icon, fb: "dashboard" })),
                ...currentApp.forms.filter((f) => (f.menuSectionId || "forms") === sec.id).map((f) => ({ kind: "form" as const, id: f.id, name: f.name, icon: f.icon, fb: "file" })),
                ...currentApp.reports.filter((r) => r.showInMenu !== false && (r.menuSectionId || defaultSectionFor("report", currentApp, r.id)) === sec.id && !(r.menuSectionId === undefined && defaultSectionFor("report", currentApp, r.id) === "forms")).map((r) => ({ kind: "report" as const, id: r.id, name: r.name, icon: r.icon, fb: "table" })),
              ];
              return (
                <div key={sec.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIconFor(sec.id)} className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:border-blue-400" title="Change icon"><Icon name={sec.icon} fallback="folder" /></button>
                    <input value={sec.label} onChange={(e) => setSections(sections.map((x) => (x.id === sec.id ? { ...x, label: e.target.value } : x)))} className="flex-1 text-xs font-semibold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5" />
                    <span className="text-[10px] text-slate-400">{members.length} item(s)</span>
                    <IconButton size="sm" disabled={i === 0} onClick={() => { const n = [...sections]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSections(n); }}><ChevronUp className="w-3.5 h-3.5" /></IconButton>
                    <IconButton size="sm" disabled={i === sections.length - 1} onClick={() => { const n = [...sections]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSections(n); }}><ChevronDown className="w-3.5 h-3.5" /></IconButton>
                    {!["pages", "forms", "reports"].includes(sec.id) && <IconButton size="sm" tone="danger" onClick={() => { setSections(sections.filter((x) => x.id !== sec.id)); }} title="Remove (items fall back to defaults)"><Trash2 className="w-3.5 h-3.5" /></IconButton>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {members.map((m) => (
                      <span key={`${m.kind}_${m.id}`} className="inline-flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-full pl-2 pr-1 py-0.5 text-slate-700">
                        <Icon name={m.icon} fallback={m.fb} className="w-3 h-3 text-slate-400" />{m.name}<span className="text-[9px] uppercase text-slate-400">{m.kind}</span>
                        <select value={sec.id} onChange={(e) => assign(m.kind, m.id, e.target.value)} className="text-[10px] border border-slate-200 rounded-full px-1 py-0.5 bg-white" title="Move to section">{sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                      </span>
                    ))}
                    {members.length === 0 && <span className="text-[11px] text-slate-400">Empty — assign items using the dropdown on any item, or from the form/report/page settings.</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {iconFor && <Modal isOpen onClose={() => setIconFor(null)} title="Section icon" maxWidth="md" footer={<Button onClick={() => setIconFor(null)}>Done</Button>}><IconPicker value={sections.find((x) => x.id === iconFor)?.icon} onChange={(k) => setSections(sections.map((x) => (x.id === iconFor ? { ...x, icon: k } : x)))} accent={currentApp.settings?.accentColor} /></Modal>}

        {nav.length === 0 ? (
          <div className="bg-white p-10 rounded-xl border-2 border-dashed border-slate-300 text-center text-xs text-slate-500"><Home className="w-6 h-6 mx-auto mb-2 text-slate-300" />Automatic menu is active: Dashboards → Modules → Reports, filtered by each member&apos;s designation.<br />Click <strong>Generate from app</strong> to customise.</div>
        ) : (
          <div className="space-y-2">
            {nav.map((it, i) => renderItem(it, i, nav))}
            <div className="flex gap-1.5">{(["section", "form", "report", "page", "link"] as const).map((t) => <button key={t} type="button" onClick={() => addChild(undefined, t)} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600">+ {t}</button>)}</div>
          </div>
        )}
        <p className="text-[11px] text-slate-400">Items a member cannot access (by designation) are hidden automatically even when listed here.</p>
      </div>
    </div>
  );
};
