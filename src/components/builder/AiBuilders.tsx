"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/Button";
import { Select, Textarea, Badge } from "@/components/ui/FormControls";
import { generateReportFromPrompt, generateFormFromPrompt, generateDashboardFromPrompt, ReportProposal, FormProposal, DashboardProposal } from "@/lib/ai/generators";
import { WriterResult } from "@/lib/ai/workflowWriter";
import { AiLogEvent } from "@/lib/ai/chats";
import { generateId } from "@/lib/utils/idGenerator";
import { WorkflowAiWriter, applyLookupFilter } from "./WorkflowBuilder/WorkflowAiWriter";
import { getBuilderUrl } from "@/lib/utils/routes";
import { withParentLinkColumns } from "@/lib/engine/subformLink";
import { ArrowRight, CheckCircle2, Sparkles, Filter } from "lucide-react";

const useRun = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(false); } };
  return { busy, error, run };
};

type ProposalWith<T> = T & { msgId: string };
type LogProp = { onLog?: (e: AiLogEvent) => void };

const ErrorBox: React.FC<{ error: string }> = ({ error }) => (error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div> : null);

// ── New report ───────────────────────────────────────────────────────────────

export const AiNewReport: React.FC<{ disabled: boolean; initialPrompt?: string; initialFormId?: string } & LogProp> = ({ disabled, initialPrompt, initialFormId, onLog }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [formId, setFormId] = useState(initialFormId || "");
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<ProposalWith<ReportProposal> | null>(null);
  if (!currentApp) return null;
  const form = proposal ? currentApp.forms.find((f) => f.id === proposal.report.sourceFormId) : null;
  const fieldLabel = (id?: string) => form?.fields.find((f) => f.id === id)?.label || id;

  return (
    <div data-panel className="space-y-4">
      <div className="grid grid-cols-[220px_1fr] gap-3 items-start">
        <Select label="Source form" value={formId} onChange={(e) => setFormId(e.target.value)}><option value="">Let AI decide</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Textarea label="Describe the report" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim() && !disabled && !busy) { e.preventDefault(); (e.currentTarget.closest("[data-panel]")?.querySelector("button[data-generate]") as HTMLButtonElement | null)?.click(); } }} placeholder="e.g. Only active states, sorted by name · Pending invoices this month grouped by customer with total amount · Invoices as kanban by payment status" />
      </div>
      <Button loading={busy} disabled={disabled || !prompt.trim()} data-generate icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => { const msgId = generateId("msg"); onLog?.({ id: msgId, prompt, reply: "" }); try { const p = await generateReportFromPrompt(prompt, currentApp, formId || undefined); setProposal({ ...p, msgId }); onLog?.({ id: msgId, reply: `${p.report.name} (${p.report.reportType}) on ${currentApp.forms.find((f) => f.id === p.report.sourceFormId)?.name || "?"} — ${p.explanation}`, status: "proposed" }); } catch (e: any) { onLog?.({ id: msgId, reply: `Could not generate: ${e?.message || e}`, status: "error" }); throw e; } })}>Generate report</Button>
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
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => { onLog?.({ id: proposal.msgId, status: "discarded" }); setProposal(null); }}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => { updateCurrentApp((prev) => ({ ...prev, reports: [...prev.reports, proposal.report] })); showToast(`Report "${proposal.report.name}" created`, "success"); const link = getBuilderUrl(currentApp.linkName, { tab: "reports", report: proposal.report.linkName }); onLog?.({ id: proposal.msgId, status: "applied", link }); router.push(link); }}>Create & open</Button></div>
        </div>
      )}
    </div>
  );
};

// ── New form ─────────────────────────────────────────────────────────────────

export const AiNewForm: React.FC<{ disabled: boolean; initialPrompt?: string } & LogProp> = ({ disabled, initialPrompt, onLog }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<ProposalWith<FormProposal> | null>(null);
  if (!currentApp) return null;

  return (
    <div data-panel className="space-y-4">
      <Textarea label="Describe the form" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim() && !disabled && !busy) { e.preventDefault(); (e.currentTarget.closest("[data-panel]")?.querySelector("button[data-generate]") as HTMLButtonElement | null)?.click(); } }} placeholder="e.g. Vendor form: vendor code (auto number VEN-0001), vendor name, phone, GSTIN, city (lookup City), state (lookup State), payment terms (dropdown: Cash, 15 days, 30 days), active checkbox" />
      <Button loading={busy} disabled={disabled || !prompt.trim()} data-generate icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => { const msgId = generateId("msg"); onLog?.({ id: msgId, prompt, reply: "" }); try { const p = await generateFormFromPrompt(prompt, currentApp); setProposal({ ...p, msgId }); onLog?.({ id: msgId, reply: `${p.form.name} — ${p.form.fields.filter((f) => f.type !== "section").length} fields${p.extraForms?.length ? ` (+ ${p.extraForms.map((f) => f.name).join(", ")})` : ""}. ${p.explanation}`, status: "proposed" }); } catch (e: any) { onLog?.({ id: msgId, reply: `Could not generate: ${e?.message || e}`, status: "error" }); throw e; } })}>Generate form</Button>
      <ErrorBox error={error} />
      {proposal && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {proposal.form.name} <span className="font-normal text-slate-500">· {proposal.form.fields.filter((f) => f.type !== "section").length} fields</span></div>
          {proposal.extraForms?.length ? <div className="text-[11px] text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5">Also creates child form{proposal.extraForms.length > 1 ? "s" : ""}: <strong>{proposal.extraForms.map((f) => f.name).join(", ")}</strong> — used as a linked subform (rows saved as its records, with a lookup back to {proposal.form.name}).</div> : null}
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="flex flex-wrap gap-1">{proposal.form.fields.map((f) => <Badge key={f.id} variant={f.type === "lookup" ? "primary" : f.type === "subform" ? "purple" : f.type === "formula" || f.type === "rollup" ? "indigo" : f.type === "section" ? "dark" : "default"}>{f.label}{f.type === "lookup" ? ` → ${currentApp.forms.find((x) => x.id === f.lookup?.targetFormId)?.name || "?"}` : ""}{f.required ? " *" : ""}</Badge>)}</div>
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => { onLog?.({ id: proposal.msgId, status: "discarded" }); setProposal(null); }}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => { const newForms = [...(proposal.extraForms || []), proposal.form]; const newReports = [...(proposal.extraReports || []), proposal.report].filter(Boolean); updateCurrentApp((prev) => withParentLinkColumns({ ...prev, forms: [...prev.forms.map((f) => (proposal.updatedForms || []).find((u) => u.id === f.id) || f), ...newForms], reports: [...prev.reports, ...newReports], roles: prev.roles.map((r) => ({ ...r, forms: { ...r.forms, ...Object.fromEntries(newForms.map((nf) => [nf.id, r.defaultForm || { view: true, create: true, edit: true, delete: false, print: true, export: false, import: false, recordScope: "all" }])) } })) })); showToast(newForms.length > 1 ? `Created ${newForms.map((f) => f.name).join(" + ")}` : `Form "${proposal.form.name}" created`, "success"); router.push(getBuilderUrl(currentApp.linkName, { tab: "forms", form: proposal.form.linkName }));  onLog?.({ id: proposal.msgId, status: "applied", link: getBuilderUrl(currentApp.linkName, { tab: "forms", form: proposal.form.linkName }) }); }}>Create & open</Button></div>
        </div>
      )}
    </div>
  );
};

// ── New workflow ─────────────────────────────────────────────────────────────

/** Same verified writer as the workflow page (syntax → field/form references → dry run → auto-repair). */
export const AiNewWorkflow: React.FC<{ disabled: boolean; initialPrompt?: string; initialFormId?: string; onAddKey?: () => void } & LogProp> = ({ disabled, initialPrompt, initialFormId, onAddKey, onLog }) => {
  const { currentApp, createWorkflow, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  if (!currentApp) return null;

  const apply = (r: WriterResult) => {
    if (r.kind === "workflow") {
      const w = createWorkflow({ ...r.workflow, id: undefined });
      const link = getBuilderUrl(currentApp.linkName, { tab: "workflows", workflow: w.id });
      onLog?.({ id: r.msgId || generateId("msg"), status: "applied", link });
      router.push(link);
    } else {
      onLog?.({ id: r.msgId || generateId("msg"), status: "applied" });
      applyLookupFilter(r, updateCurrentApp);
      showToast(`Lookup filter applied to ${r.affected.length} field(s)`, "success");
    }
  };

  return (
    <div className="space-y-4">
      <WorkflowAiWriter key={`${initialFormId || ""}|${initialPrompt || ""}`} formId={initialFormId} initialPrompt={initialPrompt} onApply={apply} disabled={disabled} onAddKey={onAddKey} onLog={onLog} />
    </div>
  );
};

// ── New dashboard ────────────────────────────────────────────────────────────

export const AiNewDashboard: React.FC<{ disabled: boolean; initialPrompt?: string } & LogProp> = ({ disabled, initialPrompt, onLog }) => {
  const { currentApp, createPage, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [proposal, setProposal] = useState<ProposalWith<DashboardProposal> | null>(null);
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
    const link = getBuilderUrl(currentApp.linkName, { tab: "pages", page: page.linkName });
    onLog?.({ id: proposal.msgId, status: "applied", link });
    setTimeout(() => router.push(link), 80);
  };
  return (
    <div data-panel className="space-y-4">
      <Textarea label="Describe the dashboard" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && prompt.trim() && !disabled && !busy) { e.preventDefault(); (e.currentTarget.closest("[data-panel]")?.querySelector("button[data-generate]") as HTMLButtonElement | null)?.click(); } }} placeholder="e.g. Sales overview: this month's sales, invoice count, outstanding and average bill; sales by month, payment status split, top customers; list of pending invoices; buttons for new invoice and new customer" />
      <div className="flex flex-wrap gap-1.5">{["Sales overview with outstanding and top customers", "Stock health: low stock items, purchases vs sales by month", "Owner daily view: today's sales, collections, pending deliveries", "Customer insights: new customers per month, city-wise split"].map((p) => <button key={p} type="button" onClick={() => setPrompt(p)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:text-emerald-700">{p}</button>)}</div>
      <Button loading={busy} disabled={disabled || !prompt.trim()} data-generate icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => run(async () => { const msgId = generateId("msg"); onLog?.({ id: msgId, prompt, reply: "" }); try { const p = await generateDashboardFromPrompt(prompt, currentApp); setProposal({ ...p, msgId }); onLog?.({ id: msgId, reply: `${p.name} — ${p.components.length} widgets. ${p.explanation}`, status: "proposed" }); } catch (e: any) { onLog?.({ id: msgId, reply: `Could not generate: ${e?.message || e}`, status: "error" }); throw e; } })}>Generate dashboard</Button>
      <ErrorBox error={error} />
      {proposal && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {proposal.name}</span><Badge variant="primary">{proposal.components.length} widgets</Badge></div>
          <p className="text-slate-600">{proposal.explanation}</p>
          <div className="grid grid-cols-12 gap-1.5">{proposal.components.map((c: any) => <div key={c.id} style={{ gridColumn: `span ${c.width} / span ${c.width}` }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{String(c.type).replace("_", " ")} · {c.width}/12</div><div className="text-slate-800 truncate">{label(c)}</div></div>)}</div>
          <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={asHome} onChange={(e) => setAsHome(e.target.checked)} className="rounded border-slate-300" /> Make it the app&apos;s home page</label>
          <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" onClick={() => { onLog?.({ id: proposal.msgId, status: "discarded" }); setProposal(null); }}>Discard</Button><Button size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={apply}>Create &amp; open</Button></div>
        </div>
      )}
    </div>
  );
};
