import React from "react";
import { LiveAppRootView } from "@/components/runtime/LiveAppRootView";
import { getStaticAppParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticAppParams();
}

export default function LiveAppRootPage() {
  return <LiveAppRootView />;
}
