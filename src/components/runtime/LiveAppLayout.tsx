"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import {
  FileText,
  TableProperties,
  LayoutTemplate,
  Edit,
  Menu,
  X,
  Layers,
  Search,
  Plus,
} from "lucide-react";

export const LiveAppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { app, loading } = useLiveApp();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8fafc] text-slate-400">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium text-slate-600">Loading Application...</span>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
          <Layers className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">Application Not Found</h1>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
          The requested application could not be located in your local storage database.
        </p>
        <Link
          href="/builder"
          className="text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Applications Builder
        </Link>
      </div>
    );
  }

  const appBase = `/${app.linkName}`;

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#f8fafc]">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-2xs">
            <Layers className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-slate-900 leading-tight">{app.name}</h1>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Runtime
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/builder/${app.linkName}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-all shadow-3xs hover:border-slate-400"
          >
            <Edit className="w-3.5 h-3.5 text-blue-600" />
            <span>Edit in Builder</span>
          </Link>
        </div>
      </header>

      {/* Main Two-Pane Container (Independent Scrolling) */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Dynamic Sidebar (Independent Scroll Pane) */}
        <aside
          className={`fixed md:static inset-y-14 left-0 z-20 w-64 bg-white border-r border-slate-200/90 h-full flex flex-col justify-between shrink-0 min-h-0 transition-transform duration-200 ease-in-out md:translate-x-0 shadow-xs md:shadow-none ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="p-3 space-y-6 overflow-y-auto flex-1 min-h-0">
            {/* Custom Pages / Dashboard if any */}
            {app.pages.length > 0 && (
              <div>
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dashboards & Pages
                </div>
                <nav className="space-y-0.5">
                  {app.pages.map((page) => {
                    const href = `${appBase}/pages/${page.linkName}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={page.id}
                        href={href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                          active
                            ? "bg-blue-50 text-blue-700 font-semibold shadow-3xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <LayoutTemplate className={`w-4 h-4 ${active ? "text-blue-600" : "text-slate-400"}`} />
                        <span>{page.name}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* Forms & Reports Navigation (Dynamically generated) */}
            <div>
              <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Modules & Forms
              </div>
              <nav className="space-y-1">
                {app.forms.map((form) => {
                  const defaultReport = app.reports.find((r) => r.sourceFormId === form.id && r.reportType !== "reconciliation");
                  const reportHref = defaultReport
                    ? `${appBase}/reports/${defaultReport.linkName}`
                    : `${appBase}/${form.linkName}`;
                  const isReportActive = pathname.startsWith(reportHref);

                  return (
                    <div key={form.id} className="space-y-0.5">
                      <Link
                        href={reportHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                          isReportActive
                            ? "bg-blue-50 text-blue-700 font-semibold shadow-3xs"
                            : "text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <TableProperties className={`w-4 h-4 ${isReportActive ? "text-blue-600" : "text-slate-400"}`} />
                          <span>{form.name}</span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* Reconciliation & Cross-Form Reports */}
            {app.reports.some((r) => r.reportType === "reconciliation") && (
              <div>
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Reconciliation & Ledgers
                </div>
                <nav className="space-y-1">
                  {app.reports
                    .filter((r) => r.reportType === "reconciliation")
                    .map((r) => {
                      const href = `${appBase}/reports/${r.linkName}`;
                      const active = pathname === href;
                      return (
                        <Link
                          key={r.id}
                          href={href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                            active
                              ? "bg-indigo-50 text-indigo-700 font-semibold shadow-3xs"
                              : "text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <Layers className={`w-4 h-4 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                          <span>{r.name}</span>
                        </Link>
                      );
                    })}
                </nav>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50/50 shrink-0">
            Powered by Zoho Creator Engine
          </div>
        </aside>

        {/* Main Content (Independent Scroll Pane) */}
        <main className="flex-1 h-full overflow-y-auto min-h-0 min-w-0 p-6 md:p-8 bg-[#f8fafc]">
          {children}
        </main>
      </div>
    </div>
  );
};
