import React from "react";
import { NewRecordView } from "@/components/runtime/NewRecordView";
import { getStaticFormParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticFormParams();
}

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const resolved = await params;
  return <NewRecordView formLinkName={resolved.form} />;
}
