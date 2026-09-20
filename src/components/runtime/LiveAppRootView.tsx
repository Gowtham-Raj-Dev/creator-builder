"use client";

import React from "react";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicPage } from "@/components/runtime/DynamicPage";
import { DynamicReport } from "@/components/runtime/DynamicReport";
import { Layers } from "lucide-react";
import Link from "next/link";
import { getBuilderUrl } from "@/lib/utils/routes";

export const LiveAppRootView: React.FC = () => {
  const { app } = useLiveApp();

  if (!app) return null;

  // 1. If custom page exists (e.g. Dashboard), display it
  if (app.pages.length > 0) {
    return <DynamicPage page={app.pages[0]} />;
  }

  // 2. Otherwise display default report of first form
  if (app.forms.length > 0) {
    const firstForm = app.forms[0];
    const defaultRep = app.reports.find((r) => r.sourceFormId === firstForm.id) || {
      id: "default",
      name: `${firstForm.name} Report`,
      linkName: `${firstForm.linkName}_report`,
      sourceFormId: firstForm.id,
      columns: firstForm.fields.map((f, i) => ({
        fieldId: f.id,
        label: f.label,
        visible: true,
        order: i,
      })),
      pageSize: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return <DynamicReport report={defaultRep} form={firstForm} />;
  }

  return (
    <div className="bg-white p-12 rounded-xl border border-slate-200 text-center max-w-lg mx-auto space-y-3">
      <Layers className="w-10 h-10 text-slate-300 mx-auto" />
      <h2 className="text-base font-bold text-slate-800">Application Initialized</h2>
      <p className="text-xs text-slate-500">
        This application has no forms or pages yet. Open the builder to create your first form.
      </p>
      <Link
        href={getBuilderUrl(app.linkName)}
        className="inline-block text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Open in Builder
      </Link>
    </div>
  );
};
