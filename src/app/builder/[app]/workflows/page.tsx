import React from "react";
import { WorkflowBuilderView } from "@/components/builder/WorkflowBuilder/WorkflowBuilderView";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function WorkflowsBuilderPage() {
  return <WorkflowBuilderView />;
}
