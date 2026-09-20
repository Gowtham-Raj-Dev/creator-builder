import React from "react";
import { AppSettingsView } from "@/components/builder/AppSettingsView";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function SettingsPage() {
  return <AppSettingsView />;
}
