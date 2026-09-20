"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicForm } from "@/components/runtime/DynamicForm";
import { getLiveAppUrl } from "@/lib/utils/routes";

export const NewRecordView: React.FC<{ formLinkName: string }> = ({ formLinkName }) => {
  const router = useRouter();
  const { app } = useLiveApp();

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

  return (
    <DynamicForm
      form={targetForm}
      onSuccess={() => router.push(getLiveAppUrl(app.linkName, { form: targetForm.linkName }))}
      onCancel={() => router.push(getLiveAppUrl(app.linkName, { form: targetForm.linkName }))}
    />
  );
};
