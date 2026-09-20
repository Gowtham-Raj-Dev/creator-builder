import React from "react";
import { PageBuilderView } from "@/components/builder/PageBuilder/PageBuilderView";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function PagesBuilderPage() {
  return <PageBuilderView />;
}
