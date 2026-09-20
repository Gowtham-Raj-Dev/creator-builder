"use client";

import React from "react";
import Link from "next/link";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { ExternalLink, Save, ArrowLeft, Check, AlertCircle, Layers } from "lucide-react";
import { getLiveAppUrl } from "@/lib/utils/routes";

export const BuilderHeader: React.FC<{ activeTab?: string }> = () => {
  const { currentApp, isDirty, lastSavedText, saveCurrentApp } = useAppBuilder();

  if (!currentApp) return null;

  return (
    <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-3">
        <Link
          href="/builder"
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Back to Applications"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="h-4 w-[1px] bg-slate-200" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-2xs">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              YourBuilder
            </span>
            <span className="text-slate-300">/</span>
            <h1 className="text-sm font-semibold text-slate-900">{currentApp.name}</h1>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 border border-slate-200">
              /{currentApp.linkName}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Save status badge */}
        <div className="flex items-center gap-2 text-xs">
          {isDirty ? (
            <div className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Unsaved changes</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <Check className="w-3.5 h-3.5" />
              <span>{lastSavedText}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={getLiveAppUrl(currentApp.linkName)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5 text-slate-500" />}
            >
              Preview Live App
            </Button>
          </Link>

          <Button
            variant={isDirty ? "primary" : "secondary"}
            size="sm"
            onClick={saveCurrentApp}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save
          </Button>
        </div>
      </div>
    </header>
  );
};
