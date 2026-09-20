"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicReport } from "@/components/runtime/DynamicReport";
import { ReportDefinition } from "@/types/schema";

export default function FormModulePage() {
  const params = useParams();
  const router = useRouter();
  const { app } = useLiveApp();

  const formLinkName = (params?.form as string) || "";

  if (!app) return null;

  const targetForm = app.forms.find((f) => f.linkName === formLinkName);

  if (!targetForm) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto">
        <h2 className="text-base font-bold text-slate-800">Form Not Found</h2>
        <p className="text-xs text-slate-400 mt-1">
          No form matching &quot;{formLinkName}&quot; exists in this application schema.
        </p>
      </div>
    );
  }

  // Find default report or build a dynamic fallback report
  const defaultReport: ReportDefinition = app.reports.find(
    (r) => r.sourceFormId === targetForm.id
  ) || {
    id: `rep_${targetForm.id}`,
    name: `${targetForm.name} Report`,
    linkName: `${targetForm.linkName}_report`,
    sourceFormId: targetForm.id,
    columns: targetForm.fields.map((f, i) => ({
      fieldId: f.id,
      label: f.label,
      visible: true,
      order: i,
    })),
    pageSize: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <DynamicReport
      report={defaultReport}
      form={targetForm}
      onAddRecord={() => router.push(`/${app.linkName}/${targetForm.linkName}/new`)}
      onEditRecord={(recId) => router.push(`/${app.linkName}/${targetForm.linkName}/${recId}`)}
    />
  );
}
