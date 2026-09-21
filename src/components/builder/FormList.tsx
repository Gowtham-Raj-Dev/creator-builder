"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, EmptyState, Badge } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toLinkName, isValidLinkName } from "@/lib/utils/linkName";
import { FileText, Plus, TableProperties, Copy, Trash2, Edit, ExternalLink, Sigma, Search, Table, Zap } from "lucide-react";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";

export const FormList: React.FC = () => {
  const { currentApp, createForm, deleteForm, duplicateForm } = useAppBuilder();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [linkName, setLinkName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<1 | 2 | 3>(2);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  if (!currentApp) return null;

  const create = () => {
    setError("");
    if (!name.trim()) return setError("Form name is required");
    const clean = toLinkName(linkName || name);
    if (!clean || !isValidLinkName(clean)) return setError("Link name: lowercase letters, numbers and underscores only.");
    if (currentApp.forms.some((f) => f.linkName === clean)) return setError(`Link name "${clean}" already exists.`);
    createForm(name.trim(), description.trim(), columns, clean);
    setOpen(false); setName(""); setLinkName(""); setDescription(""); setTouched(false);
  };

  const askDelete = (formId: string) => {
    const incoming = currentApp.relationships.filter((r) => r.targetFormId === formId);
    const w: string[] = [];
    if (incoming.length) w.push(`Referenced by lookups in: ${incoming.map((r) => currentApp.forms.find((f) => f.id === r.sourceFormId)?.name || r.sourceFormId).join(", ")}.`);
    const wf = currentApp.workflows.filter((x) => x.formId === formId).length;
    if (wf) w.push(`${wf} workflow(s) will be deleted.`);
    const reps = currentApp.reports.filter((x) => x.sourceFormId === formId).length;
    if (reps) w.push(`${reps} report(s) will be deleted.`);
    setDeleteTarget(formId); setDeleteWarnings(w);
  };

  const forms = currentApp.forms.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-3xs gap-4">
          <div><h1 className="text-lg font-bold text-slate-900">Forms</h1><p className="text-xs text-slate-500 mt-0.5">Design data-entry forms: fields, lookups, subforms, formulas and validations.</p></div>
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-40 text-xs pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg" /></div>
            <Button size="md" onClick={() => setOpen(true)} icon={<Plus className="w-4 h-4" />}>New Form</Button>
          </div>
        </div>

        {forms.length === 0 ? (
          <EmptyState icon={<FileText className="w-6 h-6" />} title={currentApp.forms.length ? "No matches" : "No forms yet"} description="Create your first form to start collecting data. A default report is generated automatically." action={<Button size="sm" onClick={() => setOpen(true)} icon={<Plus className="w-3.5 h-3.5" />}>Create form</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forms.map((form) => {
              const report = currentApp.reports.find((r) => r.sourceFormId === form.id && r.reportType !== "ledger");
              const lookups = form.fields.filter((f) => f.type === "lookup").length;
              const subforms = form.fields.filter((f) => f.type === "subform").length;
              const formulas = form.fields.filter((f) => f.type === "formula" || f.type === "rollup").length;
              const wfs = currentApp.workflows.filter((w) => w.formId === form.id).length;
              return (
                <div key={form.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-3xs hover:border-slate-300 hover:shadow-2xs transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between">
                      <Link href={getBuilderUrl(currentApp.linkName, { tab: "forms", form: form.linkName })} className="flex items-center gap-2.5 min-w-0 group">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0"><FileText className="w-4 h-4" /></div>
                        <div className="min-w-0"><h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate">{form.name}</h3><span className="text-[11px] font-mono text-slate-400">/{form.linkName}</span></div>
                      </Link>
                      <div className="flex items-center gap-0.5">
                        <IconButton tone="primary" onClick={() => duplicateForm(form.id)} title="Duplicate form"><Copy className="w-3.5 h-3.5" /></IconButton>
                        <IconButton tone="danger" onClick={() => askDelete(form.id)} title="Delete form"><Trash2 className="w-3.5 h-3.5" /></IconButton>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px]">{form.description || "No description."}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{form.fields.filter((f) => f.type !== "section").length} fields</Badge>
                      {lookups > 0 && <Badge variant="primary"><Search className="w-3 h-3" />{lookups} lookup</Badge>}
                      {subforms > 0 && <Badge variant="purple"><Table className="w-3 h-3" />{subforms} subform</Badge>}
                      {formulas > 0 && <Badge variant="indigo"><Sigma className="w-3 h-3" />{formulas} computed</Badge>}
                      {wfs > 0 && <Badge variant="warning"><Zap className="w-3 h-3" />{wfs} workflows</Badge>}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-[11px]">
                      {report && <Link href={getBuilderUrl(currentApp.linkName, { tab: "reports", report: report.linkName })} className="text-slate-500 hover:text-blue-600 flex items-center gap-1"><TableProperties className="w-3.5 h-3.5" /> Report</Link>}
                      <Link href={getLiveAppUrl(currentApp.linkName, { form: form.linkName, action: "new" })} target="_blank" className="text-slate-500 hover:text-blue-600 flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Try live</Link>
                    </div>
                    <Link href={getBuilderUrl(currentApp.linkName, { tab: "forms", form: form.linkName })}><Button variant="primary" size="sm" icon={<Edit className="w-3.5 h-3.5" />}>Edit fields</Button></Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Create new form" description="A default report is created automatically." footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create form</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-4">
          <Input label="Form name" value={name} required onChange={(e) => { setName(e.target.value); if (!touched) setLinkName(toLinkName(e.target.value)); }} placeholder="e.g. Purchase, Item, Vendor" autoFocus />
          <Input label="Link name" value={linkName} required onChange={(e) => { setLinkName(toLinkName(e.target.value)); setTouched(true); }} helperText="Used in URLs, scripts and formulas." />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          <Select label="Layout" value={columns} onChange={(e) => setColumns(Number(e.target.value) as 1 | 2 | 3)}><option value={1}>1 column</option><option value={2}>2 columns</option><option value={3}>3 columns</option></Select>
          {error && <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-lg border border-rose-200">{error}</p>}
        </form>
      </Modal>

      <ConfirmDialog isOpen={Boolean(deleteTarget)} onClose={() => { setDeleteTarget(null); setDeleteWarnings([]); }} onConfirm={() => { if (deleteTarget) deleteForm(deleteTarget); }} title="Delete form" message="Delete this form? Its fields, reports and workflows will be removed. Records stay in Firestore but become unreachable." warnings={deleteWarnings} />
    </div>
  );
};
