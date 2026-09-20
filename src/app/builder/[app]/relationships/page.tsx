import React from "react";
import { RelationshipsView } from "@/components/builder/RelationshipsView/RelationshipsView";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function RelationshipsPage() {
  return <RelationshipsView />;
}
