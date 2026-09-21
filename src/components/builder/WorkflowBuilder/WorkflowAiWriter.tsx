"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecordDefinition, WorkflowDefinition } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Select, Textarea, Badge } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { hasActiveKey } from "@/lib/ai/claude";
import { writeWorkflowWithAi, examplePrompts, WriterResult, WrittenWorkflow, WorkflowChecks, LookupFilterProposal } from "@/lib/ai/workflowWriter";
import { getBuilderUrl } from "@/lib/utils/routes";
import { AiLogEvent } from "@/lib/ai/chats";
import { generateId } from "@/lib/utils/idGenerator";
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, Code2, ArrowRight, Filter, Loader2, Wand2, RefreshCw, ShieldCheck, KeyRound } from "lucide-react";

const TRIGGER_LABEL: Record<string, string> = { onLoad: "On load (new)", onEdit: "On load (edit)", onOpen: "On load (new + edit)", onUserInput: "On field change", onValidate: "On validate", onSubmit: "On submit", onSuccess: "After save", onDelete: "On delete" };

export function triggerText(wf: WorkflowDefinition, form?: { fields: Array<{ id: string; label: string; subform?: { columns: Array<{ id: string; label: string }> } }> } | null): string {
  const base = TRIGGER_LABEL[wf.trigger.type] || wf.trigger.type;
  if (wf.trigger.type !== "onUserInput") return base;
  if (!wf.trigger.fieldId) return `${base} · any field`;
  const [top, col] = wf.trigger.fieldId.split(".");
  const f = form?.fields.find((x) => x.id === top);
  const c = col ? f?.subform?.columns.find((x) => x.id === col) : undefined;
  return `${base} · ${f?.label || top}${c ? ` › ${c.label}` : ""}`;
}

export interface WorkflowAiWriterProps {
  /** create mode: the form the workflow belongs to (changeable unless lockForm) */
  formId?: string;
  lockForm?: boolean;
  /** modify mode: the workflow being edited */
  existing?: WorkflowDefinition | null;
  onApply: (result: WriterResult) => void;
  onCancel?: () => void;
  /** initial request text (deep links) */
  initialPrompt?: string;
  /** override the apply button text (e.g. "Apply to workflow" when filling an existing empty workflow) */
  applyLabel?: string;
  /** parent already knows AI is unavailable and shows its own banner (AI Assistant tab) */
  disabled?: boolean;
  /** where "Add key" should go when the parent manages the settings tab itself */
  onAddKey?: () => void;
  /** true while a proposal is on screen or being generated (so a host modal can guard against accidental close) */
  onDirty?: (dirty: boolean) => void;
  /** chat-history hook: every generated proposal and its outcome is reported here */
  onLog?: (e: AiLogEvent) => void;
}

/**
 * Plain-language → verified workflow. Used inside the workflow page (modal) and the AI Assistant tab (card).
 * Every proposal shows its check report (syntax · references · dry run) before it can be applied.
 */
export const WorkflowAiWriter: React.FC<WorkflowAiWriterProps> = ({ formId: initialFormId, lockForm, existing, onApply, onCancel, initialPrompt, applyLabel: applyLabelProp, disabled, onAddKey, onDirty, onLog }) => {
  const { currentApp, loadRecords } = useAppBuilder();
  const { user } = useAuth();
  const router = useRouter();
  const [formId, setFormId] = useState(existing?.formId || initialFormId || currentApp?.forms[0]?.id || "");
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<WriterResult | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const recordsRef = useRef<Record<string, RecordDefinition[]> | null>(null);
  const runId = useRef(0); // bumps when the form changes so a stale in-flight proposal is dropped
  const mode = existing ? "modify" : "create";

  useEffect(() => { let on = true; hasActiveKey().then((k) => { if (on) setHasKey(k); }).catch(() => { if (on) setHasKey(false); }); return () => { on = false; }; }, []);
  useEffect(() => { onDirty?.(busy || result !== null); }, [busy, result, onDirty]);

  const form = currentApp?.forms.find((f) => f.id === formId);
  const examples = useMemo(() => (form && currentApp ? (mode === "create" ? examplePrompts(form, currentApp) : MODIFY_EXAMPLES) : []), [form, currentApp, mode]);
  if (!currentApp) return null;

  /** Records of every form, loaded once per panel (used for dry runs and lookup sample ids). */
  const records = async () => {
    if (recordsRef.current) return recordsRef.current;
    const m: Record<string, RecordDefinition[]> = {};
    await Promise.all(currentApp.forms.map(async (f) => { try { m[f.id] = await loadRecords(f.id); } catch { m[f.id] = []; } }));
    recordsRef.current = m;
    return m;
  };

  const canGenerate = Boolean(hasKey && !disabled && form && !busy);
  const generate = async (request: string, base?: WorkflowDefinition | null) => {
    if (!canGenerate || !form || !request.trim()) return;
    const id = ++runId.current;
    const msgId = generateId("msg");
    onLog?.({ id: msgId, prompt: request, reply: "" });
    setBusy(true); setError(""); setStatus("Loading sample data…");
    try {
      const recordsMap = await records();
      const r = await writeWorkflowWithAi({ prompt: request, form, app: currentApp, recordsMap, existing: base ?? null, user: user ? { email: user.email, name: user.name } : null, onStatus: (s) => { if (id === runId.current) setStatus(s); }, allowLookupFilter: mode === "create" && !base });
      if (id !== runId.current) return; // the form was switched meanwhile — drop the stale proposal
      (r as WriterResult & { msgId?: string }).msgId = msgId;
      setResult(r);
      setRefine("");
      onLog?.({ id: msgId, reply: r.kind === "workflow" ? `${r.workflow.name} · ${triggerText(r.workflow, form)} — ${r.verified ? "verified ✓" : "needs attention"}${r.repairs ? ` (fixed ${r.repairs}×)` : ""}. ${r.explanation}` : `Lookup filter on ${currentApp.forms.find((f) => f.id === r.targetFormId)?.name || "form"} — ${r.explanation}`, status: "proposed" });
    } catch (e: any) {
      if (id === runId.current) setError(e?.message || String(e));
      onLog?.({ id: msgId, reply: `Could not write the workflow: ${e?.message || e}`, status: "error" });
    } finally { if (id === runId.current) { setBusy(false); setStatus(""); } }
  };
  const apply = (r: WriterResult) => { onApply(r); if (r.kind === "lookup_filter") setResult(null); };
  const discard = () => { const id = (result as (WriterResult & { msgId?: string }) | null)?.msgId; if (id) onLog?.({ id, status: "discarded" }); setResult(null); };

  const proposal = result?.kind === "workflow" ? result : null;
  const filterProposal = result?.kind === "lookup_filter" ? result : null;
  const applyLabel = applyLabelProp || (mode === "create" ? "Create workflow" : "Apply to workflow");

  return (
    <div className="space-y-4">
      {hasKey === false && !disabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> No AI provider key is configured for this app yet.</span>
          <Button size="xs" variant="outline" onClick={() => (onAddKey ? onAddKey() : router.push(`${getBuilderUrl(currentApp.linkName, { tab: "ai" })}&aiTab=settings`))}>Add key</Button>
        </div>
      )}

      {mode === "modify" && existing && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-indigo-600" /> {existing.name}</span><Badge variant="indigo">{triggerText(existing, form)}</Badge></div>
          <pre className="mt-2 bg-slate-900 text-emerald-200 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{existing.codeScript || "// (empty script)"}</pre>
        </div>
      )}

      <div className={`grid gap-3 items-start ${mode === "create" && !lockForm ? "grid-cols-1 md:grid-cols-[220px_1fr]" : "grid-cols-1"}`}>
        {mode === "create" && !lockForm && (
          <div className="space-y-2">
            <Select label="Form" value={formId} disabled={busy} onChange={(e) => { runId.current++; setBusy(false); setStatus(""); setFormId(e.target.value); setResult(null); setError(""); setRefine(""); }}>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
            {form && <div className="text-[10px] text-slate-400 leading-relaxed max-h-28 overflow-y-auto">Fields: {form.fields.filter((f) => f.type !== "section").map((f) => f.linkName).join(", ")}</div>}
          </div>
        )}
        <Textarea
          label={mode === "create" ? `Describe the rule${form && lockForm ? ` for ${form.name}` : ""}` : "Describe the change"}
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && canGenerate && prompt.trim()) { e.preventDefault(); generate(prompt, existing); } }}
          placeholder={mode === "create" ? "e.g. When Purchase Order is chosen, fill Line Items from that PO and copy the vendor · Block save if received quantity is more than ordered · After save reduce item stock" : "e.g. Also copy the delivery address · Skip rows where quantity is zero · Ask for confirmation when the total is above 50,000"}
          helperText="Use the field names you see on the form. Enter to generate, Shift+Enter for a new line."
        />
      </div>

      {examples.length > 0 && !result && (
        <div className="flex flex-wrap gap-1.5">{examples.map((p) => <button key={p} type="button" onClick={() => setPrompt(p)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 text-left">{p}</button>)}</div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button loading={busy} disabled={!canGenerate || !prompt.trim()} icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => generate(prompt, existing)}>{mode === "create" ? "Write workflow" : "Rewrite with AI"}</Button>
        {busy && status && <span className="text-[11px] text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {status}</span>}
        {!busy && !result && <span className="text-[11px] text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Every script is syntax-checked, cross-checked against your fields and dry-run on sample data before you see it.</span>}
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}

      {proposal && form && (
        <ProposalCard proposal={proposal} form={form} mode={mode}>
          <div className="space-y-2 pt-1">
            <div className="flex gap-2 items-start">
              <input value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && refine.trim() && canGenerate) generate(refine, proposal.workflow); }} placeholder="Want a change? e.g. also copy the vendor, skip zero-quantity rows…" className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              <Button size="sm" variant="outline" loading={busy} disabled={!refine.trim() || !canGenerate} icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => generate(refine, proposal.workflow)}>Refine</Button>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { discard(); onCancel?.(); }}>Discard</Button>
              <Button size="sm" variant={proposal.verified ? "primary" : "secondary"} icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => apply(proposal)}>{proposal.verified ? applyLabel : `${applyLabel} anyway`}</Button>
            </div>
          </div>
        </ProposalCard>
      )}

      {filterProposal && <LookupFilterCard proposal={filterProposal} onDiscard={discard} onApply={() => apply(filterProposal)} />}
    </div>
  );
};

const MODIFY_EXAMPLES = ["Add a guard so nothing happens when the lookup is empty", "Skip rows where quantity is zero or blank", "Ask for confirmation before making the change", "Also copy the remaining details from the linked record", "Show a clear error message instead of silently stopping"];

// ── proposal card ─────────────────────────────────────────────────────────────

const ProposalCard: React.FC<{ proposal: WrittenWorkflow; form: { fields: any[]; name: string }; mode: "create" | "modify"; children: React.ReactNode }> = ({ proposal, form, mode, children }) => {
  const { workflow, checks, explanation, assumptions, verified, repairs } = proposal;
  return (
    <div className={`rounded-xl border p-4 space-y-3 text-xs ${verified ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/40"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-bold text-slate-900 flex items-center gap-1.5"><Code2 className="w-4 h-4 text-indigo-600" /> {workflow.name}</span>
        <span className="flex items-center gap-1.5">
          <Badge variant="indigo">{triggerText(workflow, form as any)}</Badge>
          {verified ? <Badge variant="success">Verified{repairs ? ` · fixed ${repairs}×` : ""}</Badge> : <Badge variant="warning">Needs attention</Badge>}
        </span>
      </div>
      {explanation && <p className="text-slate-700 leading-relaxed">{explanation}</p>}
      {assumptions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-white/70 p-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Assumptions</div><ul className="list-disc pl-4 text-slate-700 space-y-0.5">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
      )}
      <ChecksReport checks={checks} />
      <pre className="bg-slate-900 text-emerald-200 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">{workflow.codeScript}</pre>
      {!verified && <p className="text-[11px] text-amber-800">The script did not pass every check. You can still {mode === "create" ? "create" : "apply"} it and edit by hand, or refine the request below.</p>}
      {children}
    </div>
  );
};

const ChecksReport: React.FC<{ checks: WorkflowChecks }> = ({ checks }) => {
  const refErrors = checks.references.filter((i) => i.level === "error");
  const refWarnings = checks.references.filter((i) => i.level === "warning");
  const dr = checks.dryRun;
  const changed = dr ? Object.entries(dr.changed) : [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 divide-y divide-slate-100">
      <CheckRow ok={checks.syntax.ok} label="Syntax" detail={checks.syntax.ok ? "valid sandbox JavaScript" : checks.syntax.error} />
      <CheckRow ok={refErrors.length === 0} warn={refErrors.length === 0 && refWarnings.length > 0} label="Field & form names" detail={refErrors.length === 0 && refWarnings.length === 0 ? "every field, column and form used exists" : undefined}>
        {(refErrors.length > 0 || refWarnings.length > 0) && <ul className="mt-1 space-y-0.5">{[...refErrors, ...refWarnings].map((i, k) => <li key={k} className={i.level === "error" ? "text-rose-700" : "text-amber-700"}>{i.message}{i.hint ? <span className="text-slate-500"> {i.hint}</span> : null}</li>)}</ul>}
      </CheckRow>
      <CheckRow ok={Boolean(dr?.ok)} warn={false} label="Dry run" detail={!dr ? "skipped (syntax error)" : dr.ok ? `ran without errors on ${dr.sample === "record" ? "your latest record" : "sample values"}` : dr.error}>
        {dr?.ok && (
          <div className="mt-1 space-y-0.5 text-slate-600">
            {changed.length > 0 && <div><span className="text-slate-400">Changed:</span> {changed.map(([k, v]) => <span key={k} className="font-mono mr-2">{k} = {typeof v === "string" ? v : JSON.stringify(v)}</span>)}</div>}
            {dr.dataOps > 0 && <div><span className="text-slate-400">Queued:</span> {dr.dataOps} data operation(s) on other forms (applied after save)</div>}
            {dr.popup && <div><span className="text-slate-400">Popup:</span> {dr.popup}</div>}
            {dr.blocked && <div className="text-amber-700">Would block the save with these sample values.</div>}
            {dr.messages.length > 0 && <div><span className="text-slate-400">Messages:</span> {dr.messages.slice(0, 4).join(" · ")}</div>}
            {changed.length === 0 && dr.dataOps === 0 && !dr.popup && !dr.blocked && <div className="text-slate-400">No visible effect with the sample values — fine for rules that only act under certain conditions.</div>}
          </div>
        )}
      </CheckRow>
    </div>
  );
};

const CheckRow: React.FC<{ ok: boolean; warn?: boolean; label: string; detail?: string; children?: React.ReactNode }> = ({ ok, warn, label, detail, children }) => (
  <div className="px-3 py-2 flex gap-2 items-start">
    {ok && !warn ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" /> : ok && warn ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />}
    <div className="min-w-0 flex-1"><span className="font-semibold text-slate-800">{label}</span>{detail && <span className="text-slate-500"> — {detail}</span>}{children}</div>
  </div>
);

// ── lookup filter card (the AI decided the request is about lookup visibility) ───

const LookupFilterCard: React.FC<{ proposal: LookupFilterProposal; onDiscard: () => void; onApply: () => void }> = ({ proposal, onDiscard, onApply }) => {
  const { currentApp } = useAppBuilder();
  if (!currentApp) return null;
  const target = currentApp.forms.find((f) => f.id === proposal.targetFormId);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3 text-xs">
      <div className="font-bold text-slate-900 flex items-center gap-1.5"><Filter className="w-4 h-4 text-blue-600" /> Lookup filter on {target?.name}</div>
      <p className="text-slate-600">{proposal.explanation}</p>
      <div className="flex flex-wrap gap-1">{proposal.filters.map((f) => <span key={f.id} className="px-2 py-0.5 rounded-full bg-white border border-blue-200">{target?.fields.find((x) => x.id === f.fieldId)?.label} {f.operator.replace(/_/g, " ")} {f.value !== undefined && f.value !== "" ? String(f.value) : ""}</span>)}</div>
      <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Will be applied to {proposal.affected.length} lookup field(s)</div>{proposal.affected.length ? <ul className="list-disc pl-4 text-slate-700">{proposal.affected.map((a) => <li key={`${a.fieldId}${a.columnId || ""}`}>{a.label}</li>)}</ul> : <p className="text-amber-700">No form currently looks up this form — the filter has nothing to apply to yet.</p>}</div>
      <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={onDiscard}>Discard</Button><Button size="sm" disabled={proposal.affected.length === 0} icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={onApply}>Apply filter</Button></div>
    </div>
  );
};

// ── modal wrapper for the workflow page ───────────────────────────────────────

export const WorkflowAiModal: React.FC<{ formId?: string; existing?: WorkflowDefinition | null; /** fill the selected workflow (even when its script is still empty) instead of creating a new one */ target?: WorkflowDefinition | null; onClose: () => void; onApply: (r: WriterResult) => void }> = ({ formId, existing, target, onClose, onApply }) => {
  const dirty = useRef(false); // a proposal is on screen or being generated
  const close = () => { if (!dirty.current || window.confirm("Discard the AI proposal?")) onClose(); };
  return (
  <Modal
    isOpen
    onClose={close}
    title={existing ? `Edit "${existing.name}" with AI` : target ? `Write "${target.name}" with AI` : "Write a workflow with AI"}
    description={existing ? "Describe what should change. The whole script is rewritten, re-checked and dry-run before you apply it." : `Describe the rule in plain words. You get a checked script with an explanation — nothing is saved until you click ${target ? "Apply" : "Create"}.`}
    maxWidth="4xl"
    icon={existing ? <Wand2 className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
  >
    <WorkflowAiWriter formId={target?.formId || formId} existing={existing} lockForm={Boolean(existing || target)} applyLabel={target && !existing ? "Apply to workflow" : undefined} onApply={(r) => { dirty.current = false; onApply(r); }} onCancel={() => { dirty.current = false; onClose(); }} onDirty={(d) => { dirty.current = d; }} />
  </Modal>
  );
};

/** Apply a lookup-filter proposal to every lookup that targets the form. */
export function applyLookupFilter(proposal: LookupFilterProposal, update: (fn: (prev: any) => any) => void) {
  update((prev) => ({
    ...prev,
    forms: prev.forms.map((f: any) => ({
      ...f,
      fields: f.fields.map((fld: any) => {
        if (fld.type === "lookup" && fld.lookup?.targetFormId === proposal.targetFormId) return { ...fld, lookup: { ...fld.lookup, filters: proposal.filters } };
        if (fld.type === "subform" && fld.subform) return { ...fld, subform: { ...fld.subform, columns: fld.subform.columns.map((c: any) => (c.type === "lookup" && c.lookup?.targetFormId === proposal.targetFormId ? { ...c, lookup: { ...c.lookup, filters: proposal.filters } } : c)) } };
        return fld;
      }),
    })),
  }));
}

