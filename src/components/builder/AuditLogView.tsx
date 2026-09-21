"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AuditLogEntry } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState } from "@/components/ui/FormControls";
import { toCsv, downloadText } from "@/lib/engine/reportEngine";
import { ScrollText, RefreshCw, Download, Search } from "lucide-react";

const TYPE_TONE: Record<string, any> = { record: "primary", schema: "purple", member: "indigo", role: "indigo", publish: "success", auth: "default" };

export const AuditLogView: React.FC = () => {
  const { currentApp, listAudit } = useAppBuilder();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");

  const load = async () => { setEntries(null); setEntries(await listAudit()); };
  useEffect(() => { load(); }, [currentApp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => (entries || []).filter((e) => (!type || e.type === type) && (!q || `${e.user} ${e.entityName} ${e.action}`.toLowerCase().includes(q.toLowerCase()))), [entries, type, q]);
  if (!currentApp) return null;

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-3 flex-wrap">
          <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-blue-600" /> Audit log</h1><p className="text-xs text-slate-500 mt-0.5">Who changed what and when — records, schema, members, publishes (last 200).</p></div>
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40 text-xs pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg" /></div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"><option value="">All types</option><option value="record">Records</option><option value="schema">Schema</option><option value="member">Members</option><option value="publish">Publish</option></select>
            <Button variant="outline" size="sm" onClick={load} icon={<RefreshCw className="w-3.5 h-3.5" />}>Refresh</Button>
            <Button variant="outline" size="sm" onClick={() => downloadText(`${currentApp.linkName}_audit.csv`, toCsv(["Time", "User", "Type", "Action", "Entity", "Changes"], filtered.map((e) => [e.createdAt, e.user, e.type, e.action, e.entityName || "", e.changes ? JSON.stringify(e.changes) : ""])))} icon={<Download className="w-3.5 h-3.5" />}>CSV</Button>
          </div>
        </div>
        {!entries ? <p className="text-xs text-slate-400 text-center py-8">Loading…</p> : filtered.length === 0 ? <EmptyState icon={<ScrollText className="w-6 h-6" />} title="No activity yet" description="Record and schema changes will appear here." /> : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-3xs divide-y divide-slate-100">
            {filtered.map((e) => (
              <div key={e.id} className="px-4 py-3 text-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0">{(e.userName || e.user || "?").charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-slate-900">{e.userName || e.user}</span><span className="text-slate-500">{e.action}</span><Badge variant={TYPE_TONE[e.type] || "default"}>{e.entityType || e.type}</Badge><span className="font-medium text-slate-800 truncate">{e.entityName}</span>{e.recordId && <span className="font-mono text-[10px] text-slate-400">{e.recordId}</span>}</div>
                  {e.changes && Object.keys(e.changes).length > 0 && (
                    <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">{Object.entries(e.changes).slice(0, 6).map(([k, ch]) => { const form = currentApp.forms.find((f) => f.id === e.formId); const label = form?.fields.find((f) => f.id === k)?.label || k; return <span key={k}><span className="text-slate-700">{label}</span>: <span className="line-through text-rose-400">{fmt(ch.from)}</span> → <span className="text-emerald-700">{fmt(ch.to)}</span></span>; })}{Object.keys(e.changes).length > 6 && <span>+{Object.keys(e.changes).length - 6} more</span>}</div>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function fmt(v: any) { if (v === null || v === undefined || v === "") return "∅"; if (Array.isArray(v)) return `[${v.length}]`; if (typeof v === "object") return "{…}"; return String(v).slice(0, 40); }
