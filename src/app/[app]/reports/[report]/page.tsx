import React from "react";
import { LiveReportView } from "@/components/runtime/LiveReportView";
import { getStaticReportParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticReportParams();
}

export default async function LiveReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const resolved = await params;
  return <LiveReportView reportLinkName={resolved.report} />;
}
