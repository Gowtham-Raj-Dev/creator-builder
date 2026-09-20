import React from "react";
import { EditRecordView } from "@/components/runtime/EditRecordView";
import { getStaticRecordParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticRecordParams();
}

export default async function EditRecordPage({
  params,
}: {
  params: Promise<{ form: string; recordId: string }>;
}) {
  const resolved = await params;
  return <EditRecordView formLinkName={resolved.form} recordId={resolved.recordId} />;
}
