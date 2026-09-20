import React from "react";
import { FormList } from "@/components/builder/FormList";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function BuilderAppHomePage() {
  return <FormList />;
}
