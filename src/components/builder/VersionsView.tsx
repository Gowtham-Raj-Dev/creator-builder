"use client";

import React, { useEffect, useState } from "react";
import { AppVersion } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Input } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { History, Rocket, RotateCcw, GitCompare, CheckCircle2 } from "lucide-react";

export const VersionsView: React.FC = () => {
  const { currentApp, listVersions, rollbackTo, publish } = useAppBuilder();
  const [versions, setVersions] = useState<AppVersion[] | null>(null);
  const [rollback, setRollback] = useState<AppVersion | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => setVersions(await listVersions());
  useEffect(() => { load(); }, [currentApp?.publishedVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentApp) return null;

  const diff = (v: AppVersion) => {
    const s = v.snapshot;
    const d: string[] = [];
    const cmp = (a: any[], b: any[], name: string) => { const added = b.filter((x) => !a.some((y) => y.id === x.id)).length; const removed = a.filter((x) => !b.some((y) => y.id === x.id)).length; const changed = b.filter((x) => { const o = a.find((y) => y.id === x.id); return o && JSON.stringify(o) !== JSON.stringify(x); }).length; if (added || removed || changed) d.push(`${name}: +${added} −${removed} ~${changed}`); };
    cmp(s.forms, currentApp.forms, "forms"); cmp(s.reports, currentApp.reports, "reports"); cmp(s.pages, currentApp.pages, "pages"); cmp(s.workflows, currentApp.workflows, "workflows"); cmp(s.roles || [], currentApp.roles, "roles");
    return d;
  };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-3">
          <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><History className="w-5 h-5 text-blue-600" /> Versions & publishing</h1><p className="text-xs text-slate-500 mt-0.5">Members use the latest <strong>published</strong> version; you edit the draft. Roll back restores a snapshot into the draft.</p></div>
          <div className="flex items-center gap-2"><Input size="sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version label" /><Button size="sm" loading={busy} onClick={async () => { setBusy(true); await publish(label || undefined); setLabel(""); setBusy(false); load(); }} icon={<Rocket className="w-3.5 h-3.5" />}>Publish</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Draft" value={`v${(currentApp.publishedVersion || 0)}+`} sub={`updated ${new Date(currentApp.updatedAt).toLocaleString()}`} />
          <Stat label="Published" value={currentApp.publishedVersion ? `v${currentApp.publishedVersion}` : "—"} sub={currentApp.publishedAt ? new Date(currentApp.publishedAt).toLocaleString() : "not published yet"} />
          <Stat label="Pending changes" value={versions?.[0] ? String(diff(versions[0]).length || 0) : "—"} sub="areas changed since last publish" />
        </div>
        {!versions ? <p className="text-xs text-slate-400">Loading…</p> : versions.length === 0 ? <EmptyState icon={<Rocket className="w-6 h-6" />} title="No versions yet" description="Publish to create the first version members can use." /> : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-3xs divide-y divide-slate-100">
            {versions.map((v) => { const isLive = v.version === currentApp.publishedVersion; const d = isLive ? diff(v) : []; return (
              <div key={v.id} className="p-4 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><span className="font-bold text-slate-900">v{v.version}</span>{isLive && <Badge variant="success" dot><CheckCircle2 className="w-3 h-3" /> Live</Badge>}<span className="text-slate-500">{v.label}</span></div>
                  <div className="text-[11px] text-slate-400">{new Date(v.createdAt).toLocaleString()} · {v.createdBy} · {v.snapshot.forms.length} forms, {v.snapshot.reports.length} reports, {v.snapshot.workflows.length} workflows</div>
                  {isLive && d.length > 0 && <div className="text-[11px] text-amber-700 flex items-center gap-1"><GitCompare className="w-3 h-3" /> Draft differs: {d.join(" · ")}</div>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setRollback(v)} icon={<RotateCcw className="w-3.5 h-3.5" />}>Restore into draft</Button>
              </div>); })}
          </div>
        )}
      </div>
      <ConfirmDialog isOpen={Boolean(rollback)} onClose={() => setRollback(null)} onConfirm={async () => { if (rollback) await rollbackTo(rollback); }} title={`Restore v${rollback?.version}?`} message="The draft (forms, reports, pages, workflows, roles, settings) will be replaced with this snapshot. Records are not affected. Publish afterwards to make it live." confirmText="Restore" isDestructive={false} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs"><div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div><div className="text-xl font-bold text-slate-900">{value}</div><div className="text-[11px] text-slate-400">{sub}</div></div>
);
