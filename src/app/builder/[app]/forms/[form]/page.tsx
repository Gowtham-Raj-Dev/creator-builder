"use client";

import React from "react";
import { useParams } from "next/navigation";
import { FormBuilderWrapper } from "@/components/builder/FormBuilder/FormBuilderWrapper";

export default function FormBuilderPage() {
  const params = useParams();
  const formLinkName = (params?.form as string) || "";

  return <FormBuilderWrapper formLinkName={formLinkName} />;
}
