"use client";

import React from "react";
import { useParams } from "next/navigation";
import { LiveAppProvider } from "@/context/LiveAppContext";
import { LiveAppLayout } from "@/components/runtime/LiveAppLayout";

export default function AppRuntimeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const appLinkName = (params?.app as string) || "";

  return (
    <LiveAppProvider appLinkName={appLinkName}>
      <LiveAppLayout>{children}</LiveAppLayout>
    </LiveAppProvider>
  );
}
