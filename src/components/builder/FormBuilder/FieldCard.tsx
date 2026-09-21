"use client";

import React from "react";
import { FieldDefinition } from "@/types/schema";
import { FIELD_TYPES } from "./FieldPalette";
import { GripVertical, Copy, Trash2, ChevronUp, ChevronDown, Lock, EyeOff, Sigma, Database, Search, Sparkles, Heading, AlertCircle } from "lucide-react";

interface FieldCardProps {
  field: FieldDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  dragIndex: number;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  issue?: string;
}

export const FieldCard: React.FC<FieldCardProps> = ({ field, isSelected, onSelect, onDuplicate, onDelete, onMoveUp, onMoveDown, dragIndex, onDragStart, onDragOver, onDrop, issue }) => {
  const typeInfo = FIELD_TYPES.find((t) => t.type === field.type);
  const isSection = field.type === "section";

  const preview = () => {
    const box = "h-8 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 flex items-center text-[11px] text-slate-400";
    switch (field.type) {
      case "section": return null;
      case "textarea": case "richtext": return <div className={`${box} h-14 items-start pt-1.5`}>{field.placeholder || "Long text…"}</div>;
      case "checkbox": return <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="w-4 h-4 rounded border border-slate-300 bg-white" />{field.label}</div>;
      case "radio": return <div className="flex gap-1.5 flex-wrap">{(field.options || []).slice(0, 4).map((o) => <span key={o} className="px-2 py-0.5 rounded-full border border-slate-300 text-[11px] text-slate-500 bg-white">{o}</span>)}</div>;
      case "multiselect": return <div className="flex gap-1.5 flex-wrap">{(field.options || []).slice(0, 4).map((o) => <span key={o} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-500">{o}</span>)}</div>;
      case "subform": return <div className="rounded-md border border-slate-200 overflow-hidden"><div className="grid text-[10px] font-semibold text-slate-500 bg-slate-100 divide-x divide-slate-200" style={{ gridTemplateColumns: `repeat(${Math.max(1, (field.subform?.columns || []).length)}, minmax(0,1fr))` }}>{(field.subform?.columns || []).map((c) => <div key={c.id} className="px-2 py-1 truncate">{c.label}{c.formula?.expression && " ƒ"}</div>)}</div><div className="h-6 bg-white" /></div>;
      case "formula": return <div className={`${box} bg-indigo-50/60 border-indigo-200 text-indigo-700 font-mono`}><Sigma className="w-3 h-3 mr-1.5" />{field.formula?.expression || "expression"}</div>;
      case "rollup": return <div className={`${box} bg-emerald-50/60 border-emerald-200 text-emerald-700`}><Database className="w-3 h-3 mr-1.5" />{field.rollup?.aggregate?.toUpperCase() || "SUM"} · {field.rollup?.sourceFormId ? "configured" : "not configured"}</div>;
      case "autonumber": return <div className={`${box} bg-amber-50/60 border-amber-200 text-amber-800 font-mono`}><Sparkles className="w-3 h-3 mr-1.5" />{field.autonumber?.pattern || `${field.autonumber?.prefix || ""}00001`}</div>;
      case "lookup": return <div className={`${box} justify-between`}><span className="flex items-center gap-1.5"><Search className="w-3 h-3" />{field.lookup?.multiple ? "Select records…" : "Select record…"}</span><ChevronDown className="w-3 h-3" /></div>;
      case "rating": return <div className="flex gap-0.5 text-amber-400 text-sm">★★★★<span className="text-slate-300">★</span></div>;
      case "signature": return <div className="h-12 rounded-md border-2 border-dashed border-slate-300 bg-white" />;
      case "file": case "image": return <div className="h-12 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] text-slate-400">Drop {field.type} here</div>;
      case "address": return <div className="grid grid-cols-2 gap-1"><div className={`${box} col-span-2`}>Address line 1</div><div className={box}>City</div><div className={box}>PIN</div></div>;
      case "currency": return <div className={box}><span className="font-bold mr-1.5 text-slate-500">{field.currencySymbol || "₹"}</span>0.00</div>;
      case "percentage": return <div className={`${box} justify-between`}>0<span>%</span></div>;
      case "dropdown": return <div className={`${box} justify-between`}>{field.placeholder || `Select ${field.label}…`}<ChevronDown className="w-3 h-3" /></div>;
      case "date": return <div className={`${box} justify-between`}>dd-mm-yyyy<span>📅</span></div>;
      default: return <div className={box}>{field.placeholder || `Enter ${field.label.toLowerCase()}…`}</div>;
    }
  };

  if (isSection) {
    return (
      <div draggable onDragStart={(e) => onDragStart(e, dragIndex)} onDragOver={(e) => onDragOver(e, dragIndex)} onDrop={(e) => onDrop(e, dragIndex)} onClick={onSelect} className={`group relative rounded-xl border-2 transition-all cursor-pointer ${isSelected ? "border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20" : "border-dashed border-slate-300 bg-slate-50/60 hover:border-slate-400"}`}>
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />
            <Heading className="w-4 h-4 text-slate-500" />
            <div className="min-w-0"><div className="text-sm font-bold text-slate-900 truncate">{field.label}</div><div className="text-[10px] text-slate-400">Section · {field.section?.columns || 2} columns{field.section?.collapsible ? " · collapsible" : ""}</div></div>
          </div>
          <Actions onDuplicate={onDuplicate} onDelete={onDelete} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
        </div>
      </div>
    );
  }

  return (
    <div draggable onDragStart={(e) => onDragStart(e, dragIndex)} onDragOver={(e) => onDragOver(e, dragIndex)} onDrop={(e) => onDrop(e, dragIndex)} onClick={onSelect} className={`group relative p-3 bg-white rounded-xl border transition-all cursor-pointer shadow-3xs h-full ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20 shadow-xs" : issue ? "border-rose-300" : "border-slate-200 hover:border-slate-300 hover:shadow-2xs"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="w-4 h-4 text-slate-300 group-hover:text-slate-500 cursor-grab shrink-0 -ml-1" />
          <span className="text-slate-400 shrink-0">{typeInfo?.icon}</span>
          <span className="text-xs font-semibold text-slate-900 truncate">{field.label}</span>
          {field.required && <span className="text-rose-500 font-bold text-xs">*</span>}
          {field.hidden && <EyeOff className="w-3 h-3 text-slate-400" />}
          {field.readonly && field.type !== "formula" && field.type !== "rollup" && field.type !== "autonumber" && <Lock className="w-3 h-3 text-slate-400" />}
          {issue && <span title={issue}><AlertCircle className="w-3.5 h-3.5 text-rose-500" /></span>}
        </div>
        <Actions onDuplicate={onDuplicate} onDelete={onDelete} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
      </div>
      {preview()}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span className="font-mono truncate">{field.linkName}</span>
        <span className="flex items-center gap-1.5">
          {field.unique && <span className="bg-slate-100 px-1 rounded">unique</span>}
          {field.visibilityRule && <span className="bg-amber-50 text-amber-700 px-1 rounded">rule</span>}
          {field.width && field.width !== "full" && <span className="bg-slate-100 px-1 rounded">{field.width.replace("_", " ")}</span>}
          <span className="capitalize">{field.type}</span>
        </span>
      </div>
    </div>
  );
};

const Actions: React.FC<{ onDuplicate: () => void; onDelete: () => void; onMoveUp?: () => void; onMoveDown?: () => void }> = ({ onDuplicate, onDelete, onMoveUp, onMoveDown }) => (
  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
    {onMoveUp && <button onClick={onMoveUp} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>}
    {onMoveDown && <button onClick={onMoveDown} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>}
    <button onClick={onDuplicate} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
    <button onClick={onDelete} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
  </div>
);
