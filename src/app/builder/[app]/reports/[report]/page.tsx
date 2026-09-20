"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ReportBuilderView } from "@/components/builder/ReportBuilder/ReportBuilderView";

export default function SingleReportBuilderPage() {
  const params = useParams();
  const reportLinkName = (params?.report as string) || "";

  return <ReportBuilderView reportLinkName={reportLinkName} />;
}
