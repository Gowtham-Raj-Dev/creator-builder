"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import {
  FileText,
  TableProperties,
  LayoutTemplate,
  Zap,
  Network,
  Settings,
  Plus,
  ChevronRight,
} from "lucide-react";

interface BuilderSidebarProps {
  onNewFormClick?: () => void;
}

export const BuilderSidebar: React.FC<BuilderSidebarProps> = ({ onNewFormClick }) => {
  const pathname = usePathname();
  const { currentApp } = useAppBuilder();

  if (!currentApp) return null;

  const appBase = `/builder/${currentApp.linkName}`;

  const isActive = (path: string) => {
    if (path === appBase) {
      return pathname === appBase || pathname.startsWith(`${appBase}/forms`);
    }
    return pathname.startsWith(path);
  };

  const navItems = [
    {
      label: "Forms",
      href: `${appBase}`,
      activeMatch: (p: string) => p === appBase || p.includes("/forms"),
      icon: <FileText className="w-4 h-4" />,
      count: currentApp.forms.length,
      action: onNewFormClick ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNewFormClick();
          }}
          className="p-1 rounded-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="Create New Form"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      ) : null,
    },
    {
      label: "Reports",
      href: `${appBase}/reports`,
      activeMatch: (p: string) => p.includes("/reports"),
      icon: <TableProperties className="w-4 h-4" />,
      count: currentApp.reports.length,
    },
    {
      label: "Pages",
      href: `${appBase}/pages`,
      activeMatch: (p: string) => p.includes("/pages"),
      icon: <LayoutTemplate className="w-4 h-4" />,
      count: currentApp.pages.length,
    },
    {
      label: "Workflows",
      href: `${appBase}/workflows`,
      activeMatch: (p: string) => p.includes("/workflows"),
      icon: <Zap className="w-4 h-4" />,
      count: currentApp.workflows.length,
    },
  ];

  const settingsItems = [
    {
      label: "Data Relationships",
      href: `${appBase}/relationships`,
      activeMatch: (p: string) => p.includes("/relationships"),
      icon: <Network className="w-4 h-4" />,
      count: currentApp.relationships.length,
    },
    {
      label: "Application Settings",
      href: `${appBase}/settings`,
      activeMatch: (p: string) => p.includes("/settings"),
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200/90 bg-white h-full flex flex-col justify-between shrink-0 select-none min-h-0">
      <div className="p-3 space-y-6 overflow-y-auto flex-1 min-h-0">
        {/* Build Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Build
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.activeMatch(pathname);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`group flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    active
                      ? "bg-blue-50 text-blue-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.action}
                    {item.count !== undefined && (
                      <span
                        className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-medium ${
                          active ? "bg-blue-100 text-blue-700" : "bg-slate-200/70 text-slate-500"
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Settings Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Settings & Schema
          </div>
          <nav className="space-y-1">
            {settingsItems.map((item) => {
              const active = item.activeMatch(pathname);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`group flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    active
                      ? "bg-blue-50 text-blue-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-medium ${
                        active ? "bg-blue-100 text-blue-700" : "bg-slate-200/70 text-slate-500"
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Zoho Creator Architecture</span>
          <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
            v1.0
          </span>
        </div>
      </div>
    </aside>
  );
};
