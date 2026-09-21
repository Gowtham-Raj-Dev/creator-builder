"use client";

import React, { useState } from "react";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { getMenuSections } from "@/lib/utils/menu";
import { generateId } from "@/lib/utils/idGenerator";
import { Select } from "@/components/ui/FormControls";
import { IconPicker } from "@/components/ui/IconPicker";
import { Plus } from "lucide-react";

/** "Menu section" select (with inline "+ new section") and icon picker, shared by form / report / page settings. */
export const MenuSectionPicker: React.FC<{
  sectionId?: string;
  icon?: string;
  defaultSectionId: string;
  onChange: (patch: { menuSectionId?: string; icon?: string }) => void;
  compact?: boolean;
}> = ({ sectionId, icon, defaultSectionId, onChange, compact }) => {
  const { currentApp, updateCurrentApp } = useAppBuilder();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (!currentApp) return null;
  const sections = getMenuSections(currentApp);
  const accent = currentApp.settings?.accentColor || "#2563eb";

  const addSection = () => {
    if (!name.trim()) return;
    const sec = { id: generateId("sec"), label: name.trim(), icon: "folder" };
    updateCurrentApp((prev) => ({ ...prev, settings: { ...(prev.settings || { theme: "light" }), menuSections: [...getMenuSections(prev), sec] } }));
    onChange({ menuSectionId: sec.id });
    setName("");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Select size={compact ? "sm" : "md"} label="Menu section (live app sidebar)" value={sectionId || ""} onChange={(e) => onChange({ menuSectionId: e.target.value || undefined })}>
          <option value="">Default ({sections.find((s) => s.id === defaultSectionId)?.label || defaultSectionId})</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        {adding ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSection(); if (e.key === "Escape") setAdding(false); }} placeholder="New section name" className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300" />
            <button type="button" onClick={addSection} className="text-xs font-semibold text-blue-600">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-[11px] font-semibold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> New section</button>
        )}
      </div>
      <IconPicker label="Menu icon" value={icon} onChange={(k) => onChange({ icon: k })} accent={accent} compact={compact} />
    </div>
  );
};
