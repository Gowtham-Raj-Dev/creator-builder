"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicReport } from "@/components/runtime/DynamicReport";
import { DynamicForm } from "@/components/runtime/DynamicForm";
import { DynamicPage } from "@/components/runtime/DynamicPage";
import { ReportDefinition } from "@/types/schema";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { AccessDenied, NotFoundCard } from "./LiveAppRootView";

/** Form module: list (default report) of a form. */
export const FormModuleView: React.FC<{ formLinkName: string; view?: string }> = ({ formLinkName, view }) => {
  const router = useRouter();
  const { app, permissions } = useLiveApp();
  if (!app) return null;
  const targetForm = app.forms.find((f) => f.linkName === formLinkName);
  if (!targetForm) return <NotFoundCard title="Form not found" message={`No form matching "${formLinkName}" exists in this application.`} />;
  if (!permissions.form(targetForm.id).view) return <AccessDenied what={targetForm.name} />;

  const report: ReportDefinition = app.reports.find((r) => r.sourceFormId === targetForm.id && r.reportType !== "ledger") || {
    id: `rep_${targetForm.id}`, name: `${targetForm.name} Report`, linkName: `${targetForm.linkName}_report`, sourceFormId: targetForm.id, reportType: "table",
    columns: targetForm.fields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: true, order: i })), pageSize: 15, createdAt: "", updatedAt: "",
  };

  return (
    <DynamicReport
      report={report}
      form={targetForm}
      initialView={view}
      onAddRecord={() => router.push(getLiveAppUrl(app.linkName, { form: targetForm.linkName, action: "new" }))}
      onEditRecord={(id) => router.push(getLiveAppUrl(app.linkName, { form: targetForm.linkName, recordId: id }))}
    />
  );
};

export const NewRecordView: React.FC<{ formLinkName: string }> = ({ formLinkName }) => {
  const router = useRouter();
  const { app, permissions } = useLiveApp();
  if (!app) return null;
  const targetForm = app.forms.find((f) => f.linkName === formLinkName);
  if (!targetForm) return <NotFoundCard title="Form not found" message={`No form matching "${formLinkName}" exists.`} />;
  if (!permissions.form(targetForm.id).create) return <AccessDenied what={`creating ${targetForm.name} records`} />;
  const back = () => {
    const rep = app.reports.find((r) => r.sourceFormId === targetForm.id && r.reportType !== "ledger");
    router.push(rep ? getLiveAppUrl(app.linkName, { report: rep.linkName }) : getLiveAppUrl(app.linkName, { form: targetForm.linkName }));
  };
  return <DynamicForm form={targetForm} onSuccess={() => back()} onCancel={back} />;
};

export const EditRecordView: React.FC<{ formLinkName: string; recordId: string }> = ({ formLinkName, recordId }) => {
  const router = useRouter();
  const { app, recordsMap, permissions } = useLiveApp();
  if (!app) return null;
  const targetForm = app.forms.find((f) => f.linkName === formLinkName);
  if (!targetForm) return <NotFoundCard title="Form not found" message={`No form matching "${formLinkName}" exists.`} />;
  if (!permissions.form(targetForm.id).view) return <AccessDenied what={targetForm.name} />;
  const record = (recordsMap[targetForm.id] || []).find((r) => r.id === recordId) || null;
  if (!record) return <NotFoundCard title="Record not found" message={`Record "${recordId}" could not be found (it may be in the trash).`} />;
  if (!permissions.canSeeRecord(targetForm.id, record)) return <AccessDenied what="this record" />;
  const back = () => {
    const rep = app.reports.find((r) => r.sourceFormId === targetForm.id && r.reportType !== "ledger");
    router.push(rep ? getLiveAppUrl(app.linkName, { report: rep.linkName }) : getLiveAppUrl(app.linkName, { form: targetForm.linkName }));
  };
  return <DynamicForm form={targetForm} record={record} onSuccess={() => back()} onCancel={back} />;
};

export const LiveReportView: React.FC<{ reportLinkName: string; view?: string }> = ({ reportLinkName, view }) => {
  const router = useRouter();
  const { app, permissions } = useLiveApp();
  if (!app) return null;
  const report = app.reports.find((r) => r.linkName === reportLinkName);
  if (!report) return <NotFoundCard title="Report not found" message={`No report matching "${reportLinkName}" exists.`} />;
  if (!permissions.report(report.id).view) return <AccessDenied what={report.name} />;
  const sourceForm = app.forms.find((f) => f.id === report.sourceFormId);
  if (!sourceForm) return <NotFoundCard title="Source form missing" message="The form behind this report was deleted." />;
  return (
    <DynamicReport
      report={report}
      form={sourceForm}
      initialView={view}
      onAddRecord={() => router.push(getLiveAppUrl(app.linkName, { form: sourceForm.linkName, action: "new" }))}
      onEditRecord={(id) => router.push(getLiveAppUrl(app.linkName, { form: sourceForm.linkName, recordId: id }))}
    />
  );
};

export const LiveCustomPageWrapper: React.FC<{ pageLinkName: string }> = ({ pageLinkName }) => {
  const { app, permissions } = useLiveApp();
  if (!app) return null;
  const page = app.pages.find((p) => p.linkName === pageLinkName);
  if (!page) return <NotFoundCard title="Page not found" message={`No page matching "${pageLinkName}" exists.`} />;
  if (!permissions.page(page.id)) return <AccessDenied what={page.name} />;
  return <DynamicPage page={page} />;
};
