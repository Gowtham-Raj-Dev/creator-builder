"use client";

import React from "react";
import { useLiveApp } from "@/context/LiveAppContext";
import { DynamicPage } from "@/components/runtime/DynamicPage";

export const LiveCustomPageWrapper: React.FC<{ pageLinkName: string }> = ({ pageLinkName }) => {
  const { app } = useLiveApp();

  if (!app) return null;

  const targetPage = app.pages.find((p) => p.linkName === pageLinkName);

  if (!targetPage) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-md mx-auto">
        <h2 className="text-base font-bold text-slate-800">Page Not Found</h2>
        <p className="text-xs text-slate-400 mt-1">
          No page matching &quot;{pageLinkName}&quot; exists in this application schema.
        </p>
      </div>
    );
  }

  return <DynamicPage page={targetPage} />;
};
