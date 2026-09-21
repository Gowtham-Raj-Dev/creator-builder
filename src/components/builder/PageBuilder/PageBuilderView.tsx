"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PageComponent, PageComponentType } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Textarea, Toggle, EmptyState, Badge } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SimpleFilterList } from "@/components/runtime/report/FilterBuilder";
import { generateId } from "@/lib/utils/idGenerator";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { DATE_PRESETS } from "@/lib/engine/reportEngine";
import { DEFAULT_FILTER_PRESETS } from "@/lib/engine/pageEngine";
import { REPORT_TYPES } from "@/lib/engine/reportTypes";
import { LayoutTemplate, Plus, Trash2, Copy, ExternalLink, Heading, Type, FileText, BarChart3, Gauge, TableProperties, FormInput, Minus, Filter, Link2, Image as ImageIcon, MousePointerClick, Code, ChevronUp, ChevronDown, Home, X } from "lucide-react";

const WIDGETS: Array<{ type: PageComponentType; label: string; icon: React.ReactNode; width: number; props: Record<string, any> }> = [
  { type: "heading", label: "Heading", icon: <Heading className="w-4 h-4" />, width: 12, props: { title: "Dashboard", subtitle: "" } },
  { type: "stat_card", label: "KPI cards", icon: <Gauge className="w-4 h-4" />, width: 12, props: { stats: [] } },
  { type: "chart", label: "Chart", icon: <BarChart3 className="w-4 h-4" />, width: 6, props: { chartType: "bar", metric: "count" } },
  { type: "report_embed", label: "Report", icon: <TableProperties className="w-4 h-4" />, width: 12, props: { pageSize: 8 } },
  { type: "form_embed", label: "Form", icon: <FormInput className="w-4 h-4" />, width: 6, props: {} },
  { type: "filter_panel", label: "Date filter", icon: <Filter className="w-4 h-4" />, width: 12, props: { label: "Date range" } },
  { type: "quick_links", label: "Quick links", icon: <Link2 className="w-4 h-4" />, width: 12, props: { links: [] } },
  { type: "markdown", label: "Markdown", icon: <FileText className="w-4 h-4" />, width: 6, props: { content: "## Notes\n- Use **markdown** here" } },
  { type: "text", label: "Text", icon: <Type className="w-4 h-4" />, width: 6, props: { content: "" } },
  { type: "button", label: "Button", icon: <MousePointerClick className="w-4 h-4" />, width: 3, props: { label: "New record", action: "new" } },
  { type: "image", label: "Image", icon: <ImageIcon className="w-4 h-4" />, width: 6, props: { src: "" } },
  { type: "iframe", label: "Embed (iframe)", icon: <Code className="w-4 h-4" />, width: 12, props: { src: "", height: 400 } },
  { type: "divider", label: "Divider", icon: <Minus className="w-4 h-4" />, width: 12, props: {} },
];

export const PageBuilderView: React.FC<{ pageLinkName?: string }> = ({ pageLinkName }) => {
  const { currentApp, createPage, updatePage, deletePage, duplicatePage } = useAppBuilder();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedComp, setSelectedComp] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (!currentApp) return; if (pageLinkName) { const p = currentApp.pages.find((x) => x.linkName === pageLinkName); if (p) { setSelectedId(p.id); return; } } if (!selectedId || !currentApp.pages.some((p) => p.id === selectedId)) setSelectedId(currentApp.pages[0]?.id || null); }, [currentApp, pageLinkName, selectedId]);

  if (!currentApp) return null;
  const page = currentApp.pages.find((p) => p.id === selectedId) || null;
  const comp = page?.components.find((c) => c.id === selectedComp) || null;
  const setComps = (components: PageComponent[]) => page && updatePage(page.id, { components });
  const upComp = (id: string, patch: Partial<PageComponent>) => page && setComps(page.components.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const upProps = (id: string, props: Record<string, any>) => { const c = page?.components.find((x) => x.id === id); if (c) upComp(id, { props: { ...c.props, ...props } }); };
  const addWidget = (w: (typeof WIDGETS)[number]) => { if (!page) return; const c: PageComponent = { id: generateId("comp"), type: w.type, width: w.width, props: JSON.parse(JSON.stringify(w.props)) }; setComps([...page.components, c]); setSelectedComp(c.id); };
  const move = (i: number, d: -1 | 1) => { if (!page) return; const n = [...page.components]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setComps(n); };

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0">
      <div className="w-60 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pages ({currentApp.pages.length})</span><Button size="xs" onClick={() => setCreateOpen(true)} icon={<Plus className="w-3 h-3" />}>New</Button></div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {currentApp.pages.map((p) => <button key={p.id} onClick={() => { setSelectedId(p.id); setSelectedComp(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${selectedId === p.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-slate-700 hover:bg-slate-100"}`}><LayoutTemplate className="w-3.5 h-3.5 text-slate-400" /><span className="truncate flex-1">{p.name}</span>{p.isHome && <Home className="w-3 h-3 text-amber-500" />}</button>)}
          {currentApp.pages.length === 0 && <p className="text-[11px] text-slate-400 p-3 text-center">No pages yet.</p>}
        </div>
        {page && (
          <div className="border-t border-slate-100 p-2.5 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">Add widget</div>
            <div className="grid grid-cols-2 gap-1">{WIDGETS.map((w) => <button key={w.type} onClick={() => addWidget(w)} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-md"><span className="text-slate-400">{w.icon}</span>{w.label}</button>)}</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-100/60 p-6">
        {!page ? <EmptyState icon={<LayoutTemplate className="w-6 h-6" />} title="Select or create a page" description="Dashboards are grids of widgets: KPI cards, charts, reports, forms, links." action={<Button size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>New page</Button>} /> : (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Input size="sm" value={page.name} onChange={(e) => updatePage(page.id, { name: e.target.value })} className="font-semibold" />
                <Toggle size="sm" checked={Boolean(page.isHome)} onChange={(v) => updatePage(page.id, { isHome: v })} label="Home page" />
              </div>
              <div className="flex items-center gap-1"><Link href={getLiveAppUrl(currentApp.linkName, { page: page.linkName })} target="_blank"><Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>Open live</Button></Link><IconButton tone="primary" onClick={() => duplicatePage(page.id)}><Copy className="w-4 h-4" /></IconButton><IconButton tone="danger" onClick={() => setDeleteId(page.id)}><Trash2 className="w-4 h-4" /></IconButton></div>
            </div>

            <div className="grid grid-cols-12 gap-3">
              {page.components.map((c, i) => {
                const w = WIDGETS.find((x) => x.type === c.type);
                const sel = selectedComp === c.id;
                return (
                  <div key={c.id} style={{ gridColumn: `span ${Math.max(1, Math.min(12, c.width || 12))} / span ${Math.max(1, Math.min(12, c.width || 12))}` }} onClick={() => setSelectedComp(c.id)} className={`group relative bg-white rounded-xl border p-3 cursor-pointer min-h-[72px] min-w-0 overflow-hidden ${sel ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 min-w-0"><span className="text-slate-400 shrink-0">{w?.icon}</span><span className="truncate">{w?.label}</span><Badge size="sm">{c.width || 12}/12</Badge></span>
                      {/* actions wrap under the title on narrow widgets instead of spilling out of the card */}
                      <div className={`flex items-center ml-auto shrink-0 ${sel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                        <IconButton size="sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ChevronUp className="w-3.5 h-3.5" /></IconButton><IconButton size="sm" disabled={i === page.components.length - 1} onClick={() => move(i, 1)} title="Move down"><ChevronDown className="w-3.5 h-3.5" /></IconButton>
                        <IconButton size="sm" tone="primary" onClick={() => setComps([...page.components.slice(0, i + 1), { ...JSON.parse(JSON.stringify(c)), id: generateId("comp") }, ...page.components.slice(i + 1)])} title="Duplicate"><Copy className="w-3.5 h-3.5" /></IconButton>
                        <IconButton size="sm" tone="danger" onClick={() => { setComps(page.components.filter((x) => x.id !== c.id)); if (selectedComp === c.id) setSelectedComp(null); }} title="Remove"><Trash2 className="w-3.5 h-3.5" /></IconButton>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">{summarize(c, currentApp)}</div>
                  </div>
                );
              })}
              {page.components.length === 0 && <div className="col-span-12 text-center text-xs text-slate-400 py-12 border-2 border-dashed border-slate-300 rounded-xl bg-white">Add widgets from the left panel.</div>}
            </div>
          </div>
        )}
      </div>

      {/* widget properties */}
      <div className="w-[340px] border-l border-slate-200 bg-white h-full overflow-y-auto shrink-0">
        {!comp || !page ? (
          <div className="p-6 text-center text-slate-400 text-xs mt-10"><LayoutTemplate className="w-8 h-8 mx-auto mb-2 text-slate-300" />Select a widget to configure it.</div>
        ) : (
          <div className="p-4 space-y-4 text-xs">
            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">{WIDGETS.find((w) => w.type === comp.type)?.label}</span><IconButton onClick={() => setSelectedComp(null)}><X className="w-4 h-4" /></IconButton></div>
            <div className="space-y-1.5"><label className="font-medium text-slate-700">Width (1–12 columns)</label><input type="range" min={1} max={12} value={comp.width || 12} onChange={(e) => upComp(comp.id, { width: parseInt(e.target.value) })} className="w-full" /><div className="flex gap-1">{[3, 4, 6, 8, 12].map((n) => <button key={n} type="button" onClick={() => upComp(comp.id, { width: n })} className={`px-2 py-0.5 rounded border text-[10px] ${comp.width === n ? "bg-blue-600 text-white border-blue-600" : "border-slate-300"}`}>{n}</button>)}</div></div>
            <WidgetProps comp={comp} app={currentApp} upProps={(p) => upProps(comp.id, p)} />
          </div>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New page" footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!newName.trim()} onClick={() => { const p = createPage(newName.trim()); setSelectedId(p.id); setCreateOpen(false); setNewName(""); }}>Create</Button></>}>
        <Input label="Page name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dashboard, Purchase Overview" autoFocus />
      </Modal>
      <ConfirmDialog isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) { deletePage(deleteId); setSelectedId(null); } }} title="Delete page" message="Remove this page and all its widgets?" />
    </div>
  );
};

function summarize(c: PageComponent, app: any): string {
  const p = c.props || {};
  const form = app.forms.find((f: any) => f.id === p.formId)?.name;
  switch (c.type) {
    case "heading": return p.title || "(no title)";
    case "stat_card": return `${(p.stats || []).length} KPI(s)`;
    case "chart": return `${p.chartType} · ${form || "no form"} · by ${app.forms.find((f: any) => f.id === p.formId)?.fields.find((x: any) => x.id === p.groupByFieldId)?.label || p.groupByFieldId || "?"}`;
    case "report_embed": return app.reports.find((r: any) => r.id === p.reportId)?.name || "no report";
    case "form_embed": return form || "no form";
    case "quick_links": return `${(p.links || []).length} link(s)`;
    case "markdown": case "text": return (p.content || "").slice(0, 60);
    case "button": return p.label;
    default: return "";
  }
}

const WidgetProps: React.FC<{ comp: PageComponent; app: any; upProps: (p: Record<string, any>) => void }> = ({ comp, app, upProps }) => {
  const p = comp.props || {};
  const form = app.forms.find((f: any) => f.id === p.formId);
  const fieldsOf = (fid: string, types?: string[]) => (app.forms.find((f: any) => f.id === fid)?.fields || []).filter((f: any) => f.type !== "section" && f.type !== "subform" && (!types || types.includes(f.type) || (f.type === "formula" && types.includes("number") && f.formula?.resultType === "number")));
  const numeric = ["number", "currency", "decimal", "percentage", "rollup", "rating", "formula"];

  switch (comp.type) {
    case "heading": return <><Input size="sm" label="Title" value={p.title || ""} onChange={(e) => upProps({ title: e.target.value })} /><Input size="sm" label="Subtitle" value={p.subtitle || ""} onChange={(e) => upProps({ subtitle: e.target.value })} helperText="Supports {{form.count}} / {{form.sum(field)}}" /><Toggle size="sm" checked={Boolean(p.plain)} onChange={(v) => upProps({ plain: v })} label="No card background" /><Select size="sm" label="Action button → form" value={p.buttonFormId || ""} onChange={(e) => upProps({ buttonFormId: e.target.value || undefined })}><option value="">None</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>{p.buttonFormId && <Input size="sm" label="Button label" value={p.buttonLabel || ""} onChange={(e) => upProps({ buttonLabel: e.target.value })} />}</>;
    case "text": case "markdown": return <Textarea label="Content" rows={8} value={p.content || ""} onChange={(e) => upProps({ content: e.target.value })} helperText="Use {{form.count}} or {{form.sum(field)}} for live numbers." />;
    case "image": return <><Input size="sm" label="Image URL" value={p.src || ""} onChange={(e) => upProps({ src: e.target.value })} /><Input size="sm" label="Max height (px)" type="number" value={p.height || 260} onChange={(e) => upProps({ height: parseInt(e.target.value) || 260 })} /></>;
    case "iframe": return <><Input size="sm" label="URL" value={p.src || ""} onChange={(e) => upProps({ src: e.target.value })} /><Input size="sm" label="Height (px)" type="number" value={p.height || 400} onChange={(e) => upProps({ height: parseInt(e.target.value) || 400 })} /></>;
    case "divider": return <Input size="sm" label="Label (optional)" value={p.label || ""} onChange={(e) => upProps({ label: e.target.value })} />;
    case "filter_panel": {
      const presets: string[] = Array.isArray(p.presets) && p.presets.length ? p.presets : DEFAULT_FILTER_PRESETS;
      const usedForms: any[] = app.forms.filter((f: any) => f.fields.some((x: any) => x.type === "date" || x.type === "datetime"));
      return (
        <>
          <Input size="sm" label="Label" value={p.label || ""} onChange={(e) => upProps({ label: e.target.value })} />
          <Select size="sm" label="Style" value={p.style || "chips"} onChange={(e) => upProps({ style: e.target.value })}><option value="chips">Quick buttons</option><option value="dropdown">Dropdown</option></Select>
          <div className="space-y-1"><label className="font-medium text-slate-700">Quick ranges to show</label><div className="flex flex-wrap gap-1">{DATE_PRESETS.map((d) => { const on = presets.includes(d.id); return <button key={d.id} type="button" onClick={() => upProps({ presets: on ? presets.filter((x) => x !== d.id) : [...presets, d.id] })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{d.label}</button>; })}</div></div>
          <Select size="sm" label="Default range when the page opens" value={p.defaultPreset || ""} onChange={(e) => upProps({ defaultPreset: e.target.value || undefined })}><option value="">All time</option>{DATE_PRESETS.filter((d) => presets.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
          <Toggle size="sm" checked={p.showCustom !== false} onChange={(v) => upProps({ showCustom: v })} label="Allow custom from–to dates" />
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="font-medium text-slate-700">Date field per form</label>
            <p className="text-[11px] text-slate-500">Which date the range applies to (e.g. Sales Invoice → Invoice Date). Blank = first date field.</p>
            {usedForms.map((f: any) => <Select key={f.id} size="sm" label={f.name} value={p.dateFields?.[f.id] || ""} onChange={(e) => upProps({ dateFields: { ...(p.dateFields || {}), [f.id]: e.target.value || undefined } })}><option value="">Auto</option>{f.fields.filter((x: any) => x.type === "date" || x.type === "datetime").map((x: any) => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="createdAt">Created at</option></Select>)}
          </div>
          <p className="text-[11px] text-slate-500">Applies to every KPI, chart and report widget on this page. KPI comparisons then compare with the previous period of the same length.</p>
        </>
      );
    }
    case "button": return <><Input size="sm" label="Label" value={p.label || ""} onChange={(e) => upProps({ label: e.target.value })} /><Select size="sm" label="Open form" value={p.formId || ""} onChange={(e) => upProps({ formId: e.target.value || undefined, reportId: undefined, pageId: undefined })}><option value="">—</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>{p.formId && <Select size="sm" label="Action" value={p.action || "new"} onChange={(e) => upProps({ action: e.target.value })}><option value="new">New record</option><option value="list">List</option></Select>}<Select size="sm" label="…or report" value={p.reportId || ""} onChange={(e) => upProps({ reportId: e.target.value || undefined, formId: undefined })}><option value="">—</option>{app.reports.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select><Select size="sm" label="…or page" value={p.pageId || ""} onChange={(e) => upProps({ pageId: e.target.value || undefined })}><option value="">—</option>{app.pages.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select><Input size="sm" label="…or external URL" value={p.url || ""} onChange={(e) => upProps({ url: e.target.value })} /><Select size="sm" label="Style" value={p.variant || "primary"} onChange={(e) => upProps({ variant: e.target.value })}><option value="primary">Primary</option><option value="outline">Outline</option></Select></>;
    case "quick_links": return <div className="space-y-2">{(p.links || []).map((l: any, i: number) => <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-1.5"><Input size="sm" value={l.label || ""} onChange={(e) => upProps({ links: p.links.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" /><Select size="sm" value={l.formId || ""} onChange={(e) => upProps({ links: p.links.map((x: any, j: number) => (j === i ? { ...x, formId: e.target.value } : x)) })}><option value="">Form…</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select><div className="flex items-center justify-between"><Select size="sm" value={l.action || "new"} onChange={(e) => upProps({ links: p.links.map((x: any, j: number) => (j === i ? { ...x, action: e.target.value } : x)) })}><option value="new">New record</option><option value="list">Open list</option></Select><IconButton size="sm" tone="danger" onClick={() => upProps({ links: p.links.filter((_: any, j: number) => j !== i) })}><Trash2 className="w-3.5 h-3.5" /></IconButton></div></div>)}<Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => upProps({ links: [...(p.links || []), { label: "New", action: "new" }] })}>Add link</Button></div>;
    case "report_embed": return <><Select size="sm" label="Report" value={p.reportId || ""} onChange={(e) => upProps({ reportId: e.target.value })}><option value="">Choose…</option>{app.reports.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select><Select size="sm" label="View" value={p.view || ""} onChange={(e) => upProps({ view: e.target.value || undefined })}><option value="">Report default</option>{REPORT_TYPES.filter((t) => t.id !== "ledger").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select><Input size="sm" label="Rows" type="number" value={p.pageSize || 8} onChange={(e) => upProps({ pageSize: parseInt(e.target.value) || 8 })} /><Toggle size="sm" checked={!p.ignoreDateFilter} onChange={(v) => upProps({ ignoreDateFilter: !v })} label="Follow the page date filter" /></>;
    case "form_embed": return <><Select size="sm" label="Form" value={p.formId || ""} onChange={(e) => upProps({ formId: e.target.value })}><option value="">Choose…</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select><Toggle size="sm" checked={Boolean(p.hideHeader)} onChange={(v) => upProps({ hideHeader: v })} label="Hide form header" /></>;
    case "chart": return (
      <>
        <Select size="sm" label="Chart type" value={p.chartType || "bar"} onChange={(e) => upProps({ chartType: e.target.value })}>{["bar", "column", "stacked", "line", "area", "pie", "donut", "funnel", "gauge"].map((t) => <option key={t}>{t}</option>)}</Select>
        <Input size="sm" label="Title" value={p.title || ""} onChange={(e) => upProps({ title: e.target.value })} />
        <Select size="sm" label="Form" value={p.formId || ""} onChange={(e) => upProps({ formId: e.target.value, groupByFieldId: "", measureFieldId: undefined, seriesFieldId: undefined })}><option value="">Choose…</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        {form && <>
          <Select size="sm" label="Group by (X axis)" value={p.groupByFieldId || ""} onChange={(e) => upProps({ groupByFieldId: e.target.value })}><option value="createdAt">Created date</option>{fieldsOf(p.formId).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
          {(p.groupByFieldId === "createdAt" || fieldsOf(p.formId, ["date", "datetime"]).some((f: any) => f.id === p.groupByFieldId)) && <Select size="sm" label="Date bucket" value={p.dateBucket || "month"} onChange={(e) => upProps({ dateBucket: e.target.value })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option></Select>}
          <div className="grid grid-cols-2 gap-2"><Select size="sm" label="Metric" value={p.metric || "count"} onChange={(e) => upProps({ metric: e.target.value })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Average</option><option value="min">Min</option><option value="max">Max</option></Select>{p.metric && p.metric !== "count" && <Select size="sm" label="Of field" value={p.measureFieldId || ""} onChange={(e) => upProps({ measureFieldId: e.target.value })}><option value="">Choose…</option>{fieldsOf(p.formId, numeric).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}</div>
          {["stacked", "line", "area", "column", "bar"].includes(p.chartType) && <Select size="sm" label="Split into series by" value={p.seriesFieldId || ""} onChange={(e) => upProps({ seriesFieldId: e.target.value || undefined })}><option value="">Single series</option>{fieldsOf(p.formId, ["dropdown", "radio", "lookup", "checkbox", "users"]).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
          {p.chartType === "gauge" && <><Input size="sm" label="Target (max)" type="number" value={p.gaugeMax || ""} onChange={(e) => upProps({ gaugeMax: parseFloat(e.target.value) })} /><Input size="sm" label="Label" value={p.gaugeLabel || ""} onChange={(e) => upProps({ gaugeLabel: e.target.value })} /></>}
          <div className="grid grid-cols-2 gap-2"><Input size="sm" label="Top N (rest → Other)" type="number" value={p.limit || ""} onChange={(e) => upProps({ limit: e.target.value ? parseInt(e.target.value) : undefined })} /><Select size="sm" label="Sort" value={p.sort || "value"} onChange={(e) => upProps({ sort: e.target.value })}><option value="value">By value</option><option value="label">By label</option></Select></div>
          <div className="space-y-1"><label className="font-medium text-slate-700">Filter records</label><SimpleFilterList form={form} filters={p.filters || []} onChange={(f) => upProps({ filters: f })} /></div>
          <Toggle size="sm" checked={p.drilldown !== false} onChange={(v) => upProps({ drilldown: v })} label="Click → open report filtered" />
        </>}
      </>
    );
    case "stat_card": return (
      <div className="space-y-2">
        {(p.stats || []).map((s: any, i: number) => { const sf = app.forms.find((f: any) => f.id === s.metric?.formId); const setStat = (patch: any) => upProps({ stats: p.stats.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) }); const setMetric = (patch: any) => setStat({ metric: { ...(s.metric || { aggregate: "count" }), ...patch } }); return (
          <div key={i} className="rounded-lg border border-slate-200 p-2.5 space-y-1.5 bg-slate-50/60">
            <div className="flex items-center gap-1"><Input size="sm" value={s.label || ""} onChange={(e) => setStat({ label: e.target.value })} placeholder="Label" /><IconButton size="sm" tone="danger" onClick={() => upProps({ stats: p.stats.filter((_: any, j: number) => j !== i) })}><Trash2 className="w-3.5 h-3.5" /></IconButton></div>
            <Select size="sm" value={s.metric?.formId || ""} onChange={(e) => setMetric({ formId: e.target.value, fieldId: undefined })}><option value="">Form…</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            {sf && <>
              <div className="grid grid-cols-2 gap-1"><Select size="sm" value={s.metric?.aggregate || "count"} onChange={(e) => setMetric({ aggregate: e.target.value })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Avg</option><option value="min">Min</option><option value="max">Max</option></Select>{s.metric?.aggregate !== "count" && <Select size="sm" value={s.metric?.fieldId || ""} onChange={(e) => setMetric({ fieldId: e.target.value })}><option value="">Field…</option>{fieldsOf(sf.id, numeric).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}</div>
              <SimpleFilterList form={sf} filters={s.metric?.filters || []} onChange={(f) => setMetric({ filters: f })} />
              <div className="grid grid-cols-2 gap-1"><Select size="sm" value={s.metric?.compare || "none"} onChange={(e) => setMetric({ compare: e.target.value })}><option value="none">No comparison</option><option value="last_month">vs last month</option><option value="last_year">vs last year</option></Select><Select size="sm" value={s.metric?.dateFieldId || ""} onChange={(e) => setMetric({ dateFieldId: e.target.value || undefined })}><option value="">Date: auto</option>{fieldsOf(sf.id, ["date", "datetime"]).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select></div>
              <div className="grid grid-cols-3 gap-1"><Input size="sm" value={s.prefix || ""} onChange={(e) => setStat({ prefix: e.target.value })} placeholder="₹ prefix" /><Input size="sm" value={s.suffix || ""} onChange={(e) => setStat({ suffix: e.target.value })} placeholder="suffix" /><input type="color" value={s.color || "#2a78d6"} onChange={(e) => setStat({ color: e.target.value })} className="w-full h-8 rounded border border-slate-300 bg-white" /></div>
              <Toggle size="sm" checked={Boolean(s.compact)} onChange={(v) => setStat({ compact: v })} label="Compact (1.2 L, 3.4 Cr)" />
            </>}
          </div>); })}
        <Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => upProps({ stats: [...(p.stats || []), { label: "Total records", metric: { formId: app.forms[0]?.id || "", aggregate: "count", compare: "none" } }] })}>Add KPI</Button>
      </div>
    );
    default: return null;
  }
};
