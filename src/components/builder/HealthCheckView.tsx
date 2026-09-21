"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, Tabs } from "@/components/ui/FormControls";
import { getBuilderUrl } from "@/lib/utils/routes";
import { applyHealthFix, HealthIssue } from "@/lib/engine/healthCheck";
import { useToast } from "@/context/ToastContext";
import { HeartPulse, RefreshCw, ShieldAlert, AlertTriangle, Info, ArrowRight, CheckCircle2, Wrench } from "lucide-react";

export const HealthCheckView: React.FC = () => {
  const { currentApp, healthIssues, refreshHealth, updateCurrentApp } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const [sev, setSev] = useState("all");
  if (!currentApp) return null;
  const list = healthIssues.filter((i) => sev === "all" || i.severity === sev);
  const counts = { error: healthIssues.filter((i) => i.severity === "error").length, warning: healthIssues.filter((i) => i.severity === "warning").length, info: healthIssues.filter((i) => i.severity === "info").length };
  const score = Math.max(0, 100 - counts.error * 15 - counts.warning * 5 - counts.info);
  const fixable = healthIssues.filter((i) => i.autoFix);
  const fix = (issues: HealthIssue[]) => {
    updateCurrentApp((prev) => issues.reduce((app, i) => applyHealthFix(app, i), prev));
    showToast(issues.length === 1 ? `Applied: ${issues[0].autoFix!.label}` : `Applied ${issues.length} fixes`, "success");
    setTimeout(refreshHealth, 50);
  };

  const open = (i: (typeof healthIssues)[number]) => {
    if (i.area === "form") { const f = currentApp.forms.find((x) => x.id === i.entityId); router.push(getBuilderUrl(currentApp.linkName, { tab: "forms", form: f?.linkName })); }
    else if (i.area === "report") { const r = currentApp.reports.find((x) => x.id === i.entityId); router.push(getBuilderUrl(currentApp.linkName, { tab: "reports", report: r?.linkName })); }
    else if (i.area === "workflow") router.push(getBuilderUrl(currentApp.linkName, { tab: "workflows", workflow: i.entityId }));
    else if (i.area === "page") { const p = currentApp.pages.find((x) => x.id === i.entityId); router.push(getBuilderUrl(currentApp.linkName, { tab: "pages", page: p?.linkName })); }
    else if (i.area === "role") router.push(getBuilderUrl(currentApp.linkName, { tab: "users" }));
  };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ring-4 ${score >= 90 ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : score >= 60 ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-rose-50 text-rose-700 ring-rose-100"}`}>{score}</div>
            <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-blue-600" /> App health</h1><p className="text-xs text-slate-500 mt-0.5">Broken lookups, invalid formulas/scripts, dangling references, unused fields, permission gaps.</p></div>
          </div>
          <div className="flex items-center gap-2">
            {fixable.length > 0 && <Button size="sm" onClick={() => fix(fixable)} icon={<Wrench className="w-3.5 h-3.5" />}>Auto-fix {fixable.length}</Button>}
            <Button variant="outline" size="sm" onClick={refreshHealth} icon={<RefreshCw className="w-3.5 h-3.5" />}>Re-scan</Button>
          </div>
        </div>
        <Tabs active={sev} onChange={setSev} tabs={[{ id: "all", label: "All", count: healthIssues.length }, { id: "error", label: "Errors", count: counts.error }, { id: "warning", label: "Warnings", count: counts.warning }, { id: "info", label: "Suggestions", count: counts.info }]} />
        {list.length === 0 ? <EmptyState icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />} title="All clear" description="No issues found in this category." /> : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-3xs divide-y divide-slate-100">
            {list.map((i) => (
              <div key={i.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 text-xs">
                {i.severity === "error" ? <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" /> : i.severity === "warning" ? <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" /> : <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />}
                <button type="button" onClick={() => open(i)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap"><Badge variant="default">{i.area}</Badge><span className="font-semibold text-slate-900 truncate">{i.entityName}</span></div>
                  <div className="text-slate-700 mt-0.5">{i.message}</div>
                  {i.fix && <div className="text-[11px] text-slate-500 mt-0.5">Fix: {i.fix}</div>}
                </button>
                {i.autoFix && <Button size="xs" variant="subtle" onClick={() => fix([i])} icon={<Wrench className="w-3 h-3" />}>{i.autoFix.label}</Button>}
                <button type="button" onClick={() => open(i)} className="p-1 text-slate-300 hover:text-slate-600"><ArrowRight className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
