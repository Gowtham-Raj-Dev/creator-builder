"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LiveAppProvider, useLiveApp } from "@/context/LiveAppContext";
import { LiveAppLayout } from "@/components/runtime/LiveAppLayout";
import { LiveAppRootView } from "@/components/runtime/LiveAppRootView";
import { FormModuleView } from "@/components/runtime/FormModuleView";
import { LiveReportView } from "@/components/runtime/LiveReportView";
import { NewRecordView } from "@/components/runtime/NewRecordView";
import { EditRecordView } from "@/components/runtime/EditRecordView";
import { DynamicPage } from "@/components/runtime/DynamicPage";

function UniversalLiveAppContent() {
  const searchParams = useSearchParams();
  const { app, loading } = useLiveApp();

  const formParam = searchParams.get("form");
  const reportParam = searchParams.get("report");
  const pageParam = searchParams.get("page");
  const actionParam = searchParams.get("action");
  const recordParam = searchParams.get("record");

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium text-slate-600">Loading Application...</span>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
          <span className="text-xl font-bold">!</span>
        </div>
        <h1 className="text-lg font-bold text-slate-800">Application Not Found</h1>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
          The requested application could not be loaded from local storage.
        </p>
      </div>
    );
  }

  // 1. Report view (standard or reconciliation)
  if (reportParam) {
    return <LiveReportView reportLinkName={reportParam} />;
  }

  // 2. Custom page / dashboard
  if (pageParam) {
    const pg = app.pages.find((p) => p.linkName === pageParam);
    if (pg) {
      return <DynamicPage page={pg} />;
    }
  }

  // 3. Form views (new, edit, list)
  if (formParam) {
    if (actionParam === "new") {
      return <NewRecordView formLinkName={formParam} />;
    }
    if (recordParam) {
      return <EditRecordView formLinkName={formParam} recordId={recordParam} />;
    }
    return <FormModuleView formLinkName={formParam} />;
  }

  // 4. Default root view
  return <LiveAppRootView />;
}

function UniversalLiveAppInner() {
  const searchParams = useSearchParams();
  const appLinkName = searchParams.get("app") || "gowthamtest";

  return (
    <LiveAppProvider appLinkName={appLinkName}>
      <LiveAppLayout>
        <UniversalLiveAppContent />
      </LiveAppLayout>
    </LiveAppProvider>
  );
}

export default function UniversalLiveAppPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading Application...</span>
          </div>
        </div>
      }
    >
      <UniversalLiveAppInner />
    </Suspense>
  );
}
