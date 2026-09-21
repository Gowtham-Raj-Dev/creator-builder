"use client";

import React, { useEffect, useState } from "react";
import { FormDefinition, ReportDefinition } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/FormControls";
import { hasActiveKey, setActiveAiApp } from "@/lib/ai/claude";
import { patchReportWithAi, patchFormWithAi, ReportPatchProposal, FormPatchProposal } from "@/lib/ai/generators";
import { withParentLinkColumns } from "@/lib/engine/subformLink";
import { Sparkles, Check, AlertTriangle, Wand2 } from "lucide-react";

type Props =
  | { isOpen: boolean; onClose: () => void; kind: "report"; entity: ReportDefinition; initialPrompt?: string }
  | { isOpen: boolean; onClose: () => void; kind: "form"; entity: FormDefinition; initialPrompt?: string };

const EXAMPLES: Record<Props["kind"], string[]> = {
  report: [
    "Map the Sales source to Items › Product and Items › Quantity",
    "Show only Paid invoices, sort by date descending",
    "Turn this into a kanban by Payment Status",
    "Add a red row highlight when Balance < Minimum Level",
    "Add group totals of Grand Total by Customer",
  ],
  form: [
    "Add a Discount % field after Rate and make Amount = quantity * rate * (1 - discount / 100)",
    "Make Phone required and unique",
    "Add a Payment Mode dropdown (Cash, UPI, Cheque) and show Cheque No only when it is Cheque",
    "Add a Notes textarea at the end",
    "Rename Vendor to Supplier",
  ],
};

/** "Edit with AI" for an existing report or form: describe the change, preview, apply. */
export const AiFixModal: React.FC<Props> = (props) => {
  const { isOpen, onClose, kind, entity, initialPrompt } = props;
  const { currentApp, updateReport, updateForm, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [reportResult, setReportResult] = useState<ReportPatchProposal | null>(null);
  const [formResult, setFormResult] = useState<FormPatchProposal | null>(null);

  useEffect(() => {
    if (!isOpen || !currentApp) return;
    setActiveAiApp(currentApp.id);
    hasActiveKey().then(setHasKey);
    setPrompt(initialPrompt || ""); setError(null); setReportResult(null); setFormResult(null);
  }, [isOpen, currentApp?.id, initialPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentApp) return null;

  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setError(null); setReportResult(null); setFormResult(null);
    try {
      if (kind === "report") setReportResult(await patchReportWithAi(entity as ReportDefinition, prompt.trim(), currentApp));
      else setFormResult(await patchFormWithAi(entity as FormDefinition, prompt.trim(), currentApp));
    } catch (e: any) { setError(e?.message || "AI request failed"); }
    finally { setBusy(false); }
  };
  const apply = () => {
    if (kind === "report" && reportResult) { updateReport(entity.id, reportResult.patch); showToast("Report updated by AI", "success"); }
    if (kind === "form" && formResult) { const { id, ...rest } = formResult.form; void id; updateForm(entity.id, rest); for (const u of formResult.updatedForms || []) { const { id: uid, ...urest } = u; updateForm(uid, urest); } setTimeout(() => updateCurrentApp((prev) => withParentLinkColumns(prev)), 0); showToast("Form updated by AI", "success"); }
    onClose();
  };
  const result = reportResult || formResult;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${kind} with AI`} description={`Describe the change to "${entity.name}". Nothing is saved until you apply.`} maxWidth="2xl" icon={<Sparkles className="w-4 h-4 text-indigo-600" />}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        {!result ? <Button onClick={run} loading={busy} disabled={!prompt.trim() || !hasKey} icon={<Wand2 className="w-3.5 h-3.5" />}>Propose change</Button>
          : <><Button variant="ghost" onClick={() => { setReportResult(null); setFormResult(null); }}>Try again</Button><Button onClick={apply} icon={<Check className="w-3.5 h-3.5" />}>Apply</Button></>}
      </>}>
      <div className="space-y-3">
        {!hasKey && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> No AI key configured — add one under AI Assistant → Provider &amp; keys.</p>}
        <Textarea rows={3} autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={kind === "report" ? "e.g. Sales source should use Items › Product and Items › Quantity" : "e.g. Add GSTIN text field after Phone, required"} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }} />
        <div className="flex flex-wrap gap-1.5">{EXAMPLES[kind].map((ex) => <button key={ex} type="button" onClick={() => setPrompt(ex)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{ex}</button>)}</div>
        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        {reportResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2 text-xs">
            <div className="font-semibold text-emerald-900 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> {reportResult.explanation || "Change proposed"}</div>
            <div className="text-[11px] text-slate-600">Will change: {reportResult.changedKeys.map((k) => <code key={k} className="mx-0.5 px-1 py-px rounded bg-white border border-slate-200">{k}</code>)}</div>
            <details className="text-[11px]"><summary className="cursor-pointer text-slate-500">Show details</summary><pre className="mt-1 max-h-48 overflow-auto bg-white border border-slate-200 rounded-lg p-2 whitespace-pre-wrap">{JSON.stringify(reportResult.patch, null, 2)}</pre></details>
          </div>
        )}
        {formResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2 text-xs">
            <div className="font-semibold text-emerald-900 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> {formResult.explanation || "Change proposed"}</div>
            <ul className="list-disc pl-5 space-y-0.5 text-slate-700">{formResult.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <div className="text-[11px] text-slate-500">{formResult.form.fields.length} fields after change (was {kind === "form" ? (entity as FormDefinition).fields.length : 0}). Existing record data is kept for unchanged fields.</div>
          </div>
        )}
      </div>
    </Modal>
  );
};
