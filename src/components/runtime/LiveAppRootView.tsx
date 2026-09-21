"use client";

import React from "react";
import Link from "next/link";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicPage } from "@/components/runtime/DynamicPage";
import { DynamicReport } from "@/components/runtime/DynamicReport";
import { getBuilderUrl, getLiveAppUrl } from "@/lib/utils/routes";
import { Layers, FileText, TableProperties, LayoutTemplate, Plus } from "lucide-react";

export const LiveAppRootView: React.FC = () => {
  const { app, permissions, recordsMap } = useLiveApp();
  if (!app) return null;

  // 1. Home page (marked isHome / settings.homePageId / first visible page)
  const home = app.pages.find((p) => p.id === app.settings?.homePageId) || app.pages.find((p) => p.isHome) || app.pages[0];
  if (home && permissions.page(home.id)) return <DynamicPage page={home} />;

  // 2. First visible form's default report
  const firstForm = app.forms.find((f) => permissions.form(f.id).view);
  if (firstForm) {
    const rep = app.reports.find((r) => r.sourceFormId === firstForm.id && r.reportType !== "ledger");
    if (rep) return <DynamicReport report={rep} form={firstForm} />;
  }

  // 3. Overview of what's available
  const visibleForms = app.forms.filter((f) => permissions.form(f.id).view);
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto"><Layers className="w-7 h-7" /></div>
        <h2 className="text-base font-bold text-slate-800">{app.name}</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">{app.description || (visibleForms.length === 0 ? "This application has no modules you can access yet." : "Choose a module from the menu to get started.")}</p>
        {permissions.canEditBuilder && app.forms.length === 0 && (
          <Link href={getBuilderUrl(app.linkName)} className="inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Build your first form</Link>
        )}
      </div>
      {visibleForms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleForms.map((f) => (
            <Link key={f.id} href={getLiveAppUrl(app.linkName, { form: f.linkName })} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><FileText className="w-4 h-4" /></div>
              <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{f.name}</div><div className="text-[11px] text-slate-400">{(recordsMap[f.id] || []).length} records</div></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export const AccessDenied: React.FC<{ what?: string }> = ({ what = "this page" }) => (
  <div className="bg-white p-10 rounded-xl border border-slate-200 text-center max-w-md mx-auto space-y-2">
    <TableProperties className="w-8 h-8 text-slate-300 mx-auto" />
    <h2 className="text-sm font-bold text-slate-800">No access</h2>
    <p className="text-xs text-slate-500">Your designation does not allow you to view {what}. Contact the app owner.</p>
  </div>
);

export const NotFoundCard: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto space-y-1">
    <LayoutTemplate className="w-8 h-8 text-slate-300 mx-auto mb-2" />
    <h2 className="text-sm font-bold text-slate-800">{title}</h2>
    <p className="text-xs text-slate-400">{message}</p>
  </div>
);
