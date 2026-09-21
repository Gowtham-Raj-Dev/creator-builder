"use client";

import React, { useMemo, useState } from "react";
import { FieldDefinition, FormDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { parseCsv, coerceImportValue, toCsv, downloadText } from "@/lib/engine/reportEngine";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download } from "lucide-react";

export const ImportModal: React.FC<{ form: FormDefinition; onClose: () => void }> = ({ form, onClose }) => {
  const { importRecords, recordsMap } = useLiveApp();
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({}); // csv column index -> field id
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const importable = form.fields.filter((f) => !["section", "subform", "formula", "rollup", "signature", "file", "image"].includes(f.type));

  const headers = rows[0] || [];
  const body = rows.slice(1);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    // auto-map by label / linkName
    const m: Record<number, string> = {};
    (parsed[0] || []).forEach((h, i) => {
      const key = h.trim().toLowerCase();
      const f = importable.find((x) => x.label.toLowerCase() === key || x.linkName.toLowerCase() === key || x.id === key);
      if (f) m[i] = f.id;
    });
    setMapping(m);
    setDone(null);
  };

  const lookupResolver = (field: FieldDefinition, text: string) => {
    if (!field.lookup) return undefined;
    const recs = recordsMap[field.lookup.targetFormId] || [];
    const t = text.trim().toLowerCase();
    const hit = recs.find((r) => String(r.data?.[field.lookup!.displayFieldId] ?? "").trim().toLowerCase() === t || r.id === text.trim());
    return hit?.id;
  };

  const preview = useMemo(() => body.slice(0, 5), [body]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const run = async () => {
    setBusy(true);
    const out = body.map((r) => {
      const data: Record<string, any> = {};
      for (const [idx, fid] of Object.entries(mapping)) {
        if (!fid) continue;
        const field = importable.find((f) => f.id === fid)!;
        data[fid] = coerceImportValue(field, r[Number(idx)] ?? "", lookupResolver);
      }
      return data;
    });
    const n = await importRecords(form.id, out);
    setDone(n);
    setBusy(false);
  };

  const downloadTemplate = () => downloadText(`${form.linkName}_template.csv`, toCsv(importable.map((f) => f.label), [importable.map((f) => (f.options?.[0] ?? (f.type === "date" ? "2025-01-31" : "")))]));

  return (
    <Modal isOpen onClose={onClose} title={`Import into ${form.name}`} description="Upload a CSV, map columns to fields, and import. Lookups are matched by their display value." maxWidth="4xl" icon={<FileSpreadsheet className="w-4 h-4" />}
      footer={<><Button variant="outline" onClick={onClose}>{done !== null ? "Close" : "Cancel"}</Button>{done === null && <Button onClick={run} loading={busy} disabled={body.length === 0 || mappedCount === 0}>Import {body.length} row(s)</Button>}</>}>
      {done !== null ? (
        <div className="text-center py-10 space-y-2"><CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" /><p className="text-sm font-semibold text-slate-900">{done} record(s) imported</p></div>
      ) : rows.length === 0 ? (
        <div className="space-y-4">
          <label className="block rounded-xl border-2 border-dashed border-slate-300 p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40">
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <UploadCloud className="w-8 h-8 text-blue-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800 mt-2">Click to choose a CSV file</p>
            <p className="text-[11px] text-slate-400">First row must be headers. Excel: File → Save As → CSV.</p>
          </label>
          <button type="button" onClick={downloadTemplate} className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Download template CSV</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs"><span className="text-slate-600"><strong>{body.length}</strong> data rows · <strong>{mappedCount}</strong>/{headers.length} columns mapped</span><button type="button" className="text-blue-600 font-semibold" onClick={() => setRows([])}>Choose another file</button></div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="text-xs w-full">
              <thead className="bg-slate-50">
                <tr>{headers.map((h, i) => (
                  <th key={i} className="p-2 text-left align-top min-w-[160px]">
                    <div className="font-semibold text-slate-800 truncate">{h}</div>
                    <select value={mapping[i] || ""} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })} className={`mt-1 w-full text-[11px] border rounded px-1.5 py-1 bg-white ${mapping[i] ? "border-emerald-300" : "border-slate-300"}`}>
                      <option value="">— skip —</option>
                      {importable.map((f) => <option key={f.id} value={f.id}>{f.label}{f.required ? " *" : ""}</option>)}
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">{preview.map((r, ri) => <tr key={ri}>{headers.map((_, ci) => <td key={ci} className="p-2 text-slate-600 truncate max-w-[200px]">{r[ci]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {importable.some((f) => f.required && !Object.values(mapping).includes(f.id)) && (
            <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5"><AlertTriangle className="w-4 h-4 text-amber-600" /> Required fields not mapped: {importable.filter((f) => f.required && !Object.values(mapping).includes(f.id)).map((f) => f.label).join(", ")}</div>
          )}
        </div>
      )}
    </Modal>
  );
};
