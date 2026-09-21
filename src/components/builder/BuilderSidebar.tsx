"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { FileText, TableProperties, LayoutTemplate, Zap, Network, Settings, Users, Menu as MenuIcon, History, ScrollText, HeartPulse, Sparkles, Printer } from "lucide-react";
import { getBuilderUrl, BuilderTab } from "@/lib/utils/routes";

export const BuilderSidebar: React.FC = () => {
  const searchParams = useSearchParams();
  const { currentApp, healthIssues } = useAppBuilder();
  if (!currentApp) return null;
  const currentTab = (searchParams.get("tab") || "forms") as BuilderTab;
  const errors = healthIssues.filter((i) => i.severity === "error").length;

  const groups: Array<{ title: string; items: Array<{ tab: BuilderTab; label: string; icon: React.ReactNode; count?: number; badge?: "error" }> }> = [
    { title: "Build", items: [
      { tab: "forms", label: "Forms", icon: <FileText className="w-4 h-4" />, count: currentApp.forms.length },
      { tab: "reports", label: "Reports", icon: <TableProperties className="w-4 h-4" />, count: currentApp.reports.length },
      { tab: "pages", label: "Pages & Dashboards", icon: <LayoutTemplate className="w-4 h-4" />, count: currentApp.pages.length },
      { tab: "workflows", label: "Workflows", icon: <Zap className="w-4 h-4" />, count: currentApp.workflows.length },
      { tab: "print", label: "Print designs", icon: <Printer className="w-4 h-4" />, count: (currentApp.printTemplates || []).length },
    ] },
    { title: "Access", items: [
      { tab: "users", label: "Users & Roles", icon: <Users className="w-4 h-4" />, count: currentApp.members.length },
      { tab: "navigation", label: "Menu & Navigation", icon: <MenuIcon className="w-4 h-4" /> },
    ] },
    { title: "Govern", items: [
      { tab: "relationships", label: "Relationships", icon: <Network className="w-4 h-4" />, count: currentApp.relationships.length },
      { tab: "versions", label: "Versions & Publish", icon: <History className="w-4 h-4" />, count: currentApp.publishedVersion },
      { tab: "audit", label: "Audit Log", icon: <ScrollText className="w-4 h-4" /> },
      { tab: "health", label: "Health Check", icon: <HeartPulse className="w-4 h-4" />, count: healthIssues.length, badge: errors ? "error" : undefined },
      { tab: "ai", label: "AI Assistant", icon: <Sparkles className="w-4 h-4" /> },
      { tab: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    ] },
  ];

  return (
    <aside className="w-60 border-r border-slate-200/90 bg-white h-full flex flex-col justify-between shrink-0 select-none min-h-0">
      <div className="p-3 space-y-5 overflow-y-auto flex-1 min-h-0">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.title}</div>
            <nav className="space-y-0.5">
              {g.items.map((item) => {
                const active = currentTab === item.tab;
                return (
                  <Link key={item.tab} href={getBuilderUrl(currentApp.linkName, { tab: item.tab })} className={`group flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${active ? "bg-blue-50 text-blue-700 font-semibold shadow-3xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
                    <div className="flex items-center gap-2.5"><span className={active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}>{item.icon}</span><span>{item.label}</span></div>
                    {item.count !== undefined && item.count !== null && (
                      <span className={`px-1.5 py-px text-[10px] rounded-full font-mono font-medium ${item.badge === "error" ? "bg-rose-100 text-rose-700" : active ? "bg-blue-100 text-blue-700" : "bg-slate-200/70 text-slate-500"}`}>{item.tab === "versions" ? `v${item.count}` : item.count}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-200 bg-white text-[10px] text-slate-400 flex items-center justify-between">
        <span>Schema v{currentApp.schemaVersion}</span>
        <span className="font-mono">{currentApp.publishedVersion ? `published v${currentApp.publishedVersion}` : "unpublished"}</span>
      </div>
    </aside>
  );
};
