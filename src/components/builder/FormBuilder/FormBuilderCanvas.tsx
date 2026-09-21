"use client";

import React, { useState } from "react";
import { FormDefinition, FieldDefinition, FieldType } from "@/types/schema";
import { FieldCard } from "./FieldCard";
import { Button } from "@/components/ui/Button";
import { Columns2, Columns, Columns3, Plus, Zap, Info, Settings2, Eye, Sparkles } from "lucide-react";

interface FormBuilderCanvasProps {
  form: FormDefinition;
  selectedFieldId: string | null;
  onSelectField: (field: FieldDefinition | null) => void;
  onAddField: (type: FieldType, label: string, atIndex?: number) => void;
  onDuplicateField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onUpdateFormColumns: (columns: 1 | 2 | 3) => void;
  onOpenFormSettings: () => void;
  onPreview: () => void;
  onNavigateToWorkflows?: () => void;
  onEditWithAi?: () => void;
  issues: Record<string, string>;
}

const SPAN: Record<string, string> = { full: "md:col-span-6", half: "md:col-span-3", third: "md:col-span-2", two_thirds: "md:col-span-4" };
const ALWAYS_FULL = new Set(["subform", "section", "richtext", "file", "image", "address", "signature"]);

export const FormBuilderCanvas: React.FC<FormBuilderCanvasProps> = ({ form, selectedFieldId, onSelectField, onAddField, onDuplicateField, onDeleteField, onReorderFields, onUpdateFormColumns, onOpenFormSettings, onPreview, onNavigateToWorkflows, onEditWithAi, issues }) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [paletteOver, setPaletteOver] = useState(false);

  const handleDragStart = (e: React.DragEvent, index: number) => { e.dataTransfer.setData("text/plain", String(index)); e.dataTransfer.effectAllowed = "move"; setDraggedIndex(index); };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); e.stopPropagation(); setOverIndex(index); };
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault(); e.stopPropagation();
    setPaletteOver(false);
    const paletteData = e.dataTransfer.getData("application/json");
    if (paletteData) {
      try { const parsed = JSON.parse(paletteData); if (parsed.type) onAddField(parsed.type, parsed.label, index); } catch { /* ignore */ }
    } else if (draggedIndex !== null && draggedIndex !== index) onReorderFields(draggedIndex, index);
    setDraggedIndex(null); setOverIndex(null);
  };
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault(); setPaletteOver(false);
    const paletteData = e.dataTransfer.getData("application/json");
    if (paletteData) { try { const parsed = JSON.parse(paletteData); if (parsed.type) onAddField(parsed.type, parsed.label); } catch { /* ignore */ } }
    setDraggedIndex(null); setOverIndex(null);
  };

  // group into sections for a faithful preview of the runtime layout
  const groups: Array<{ section?: FieldDefinition; sectionIndex?: number; fields: Array<{ f: FieldDefinition; i: number }> }> = [];
  let cur: (typeof groups)[number] = { fields: [] };
  form.fields.forEach((f, i) => { if (f.type === "section") { if (cur.fields.length || cur.section) groups.push(cur); cur = { section: f, sectionIndex: i, fields: [] }; } else cur.fields.push({ f, i }); });
  groups.push(cur);

  const spanFor = (f: FieldDefinition, cols: number) => (ALWAYS_FULL.has(f.type) ? "md:col-span-6" : f.width ? SPAN[f.width] : cols === 1 ? "md:col-span-6" : cols === 3 ? "md:col-span-2" : "md:col-span-3");

  const renderCard = (field: FieldDefinition, index: number) => (
    <FieldCard field={field} isSelected={selectedFieldId === field.id} onSelect={() => onSelectField(field)} onDuplicate={() => onDuplicateField(field.id)} onDelete={() => onDeleteField(field.id)} onMoveUp={index > 0 ? () => onReorderFields(index, index - 1) : undefined} onMoveDown={index < form.fields.length - 1 ? () => onReorderFields(index, index + 1) : undefined} dragIndex={index} onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop} issue={issues[field.id]} />
  );

  return (
    <div className="flex-1 bg-[#f8fafc] h-full flex flex-col overflow-hidden select-none min-h-0 min-w-0" onDragOver={(e) => { e.preventDefault(); setPaletteOver(true); }} onDragLeave={() => setPaletteOver(false)} onDrop={handleCanvasDrop}>
      <div className="h-12 border-b border-slate-200 bg-white px-5 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-bold text-slate-800 truncate">{form.name}</h2>
          <span className="text-[11px] font-mono text-slate-400">{form.fields.filter((f) => f.type !== "section").length} fields</span>
          <div className="h-3.5 w-px bg-slate-200" />
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {([1, 2, 3] as const).map((c) => (
              <button key={c} onClick={() => onUpdateFormColumns(c)} className={`p-1 rounded-md text-[11px] font-medium flex items-center gap-1 ${form.columns === c ? "bg-white text-blue-600 shadow-3xs" : "text-slate-500 hover:text-slate-800"}`} title={`${c} column layout`}>
                {c === 1 ? <Columns className="w-3.5 h-3.5" /> : c === 2 ? <Columns2 className="w-3.5 h-3.5" /> : <Columns3 className="w-3.5 h-3.5" />}{c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onEditWithAi && <Button variant="subtle" size="sm" onClick={onEditWithAi} icon={<Sparkles className="w-3.5 h-3.5 text-indigo-600" />}>Edit with AI</Button>}
          <Button variant="ghost" size="sm" onClick={onOpenFormSettings} icon={<Settings2 className="w-3.5 h-3.5" />}>Form settings</Button>
          <Button variant="ghost" size="sm" onClick={onPreview} icon={<Eye className="w-3.5 h-3.5" />}>Preview</Button>
          {onNavigateToWorkflows && <Button variant="ghost" size="sm" onClick={onNavigateToWorkflows} icon={<Zap className="w-3.5 h-3.5 text-amber-500" />}>Workflows</Button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-6" onClick={() => onSelectField(null)}>
        <div className="max-w-4xl mx-auto space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-3xs">
            <h1 className="text-lg font-bold text-slate-900">{form.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{form.description || "Fill out the fields below and submit your entry."}</p>
          </div>

          {paletteOver && <div className="p-3 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/70 text-center text-blue-700 font-medium text-xs animate-pulse">Drop to add field at the end (or drop on a card to insert before it)</div>}

          {form.fields.length === 0 ? (
            <div className="py-16 px-6 bg-white rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600"><Plus className="w-6 h-6" /></div>
              <div><h3 className="text-sm font-semibold text-slate-800">No fields yet</h3><p className="text-xs text-slate-400 max-w-sm mt-1">Drag field types from the left palette, or click one to append it. Start with a Section to group fields.</p></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onAddField("text", "Name")}>+ Text field</Button><Button variant="outline" size="sm" onClick={() => onAddField("section", "Basic Details")}>+ Section</Button></div>
            </div>
          ) : (
            groups.map((g, gi) => {
              const cols = (g.section?.section?.columns || form.columns || 2) as 1 | 2 | 3;
              return (
                <div key={g.section?.id || `g${gi}`} className={`rounded-xl ${g.section ? "border border-slate-200 bg-white/60 p-3 space-y-3" : ""}`}>
                  {g.section && g.sectionIndex !== undefined && renderCard(g.section, g.sectionIndex)}
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    {g.fields.map(({ f, i }) => <div key={f.id} className={`${spanFor(f, cols)} ${overIndex === i && draggedIndex !== null && draggedIndex !== i ? "ring-2 ring-blue-400 rounded-xl" : ""}`}>{renderCard(f, i)}</div>)}
                    {g.fields.length === 0 && g.section && <div className="md:col-span-6 text-[11px] text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">Empty section — drag fields here</div>}
                  </div>
                </div>
              );
            })
          )}

          {form.fields.length > 0 && (
            <div className="p-3.5 bg-white/70 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2"><span className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg text-xs opacity-80">Save Record</span><span className="px-3 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs opacity-80">Cancel</span></div>
              <span className="text-[11px] flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Runtime layout preview · click a field to edit its properties</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
