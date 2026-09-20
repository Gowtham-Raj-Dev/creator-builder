import React from "react";
import { FormModuleView } from "@/components/runtime/FormModuleView";
import { getStaticFormParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticFormParams();
}

export default async function FormModulePage({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const resolved = await params;
  return <FormModuleView formLinkName={resolved.form} />;
}
