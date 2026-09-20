"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicForm } from "@/components/runtime/DynamicForm";

export const EditRecordView: React.FC<{ formLinkName: string; recordId: string }> = ({
  formLinkName,
  recordId,
}) => {
  const router = useRouter();
  const { app, recordsMap } = useLiveApp();

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

  const existingRecords = recordsMap[targetForm.id] || [];
  const targetRecord = existingRecords.find((r) => r.id === recordId) || null;

  if (!targetRecord) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto">
        <h2 className="text-base font-bold text-slate-800">Record Not Found</h2>
        <p className="text-xs text-slate-400 mt-1">
          The requested record ID &quot;{recordId}&quot; could not be found.
        </p>
      </div>
    );
  }

  return (
    <DynamicForm
      form={targetForm}
      record={targetRecord}
      onSuccess={() => router.push(`/${app.linkName}/${targetForm.linkName}`)}
      onCancel={() => router.push(`/${app.linkName}/${targetForm.linkName}`)}
    />
  );
};
