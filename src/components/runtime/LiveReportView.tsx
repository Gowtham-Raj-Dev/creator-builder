"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicReport } from "@/components/runtime/DynamicReport";

export const LiveReportView: React.FC<{ reportLinkName: string }> = ({ reportLinkName }) => {
  const router = useRouter();
  const { app } = useLiveApp();

  if (!app) return null;

  const targetReport = app.reports.find((r) => r.linkName === reportLinkName);

  if (!targetReport) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto">
        <h2 className="text-base font-bold text-slate-800">Report Not Found</h2>
        <p className="text-xs text-slate-400 mt-1">
          No report matching &quot;{reportLinkName}&quot; exists in this application schema.
        </p>
      </div>
    );
  }

  const sourceForm = app.forms.find((f) => f.id === targetReport.sourceFormId);

  if (!sourceForm) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto">
        <h2 className="text-base font-bold text-slate-800">Source Form Missing</h2>
        <p className="text-xs text-slate-400 mt-1">
          The underlying form schema for this report was deleted or not found.
        </p>
      </div>
    );
  }

  return (
    <DynamicReport
      report={targetReport}
      form={sourceForm}
      onAddRecord={() => router.push(`/${app.linkName}/${sourceForm.linkName}/new`)}
      onEditRecord={(recId) => router.push(`/${app.linkName}/${sourceForm.linkName}/${recId}`)}
    />
  );
};
