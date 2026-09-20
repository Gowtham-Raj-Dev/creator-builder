"use client";

import React from "react";
import { useParams } from "next/navigation";
import { AppBuilderProvider, useAppBuilder } from "@/context/AppBuilderContext";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { BuilderSidebar } from "@/components/builder/BuilderSidebar";
import Link from "next/link";
import { Layers } from "lucide-react";

function BuilderContent({ children }: { children: React.ReactNode }) {
  const { currentApp, loading } = useAppBuilder();

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
          The requested application could not be loaded into the builder.
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

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#f8fafc]">
      <BuilderHeader />
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <BuilderSidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">{children}</main>
      </div>
    </div>
  );
}

export default function BuilderAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const appParam = (params?.app as string) || "";

  return (
    <AppBuilderProvider initialAppIdOrLink={appParam}>
      <BuilderContent>{children}</BuilderContent>
    </AppBuilderProvider>
  );
}
