"use client";

import React, { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppBuilderProvider, useAppBuilder } from "@/context/AppBuilderContext";
import { AuthGate, FullScreenLoader } from "@/components/auth/AuthGate";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { BuilderSidebar } from "@/components/builder/BuilderSidebar";
import { FormList } from "@/components/builder/FormList";
import { FormBuilderWrapper } from "@/components/builder/FormBuilder/FormBuilderWrapper";
import { ReportBuilderView } from "@/components/builder/ReportBuilder/ReportBuilderView";
import { WorkflowBuilderView } from "@/components/builder/WorkflowBuilder/WorkflowBuilderView";
import { PageBuilderView } from "@/components/builder/PageBuilder/PageBuilderView";
import { RelationshipsView } from "@/components/builder/RelationshipsView/RelationshipsView";
import { AppSettingsView } from "@/components/builder/AppSettingsView";
import { UsersRolesView } from "@/components/builder/UsersRolesView";
import { NavigationView } from "@/components/builder/NavigationView";
import { VersionsView } from "@/components/builder/VersionsView";
import { AuditLogView } from "@/components/builder/AuditLogView";
import { HealthCheckView } from "@/components/builder/HealthCheckView";
import { AIAssistantView } from "@/components/builder/AIAssistantView";
import { Layers } from "lucide-react";

function BuilderContent() {
  const searchParams = useSearchParams();
  const { currentApp, loading, undo, redo } = useAppBuilder();
  const tab = searchParams.get("tab") || "forms";
  const formParam = searchParams.get("form");
  const reportParam = searchParams.get("report");
  const workflowParam = searchParams.get("workflow");
  const pageParam = searchParams.get("page");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (loading) return <FullScreenLoader text="Loading application builder…" />;

  if (!currentApp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3"><Layers className="w-6 h-6" /></div>
        <h1 className="text-lg font-bold text-slate-800">Application not found</h1>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">The requested application could not be loaded from Firestore.</p>
        <Link href="/builder" className="text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700">Return to applications</Link>
      </div>
    );
  }

  const render = () => {
    switch (tab) {
      case "reports": return <ReportBuilderView reportLinkName={reportParam || undefined} />;
      case "workflows": return <WorkflowBuilderView workflowId={workflowParam || undefined} />;
      case "pages": return <PageBuilderView pageLinkName={pageParam || undefined} />;
      case "relationships": return <RelationshipsView />;
      case "users": return <UsersRolesView />;
      case "navigation": return <NavigationView />;
      case "versions": return <VersionsView />;
      case "audit": return <AuditLogView />;
      case "health": return <HealthCheckView />;
      case "ai": return <AIAssistantView />;
      case "settings": return <AppSettingsView />;
      default: return formParam ? <FormBuilderWrapper formLinkName={formParam} /> : <FormList />;
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#f8fafc]">
      <BuilderHeader />
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <BuilderSidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">{render()}</main>
      </div>
    </div>
  );
}

function Inner() {
  const searchParams = useSearchParams();
  const appParam = searchParams.get("app") || "";
  return (
    <AppBuilderProvider initialAppIdOrLink={appParam}>
      <BuilderContent />
    </AppBuilderProvider>
  );
}

export default function UniversalBuilderEditorPage() {
  return (
    <AuthGate ownerOnly>
      <Suspense fallback={<FullScreenLoader text="Loading application builder…" />}>
        <Inner />
      </Suspense>
    </AuthGate>
  );
}
