"use client";

import React, { useMemo, useState } from "react";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { formDeleteImpact, reportDeleteImpact, workflowDeleteImpact } from "@/lib/engine/dependencies";
import { planCleanup, CleanupItem } from "@/lib/ai/generators";
import { Trash2, AlertTriangle, ShieldAlert, Check, Sparkles } from "lucide-react";

/**
 * "Existing <kind>" dropdown with a careful delete: shows everything that would be removed
 * or broken, asks you to type the name, and never touches records for other forms.
 */
export const AiDeletePanel: React.FC<{ kind: "form" | "report" | "workflow" }> = ({ kind }) => {
  const { currentApp, deleteForm, deleteReport, deleteWorkflow, loadRecords } = useAppBuilder();
  const { showToast } = useToast();
  const [id, setId] = useState("");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  // AI cleanup: "remove duplicate reports" → proposed list → tick → delete
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<{ items: CleanupItem[]; explanation: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [aiConfirm, setAiConfirm] = useState(false);
  const impact = useMemo(() => (!currentApp || !id ? null : kind === "form" ? formDeleteImpact(currentApp, id) : kind === "report" ? reportDeleteImpact(currentApp, id) : workflowDeleteImpact(currentApp, id)), [currentApp, id, kind]);
  if (!currentApp) return null;

  const list: Array<{ id: string; name: string; sub?: string }> =
    kind === "form" ? currentApp.forms.map((f) => ({ id: f.id, name: f.name, sub: `${f.fields.filter((x) => x.type !== "section").length} fields` }))
    : kind === "report" ? currentApp.reports.map((r) => ({ id: r.id, name: r.name, sub: `${currentApp.forms.find((f) => f.id === r.sourceFormId)?.name || "?"} · ${r.reportType || "table"}` }))
    : currentApp.workflows.map((w) => ({ id: w.id, name: w.name, sub: `${currentApp.forms.find((f) => f.id === w.formId)?.name || "?"} · ${w.trigger.type}${w.active ? "" : " · disabled"}` }));
  const item = list.find((x) => x.id === id);

  const openConfirm = async () => {
    setTyped(""); setRecordCount(null); setOpen(true);
    if (kind === "form") { try { const recs = await loadRecords(id); setRecordCount(recs.length); } catch { setRecordCount(null); } }
  };
  const doDelete = () => {
    if (!item) return;
    if (kind === "form") deleteForm(id); else if (kind === "report") deleteReport(id); else deleteWorkflow(id);
    showToast(`${kind === "form" ? "Form" : kind === "report" ? "Report" : "Workflow"} "${item.name}" deleted`, "info");
    setOpen(false); setId("");
  };
  const runAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true); setAiError(null); setAiPlan(null);
    try { const plan = await planCleanup(aiPrompt.trim(), currentApp); setAiPlan(plan); setPicked(new Set(plan.items.map((i) => i.id))); }
    catch (e: any) { setAiError(e?.message || "AI request failed"); }
    finally { setAiBusy(false); }
  };
  const impactOf = (it: CleanupItem) => (it.kind === "form" ? formDeleteImpact(currentApp, it.id) : it.kind === "report" ? reportDeleteImpact(currentApp, it.id) : workflowDeleteImpact(currentApp, it.id));
  const applyAi = () => {
    if (!aiPlan) return;
    const chosen = aiPlan.items.filter((i) => picked.has(i.id));
    for (const it of chosen) { if (it.kind === "form") deleteForm(it.id); else if (it.kind === "report") deleteReport(it.id); else deleteWorkflow(it.id); }
    showToast(`Removed ${chosen.length} item${chosen.length === 1 ? "" : "s"}`, "info");
    setAiConfirm(false); setAiPlan(null); setAiPrompt("");
  };
  const dangerous = kind === "form" && ((impact?.broken.length || 0) > 0 || (recordCount || 0) > 0);
  const canConfirm = item && (!dangerous || typed.trim() === item.name);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Manage existing {kind}s</div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Select size="sm" value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a {kind} to delete…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.sub ? ` — ${x.sub}` : ""}</option>)}</Select>
        <Button size="sm" variant="danger" disabled={!id} onClick={openConfirm} icon={<Trash2 className="w-3.5 h-3.5" />}>Delete…</Button>
      </div>
      {impact && (impact.removed.length > 0 || impact.broken.length > 0) && (
        <div className="text-[11px] text-slate-600 space-y-1">
          {impact.removed.length > 0 && <div><span className="font-semibold text-rose-700">Also removed:</span> {impact.removed.join(", ")}</div>}
          {impact.broken.length > 0 && <div><span className="font-semibold text-amber-700">Will break:</span> {impact.broken.join(", ")}</div>}
        </div>
      )}
      {impact && !impact.removed.length && !impact.broken.length && <div className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> Nothing else depends on it.</div>}

      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Or describe what to remove</div>
        <div className="flex gap-2">
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAi()} placeholder={kind === "report" ? "e.g. remove duplicate reports · delete all kanban reports of Sales Invoice" : kind === "form" ? "e.g. remove the test forms I created today" : "e.g. delete the disabled workflows"} className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white" />
          <Button size="sm" variant="subtle" loading={aiBusy} disabled={!aiPrompt.trim()} onClick={runAi} icon={<Sparkles className="w-3.5 h-3.5" />}>Find</Button>
        </div>
        {aiError && <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{aiError}</p>}
        {aiPlan && (
          <div className="rounded-lg border border-indigo-200 bg-white p-2.5 space-y-2">
            <div className="text-[11px] text-slate-700">{aiPlan.explanation || "Proposed removals — untick anything you want to keep."}</div>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {aiPlan.items.map((it) => { const im = impactOf(it); return (
                <li key={it.id} className="flex items-start gap-2 text-[11px]">
                  <input type="checkbox" checked={picked.has(it.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} className="mt-0.5 rounded border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900"><span className="text-[9px] uppercase tracking-wider text-slate-400 mr-1">{it.kind}</span>{it.name}</div>
                    <div className="text-slate-500">{it.reason}</div>
                    {im.removed.length > 0 && <div className="text-rose-700">Also removed: {im.removed.join(", ")}</div>}
                    {im.broken.length > 0 && <div className="text-amber-700">Will break: {im.broken.join(", ")}</div>}
                  </div>
                </li>); })}
            </ul>
            <div className="flex justify-end gap-2"><Button size="xs" variant="ghost" onClick={() => setAiPlan(null)}>Discard</Button><Button size="xs" variant="danger" disabled={picked.size === 0} onClick={() => setAiConfirm(true)} icon={<Trash2 className="w-3 h-3" />}>Delete {picked.size} selected…</Button></div>
          </div>
        )}
      </div>

      <Modal isOpen={aiConfirm} onClose={() => setAiConfirm(false)} title={`Delete ${picked.size} item${picked.size === 1 ? "" : "s"}?`} icon={<ShieldAlert className="w-4 h-4 text-rose-600" />} footer={<><Button variant="outline" onClick={() => setAiConfirm(false)}>Cancel</Button><Button variant="danger" onClick={applyAi} icon={<Trash2 className="w-3.5 h-3.5" />}>Delete</Button></>}>
        <ul className="text-xs list-disc pl-5 space-y-1">{aiPlan?.items.filter((i) => picked.has(i.id)).map((i) => <li key={i.id}><span className="text-[9px] uppercase tracking-wider text-slate-400 mr-1">{i.kind}</span><strong>{i.name}</strong></li>)}</ul>
        <p className="text-[11px] text-slate-500 mt-3">Draft only — publish to make it live; Versions can roll back.</p>
      </Modal>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Delete ${kind} "${item?.name}"?`} icon={<ShieldAlert className="w-4 h-4 text-rose-600" />} maxWidth="lg"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={!canConfirm} onClick={doDelete} icon={<Trash2 className="w-3.5 h-3.5" />}>Delete {kind}</Button></>}>
        <div className="space-y-3 text-xs">
          {kind === "form" && <p className="text-slate-700">{recordCount === null ? "Checking records…" : recordCount > 0 ? <><strong className="text-rose-700">{recordCount} record{recordCount === 1 ? "" : "s"}</strong> of this form exist. They stay in the database but will no longer be reachable from the app.</> : "This form has no records."}</p>}
          {impact?.removed.length ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5"><div className="font-semibold text-rose-800 mb-1">Deleted together with it</div><ul className="list-disc pl-4 space-y-0.5 text-rose-900">{impact.removed.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
          {impact?.broken.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5"><div className="font-semibold text-amber-800 mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Will stop working</div><ul className="list-disc pl-4 space-y-0.5 text-amber-900">{impact.broken.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
          <p className="text-slate-500">This changes the draft only — members keep the published version until you publish again, and you can roll back from Versions.</p>
          {dangerous && <div><label className="font-medium text-slate-700">Type <code className="bg-slate-100 px-1 rounded">{item?.name}</code> to confirm</label><input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-full text-xs px-3 py-2 border border-slate-300 rounded-lg" autoFocus /></div>}
        </div>
      </Modal>
    </div>
  );
};
