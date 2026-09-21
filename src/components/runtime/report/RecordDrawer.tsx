"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CommentEntry, FormDefinition, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { storageService } from "@/lib/storage/firestoreProvider";
import { Drawer } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/FormControls";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { X, Printer, Edit, Trash2, Copy, ExternalLink, MessageSquare, History, Link2, FileText, Send, Sigma, Database } from "lucide-react";

export const RecordDrawer: React.FC<{
  form: FormDefinition;
  record: RecordDefinition | null;
  onClose: () => void;
  onEdit?: (rec: RecordDefinition) => void;
  onDelete?: (rec: RecordDefinition) => void;
  onPrint?: (rec: RecordDefinition) => void;
  onDuplicate?: (rec: RecordDefinition) => void;
  onLookupClick?: (fieldId: string, targetId: string) => void;
}> = ({ form, record, onClose, onEdit, onDelete, onPrint, onDuplicate, onLookupClick }) => {
  const { app, recordsMap, getDisplayValue, computeRecordValues, permissions, noteRecent } = useLiveApp();
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("details");
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [draft, setDraft] = useState("");
  const perm = permissions.form(form.id);

  useEffect(() => {
    if (!record || !app) return;
    setTab("details");
    const titleId = form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
    noteRecent(form.id, record.id, titleId ? getDisplayValue(form, record, titleId) || record.id : record.id);
    if (app.settings?.enableComments === false) return;
    const unsub = storageService.subscribeComments(app.id, form.id, record.id, setComments);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, app?.id]);

  // incoming relationships (Vendor → all purchases)
  const related = useMemo(() => {
    if (!app || !record) return [];
    return app.relationships
      .filter((r) => r.targetFormId === form.id && r.type !== "rollup")
      .map((rel) => {
        const srcForm = app.forms.find((f) => f.id === rel.sourceFormId);
        if (!srcForm) return null;
        const [top, col] = rel.sourceFieldId.split(".");
        const recs = (recordsMap[srcForm.id] || []).filter((r) => {
          if (col) return Array.isArray(r.data?.[top]) && r.data[top].some((row: any) => row[col] === record.id || (Array.isArray(row[col]) && row[col].includes(record.id)));
          const v = r.data?.[top];
          return Array.isArray(v) ? v.includes(record.id) : v === record.id;
        });
        const viaField = srcForm.fields.find((f) => f.id === top);
        return { form: srcForm, via: viaField?.label || top, records: recs };
      })
      .filter(Boolean) as Array<{ form: FormDefinition; via: string; records: RecordDefinition[] }>;
  }, [app, record, form.id, recordsMap]);

  if (!record || !app) return null;
  const values = computeRecordValues(form, record);
  const titleId = form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
  const title = titleId ? getDisplayValue(form, record, titleId) || record.id : record.id;

  const postComment = async () => {
    if (!draft.trim() || !user) return;
    const mentions = Array.from(draft.matchAll(/@([\w.+-]+@[\w-]+\.[\w.]+)/g)).map((m) => m[1]);
    await storageService.addComment({ appId: app.id, formId: form.id, recordId: record.id, text: draft.trim(), user: user.email, userName: user.name, mentions });
    for (const m of mentions) storageService.addNotification({ appId: app.id, toEmail: m, title: `${user.name} mentioned you`, body: draft.trim().slice(0, 140), link: getLiveAppUrl(app.linkName, { form: form.linkName, recordId: record.id }) });
    setDraft("");
  };

  const tabs = [
    { id: "details", label: "Details", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "related", label: "Related", icon: <Link2 className="w-3.5 h-3.5" />, count: related.reduce((s, r) => s + r.records.length, 0) },
    ...(app.settings?.enableComments !== false ? [{ id: "comments", label: "Comments", icon: <MessageSquare className="w-3.5 h-3.5" />, count: comments.length }] : []),
    { id: "history", label: "Activity", icon: <History className="w-3.5 h-3.5" />, count: (record.history || []).length },
  ];

  return (
    <Drawer
      isOpen
      onClose={onClose}
      width="max-w-5xl"
      header={
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{form.name}</div>
              <h2 className="text-base font-bold text-slate-900 truncate">{title}</h2>
              <div className="text-[11px] text-slate-400 font-mono">{record.id}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {perm.print && onPrint && <Button variant="outline" size="sm" onClick={() => onPrint(record)} icon={<Printer className="w-3.5 h-3.5" />}>Print</Button>}
              {perm.create && onDuplicate && <IconButton onClick={() => onDuplicate(record)} title="Duplicate"><Copy className="w-4 h-4" /></IconButton>}
              {perm.edit && onEdit && <Button size="sm" onClick={() => onEdit(record)} icon={<Edit className="w-3.5 h-3.5" />}>Edit</Button>}
              {perm.delete && onDelete && <IconButton tone="danger" onClick={() => onDelete(record)} title="Delete"><Trash2 className="w-4 h-4" /></IconButton>}
              <IconButton onClick={onClose}><X className="w-5 h-5" /></IconButton>
            </div>
          </div>
          <Tabs tabs={tabs} active={tab} onChange={setTab} size="sm" />
        </div>
      }
    >
      <div className="p-6">
        {tab === "details" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {form.fields.filter((f) => f.type !== "section" && permissions.fieldRule(form.id, f.id) !== "hidden").map((field) => {
              const raw = values[field.id];
              const val = getDisplayValue(form, record, field.id);
              const full = ["subform", "richtext", "address", "textarea", "signature", "image", "file"].includes(field.type);
              return (
                <div key={field.id} className={`p-3.5 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1 ${full ? "md:col-span-2" : ""}`}>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    {field.type === "formula" && <Sigma className="w-3 h-3 text-indigo-500" />}{field.type === "rollup" && <Database className="w-3 h-3 text-emerald-500" />}{field.label}
                  </div>
                  {field.type === "lookup" && raw && onLookupClick ? (
                    <button type="button" onClick={() => onLookupClick(field.id, Array.isArray(raw) ? raw[0] : raw)} className="text-sm font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">{val}<ExternalLink className="w-3 h-3" /></button>
                  ) : field.type === "subform" && Array.isArray(raw) && raw.length ? (
                    <div className="mt-1 -mx-3.5 -mb-3.5 rounded-b-lg overflow-x-auto border-t border-slate-200 bg-white">
                      <table className="text-[11.5px] min-w-full border-collapse">
                        <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                          <tr><th className="text-left px-3 py-2 font-semibold w-8">#</th>{field.subform?.columns.map((c) => { const num = ["number", "currency", "decimal", "percentage", "formula"].includes(c.type) || Boolean(c.formula); return <th key={c.id} className={`px-3 py-2 font-semibold whitespace-nowrap ${num ? "text-right" : "text-left"}`} style={{ minWidth: c.width || 120 }}>{c.label}</th>; })}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {raw.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50/70">
                              <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                              {field.subform?.columns.map((c) => { const num = ["number", "currency", "decimal", "percentage", "formula"].includes(c.type) || Boolean(c.formula); const v = row[c.id]; const text = c.type === "lookup" && c.lookup ? (recordsMap[c.lookup.targetFormId] || []).find((r) => r.id === v)?.data?.[c.lookup.displayFieldId] ?? "—" : c.type === "checkbox" ? (v ? "Yes" : "No") : v === undefined || v === null || v === "" ? "—" : num && typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: c.decimalPlaces ?? 2 }) : String(v); return <td key={c.id} className={`px-3 py-1.5 whitespace-nowrap ${num ? "text-right tabular-nums font-medium text-slate-900" : "text-slate-800"}`}>{text}</td>; })}
                            </tr>
                          ))}
                        </tbody>
                        {field.subform?.showTotals !== false && (field.subform?.totalColumnIds?.length || 0) > 0 && (
                          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold"><tr><td className="px-3 py-1.5 text-[10px] uppercase text-slate-400">Total</td>{field.subform?.columns.map((c) => <td key={c.id} className="px-3 py-1.5 text-right tabular-nums">{field.subform?.totalColumnIds?.includes(c.id) ? raw.reduce((s: number, r: any) => s + (Number(r[c.id]) || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : ""}</td>)}</tr></tfoot>
                        )}
                      </table>
                    </div>
                  ) : field.type === "richtext" ? (
                    <div className="text-sm text-slate-800 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: String(raw || "") }} />
                  ) : field.type === "image" && raw?.url ? (
                    <a href={raw.url} target="_blank" rel="noreferrer"><img src={raw.url} alt="" className="h-32 rounded-lg border border-slate-200 object-cover" /></a>
                  ) : field.type === "signature" && raw ? (
                    <img src={raw} alt="signature" className="h-20 bg-white rounded border border-slate-200" />
                  ) : field.type === "file" && (raw?.url || Array.isArray(raw)) ? (
                    <div className="space-y-1">{(Array.isArray(raw) ? raw : [raw]).map((f: any, i: number) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline block truncate">{f.name}</a>)}</div>
                  ) : (
                    <div className="text-sm font-medium text-slate-900 break-words whitespace-pre-line">{val || <span className="text-slate-300">—</span>}</div>
                  )}
                </div>
              );
            })}
            <div className="md:col-span-2 text-[11px] text-slate-400 flex flex-wrap gap-4 pt-1">
              <span>Created {new Date(record.createdAt).toLocaleString()} {record.createdByName || record.createdBy ? `· ${record.createdByName || record.createdBy}` : ""}</span>
              <span>Updated {new Date(record.updatedAt).toLocaleString()} {record.updatedBy ? `· ${record.updatedBy}` : ""}</span>
            </div>
          </div>
        )}

        {tab === "related" && (
          <div className="space-y-5">
            {related.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No other form links to {form.name}.</p>}
            {related.map((rel) => {
              const tId = rel.form.titleFieldId || rel.form.fields.find((f) => f.type !== "section")?.id;
              return (
                <div key={rel.form.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{rel.form.name} <span className="text-slate-400 font-normal">via {rel.via}</span></span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{rel.records.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {rel.records.slice(0, 50).map((r) => (
                      <button key={r.id} type="button" onClick={() => router.push(getLiveAppUrl(app.linkName, { form: rel.form.linkName, recordId: r.id }))} className="w-full text-left px-4 py-2 text-xs hover:bg-blue-50 flex items-center justify-between">
                        <span className="font-medium text-slate-800 truncate">{tId ? getDisplayValue(rel.form, r, tId) || r.id : r.id}</span>
                        <span className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </button>
                    ))}
                    {rel.records.length === 0 && <div className="px-4 py-4 text-xs text-slate-400">None</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "comments" && (
          <div className="space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {comments.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No comments yet. Mention teammates with @email.</p>}
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">{(c.userName || c.user).charAt(0).toUpperCase()}</div>
                  <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-800">{c.userName || c.user}</span><span className="text-slate-400">{new Date(c.createdAt).toLocaleString()}</span></div>
                    <p className="text-xs text-slate-700 mt-1 whitespace-pre-line">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
            {user && (
              <div className="flex items-end gap-2">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Write a comment… use @email to mention" className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/25" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) postComment(); }} />
                <Button size="sm" onClick={postComment} disabled={!draft.trim()} icon={<Send className="w-3.5 h-3.5" />}>Post</Button>
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {(record.history || []).length === 0 && <p className="text-xs text-slate-400 text-center py-6">No changes recorded yet.</p>}
            {[...(record.history || [])].reverse().map((h, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3.5 text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2"><span className="font-semibold text-slate-800">{h.by || "unknown"}</span><span>{new Date(h.at).toLocaleString()}</span></div>
                <ul className="space-y-1">
                  {Object.entries(h.changes).map(([k, ch]) => (
                    <li key={k} className="flex flex-wrap gap-1.5 items-center"><span className="font-medium text-slate-700">{form.fields.find((f) => f.id === k)?.label || k}:</span><span className="line-through text-rose-500/80">{fmt(ch.from)}</span><span>→</span><span className="text-emerald-700 font-medium">{fmt(ch.to)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
};

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
}
