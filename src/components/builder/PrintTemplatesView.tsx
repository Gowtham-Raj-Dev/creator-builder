"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PrintTemplate, PrintBlock, PrintDesign, RecordDefinition, FormDefinition } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Toggle, EmptyState, Badge } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { generateId } from "@/lib/utils/idGenerator";
import { buildPrintDocument, defaultDesign, renderDesign, NEW_BLOCK } from "@/lib/engine/printEngine";
import { generatePrintDesign, mapHtmlToPlaceholders } from "@/lib/ai/generators";
import { hasActiveKey, setActiveAiApp } from "@/lib/ai/claude";
import { Printer, Plus, Trash2, Copy, Sparkles, Eye, Code, Star, FileText, Wand2, ChevronUp, ChevronDown, LayoutTemplate, Table, Columns2, Sigma, Type, StickyNote, PenLine, AlignEndHorizontal, Minus, MoveVertical, Heading, Upload, Palette } from "lucide-react";

const BLOCK_META: Record<PrintBlock["type"], { label: string; icon: React.ReactNode; desc: string }> = {
  header: { label: "Header", icon: <Heading className="w-3.5 h-3.5" />, desc: "Logo, company name, document title, number & date" },
  twoColumns: { label: "Two columns", icon: <Columns2 className="w-3.5 h-3.5" />, desc: "Bill to / details side by side" },
  fields: { label: "Fields", icon: <LayoutTemplate className="w-3.5 h-3.5" />, desc: "Chosen fields in a 1–3 column grid or table" },
  items: { label: "Items table", icon: <Table className="w-3.5 h-3.5" />, desc: "Subform rows with totals" },
  totals: { label: "Totals", icon: <Sigma className="w-3.5 h-3.5" />, desc: "Subtotal, tax, grand total, amount in words" },
  text: { label: "Text", icon: <Type className="w-3.5 h-3.5" />, desc: "Free text / HTML" },
  notes: { label: "Notes / terms", icon: <StickyNote className="w-3.5 h-3.5" />, desc: "A field or fixed terms" },
  signature: { label: "Signatures", icon: <PenLine className="w-3.5 h-3.5" />, desc: "Signature lines" },
  footer: { label: "Footer", icon: <AlignEndHorizontal className="w-3.5 h-3.5" />, desc: "Closing line, printed by" },
  divider: { label: "Divider", icon: <Minus className="w-3.5 h-3.5" />, desc: "Horizontal line" },
  spacer: { label: "Spacer", icon: <MoveVertical className="w-3.5 h-3.5" />, desc: "Vertical gap" },
};
const PRINTABLE_TYPES = new Set(["text", "textarea", "richtext", "email", "phone", "url", "number", "decimal", "currency", "percentage", "date", "datetime", "time", "checkbox", "dropdown", "radio", "multiselect", "lookup", "autonumber", "formula", "rollup", "rating", "address", "geolocation", "barcode", "users", "color"]);

const FieldChips: React.FC<{ form: FormDefinition; selected: string[]; onChange: (ids: string[]) => void }> = ({ form, selected, onChange }) => (
  <div className="flex flex-wrap gap-1">{form.fields.filter((f) => PRINTABLE_TYPES.has(f.type)).map((f) => { const on = selected.includes(f.id); return <button key={f.id} type="button" onClick={() => onChange(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])} className={`px-2 py-0.5 rounded-full text-[10px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 text-slate-700"}`}>{f.label}</button>; })}</div>
);

/**
 * Print designer: a block-based visual builder (header, fields, items table, totals, notes, signature…)
 * that always shows the real print with a real record. Each form can have several designs; the one
 * marked default is what users get from the Print button. AI can draft a design or map your own HTML.
 */
export const PrintTemplatesView: React.FC = () => {
  const { currentApp, updateCurrentApp, loadRecords } = useAppBuilder();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState("");
  const [selBlock, setSelBlock] = useState<string | null>(null);
  const [modeOverride, setModeOverride] = useState<Record<string, "design" | "code">>({});
  const [sample, setSample] = useState<RecordDefinition | null>(null);
  const [sampleList, setSampleList] = useState<RecordDefinition[]>([]);
  const [lookupRecords, setLookupRecords] = useState<Record<string, RecordDefinition[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newForm, setNewForm] = useState("");
  const [newKind, setNewKind] = useState<"document" | "blank" | "ai" | "import">("document");
  const [newPrompt, setNewPrompt] = useState("");
  const [newHtml, setNewHtml] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState<"improve" | "import" | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiHtml, setAiHtml] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);

  const templates = useMemo(() => currentApp?.printTemplates || [], [currentApp]);
  const tpl = templates.find((t) => t.id === selectedId) || null;
  const form = tpl ? currentApp?.forms.find((f) => f.id === tpl.formId) : undefined;

  useEffect(() => { if (currentApp) { setActiveAiApp(currentApp.id); hasActiveKey().then(setHasKey).catch(() => setHasKey(false)); } }, [currentApp?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!selectedId && templates.length) setSelectedId(templates[0].id); }, [templates, selectedId]);
  useEffect(() => { setSelBlock(null); }, [selectedId]);

  useEffect(() => {
    if (!form || !currentApp) { setSample(null); setSampleList([]); return; }
    let alive = true;
    (async () => {
      const recs = (await loadRecords(form.id)).filter((r) => !r.deleted);
      const targets = Array.from(new Set(form.fields.flatMap((f) => [f.lookup?.targetFormId, ...(f.subform?.columns || []).map((c) => c.lookup?.targetFormId)]).filter(Boolean) as string[]));
      const map: Record<string, RecordDefinition[]> = {};
      for (const id of targets) map[id] = await loadRecords(id);
      if (!alive) return;
      setSampleList(recs); setSample(recs[0] || null); setLookupRecords(map);
    })();
    return () => { alive = false; };
  }, [form?.id, currentApp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mode: "design" | "code" = tpl ? (modeOverride[tpl.id] ?? (tpl.design ? "design" : "code")) : "design";
  const setMode = (m: "design" | "code") => tpl && setModeOverride((o) => ({ ...o, [tpl.id]: m }));
  if (!currentApp) return null;
  const up = (patch: Partial<PrintTemplate>) => tpl && updateCurrentApp((prev) => ({ ...prev, printTemplates: (prev.printTemplates || []).map((t) => (t.id === tpl.id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)) }));
  const setDesign = (d: PrintDesign) => form && up({ design: d, html: renderDesign(d, form) });
  const upBlock = (id: string, patch: Partial<PrintBlock>) => tpl?.design && setDesign({ ...tpl.design, blocks: tpl.design.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as PrintBlock) : b)) });
  const moveBlock = (i: number, d: -1 | 1) => { if (!tpl?.design) return; const n = [...tpl.design.blocks]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setDesign({ ...tpl.design, blocks: n }); };
  const addBlock = (type: PrintBlock["type"]) => { if (!tpl || !form) return; const b = NEW_BLOCK[type](form); const d = tpl.design || { blocks: [], theme: { accent: "#2563eb" } }; setDesign({ ...d, blocks: [...d.blocks, b] }); setSelBlock(b.id); };
  const removeBlock = (id: string) => tpl?.design && setDesign({ ...tpl.design, blocks: tpl.design.blocks.filter((b) => b.id !== id) });

  const addTemplate = (name: string, formId: string, html: string, design?: PrintDesign) => {
    const t: PrintTemplate = { id: generateId("prt"), name, formId, html, design, paper: "A4", orientation: "portrait", isDefault: !templates.some((x) => x.formId === formId), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    updateCurrentApp((prev) => ({ ...prev, printTemplates: [...(prev.printTemplates || []), t] }));
    setSelectedId(t.id);
    return t;
  };
  const create = async () => {
    const f = currentApp.forms.find((x) => x.id === newForm);
    if (!f || !newName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      if (newKind === "document") { const d = defaultDesign(f); addTemplate(newName.trim(), f.id, renderDesign(d, f), d); }
      else if (newKind === "blank") { const d: PrintDesign = { blocks: [NEW_BLOCK.header(f)], theme: { accent: "#2563eb", font: "sans", fontSize: 12, table: "striped", boxed: true } }; addTemplate(newName.trim(), f.id, renderDesign(d, f), d); }
      else if (newKind === "ai") { const res = await generatePrintDesign(newPrompt.trim() || `${newName} for ${f.name}`, f, currentApp); addTemplate(newName.trim(), f.id, `<style>\n${res.css}\n</style>\n${res.html}`); showToast(res.explanation || "Design generated", "success"); }
      else { const res = await mapHtmlToPlaceholders(newHtml, f, currentApp, newPrompt.trim() || undefined); addTemplate(newName.trim(), f.id, res.css ? `<style>\n${res.css}\n</style>\n${res.html}` : res.html); showToast(res.explanation || "Fields mapped into your design", "success"); }
      setCreateOpen(false); setNewName(""); setNewPrompt(""); setNewHtml("");
    } catch (e: any) { setCreateError(e?.message || "Failed"); }
    finally { setCreating(false); }
  };
  const setDefault = (id: string) => updateCurrentApp((prev) => { const t = (prev.printTemplates || []).find((x) => x.id === id); return { ...prev, printTemplates: (prev.printTemplates || []).map((x) => (x.formId === t?.formId ? { ...x, isDefault: x.id === id } : x)) }; });
  const remove = (id: string) => { updateCurrentApp((prev) => ({ ...prev, printTemplates: (prev.printTemplates || []).filter((x) => x.id !== id) })); if (selectedId === id) setSelectedId(null); };
  const duplicate = (t: PrintTemplate) => addTemplate(`${t.name} copy`, t.formId, t.html, t.design ? JSON.parse(JSON.stringify(t.design)) : undefined);

  const runAi = async () => {
    if (!tpl || !form) return;
    setAiBusy(true); setAiError(null);
    try {
      if (aiOpen === "improve") { const res = await generatePrintDesign(aiPrompt.trim(), form, currentApp, { html: tpl.html, css: tpl.css }); up({ html: `<style>\n${res.css}\n</style>\n${res.html}`, css: undefined, design: undefined }); setMode("code"); showToast(res.explanation || "Design updated", "success"); }
      else { const res = await mapHtmlToPlaceholders(aiHtml, form, currentApp, aiPrompt.trim() || undefined); up({ html: res.css ? `<style>\n${res.css}\n</style>\n${res.html}` : res.html, css: undefined, design: undefined }); setMode("code"); showToast(res.explanation || "Fields mapped into your design", "success"); }
      setAiOpen(null); setAiPrompt(""); setAiHtml("");
    } catch (e: any) { setAiError(e?.message || "AI request failed"); }
    finally { setAiBusy(false); }
  };

  const previewRecord: RecordDefinition | null = sample || (form ? { id: "sample", appId: currentApp.id, formId: form.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: Object.fromEntries(form.fields.filter((f) => !["section"].includes(f.type)).map((f) => [f.id, f.type === "subform" ? [Object.fromEntries((f.subform?.columns || []).map((c) => [c.id, c.type === "number" || c.type === "currency" || c.type === "decimal" ? 1 : `[${c.label}]`]))] : f.type === "checkbox" ? true : ["number", "currency", "decimal", "percentage"].includes(f.type) ? 1000 : f.type === "date" ? new Date().toISOString().slice(0, 10) : f.type === "lookup" ? "" : `[${f.label}]`])) } as RecordDefinition : null);
  const previewDoc = tpl && form ? buildPrintDocument(tpl, { app: currentApp, form, record: previewRecord, recordsMap: lookupRecords, user: user ? { name: user.name, email: user.email } : null, forms: currentApp.forms }, tpl.name) : "";
  const list = templates.filter((t) => !formFilter || t.formId === formFilter);
  const block = tpl?.design?.blocks.find((b) => b.id === selBlock) || null;

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0">
      {/* designs list */}
      <div className="w-60 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Print designs ({templates.length})</span><Button size="xs" onClick={() => { setNewForm(currentApp.forms[0]?.id || ""); setNewName(""); setNewKind("document"); setCreateOpen(true); }} icon={<Plus className="w-3 h-3" />}>New</Button></div>
        <div className="p-2 border-b border-slate-100"><Select size="sm" value={formFilter} onChange={(e) => setFormFilter(e.target.value)}><option value="">All forms</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name} ({templates.filter((t) => t.formId === f.id).length})</option>)}</Select></div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {list.map((t) => { const f = currentApp.forms.find((x) => x.id === t.formId); return (
            <button key={t.id} onClick={() => setSelectedId(t.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 ${selectedId === t.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-slate-700 hover:bg-slate-100"}`}>
              <Printer className={`w-4 h-4 shrink-0 ${selectedId === t.id ? "text-blue-600" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1"><span className="block truncate">{t.name}</span><span className="block text-[10px] text-slate-400 font-normal truncate">{f?.name || "?"} · {t.design ? "visual" : "code"} · {t.paper || "A4"}</span></span>
              {t.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />}
            </button>); })}
          {list.length === 0 && <p className="text-[11px] text-slate-400 p-3 text-center">No print designs yet.</p>}
        </div>
      </div>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-slate-100/60">
        {!tpl || !form ? (
          <div className="flex-1 flex items-center justify-center p-6"><EmptyState icon={<Printer className="w-6 h-6" />} title="Design how records print" description="Build invoices, receipts and challans from blocks, let AI draft one, or bring your own HTML — the fields are placed for you." action={<Button size="sm" onClick={() => { setNewForm(currentApp.forms[0]?.id || ""); setCreateOpen(true); }} icon={<Plus className="w-3.5 h-3.5" />}>New print design</Button>} /></div>
        ) : (
          <>
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap">
              <input value={tpl.name} onChange={(e) => up({ name: e.target.value })} className="text-sm font-bold text-slate-900 border border-transparent hover:border-slate-200 rounded px-1.5 py-0.5 w-52" />
              <Badge variant="default">{form.name}</Badge>
              <div className="w-36"><Select size="sm" value={tpl.paper || "A4"} onChange={(e) => up({ paper: e.target.value as any })}><option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option><option value="thermal80">Thermal 80mm</option></Select></div>
              <div className="w-32"><Select size="sm" value={tpl.orientation || "portrait"} onChange={(e) => up({ orientation: e.target.value as any })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></Select></div>
              <Toggle size="sm" checked={Boolean(tpl.isDefault)} onChange={(v) => v && setDefault(tpl.id)} label="Default for Print button" />
              <div className="ml-auto flex items-center gap-1.5">
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button type="button" onClick={() => { if (!tpl.design && form) setDesign(defaultDesign(form)); setMode("design"); }} className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 ${mode === "design" ? "bg-white shadow-3xs text-blue-700" : "text-slate-500"}`} title={tpl.design ? "" : "Switch to blocks (replaces the code with a fresh block design)"}><LayoutTemplate className="w-3.5 h-3.5" />Design</button>
                  <button type="button" onClick={() => setMode("code")} className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 ${mode === "code" ? "bg-white shadow-3xs text-blue-700" : "text-slate-500"}`}><Code className="w-3.5 h-3.5" />Code</button>
                </div>
                <Button variant="subtle" size="sm" onClick={() => setAiOpen("import")} icon={<Upload className="w-3.5 h-3.5 text-indigo-600" />}>Use my HTML</Button>
                <Button variant="subtle" size="sm" onClick={() => setAiOpen("improve")} icon={<Sparkles className="w-3.5 h-3.5 text-indigo-600" />}>Improve with AI</Button>
                <IconButton tone="primary" onClick={() => duplicate(tpl)} title="Duplicate"><Copy className="w-4 h-4" /></IconButton>
                <IconButton tone="danger" onClick={() => setDeleteId(tpl.id)} title="Delete"><Trash2 className="w-4 h-4" /></IconButton>
              </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr]">
              {/* left: blocks (design) or editor (code) */}
              <div className="border-r border-slate-200 bg-white flex flex-col min-h-0">
                {mode === "design" && tpl.design ? (
                  <>
                    <div className="p-2.5 border-b border-slate-100">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Theme</div>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        <label className="flex items-center gap-1.5"><input type="color" value={tpl.design.theme.accent || "#2563eb"} onChange={(e) => setDesign({ ...tpl.design!, theme: { ...tpl.design!.theme, accent: e.target.value } })} className="w-7 h-7 rounded border border-slate-300 bg-white p-0" /><span className="text-slate-600">Accent</span></label>
                        <select value={tpl.design.theme.font || "sans"} onChange={(e) => setDesign({ ...tpl.design!, theme: { ...tpl.design!.theme, font: e.target.value as any } })} className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select>
                        <select value={tpl.design.theme.table || "striped"} onChange={(e) => setDesign({ ...tpl.design!, theme: { ...tpl.design!.theme, table: e.target.value as any } })} className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white"><option value="striped">Striped table</option><option value="lines">Lined table</option><option value="grid">Grid table</option></select>
                        <select value={String(tpl.design.theme.fontSize || 12)} onChange={(e) => setDesign({ ...tpl.design!, theme: { ...tpl.design!.theme, fontSize: parseInt(e.target.value) } })} className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white">{[10, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{n}px</option>)}</select>
                        <label className="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-600"><input type="checkbox" checked={tpl.design.theme.boxed !== false} onChange={(e) => setDesign({ ...tpl.design!, theme: { ...tpl.design!.theme, boxed: e.target.checked } })} className="rounded border-slate-300" /> Boxed field cards</label>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Blocks (top → bottom)</div>
                      {tpl.design.blocks.map((b, i) => (
                        <div key={b.id} onClick={() => setSelBlock(b.id)} className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer text-xs ${selBlock === b.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                          <span className="text-slate-400">{BLOCK_META[b.type].icon}</span>
                          <span className="flex-1 min-w-0 truncate font-medium text-slate-800">{BLOCK_META[b.type].label}{b.type === "items" ? ` · ${form.fields.find((f) => f.id === b.subformFieldId)?.label || "?"}` : b.type === "fields" ? ` · ${b.fieldIds.length}` : ""}</span>
                          <span className="hidden group-hover:flex items-center" onClick={(e) => e.stopPropagation()}><IconButton size="sm" disabled={i === 0} onClick={() => moveBlock(i, -1)}><ChevronUp className="w-3 h-3" /></IconButton><IconButton size="sm" disabled={i === tpl.design!.blocks.length - 1} onClick={() => moveBlock(i, 1)}><ChevronDown className="w-3 h-3" /></IconButton><IconButton size="sm" tone="danger" onClick={() => removeBlock(b.id)}><Trash2 className="w-3 h-3" /></IconButton></span>
                        </div>
                      ))}
                      <div className="pt-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-1">Add block</div>
                        <div className="grid grid-cols-2 gap-1">{(Object.keys(BLOCK_META) as PrintBlock["type"][]).map((t) => <button key={t} type="button" onClick={() => addBlock(t)} title={BLOCK_META[t].desc} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-md"><span className="text-slate-400">{BLOCK_META[t].icon}</span>{BLOCK_META[t].label}</button>)}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5"><Code className="w-3.5 h-3.5" /> HTML + CSS with {"{{placeholders}}"} · {form.fields.filter((f) => PRINTABLE_TYPES.has(f.type)).map((f) => `{{${f.linkName}}}`).slice(0, 4).join(" ")}…</div>
                    <textarea value={tpl.html} onChange={(e) => up({ html: e.target.value, design: undefined })} spellCheck={false} className="flex-1 w-full font-mono text-[11.5px] leading-relaxed p-3 bg-slate-950 text-blue-100 resize-none focus:outline-none" />
                  </>
                )}
              </div>

              {/* right: block properties + preview */}
              <div className="flex flex-col min-h-0">
                {mode === "design" && block && (
                  <div className="bg-white border-b border-slate-200 p-3 text-xs max-h-[38%] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2"><span className="font-bold text-slate-900 flex items-center gap-1.5">{BLOCK_META[block.type].icon}{BLOCK_META[block.type].label}</span><span className="text-[10px] text-slate-400">{BLOCK_META[block.type].desc}</span></div>
                    <BlockProps block={block} form={form} onChange={(p) => upBlock(block.id, p)} />
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col bg-slate-200/60">
                  <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-2 text-xs">
                    <Eye className="w-3.5 h-3.5 text-slate-400" /><span className="font-semibold text-slate-700">Live preview</span>
                    <select value={sample?.id || ""} onChange={(e) => setSample(sampleList.find((r) => r.id === e.target.value) || null)} className="ml-auto text-[11px] border border-slate-300 rounded-md px-2 py-1 bg-white max-w-[240px]"><option value="">{sampleList.length ? "Pick a record…" : "No records yet — showing sample values"}</option>{sampleList.slice(0, 50).map((r) => <option key={r.id} value={r.id}>{form.titleFieldId ? String(r.data?.[form.titleFieldId] ?? r.id) : r.id}</option>)}</select>
                    <Button size="xs" variant="outline" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(previewDoc); w.document.close(); setTimeout(() => w.print(), 300); } }} icon={<Printer className="w-3 h-3" />}>Print test</Button>
                  </div>
                  <iframe title="print preview" srcDoc={previewDoc} className="flex-1 w-full bg-white" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* new design */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New print design" icon={<FileText className="w-4 h-4" />} maxWidth="2xl" footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={creating} disabled={!newName.trim() || !newForm || (newKind === "import" && !newHtml.trim()) || ((newKind === "ai" || newKind === "import") && !hasKey)} onClick={create} icon={newKind === "ai" || newKind === "import" ? <Wand2 className="w-3.5 h-3.5" /> : undefined}>{newKind === "ai" ? "Generate" : newKind === "import" ? "Map fields & create" : "Create"}</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tax Invoice, Delivery Challan" autoFocus />
            <Select label="Form" value={newForm} onChange={(e) => setNewForm(e.target.value)}><option value="">Choose…</option>{currentApp.forms.map((f) => { const n = templates.filter((t) => t.formId === f.id).length; return <option key={f.id} value={f.id}>{f.name}{n ? ` (${n} existing)` : ""}</option>; })}</Select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {([["document", "Ready document", "All fields, items tables, totals, signature — edit with blocks."], ["blank", "Blank", "Start with just a header and add blocks."], ["ai", "Describe with AI", "Tell the AI what the document should look like."], ["import", "Use my HTML", "Paste your own HTML/CSS; AI places the fields in it."]] as const).map(([k, l, d]) => (
              <button key={k} type="button" onClick={() => setNewKind(k)} className={`text-left p-2.5 rounded-xl border text-xs ${newKind === k ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><div className="font-semibold text-slate-900">{l}</div><div className="text-[10px] text-slate-500 mt-0.5">{d}</div></button>
            ))}
          </div>
          {newKind === "ai" && <textarea rows={3} value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="e.g. GST tax invoice with blue header, customer & invoice details side by side, items table with HSN, qty, rate, GST%, amount; CGST/SGST totals; amount in words; bank details and signature" className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg" />}
          {newKind === "import" && <><textarea rows={8} value={newHtml} onChange={(e) => setNewHtml(e.target.value)} placeholder="Paste the full HTML of your design (with its <style> or CSS). Sample values will be replaced with the right fields; the items table becomes a subform loop." className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg" /><Input size="sm" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="Optional note for the AI, e.g. 'the second table is the tax summary, keep it static'" /></>}
          {!hasKey && (newKind === "ai" || newKind === "import") && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No AI key configured — add one under AI Assistant → Provider &amp; keys.</p>}
          {createError && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{createError}</p>}
          <p className="text-[11px] text-slate-500">A form can have several designs; users choose between them when printing. Only forms with a design marked <strong>default</strong> show a Print button in the live app.</p>
        </div>
      </Modal>

      {/* AI improve / import on an existing design */}
      <Modal isOpen={Boolean(aiOpen)} onClose={() => setAiOpen(null)} title={aiOpen === "import" ? "Use my HTML for this design" : "Improve with AI"} description={aiOpen === "import" ? "Paste your HTML/CSS. The AI keeps your layout and inserts the correct field placeholders, subform loop and totals." : "Describe the change; the current design is the starting point."} icon={aiOpen === "import" ? <Upload className="w-4 h-4 text-indigo-600" /> : <Sparkles className="w-4 h-4 text-indigo-600" />} maxWidth="2xl" footer={<><Button variant="outline" onClick={() => setAiOpen(null)}>Cancel</Button><Button loading={aiBusy} disabled={!hasKey || (aiOpen === "import" ? !aiHtml.trim() : !aiPrompt.trim())} onClick={runAi} icon={<Wand2 className="w-3.5 h-3.5" />}>{aiOpen === "import" ? "Map fields" : "Apply"}</Button></>}>
        <div className="space-y-3">
          {aiOpen === "import" && <textarea rows={10} value={aiHtml} onChange={(e) => setAiHtml(e.target.value)} placeholder={"<style>…</style>\n<div class=\"invoice\"> … </div>"} className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg" />}
          <textarea rows={aiOpen === "import" ? 2 : 4} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={aiOpen === "import" ? "Optional note for the AI" : "e.g. make the header green, add HSN column, show bank details above the signature"} className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg" />
          {aiError && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{aiError}</p>}
          <p className="text-[11px] text-slate-500">The result opens in Code mode (the block design is replaced). Duplicate the design first if you want to keep the block version.</p>
        </div>
      </Modal>
      <ConfirmDialog isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) remove(deleteId); setDeleteId(null); }} title="Delete print design" message="Remove this design? Records are not affected." isDestructive />
    </div>
  );
};

// ── per-block properties ──────────────────────────────────────────────────────

const BlockProps: React.FC<{ block: PrintBlock; form: FormDefinition; onChange: (p: Partial<PrintBlock>) => void }> = ({ block, form, onChange }) => {
  const set = (p: any) => onChange(p);
  const numeric = (f: any) => ["number", "currency", "decimal", "percentage", "rollup"].includes(f.type) || (f.type === "formula" && f.formula?.resultType === "number");
  switch (block.type) {
    case "header": return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2"><Input size="sm" label="Document title" value={block.title} onChange={(e) => set({ title: e.target.value })} /><Select size="sm" label="Brand side" value={block.align || "left"} onChange={(e) => set({ align: e.target.value })}><option value="left">Brand left, title right</option><option value="right">Title left, brand right</option></Select></div>
        <div className="flex gap-4"><Toggle size="sm" checked={block.showLogo !== false} onChange={(v) => set({ showLogo: v })} label="Logo" /><Toggle size="sm" checked={block.showAppName !== false} onChange={(v) => set({ showAppName: v })} label="App / company name" /></div>
        <div><div className="text-[11px] font-medium text-slate-700 mb-1">Number / date under the title</div><FieldChips form={form} selected={block.metaFieldIds || []} onChange={(ids) => set({ metaFieldIds: ids })} /></div>
      </div>);
    case "fields": return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2"><Input size="sm" label="Section title" value={block.title || ""} onChange={(e) => set({ title: e.target.value || undefined })} /><Select size="sm" label="Columns" value={String(block.columns || 2)} onChange={(e) => set({ columns: parseInt(e.target.value) })}><option value="1">1</option><option value="2">2</option><option value="3">3</option></Select><Select size="sm" label="Style" value={block.style || "boxed"} onChange={(e) => set({ style: e.target.value })}><option value="boxed">Boxed cards</option><option value="plain">Plain</option><option value="table">Label : value table</option></Select></div>
        <div><div className="text-[11px] font-medium text-slate-700 mb-1">Fields (click to toggle; order = click order)</div><FieldChips form={form} selected={block.fieldIds} onChange={(ids) => set({ fieldIds: ids })} /></div>
      </div>);
    case "twoColumns": return (
      <div className="grid grid-cols-2 gap-3">
        {(["left", "right"] as const).map((side) => <div key={side} className="space-y-1.5"><Input size="sm" label={`${side === "left" ? "Left" : "Right"} title`} value={block[side].title || ""} onChange={(e) => set({ [side]: { ...block[side], title: e.target.value } })} /><FieldChips form={form} selected={block[side].fieldIds} onChange={(ids) => set({ [side]: { ...block[side], fieldIds: ids } })} /></div>)}
      </div>);
    case "items": { const sf = form.fields.find((f) => f.id === block.subformFieldId); const cols = sf?.subform?.columns || []; return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2"><Select size="sm" label="Subform" value={block.subformFieldId} onChange={(e) => set({ subformFieldId: e.target.value, columnIds: undefined, totalColumnIds: [] })}><option value="">Choose…</option>{form.fields.filter((f) => f.type === "subform").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select><div className="pt-5"><Toggle size="sm" checked={block.showIndex !== false} onChange={(v) => set({ showIndex: v })} label="Serial # column" /></div></div>
        {sf && <><div><div className="text-[11px] font-medium text-slate-700 mb-1">Columns</div><div className="flex flex-wrap gap-1">{cols.map((c) => { const on = !block.columnIds || block.columnIds.includes(c.id); return <button key={c.id} type="button" onClick={() => set({ columnIds: on ? cols.filter((x) => (!block.columnIds || block.columnIds.includes(x.id)) && x.id !== c.id).map((x) => x.id) : [...(block.columnIds || []), c.id] })} className={`px-2 py-0.5 rounded-full text-[10px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{c.label}</button>; })}</div></div>
        <div><div className="text-[11px] font-medium text-slate-700 mb-1">Totals under the table</div><div className="flex flex-wrap gap-1">{cols.filter((c) => numeric(c) || c.formula).map((c) => { const on = (block.totalColumnIds || []).includes(c.id); return <button key={c.id} type="button" onClick={() => set({ totalColumnIds: on ? (block.totalColumnIds || []).filter((x) => x !== c.id) : [...(block.totalColumnIds || []), c.id] })} className={`px-2 py-0.5 rounded-full text-[10px] border ${on ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-300"}`}>Σ {c.label}</button>; })}</div></div></>}
      </div>); }
    case "totals": return (
      <div className="space-y-2">
        <div><div className="text-[11px] font-medium text-slate-700 mb-1">Rows (top → bottom; last row is bold)</div>
          {block.rows.map((r, i) => <div key={i} className="flex items-center gap-1.5 mb-1"><select value={r.fieldId} onChange={(e) => set({ rows: block.rows.map((x, j) => (j === i ? { ...x, fieldId: e.target.value, label: x.label || form.fields.find((f) => f.id === e.target.value)?.label || "" } : x)) })} className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white w-44">{form.fields.filter(numeric).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select><input value={r.label} onChange={(e) => set({ rows: block.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" className="flex-1 text-[11px] border border-slate-300 rounded-md px-1.5 py-1" /><IconButton size="sm" tone="danger" onClick={() => set({ rows: block.rows.filter((_, j) => j !== i) })}><Trash2 className="w-3 h-3" /></IconButton></div>)}
          <button type="button" onClick={() => { const f = form.fields.find(numeric); if (f) set({ rows: [...block.rows, { label: f.label, fieldId: f.id }] }); }} className="text-[11px] font-semibold text-blue-600">+ Add row</button></div>
        <Select size="sm" label="Amount in words" value={block.wordsFieldId || ""} onChange={(e) => set({ wordsFieldId: e.target.value || undefined })}><option value="">None</option>{form.fields.filter(numeric).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
      </div>);
    case "text": return <textarea rows={4} value={block.html} onChange={(e) => set({ html: e.target.value })} className="w-full text-xs font-mono px-2 py-1.5 border border-slate-300 rounded-lg" placeholder="Text or HTML; placeholders like {{customer}} work here too" />;
    case "notes": return (
      <div className="grid grid-cols-2 gap-2">
        <Input size="sm" label="Title" value={block.title || ""} onChange={(e) => set({ title: e.target.value })} />
        <Select size="sm" label="From field" value={block.fieldId || ""} onChange={(e) => set({ fieldId: e.target.value || undefined })}><option value="">Fixed text below</option>{form.fields.filter((f) => ["textarea", "richtext", "text"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
        {!block.fieldId && <div className="col-span-2"><textarea rows={3} value={block.text || ""} onChange={(e) => set({ text: e.target.value })} className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg" /></div>}
      </div>);
    case "signature": return <div><div className="text-[11px] font-medium text-slate-700 mb-1">Signature labels (one per line)</div><textarea rows={3} value={block.labels.join("\n")} onChange={(e) => set({ labels: e.target.value.split("\n").filter(Boolean) })} className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg" /></div>;
    case "footer": return <div className="grid grid-cols-2 gap-2 items-end"><Input size="sm" label="Footer text" value={block.text || ""} onChange={(e) => set({ text: e.target.value })} /><Toggle size="sm" checked={block.showPrintedBy !== false} onChange={(v) => set({ showPrintedBy: v })} label="Printed by · date" /></div>;
    case "spacer": return <Input size="sm" label="Height (px)" type="number" value={block.height || 16} onChange={(e) => set({ height: parseInt(e.target.value) || 16 })} />;
    default: return <p className="text-slate-400">No settings.</p>;
  }
};
