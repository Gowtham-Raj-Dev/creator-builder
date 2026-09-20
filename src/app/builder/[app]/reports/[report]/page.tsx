import React from "react";
import { ReportBuilderView } from "@/components/builder/ReportBuilder/ReportBuilderView";
import { getStaticReportParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticReportParams();
}

export default async function SingleReportBuilderPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const resolved = await params;
  return <ReportBuilderView reportLinkName={resolved.report} />;
}
