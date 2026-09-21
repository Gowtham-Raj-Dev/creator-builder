"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WorkflowDefinition, WorkflowAction, WorkflowActionType, WorkflowTriggerType, VisualCondition, ReportOperator, WorkflowLogEntry } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useAuth } from "@/context/AuthContext";
import { storageService } from "@/lib/storage/firestoreProvider";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Toggle, Tabs, EmptyState, Badge, Textarea } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { generateId } from "@/lib/utils/idGenerator";
import { checkScriptSyntax } from "@/lib/engine/scriptInterpreter";
import { executeWorkflows, SCRIPT_API_DOCS, WorkflowResult } from "@/lib/engine/workflowEngine";
import { WORKFLOW_TEMPLATES } from "@/lib/engine/workflowTemplates";
import { OPERATORS } from "@/components/runtime/report/FilterBuilder";
import { FormulaEditor } from "../FormBuilder/FormulaEditor";
import { fixScriptWithAi, setActiveAiApp } from "@/lib/ai/claude";
import { useToast } from "@/context/ToastContext";
import { Zap, Plus, Trash2, Copy, Play, Code2, Blocks, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, BookOpen, History, Sparkles, X } from "lucide-react";

const TRIGGERS: Array<{ id: WorkflowTriggerType; label: string; desc: string; server?: boolean }> = [
  { id: "onLoad", label: "On load (new)", desc: "When a blank form opens" },
  { id: "onEdit", label: "On load (edit)", desc: "When an existing record opens" },
  { id: "onUserInput", label: "On field change", desc: "When a field or subform column changes" },
  { id: "onValidate", label: "On validate", desc: "Before save — add errors / block" },
  { id: "onSubmit", label: "On submit", desc: "Before save — adjust values, confirm" },
  { id: "onSuccess", label: "After save", desc: "Cross-form updates, email, webhooks" },
  { id: "onDelete", label: "On delete", desc: "When a record is deleted" },
  { id: "scheduled", label: "Scheduled (cron)", desc: "Needs Cloud Scheduler + Functions", server: true },
  { id: "webhook", label: "Incoming webhook", desc: "Needs a Cloud Function endpoint", server: true },
];

const ACTIONS: Array<{ id: WorkflowActionType; label: string; group: string }> = [
  { id: "setValue", label: "Set field value", group: "Fields" },
  { id: "copyField", label: "Copy field → field", group: "Fields" },
  { id: "calculateValue", label: "Calculate (expression)", group: "Fields" },
  { id: "clearField", label: "Clear field", group: "Fields" },
  { id: "setHidden", label: "Hide field", group: "Visibility" },
  { id: "setVisible", label: "Show field", group: "Visibility" },
  { id: "setReadonly", label: "Make read-only", group: "Visibility" },
  { id: "setEditable", label: "Make editable", group: "Visibility" },
  { id: "showMessage", label: "Show banner message", group: "Messages" },
  { id: "showPopup", label: "Popup (info / warning / confirm / error)", group: "Messages" },
  { id: "validate", label: "Field error (block)", group: "Messages" },
  { id: "blockSubmit", label: "Block submit", group: "Messages" },
  { id: "updateOtherForm", label: "Update another form (stock ±)", group: "Data" },
  { id: "createRecord", label: "Create record in another form", group: "Data" },
  { id: "deleteRecord", label: "Delete this record", group: "Data" },
  { id: "sendEmail", label: "Send email", group: "Integrations" },
  { id: "notify", label: "In-app notification", group: "Integrations" },
  { id: "callWebhook", label: "Call webhook (HTTP)", group: "Integrations" },
  { id: "requestApproval", label: "Request approval", group: "Integrations" },
];

export const WorkflowBuilderView: React.FC<{ workflowId?: string }> = ({ workflowId }) => {
  const { currentApp, createWorkflow, updateWorkflow, deleteWorkflow, duplicateWorkflow } = useAppBuilder();
  const [selectedId, setSelectedId] = useState<string | null>(workflowId || null);
  const [filterForm, setFilterForm] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(true);
  const [fixing, setFixing] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { if (!currentApp) return; if (!selectedId || !currentApp.workflows.some((w) => w.id === selectedId)) setSelectedId(currentApp.workflows[0]?.id || null); }, [currentApp, selectedId]);
  useEffect(() => { setActiveAiApp(currentApp?.id || null); return () => setActiveAiApp(null); }, [currentApp?.id]);

  const wf = currentApp?.workflows.find((w) => w.id === selectedId) || null;
  const form = wf ? currentApp?.forms.find((f) => f.id === wf.formId) : null;
  const syntax = useMemo(() => (wf?.mode === "code" && wf.codeScript ? checkScriptSyntax(wf.codeScript) : { ok: true }), [wf?.codeScript, wf?.mode]);

  if (!currentApp) return null;
  const up = (patch: Partial<WorkflowDefinition>) => wf && updateWorkflow(wf.id, patch);
  const upAction = (id: string, patch: Partial<WorkflowAction>) => wf && up({ actions: wf.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const list = currentApp.workflows.filter((w) => !filterForm || w.formId === filterForm);
  const fieldOptions = form ? form.fields.filter((f) => f.type !== "section") : [];
  const triggerFieldOptions = form ? [...fieldOptions.map((f) => ({ id: f.id, label: f.label })), ...form.fields.filter((f) => f.type === "subform").flatMap((sf) => (sf.subform?.columns || []).map((c) => ({ id: `${sf.id}.${c.id}`, label: `${sf.label} › ${c.label}` })))] : [];

  return (
    <div className="flex-1 flex h-full overflow-hidden min-h-0">
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Workflows ({currentApp.workflows.length})</span><div className="flex gap-1"><Button size="xs" variant="outline" onClick={() => setTemplatesOpen(true)} icon={<Sparkles className="w-3 h-3 text-amber-500" />}>Templates</Button><Button size="xs" onClick={() => { const w = createWorkflow({ name: "New Workflow", formId: filterForm || currentApp.forms[0]?.id, mode: "visual", trigger: { type: "onUserInput" } }); setSelectedId(w.id); }} icon={<Plus className="w-3 h-3" />}>New</Button></div></div>
          <select value={filterForm} onChange={(e) => setFilterForm(e.target.value)} className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-slate-50"><option value="">All forms</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {list.map((w) => { const f = currentApp.forms.find((x) => x.id === w.formId); return (
            <button key={w.id} onClick={() => setSelectedId(w.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${selectedId === w.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-slate-700 hover:bg-slate-100"}`}>
              <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${w.active ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="truncate flex-1">{w.name}</span>{w.mode === "code" ? <Code2 className="w-3 h-3 text-indigo-500" /> : <Blocks className="w-3 h-3 text-slate-400" />}</div>
              <div className="text-[10px] text-slate-400 font-normal pl-3.5">{f?.name || "?"} · {TRIGGERS.find((t) => t.id === w.trigger.type)?.label}</div>
            </button>); })}
          {list.length === 0 && <p className="text-[11px] text-slate-400 p-3 text-center">No workflows yet.</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-100/60 p-6">
        {!wf || !form ? (
          <EmptyState icon={<Zap className="w-6 h-6" />} title="Select a workflow" description="Automate calculations, validations, cross-form updates and notifications." action={<Button size="sm" onClick={() => setTemplatesOpen(true)} icon={<Sparkles className="w-3.5 h-3.5" />}>Start from template</Button>} />
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input label="Name" value={wf.name} onChange={(e) => up({ name: e.target.value })} />
                  <Select label="Form" value={wf.formId} onChange={(e) => up({ formId: e.target.value, trigger: { ...wf.trigger, fieldId: undefined }, actions: [] })}>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
                  <div className="col-span-2"><Input label="Description" value={wf.description || ""} onChange={(e) => up({ description: e.target.value })} /></div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Toggle checked={wf.active} onChange={(v) => up({ active: v })} label={wf.active ? "Enabled" : "Disabled"} />
                  <div className="flex gap-1"><IconButton tone="primary" onClick={() => duplicateWorkflow(wf.id)} title="Duplicate"><Copy className="w-4 h-4" /></IconButton><IconButton onClick={() => setLogsOpen(true)} title="Execution history"><History className="w-4 h-4" /></IconButton><IconButton tone="danger" onClick={() => setDeleteId(wf.id)} title="Delete"><Trash2 className="w-4 h-4" /></IconButton></div>
                  <span className="text-[10px] text-slate-400">v{wf.version || 1}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Trigger</label>
                  <div className="grid grid-cols-3 gap-1.5">{TRIGGERS.map((t) => <button key={t.id} type="button" onClick={() => up({ trigger: { ...wf.trigger, type: t.id } })} className={`text-left p-2 rounded-lg border text-[11px] ${wf.trigger.type === t.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"} ${t.server ? "opacity-70" : ""}`}><div className="font-semibold text-slate-900">{t.label}</div><div className="text-[10px] text-slate-500 leading-snug">{t.desc}</div></button>)}</div>
                </div>
                <div className="space-y-3">
                  {wf.trigger.type === "onUserInput" && <Select label="Field (blank = any field)" value={wf.trigger.fieldId || ""} onChange={(e) => up({ trigger: { ...wf.trigger, fieldId: e.target.value || undefined } })}><option value="">Any field</option>{triggerFieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
                  {wf.trigger.type === "scheduled" && <Input label="Cron expression" value={wf.trigger.cron || ""} onChange={(e) => up({ trigger: { ...wf.trigger, cron: e.target.value } })} placeholder="0 9 * * 1" helperText="Stored only; run it with Cloud Scheduler → Cloud Function that calls the workflow." />}
                  {wf.trigger.type === "webhook" && <Input label="Webhook key" value={wf.trigger.webhookKey || generateId("whk")} onChange={(e) => up({ trigger: { ...wf.trigger, webhookKey: e.target.value } })} helperText="POST to your Cloud Function with this key to run the workflow." />}
                  <Tabs active={wf.mode || "visual"} onChange={(m) => up({ mode: m as any })} tabs={[{ id: "visual", label: "No-code actions", icon: <Blocks className="w-3.5 h-3.5" /> }, { id: "code", label: "Script (JS)", icon: <Code2 className="w-3.5 h-3.5" /> }]} />
                  <Button variant="outline" size="sm" onClick={() => setTestOpen(true)} icon={<Play className="w-3.5 h-3.5 text-emerald-600" />}>Test run</Button>
                </div>
              </div>
            </div>

            {wf.mode === "code" ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
                <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-indigo-600" /> Script — sandboxed JavaScript</span>{syntax.ok ? <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Syntax OK</span> : <span className="text-rose-600 flex items-center gap-2"><span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {syntax.error}</span><Button size="xs" variant="subtle" loading={fixing} icon={<Sparkles className="w-3 h-3" />} onClick={async () => { setFixing(true); try { const fixed = await fixScriptWithAi(wf.codeScript || "", syntax.error || "syntax error", form, currentApp); up({ codeScript: fixed }); showToast("Script repaired by AI — review it", "success"); } catch (e: any) { showToast(e?.message || "AI fix failed", "error"); } finally { setFixing(false); } }}>Fix with AI</Button></span>}</div>
                  <textarea value={wf.codeScript || ""} onChange={(e) => up({ codeScript: e.target.value })} spellCheck={false} rows={18} placeholder={`// Read & write fields via input.<link_name>\ninput.amount = input.quantity * input.rate;\n\nif (input.amount > 10000) confirm("Large order. Continue anyway?");\n\n// After save: update stock in another form\nfor (const row of input.items) increment("item", row.item, "stock", -row.quantity);`} className="w-full font-mono text-xs p-4 bg-slate-900 text-emerald-200 placeholder:text-slate-500 focus:outline-none min-h-[380px] leading-relaxed" onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; up({ codeScript: (wf.codeScript || "").slice(0, s) + "  " + (wf.codeScript || "").slice(t.selectionEnd) }); setTimeout(() => t.setSelectionRange(s + 2, s + 2), 0); } }} />
                  <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Fields:</span>{fieldOptions.slice(0, 12).map((f) => <button key={f.id} type="button" onClick={() => up({ codeScript: (wf.codeScript || "") + `input.${f.linkName}` })} className="font-mono text-indigo-700 hover:underline">input.{f.linkName}</button>)}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-3xs overflow-hidden self-start">
                  <button type="button" onClick={() => setApiOpen((o) => !o)} className="w-full px-3 py-2 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700"><span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> API reference</span>{apiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
                  {apiOpen && <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">{Array.from(new Set(SCRIPT_API_DOCS.map((d) => d.group))).map((g) => <div key={g}><div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">{g}</div>{SCRIPT_API_DOCS.filter((d) => d.group === g).map((d) => <button key={d.name} type="button" onClick={() => up({ codeScript: (wf.codeScript || "") + (wf.codeScript?.endsWith("\n") || !wf.codeScript ? "" : "\n") + d.sig + "\n" })} className="w-full text-left px-3 py-1.5 hover:bg-indigo-50"><code className="block text-[10px] text-indigo-700 font-mono break-all">{d.sig}</code><span className="text-[10px] text-slate-500">{d.desc}</span></button>)}</div>)}</div>}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {wf.actions.map((a, i) => (
                  <ActionEditor key={a.id} action={a} index={i} wf={wf} form={form} app={currentApp} fieldOptions={fieldOptions} onChange={(p) => upAction(a.id, p)} onRemove={() => up({ actions: wf.actions.filter((x) => x.id !== a.id) })} onMove={(d) => { const n = [...wf.actions]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; up({ actions: n }); }} />
                ))}
                <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Add action</div>
                  <div className="flex flex-wrap gap-1.5">{ACTIONS.map((ac) => <button key={ac.id} type="button" onClick={() => up({ actions: [...wf.actions, { id: generateId("act"), type: ac.id, popupType: ac.id === "showPopup" ? "warning" : undefined }] })} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700"><span className="text-[9px] uppercase text-slate-400 mr-1">{ac.group}</span>{ac.label}</button>)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {templatesOpen && (
        <Modal isOpen onClose={() => setTemplatesOpen(false)} title="Workflow templates" description="Start from a working script and adapt the field names." maxWidth="3xl" icon={<Sparkles className="w-4 h-4" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {WORKFLOW_TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => { const w = createWorkflow({ name: t.name, description: t.description, formId: filterForm || currentApp.forms[0]?.id, mode: t.mode, trigger: t.trigger, codeScript: t.codeScript }); setSelectedId(w.id); setTemplatesOpen(false); }} className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40">
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900">{t.name}</span><Badge variant="default">{t.category}</Badge></div>
                <p className="text-[11px] text-slate-500 mt-1">{t.description}</p>
                <code className="block text-[10px] text-slate-400 mt-2 truncate font-mono">{t.codeScript?.split("\n").find((l) => l && !l.startsWith("//"))}</code>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {testOpen && wf && form && <TestRunModal wf={wf} onClose={() => setTestOpen(false)} />}
      {logsOpen && wf && <LogsModal wf={wf} onClose={() => setLogsOpen(false)} />}
      <ConfirmDialog isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) { deleteWorkflow(deleteId); setSelectedId(null); } }} title="Delete workflow" message="This automation will stop running immediately." />
    </div>
  );
};

// ── visual action editor ─────────────────────────────────────────────────────

const ActionEditor: React.FC<{ action: WorkflowAction; index: number; wf: WorkflowDefinition; form: any; app: any; fieldOptions: any[]; onChange: (p: Partial<WorkflowAction>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }> = ({ action, index, form, app, fieldOptions, onChange, onRemove, onMove }) => {
  const [condOpen, setCondOpen] = useState(Boolean(action.visualConditions?.length || action.condition));
  const meta = ACTIONS.find((a) => a.id === action.type);
  const needsTarget = ["setValue", "copyField", "calculateValue", "clearField", "setHidden", "setVisible", "setReadonly", "setEditable", "validate"].includes(action.type);
  const otherForms = app.forms.filter((f: any) => f.id !== form.id);
  const targetForm = app.forms.find((f: any) => f.id === action.crossFormUpdate?.targetFormId || f.id === action.createRecord?.targetFormId);
  const pathOptions = (kind: "lookup" | "number", tfId?: string) => [
    ...form.fields.filter((f: any) => (kind === "lookup" ? f.type === "lookup" && (!tfId || f.lookup?.targetFormId === tfId) : ["number", "currency", "decimal", "percentage", "formula"].includes(f.type))).map((f: any) => ({ id: f.id, label: f.label })),
    ...form.fields.filter((f: any) => f.type === "subform").flatMap((sf: any) => (sf.subform?.columns || []).filter((c: any) => (kind === "lookup" ? c.type === "lookup" && (!tfId || c.lookup?.targetFormId === tfId) : ["number", "currency", "decimal", "percentage", "formula"].includes(c.type))).map((c: any) => ({ id: `${sf.id}.${c.id}`, label: `${sf.label} › ${c.label}` }))),
  ];
  const addCond = () => onChange({ visualConditions: [...(action.visualConditions || []), { id: generateId("cond"), fieldId: fieldOptions[0]?.id || "", operator: "equals", compareType: "literal", value: "" }] });
  const upCond = (id: string, p: Partial<VisualCondition>) => onChange({ visualConditions: (action.visualConditions || []).map((c) => (c.id === id ? { ...c, ...p } : c)) });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-3xs">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">{index + 1}</span>
        <span className="text-xs font-semibold text-slate-900 flex-1">{meta?.label}</span>
        <button type="button" onClick={() => setCondOpen((o) => !o)} className={`text-[11px] px-2 py-1 rounded-md border ${action.visualConditions?.length || action.condition ? "bg-amber-50 border-amber-200 text-amber-800" : "border-slate-200 text-slate-500"}`}>Condition {action.visualConditions?.length ? `(${action.visualConditions.length})` : ""}</button>
        <IconButton size="sm" onClick={() => onMove(-1)}><ChevronDown className="w-3.5 h-3.5 rotate-180" /></IconButton><IconButton size="sm" onClick={() => onMove(1)}><ChevronDown className="w-3.5 h-3.5" /></IconButton>
        <IconButton size="sm" tone="danger" onClick={onRemove}><Trash2 className="w-3.5 h-3.5" /></IconButton>
      </div>
      <div className="p-4 space-y-3 text-xs">
        {condOpen && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-amber-900">Run only when</span><div className="flex items-center gap-2"><select value={action.conditionLogic || "AND"} onChange={(e) => onChange({ conditionLogic: e.target.value as any })} className="text-[11px] border rounded px-1.5 py-0.5 bg-white"><option value="AND">ALL match</option><option value="OR">ANY match</option></select><button type="button" onClick={addCond} className="text-[11px] font-semibold text-amber-800">+ condition</button></div></div>
            {(action.visualConditions || []).map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
                <select value={c.fieldId} onChange={(e) => upCond(c.id, { fieldId: e.target.value })} className="border rounded px-1.5 py-1 bg-white">{fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                <select value={c.operator} onChange={(e) => upCond(c.id, { operator: e.target.value as ReportOperator })} className="border rounded px-1.5 py-1 bg-white">{OPERATORS.filter((o) => !o.types).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                <select value={c.compareType} onChange={(e) => upCond(c.id, { compareType: e.target.value as any })} className="border rounded px-1.5 py-1 bg-white"><option value="literal">value</option><option value="field">field</option></select>
                {c.compareType === "field" ? <select value={c.compareFieldId || ""} onChange={(e) => upCond(c.id, { compareFieldId: e.target.value })} className="border rounded px-1.5 py-1 bg-white"><option value="">field…</option>{fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select> : <input value={c.value ?? ""} onChange={(e) => upCond(c.id, { value: e.target.value })} className="border rounded px-1.5 py-1 w-28" placeholder="value" />}
                <IconButton size="sm" tone="danger" onClick={() => onChange({ visualConditions: (action.visualConditions || []).filter((x) => x.id !== c.id) })}><X className="w-3 h-3" /></IconButton>
              </div>
            ))}
            <div><label className="text-[10px] text-amber-800">or advanced expression</label><input value={action.condition || ""} onChange={(e) => onChange({ condition: e.target.value })} placeholder='e.g. total > 1000 && status == "Draft"' className="w-full border rounded px-2 py-1 font-mono bg-white" /></div>
          </div>
        )}

        {needsTarget && <Select size="sm" label="Target field" value={action.targetFieldId || ""} onChange={(e) => onChange({ targetFieldId: e.target.value })}><option value="">Choose…</option>{fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
        {action.type === "setValue" && <Input size="sm" label="Value" value={action.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />}
        {action.type === "copyField" && <Select size="sm" label="Copy from" value={action.copySourceFieldId || ""} onChange={(e) => onChange({ copySourceFieldId: e.target.value })}><option value="">Choose…</option>{fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>}
        {action.type === "calculateValue" && <FormulaEditor value={action.expression || ""} onChange={(v) => onChange({ expression: v, visualCalculation: undefined })} form={form} app={app} rows={2} placeholder="quantity * rate" sample={false} />}
        {(action.type === "showMessage" || action.type === "validate" || action.type === "blockSubmit") && <Input size="sm" label="Message" value={action.message || ""} onChange={(e) => onChange({ message: e.target.value })} placeholder="Use {{field}} to insert values" />}
        {action.type === "showPopup" && (
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <div className="space-y-2"><Input size="sm" label="Title" value={action.title || ""} onChange={(e) => onChange({ title: e.target.value })} /><Textarea label="Message" rows={2} value={action.message || ""} onChange={(e) => onChange({ message: e.target.value })} placeholder="Stock for {{item.name}} is low ({{item.stock}} left)." /></div>
            <div className="space-y-2"><Select size="sm" label="Type" value={action.popupType || "warning"} onChange={(e) => onChange({ popupType: e.target.value as any })}><option value="info">Info (continue)</option><option value="warning">Warning (continue)</option><option value="confirm">Confirm (continue anyway?)</option><option value="error">Error (block)</option></Select>{action.popupType !== "error" && <Toggle size="sm" checked={Boolean(action.blockSubmitOnPopup)} onChange={(v) => onChange({ blockSubmitOnPopup: v })} label="Force block" />}</div>
          </div>
        )}
        {action.type === "updateOtherForm" && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select size="sm" label="Target form" value={action.crossFormUpdate?.targetFormId || ""} onChange={(e) => onChange({ crossFormUpdate: { targetFormId: e.target.value, matchLookupFieldId: "", updateFieldId: "", operation: "decrement", sourceFieldId: "" } })}><option value="">Choose…</option>{otherForms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            <Select size="sm" label="Match via lookup" value={action.crossFormUpdate?.matchLookupFieldId || ""} onChange={(e) => onChange({ crossFormUpdate: { ...action.crossFormUpdate!, matchLookupFieldId: e.target.value } })}><option value="">Choose…</option>{pathOptions("lookup", action.crossFormUpdate?.targetFormId).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
            <Select size="sm" label="Update field" value={action.crossFormUpdate?.updateFieldId || ""} onChange={(e) => onChange({ crossFormUpdate: { ...action.crossFormUpdate!, updateFieldId: e.target.value } })}><option value="">Choose…</option>{targetForm?.fields.filter((f: any) => ["number", "currency", "decimal"].includes(f.type)).map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
            <Select size="sm" label="Operation" value={action.crossFormUpdate?.operation || "decrement"} onChange={(e) => onChange({ crossFormUpdate: { ...action.crossFormUpdate!, operation: e.target.value as any } })}><option value="increment">Increase by</option><option value="decrement">Decrease by</option><option value="set">Set to</option></Select>
            <Select size="sm" label="Amount from" value={action.crossFormUpdate?.sourceFieldId || ""} onChange={(e) => onChange({ crossFormUpdate: { ...action.crossFormUpdate!, sourceFieldId: e.target.value } })}><option value="">Choose…</option>{pathOptions("number").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
            <p className="col-span-full text-[10px] text-slate-500">Runs after save. If the lookup is a subform column, every row updates its own target (PO items → Item stock).</p>
          </div>
        )}
        {action.type === "createRecord" && (
          <div className="space-y-2">
            <Select size="sm" label="Create in form" value={action.createRecord?.targetFormId || ""} onChange={(e) => onChange({ createRecord: { targetFormId: e.target.value, fieldMap: [] } })}><option value="">Choose…</option>{otherForms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            {targetForm && <>
              {(action.createRecord?.fieldMap || []).map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-1.5 items-center">
                  <select value={m.targetFieldId} onChange={(e) => onChange({ createRecord: { ...action.createRecord!, fieldMap: action.createRecord!.fieldMap.map((x, j) => (j === i ? { ...x, targetFieldId: e.target.value } : x)) } })} className="border rounded px-1.5 py-1 bg-white"><option value="">{targetForm.name} field…</option>{targetForm.fields.filter((f: any) => f.type !== "section").map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
                  <span className="text-slate-400">=</span>
                  <select value={m.sourceType} onChange={(e) => onChange({ createRecord: { ...action.createRecord!, fieldMap: action.createRecord!.fieldMap.map((x, j) => (j === i ? { ...x, sourceType: e.target.value as any } : x)) } })} className="border rounded px-1.5 py-1 bg-white"><option value="field">this form&apos;s field</option><option value="literal">fixed value</option><option value="expression">expression</option></select>
                  {m.sourceType === "field" ? <select value={m.source} onChange={(e) => onChange({ createRecord: { ...action.createRecord!, fieldMap: action.createRecord!.fieldMap.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) } })} className="border rounded px-1.5 py-1 bg-white"><option value="">field…</option>{fieldOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select> : <input value={m.source} onChange={(e) => onChange({ createRecord: { ...action.createRecord!, fieldMap: action.createRecord!.fieldMap.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) } })} className="border rounded px-1.5 py-1 font-mono" />}
                  <IconButton size="sm" tone="danger" onClick={() => onChange({ createRecord: { ...action.createRecord!, fieldMap: action.createRecord!.fieldMap.filter((_, j) => j !== i) } })}><X className="w-3 h-3" /></IconButton>
                </div>
              ))}
              <button type="button" onClick={() => onChange({ createRecord: { ...action.createRecord!, fieldMap: [...(action.createRecord?.fieldMap || []), { targetFieldId: "", sourceType: "field", source: "" }] } })} className="text-[11px] font-semibold text-blue-600">+ Map field</button>
            </>}
          </div>
        )}
        {action.type === "sendEmail" && (
          <div className="grid grid-cols-2 gap-2">
            <Input size="sm" label="To (comma separated, {{field}} ok)" value={action.email?.to || ""} onChange={(e) => onChange({ email: { ...(action.email || { subject: "", body: "" }), to: e.target.value } })} />
            <Input size="sm" label="CC" value={action.email?.cc || ""} onChange={(e) => onChange({ email: { ...(action.email || { to: "", subject: "", body: "" }), cc: e.target.value } })} />
            <div className="col-span-2"><Input size="sm" label="Subject" value={action.email?.subject || ""} onChange={(e) => onChange({ email: { ...(action.email || { to: "", body: "" }), subject: e.target.value } })} /></div>
            <div className="col-span-2"><Textarea label="Body" rows={3} value={action.email?.body || ""} onChange={(e) => onChange({ email: { ...(action.email || { to: "", subject: "" }), body: e.target.value } })} placeholder="Hello {{customer.name}}, your invoice {{invoice_no}} total is {{total}}." helperText="Queued to the Firestore &apos;mail&apos; collection — install the Firebase Trigger Email extension to deliver." /></div>
          </div>
        )}
        {action.type === "notify" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1"><label className="text-[11px] font-medium text-slate-700">Notify members</label><div className="flex flex-wrap gap-1">{app.members.map((m: any) => { const on = action.notification?.toUsers.includes(m.email); return <button key={m.email} type="button" onClick={() => onChange({ notification: { ...(action.notification || { title: "", body: "", toUsers: [] }), toUsers: on ? action.notification!.toUsers.filter((x) => x !== m.email) : [...(action.notification?.toUsers || []), m.email] } })} className={`px-2 py-0.5 rounded-full text-[11px] border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}>{m.name || m.email}</button>; })}</div></div>
            <Input size="sm" label="Title" value={action.notification?.title || ""} onChange={(e) => onChange({ notification: { ...(action.notification || { toUsers: [], body: "" }), title: e.target.value } })} />
            <Input size="sm" label="Body" value={action.notification?.body || ""} onChange={(e) => onChange({ notification: { ...(action.notification || { toUsers: [], title: "" }), body: e.target.value } })} />
          </div>
        )}
        {action.type === "callWebhook" && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Input size="sm" label="URL" value={action.webhook?.url || ""} onChange={(e) => onChange({ webhook: { ...(action.webhook || { method: "POST" }), url: e.target.value } })} placeholder="https://hooks.zapier.com/…" />
            <Select size="sm" label="Method" value={action.webhook?.method || "POST"} onChange={(e) => onChange({ webhook: { ...(action.webhook || { url: "" }), method: e.target.value as any } })}><option>POST</option><option>PUT</option><option>GET</option></Select>
            <div className="col-span-2"><Textarea label="JSON body template (blank = whole record)" rows={2} value={action.webhook?.bodyTemplate || ""} onChange={(e) => onChange({ webhook: { ...(action.webhook || { url: "", method: "POST" }), bodyTemplate: e.target.value } })} placeholder='{"item": "{{item.name}}", "qty": {{quantity}}}' /></div>
          </div>
        )}
        {action.type === "requestApproval" && (
          <div className="grid grid-cols-2 gap-2">
            <Input size="sm" label="Approver emails (comma)" value={(action.approval?.approverEmails || []).join(", ")} onChange={(e) => onChange({ approval: { ...(action.approval || {}), approverEmails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} />
            <Select size="sm" label="Status field to set 'Pending Approval'" value={action.approval?.statusFieldId || ""} onChange={(e) => onChange({ approval: { ...(action.approval || { approverEmails: [] }), statusFieldId: e.target.value } })}><option value="">None</option>{fieldOptions.filter((f) => f.type === "dropdown" || f.type === "text").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
            <div className="col-span-2"><Input size="sm" label="Message to approvers" value={action.message || ""} onChange={(e) => onChange({ message: e.target.value })} /></div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── test runner ──────────────────────────────────────────────────────────────

const TestRunModal: React.FC<{ wf: WorkflowDefinition; onClose: () => void }> = ({ wf, onClose }) => {
  const { currentApp, loadRecords } = useAppBuilder();
  const { user } = useAuth();
  const form = currentApp!.forms.find((f) => f.id === wf.formId)!;
  const [values, setValues] = useState<Record<string, any>>(() => Object.fromEntries(form.fields.filter((f) => f.type !== "section").map((f) => [f.id, f.type === "subform" ? [] : f.type === "checkbox" ? false : ""])));
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [recordsMap, setRecordsMap] = useState<Record<string, any[]>>({});

  useEffect(() => { (async () => { const m: Record<string, any[]> = {}; for (const f of currentApp!.forms) m[f.id] = await loadRecords(f.id); setRecordsMap(m); })(); }, [currentApp, loadRecords]);

  const run = () => {
    const triggerField = wf.trigger.fieldId?.split(".")[0];
    const r = executeWorkflows([{ ...wf, active: true }], wf.trigger.type === "onEdit" ? "onLoad" : wf.trigger.type, triggerField || form.fields[0]?.id, values, form, { app: currentApp, recordsMap, user: user ? { email: user.email, name: user.name } : null, isEdit: wf.trigger.type === "onEdit" });
    setResult(r);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Test: ${wf.name}`} description="Enter sample values and run. Nothing is saved — data operations are listed, not executed." maxWidth="4xl" icon={<Play className="w-4 h-4" />} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={run} icon={<Play className="w-3.5 h-3.5" />}>Run</Button></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {form.fields.filter((f) => !["section", "subform", "formula", "rollup", "autonumber"].includes(f.type)).map((f) => (
            <Input key={f.id} size="sm" label={`${f.label} (${f.linkName})`} value={values[f.id] ?? ""} onChange={(e) => setValues({ ...values, [f.id]: ["number", "currency", "decimal", "percentage"].includes(f.type) ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} placeholder={f.type === "lookup" ? "record id" : f.type} />
          ))}
          {form.fields.filter((f) => f.type === "subform").map((f) => (
            <Textarea key={f.id} label={`${f.label} rows (JSON, keys = column link names)`} rows={3} value={typeof values[f.id] === "string" ? values[f.id] : JSON.stringify(values[f.id] || [])} onChange={(e) => { try { const rows = JSON.parse(e.target.value); const mapped = rows.map((r: any) => { const o: any = {}; for (const c of f.subform?.columns || []) o[c.id] = r[c.linkName] ?? r[c.id] ?? ""; return o; }); setValues({ ...values, [f.id]: mapped }); } catch { setValues({ ...values, [f.id]: e.target.value }); } }} className="font-mono" />
          ))}
        </div>
        <div className="space-y-3">
          {!result ? <div className="text-xs text-slate-400 text-center py-12 border-2 border-dashed rounded-xl">Click Run to execute.</div> : (
            <>
              <div className={`rounded-lg p-3 text-xs border ${result.shouldBlockSubmit ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>{result.shouldBlockSubmit ? "Submit would be BLOCKED" : "Submit would continue"} · {result.logs[0]?.durationMs ?? 0} ms</div>
              {result.popupAlert && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><div className="font-bold text-amber-900">Popup ({result.popupAlert.type})</div><div className="text-amber-800">{result.popupAlert.message}</div></div>}
              <Block title="Changed values">{Object.entries(result.updatedValues).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(values[k]) && !k.endsWith("__rec")).map(([k, v]) => <div key={k} className="font-mono"><span className="text-slate-500">{form.fields.find((f) => f.id === k)?.linkName || k}</span> = <span className="text-indigo-700">{JSON.stringify(v)}</span></div>)}</Block>
              <Block title="Messages / console">{result.messages.map((m, i) => <div key={i} className={m.type === "error" ? "text-rose-600" : m.type === "warning" ? "text-amber-700" : "text-slate-700"}>[{m.type}] {m.text}</div>)}</Block>
              <Block title="Data operations (would run after save)">{result.dataOps.map((op, i) => <div key={i} className="font-mono text-emerald-800">{op.type} {currentApp!.forms.find((f) => f.id === op.formId)?.name} {op.recordId || ""} {op.fieldId ? `${op.fieldId} ${op.amount! >= 0 ? "+" : ""}${op.amount}` : ""} {op.data ? JSON.stringify(op.data) : ""}</div>)}</Block>
              <Block title="Field errors">{Object.entries(result.validationErrors).map(([k, v]) => <div key={k} className="text-rose-600">{form.fields.find((f) => f.id === k)?.label || k}: {v}</div>)}</Block>
              <Block title="Visibility / readonly">{Object.entries(result.fieldVisibility).map(([k, v]) => <div key={k}>{form.fields.find((f) => f.id === k)?.label || k}: {v ? "hidden" : "visible"}</div>)}{Object.entries(result.fieldReadonly).map(([k, v]) => <div key={`ro${k}`}>{form.fields.find((f) => f.id === k)?.label || k}: {v ? "read-only" : "editable"}</div>)}</Block>
              {(result.emails.length > 0 || result.webhooks.length > 0 || result.notifications.length > 0) && <Block title="Integrations">{result.emails.map((e, i) => <div key={`e${i}`}>✉ {e.to.join(", ")} — {e.subject}</div>)}{result.notifications.map((n, i) => <div key={`n${i}`}>🔔 {n.toUsers.join(", ")} — {n.title}</div>)}{result.webhooks.map((w, i) => <div key={`w${i}`}>🌐 {w.method} {w.url}</div>)}</Block>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Block: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const arr = React.Children.toArray(children);
  if (arr.length === 0) return null;
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] space-y-0.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{title}</div>{children}</div>;
};

const LogsModal: React.FC<{ wf: WorkflowDefinition; onClose: () => void }> = ({ wf, onClose }) => {
  const { currentApp } = useAppBuilder();
  const [logs, setLogs] = useState<WorkflowLogEntry[] | null>(null);
  useEffect(() => { if (currentApp) storageService.listWorkflowLogs(currentApp.id, 300).then((l) => setLogs(l.filter((x) => x.workflowId === wf.id))); }, [currentApp, wf.id]);
  return (
    <Modal isOpen onClose={onClose} title={`Execution history: ${wf.name}`} description="Recorded when the workflow ran during a real save." maxWidth="3xl" icon={<History className="w-4 h-4" />}>
      {!logs ? <p className="text-xs text-slate-400">Loading…</p> : logs.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No executions recorded yet.</p> : (
        <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">{logs.map((l) => <div key={l.id} className="py-2.5 text-xs"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><Badge variant={l.status === "success" ? "success" : l.status === "blocked" ? "warning" : "danger"}>{l.status}</Badge><span className="text-slate-500">{new Date(l.createdAt).toLocaleString()}</span><span className="text-slate-400">{l.user}</span></span><span className="text-[10px] text-slate-400">{l.durationMs} ms · {l.recordId}</span></div>{l.messages.length > 0 && <ul className="mt-1 pl-3 text-[11px] text-slate-600 list-disc">{l.messages.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}</ul>}</div>)}</div>
      )}
    </Modal>
  );
};
