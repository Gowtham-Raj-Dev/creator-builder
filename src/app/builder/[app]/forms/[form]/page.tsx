import React from "react";
import { FormBuilderWrapper } from "@/components/builder/FormBuilder/FormBuilderWrapper";
import { getStaticFormParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticFormParams();
}

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const resolved = await params;
  return <FormBuilderWrapper formLinkName={resolved.form} />;
}
