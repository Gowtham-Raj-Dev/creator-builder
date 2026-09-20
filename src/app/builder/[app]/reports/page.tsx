import React from "react";
import { ReportBuilderView } from "@/components/builder/ReportBuilder/ReportBuilderView";

export function generateStaticParams() {
  return [{ app: "gowthamtest" }];
}

export default function ReportsBuilderPage() {
  return <ReportBuilderView />;
}
