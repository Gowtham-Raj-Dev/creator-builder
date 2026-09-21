"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/Button";
import { Select, Textarea, Badge } from "@/components/ui/FormControls";
import { generateReportFromPrompt, generateFormFromPrompt, generateWorkflowFromPrompt, generateDashboardFromPrompt, ReportProposal, FormProposal, WorkflowProposal, DashboardProposal } from "@/lib/ai/generators";
import { getBuilderUrl } from "@/lib/utils/routes";
import { AiDeletePanel } from "./AiDeletePanel";
import { withParentLinkColumns } from "@/lib/engine/subformLink";
import { TableProperties, FileText, Zap, ArrowRight, CheckCircle2, Sparkles, Filter, Code2, LayoutDashboard } from "lucide-react";

const useRun = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(false); } };
  return { busy, error, run };
};

const ErrorBox: React.FC<{ error: string }> = ({ error }) => (error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div> : null);

// ── New report ───────────────────────────────────────────────────────────────

export const AiNewReport: React.FC<{ disabled: boolean; initialPrompt?: string; initialFormId?: string }> = ({ disabled, initialPrompt, initialFormId }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [formId, setFormId] = useState(initialFormId || "");
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<ReportProposal | null>(null);
  if (!currentApp) return null;
  const form = proposal ? currentApp.forms.find((f) => f.id === proposal.report.sourceFormId) : null;
  const fieldLabel = (id?: string) => form?.fields.find((f) => f.id === id)?.label || id;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
      <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><TableProperties className="w-4 h-4 text-blue-600" /> Create a report from a description</h3><p className="text-xs text-slate-500">Choose the source form (optional) and describe the view. Filters, columns, grouping, type (table / kanban / calendar / summary / pivot) are picked for you.</p></div>
      <div className="grid grid-cols-[220px_1fr] gap-3 items-start">
        <Select label="Source form" value={formId} onChange={(e) => setFormId(e.target.value)}><option value="">Let AI decide</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Textarea label="Describe the report" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Only active states, sorted by name · Pending invoices this month grouped by customer with total amount · Invoices as kanban by payment status" />
      </div>
      <Button loading={busy} disabled={disabled || !prompt.trim()} icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => setProposal(await generateReportFromPrompt(prompt, currentApp, formId || undefined)))}>Generate report</Button>
      <ErrorBox error={error} />
      {proposal && form && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {proposal.report.name}</span><Badge variant="primary">{proposal.report.reportType}</Badge></div>
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Source</div>{form.name}</div>
            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Columns</div>{proposal.report.columns.filter((c) => c.visible).map((c) => c.label).join(", ")}</div>
            {proposal.report.filterGroups?.[0]?.filters.length ? <div className="md:col-span-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Filter className="w-3 h-3" /> Filters</div>{proposal.report.filterGroups[0].filters.map((f) => <span key={f.id} className="inline-block mr-1.5 mb-1 px-2 py-0.5 rounded-full bg-white border border-slate-200">{fieldLabel(f.fieldId)} {f.operator.replace(/_/g, " ")} {f.preset || (f.value !== undefined && f.value !== "" ? String(f.value) : "")}</span>)}</div> : null}
            {proposal.report.groupByFieldId && <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Group by</div>{fieldLabel(proposal.report.groupByFieldId)}{proposal.report.groupAggregates?.length ? ` · ${proposal.report.groupAggregates.map((g) => `${g.aggregate}(${fieldLabel(g.fieldId)})`).join(", ")}` : ""}</div>}
            {proposal.report.defaultSortField && <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sort</div>{fieldLabel(proposal.report.defaultSortField)} {proposal.report.defaultSortOrder}</div>}
          </div>
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => setProposal(null)}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => { updateCurrentApp((prev) => ({ ...prev, reports: [...prev.reports, proposal.report] })); showToast(`Report "${proposal.report.name}" created`, "success"); router.push(getBuilderUrl(currentApp.linkName, { tab: "reports", report: proposal.report.linkName })); }}>Create & open</Button></div>
        </div>
      )}
      <AiDeletePanel kind="report" />
    </div>
  );
};

// ── New form ─────────────────────────────────────────────────────────────────

export const AiNewForm: React.FC<{ disabled: boolean; initialPrompt?: string }> = ({ disabled, initialPrompt }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<FormProposal | null>(null);
  if (!currentApp) return null;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
      <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600" /> Create a single form</h3><p className="text-xs text-slate-500">Describe one form. It can look up any existing form ({currentApp.forms.map((f) => f.name).join(", ") || "none yet"}) and gets a default report automatically.</p></div>
      <Textarea label="Describe the form" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Vendor form: vendor code (auto number VEN-0001), vendor name, phone, GSTIN, city (lookup City), state (lookup State), payment terms (dropdown: Cash, 15 days, 30 days), active checkbox" />
      <Button loading={busy} disabled={disabled || !prompt.trim()} icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => setProposal(await generateFormFromPrompt(prompt, currentApp)))}>Generate form</Button>
      <ErrorBox error={error} />
      {proposal && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {proposal.form.name} <span className="font-normal text-slate-500">· {proposal.form.fields.filter((f) => f.type !== "section").length} fields</span></div>
          {proposal.extraForms?.length ? <div className="text-[11px] text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5">Also creates child form{proposal.extraForms.length > 1 ? "s" : ""}: <strong>{proposal.extraForms.map((f) => f.name).join(", ")}</strong> — used as a linked subform (rows saved as its records, with a lookup back to {proposal.form.name}).</div> : null}
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="flex flex-wrap gap-1">{proposal.form.fields.map((f) => <Badge key={f.id} variant={f.type === "lookup" ? "primary" : f.type === "subform" ? "purple" : f.type === "formula" || f.type === "rollup" ? "indigo" : f.type === "section" ? "dark" : "default"}>{f.label}{f.type === "lookup" ? ` → ${currentApp.forms.find((x) => x.id === f.lookup?.targetFormId)?.name || "?"}` : ""}{f.required ? " *" : ""}</Badge>)}</div>
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => setProposal(null)}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => { const newForms = [...(proposal.extraForms || []), proposal.form]; const newReports = [...(proposal.extraReports || []), proposal.report].filter(Boolean); updateCurrentApp((prev) => withParentLinkColumns({ ...prev, forms: [...prev.forms.map((f) => (proposal.updatedForms || []).find((u) => u.id === f.id) || f), ...newForms], reports: [...prev.reports, ...newReports], roles: prev.roles.map((r) => ({ ...r, forms: { ...r.forms, ...Object.fromEntries(newForms.map((nf) => [nf.id, r.defaultForm || { view: true, create: true, edit: true, delete: false, print: true, export: false, import: false, recordScope: "all" }])) } })) })); showToast(newForms.length > 1 ? `Created ${newForms.map((f) => f.name).join(" + ")}` : `Form "${proposal.form.name}" created`, "success"); router.push(getBuilderUrl(currentApp.linkName, { tab: "forms", form: proposal.form.linkName })); }}>Create & open</Button></div>
        </div>
      )}
      <AiDeletePanel kind="form" />
    </div>
  );
};

// ── New workflow ─────────────────────────────────────────────────────────────

export const AiNewWorkflow: React.FC<{ disabled: boolean; initialPrompt?: string; initialFormId?: string }> = ({ disabled, initialPrompt, initialFormId }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [formId, setFormId] = useState(initialFormId || currentApp?.forms[0]?.id || "");
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<WorkflowProposal | null>(null);
  if (!currentApp) return null;
  const form = currentApp.forms.find((f) => f.id === formId);

  const apply = () => {
    if (!proposal) return;
    if (proposal.kind === "workflow") {
      updateCurrentApp((prev) => ({ ...prev, workflows: [...prev.workflows, proposal.workflow] }));
      showToast(`Workflow "${proposal.workflow.name}" created`, "success");
      router.push(getBuilderUrl(currentApp.linkName, { tab: "workflows", workflow: proposal.workflow.id }));
    } else {
      updateCurrentApp((prev) => ({
        ...prev,
        forms: prev.forms.map((f) => ({
          ...f,
          fields: f.fields.map((fld) => {
            if (fld.type === "lookup" && fld.lookup?.targetFormId === proposal.targetFormId) return { ...fld, lookup: { ...fld.lookup, filters: proposal.filters } };
            if (fld.type === "subform" && fld.subform) return { ...fld, subform: { ...fld.subform, columns: fld.subform.columns.map((c) => (c.type === "lookup" && c.lookup?.targetFormId === proposal.targetFormId ? { ...c, lookup: { ...c.lookup, filters: proposal.filters } } : c)) } };
            return fld;
          }),
        })),
      }));
      showToast(`Lookup filter applied to ${proposal.affected.length} field(s)`, "success");
      setProposal(null);
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
      <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Write a workflow / rule from a description</h3><p className="text-xs text-slate-500">Pick the form the rule belongs to and explain it in plain words. If the request is really about which records may be chosen in a lookup (e.g. inactive states must not appear), the AI proposes a lookup filter instead of a script.</p></div>
      <div className="grid grid-cols-[220px_1fr] gap-3 items-start">
        <div className="space-y-2">
          <Select label="Form" value={formId} onChange={(e) => setFormId(e.target.value)}>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
          {form && <div className="text-[10px] text-slate-400 leading-relaxed max-h-28 overflow-y-auto">Fields: {form.fields.filter((f) => f.type !== "section").map((f) => f.linkName).join(", ")}</div>}
        </div>
        <Textarea label="Describe the rule" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={`e.g. When Active is No, this ${form?.name || "record"} must not appear in any lookup dropdown · Block save if quantity is more than product stock and show a message · After saving, reduce product stock by the quantity of each line item · If payment mode is Cheque, cheque number is mandatory`} />
      </div>
      <Button loading={busy} disabled={disabled || !prompt.trim() || !formId} icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => setProposal(await generateWorkflowFromPrompt(prompt, currentApp, formId)))}>Generate</Button>
      <ErrorBox error={error} />
      {proposal && proposal.kind === "workflow" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 flex items-center gap-1.5"><Code2 className="w-4 h-4 text-indigo-600" /> {proposal.workflow.name}</span><Badge variant="warning">{proposal.workflow.trigger.type}{proposal.workflow.trigger.fieldId ? ` · ${form?.fields.find((f) => f.id === proposal.workflow.trigger.fieldId?.split(".")[0])?.label || ""}` : ""}</Badge></div>
          <p className="text-slate-600">{proposal.explanation}</p>
          <pre className="bg-slate-900 text-emerald-200 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">{proposal.workflow.codeScript}</pre>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setProposal(null)}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={apply}>Create workflow & open</Button></div>
        </div>
      )}
      {proposal && proposal.kind === "lookup_filter" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3 text-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5"><Filter className="w-4 h-4 text-blue-600" /> Lookup filter on {currentApp.forms.find((f) => f.id === proposal.targetFormId)?.name}</div>
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="flex flex-wrap gap-1">{proposal.filters.map((f) => <span key={f.id} className="px-2 py-0.5 rounded-full bg-white border border-blue-200">{currentApp.forms.find((x) => x.id === proposal.targetFormId)?.fields.find((x) => x.id === f.fieldId)?.label} {f.operator.replace(/_/g, " ")} {f.value !== undefined && f.value !== "" ? String(f.value) : ""}</span>)}</div>
          <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Will be applied to {proposal.affected.length} lookup field(s)</div>{proposal.affected.length ? <ul className="list-disc pl-4 text-slate-700">{proposal.affected.map((a) => <li key={`${a.fieldId}${a.columnId || ""}`}>{a.label}</li>)}</ul> : <p className="text-amber-700">No form currently looks up this form — the filter has nothing to apply to yet.</p>}</div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setProposal(null)}>Discard</Button><Button size="sm" disabled={proposal.affected.length === 0} icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={apply}>Apply filter</Button></div>
        </div>
      )}
      <AiDeletePanel kind="workflow" />
    </div>
  );
};

// ── New dashboard ────────────────────────────────────────────────────────────

export const AiNewDashboard: React.FC<{ disabled: boolean; initialPrompt?: string }> = ({ disabled, initialPrompt }) => {
  const { currentApp, createPage, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<DashboardProposal | null>(null);
  const [asHome, setAsHome] = useState(true);
  if (!currentApp) return null;
  const label = (c: any) => {
    const f = currentApp.forms.find((x) => x.id === c.props?.formId);
    switch (c.type) {
      case "heading": return c.props.title;
      case "filter_panel": return `Date filter${c.props.defaultPreset ? ` · default ${String(c.props.defaultPreset).replace(/_/g, " ")}` : ""}`;
      case "stat_card": return `${c.props.stats.length} KPI cards: ${c.props.stats.map((s: any) => s.label).join(", ")}`;
      case "chart": return `${c.props.chartType} · ${f?.name || "?"} · ${c.props.metric}${c.props.measureFieldId ? ` of ${f?.fields.find((x: any) => x.id === c.props.measureFieldId)?.label}` : ""} by ${c.props.groupByFieldId === "createdAt" ? "date" : f?.fields.find((x: any) => x.id === c.props.groupByFieldId)?.label}`;
      case "report_embed": return `Report: ${currentApp.reports.find((r) => r.id === c.props.reportId)?.name}${c.props.view ? ` (${c.props.view})` : ""}`;
      case "quick_links": return `Quick links: ${c.props.links.map((l: any) => l.label).join(", ")}`;
      default: return c.type;
    }
  };
  const apply = () => {
    if (!proposal) return;
    const page = createPage(proposal.name, proposal.explanation);
    setTimeout(() => updateCurrentApp((prev) => ({ ...prev, pages: prev.pages.map((p) => (p.id === page.id ? { ...p, components: proposal.components, isHome: asHome } : asHome ? { ...p, isHome: false } : p)) })), 30);
    showToast(`Dashboard "${proposal.name}" created`, "success");
    setTimeout(() => router.push(getBuilderUrl(currentApp.linkName, { tab: "pages", page: page.linkName })), 80);
  };
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
      <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-emerald-600" /> Create a dashboard from a description</h3><p className="text-xs text-slate-500">Say what you want to watch. You get a page with a date filter, KPI cards, charts, a report widget and quick links — using your real forms and fields.</p></div>
      <Textarea label="Describe the dashboard" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Sales overview: this month's sales, invoice count, outstanding and average bill; sales by month, payment status split, top customers; list of pending invoices; buttons for new invoice and new customer" />
      <div className="flex flex-wrap gap-1.5">{["Sales overview with outstanding and top customers", "Stock health: low stock items, purchases vs sales by month", "Owner daily view: today's sales, collections, pending deliveries", "Customer insights: new customers per month, city-wise split"].map((p) => <button key={p} type="button" onClick={() => setPrompt(p)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:text-emerald-700">{p}</button>)}</div>
      <Button loading={busy} disabled={disabled || !prompt.trim()} icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => setProposal(await generateDashboardFromPrompt(prompt, currentApp)))}>Generate dashboard</Button>
      <ErrorBox error={error} />
      {proposal && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {proposal.name}</span><Badge variant="primary">{proposal.components.length} widgets</Badge></div>
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="grid grid-cols-12 gap-1.5">{proposal.components.map((c: any) => <div key={c.id} style={{ gridColumn: `span ${c.width} / span ${c.width}` }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{String(c.type).replace("_", " ")} · {c.width}/12</div><div className="text-slate-800 truncate">{label(c)}</div></div>)}</div>
          <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={asHome} onChange={(e) => setAsHome(e.target.checked)} className="rounded border-slate-300" /> Make it the app&apos;s home page</label>
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => setProposal(null)}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={apply}>Create &amp; open</Button></div>
        </div>
      )}
    </div>
  );
};
