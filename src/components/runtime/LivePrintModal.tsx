"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormDefinition, RecordDefinition, PrintTemplate } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { buildPrintDocument } from "@/lib/engine/printEngine";
import { Button } from "@/components/ui/Button";
import { Printer, X, FileText, Download } from "lucide-react";

/**
 * Print for end users: only the designs the owner built for this form (Print designs tab).
 * No presets, no code — pick a design if there are several, preview, print. When the owner
 * hasn't designed anything yet, a ready document generated from the form is used.
 */
export const LivePrintModal: React.FC<{ isOpen: boolean; onClose: () => void; form: FormDefinition; record?: RecordDefinition | null; records?: RecordDefinition[]; reportName?: string }> = ({ isOpen, onClose, form, record, records, reportName }) => {
  const { app, recordsMap } = useLiveApp();
  const { user } = useAuth();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // only designs the owner built (default first); the Print button is hidden when there are none
  const designs = useMemo<PrintTemplate[]>(() => [...(app?.printTemplates || []).filter((t) => t.formId === form.id)].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault))), [app, form.id]);
  const [designId, setDesignId] = useState<string>("");
  useEffect(() => { if (isOpen) setDesignId(designs[0]?.id || ""); }, [isOpen, designs]);
  const design = designs.find((d) => d.id === designId) || designs[0];

  const doc = useMemo(() => {
    if (!app || !design) return "";
    if (records && !record) {
      // report print: simple listing of the visible records
      const cols = form.fields.filter((f) => !["subform", "section", "richtext", "file", "image", "signature"].includes(f.type));
      const html = `<style>.doc{padding:6mm}.head{display:flex;justify-content:space-between;border-bottom:2px solid #2563eb;padding-bottom:8px;margin-bottom:10px}.brand{font-size:18px;font-weight:700;color:#2563eb}th{background:#eff6ff;border-bottom:1px solid #bfdbfe;font-size:10px;text-transform:uppercase}td{border-bottom:1px solid #f1f5f9;font-size:11px}</style>
<div class="doc"><div class="head"><div class="brand">{{app.name}}</div><div style="text-align:right"><b>${reportName || form.name}</b><div style="font-size:10px;color:#64748b">{{today}} · ${records.length} records</div></div></div>
<table><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>{{#report_rows}}<tr>${cols.map((c) => `<td>{{${c.linkName}}}</td>`).join("")}</tr>{{/report_rows}}</tbody></table></div>`;
      return buildPrintDocument({ html, paper: "A4", orientation: cols.length > 6 ? "landscape" : "portrait" }, { app, form, records, recordsMap, user: user ? { name: user.name, email: user.email } : null, forms: app.forms }, reportName || form.name);
    }
    return buildPrintDocument(design, { app, form, record, recordsMap, user: user ? { name: user.name, email: user.email } : null, forms: app.forms }, `${form.name} – ${design.name}`);
  }, [app, design, form, record, records, recordsMap, user, reportName]);

  if (!isOpen || !app || !design) return null;
  const print = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    w.focus(); w.print();
  };
  const savePdf = () => { const w = window.open("", "_blank"); if (w) { w.document.write(doc); w.document.close(); setTimeout(() => w.print(), 300); } };
  const title = record ? (form.titleFieldId ? String(record.data?.[form.titleFieldId] ?? record.id) : record.id) : reportName || form.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-5xl w-full h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100"><Printer className="w-4 h-4" /></div>
            <div className="min-w-0"><div className="text-sm font-bold text-slate-900 truncate">Print · {title}</div><div className="text-[11px] text-slate-500">{form.name}{records && !record ? ` · ${records.length} records` : ""}</div></div>
          </div>
          <div className="flex items-center gap-2">
            {!records && designs.length > 1 && (
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 max-w-[420px] overflow-x-auto">
                {designs.map((d) => <button key={d.id} type="button" onClick={() => setDesignId(d.id)} className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap flex items-center gap-1 ${designId === d.id ? "bg-white shadow-3xs text-blue-700" : "text-slate-600 hover:text-slate-900"}`}><FileText className="w-3 h-3" />{d.name}</button>)}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={savePdf} icon={<Download className="w-3.5 h-3.5" />} title="Open in a new tab (save as PDF from the print dialog)">PDF</Button>
            <Button size="sm" onClick={print} icon={<Printer className="w-3.5 h-3.5" />}>Print</Button>
            <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-slate-200/70 p-4 overflow-auto">
          <iframe ref={frameRef} title="print preview" srcDoc={doc} className="w-full h-full bg-white rounded-lg shadow-xl border border-slate-300" />
        </div>
      </div>
    </div>
  );
};
