import React from "react";
import { LiveCustomPageWrapper } from "@/components/runtime/LiveCustomPageWrapper";
import { getStaticPageParams } from "@/lib/storage/staticParams";

export function generateStaticParams() {
  return getStaticPageParams();
}

export default async function LiveCustomPageView({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const resolved = await params;
  return <LiveCustomPageWrapper pageLinkName={resolved.page} />;
}
