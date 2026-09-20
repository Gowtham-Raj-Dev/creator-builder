"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppBuilderProvider, useAppBuilder } from "@/context/AppBuilderContext";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { BuilderSidebar } from "@/components/builder/BuilderSidebar";
import { FormList } from "@/components/builder/FormList";
import { FormBuilderWrapper } from "@/components/builder/FormBuilder/FormBuilderWrapper";
import { ReportBuilderView } from "@/components/builder/ReportBuilder/ReportBuilderView";
import { WorkflowBuilderView } from "@/components/builder/WorkflowBuilder/WorkflowBuilderView";
import { PageBuilderView } from "@/components/builder/PageBuilder/PageBuilderView";
import { RelationshipsView } from "@/components/builder/RelationshipsView/RelationshipsView";
import { AppSettingsView } from "@/components/builder/AppSettingsView";
import Link from "next/link";
import { Layers } from "lucide-react";

function UniversalBuilderContent() {
  const searchParams = useSearchParams();
  const { currentApp, loading } = useAppBuilder();

  const tab = searchParams.get("tab") || "forms";
  const formParam = searchParams.get("form");
  const reportParam = searchParams.get("report");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading Application Builder...</span>
        </div>
      </div>
    );
  }

  if (!currentApp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
          <Layers className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">Application Not Found</h1>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
          The requested application could not be loaded into the builder from local storage.
        </p>
        <Link
          href="/builder"
          className="text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Return to Applications List
        </Link>
      </div>
    );
  }

  const renderActiveTab = () => {
    switch (tab) {
      case "reports":
        return <ReportBuilderView reportLinkName={reportParam || undefined} />;
      case "workflows":
        return <WorkflowBuilderView />;
      case "pages":
        return <PageBuilderView />;
      case "relationships":
        return <RelationshipsView />;
      case "settings":
        return <AppSettingsView />;
      case "forms":
      default:
        if (formParam) {
          return <FormBuilderWrapper formLinkName={formParam} />;
        }
        return <FormList />;
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#f8fafc]">
      <BuilderHeader />
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <BuilderSidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
          {renderActiveTab()}
        </main>
      </div>
    </div>
  );
}

function UniversalBuilderInner() {
  const searchParams = useSearchParams();
  const appParam = searchParams.get("app") || "gowthamtest";

  return (
    <AppBuilderProvider initialAppIdOrLink={appParam}>
      <UniversalBuilderContent />
    </AppBuilderProvider>
  );
}

export default function UniversalBuilderEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading Application Builder...</span>
          </div>
        </div>
      }
    >
      <UniversalBuilderInner />
    </Suspense>
  );
}
