"use client";

import React, { useState } from "react";
import { FormDefinition, FieldDefinition, FieldType } from "@/types/schema";
import { FieldCard } from "./FieldCard";
import { Button } from "@/components/ui/Button";
import {
  Columns2,
  Columns,
  Sparkles,
  Plus,
  Zap,
  Info,
} from "lucide-react";

interface FormBuilderCanvasProps {
  form: FormDefinition;
  selectedFieldId: string | null;
  onSelectField: (field: FieldDefinition | null) => void;
  onAddField: (type: FieldType, label: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
  onUpdateFormColumns: (columns: 1 | 2) => void;
  onNavigateToWorkflows?: () => void;
}

export const FormBuilderCanvas: React.FC<FormBuilderCanvasProps> = ({
  form,
  selectedFieldId,
  onSelectField,
  onAddField,
  onDuplicateField,
  onDeleteField,
  onReorderFields,
  onUpdateFormColumns,
  onNavigateToWorkflows,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isPaletteDraggingOver, setIsPaletteDraggingOver] = useState(false);

  // Drag and drop from field cards within canvas
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTargetIndex !== index) {
      setDropTargetIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPaletteDraggingOver(false);

    // Check if drop is from palette
    const paletteData = e.dataTransfer.getData("application/json");
    if (paletteData) {
      try {
        const parsed = JSON.parse(paletteData);
        if (parsed.type) {
          onAddField(parsed.type, parsed.label);
          setDraggedIndex(null);
          setDropTargetIndex(null);
          return;
        }
      } catch (err) {
        console.error("Drop parse error:", err);
      }
    }

    // Reorder inside canvas
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderFields(draggedIndex, index);
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPaletteDraggingOver(true);
  };

  const handleCanvasDragLeave = () => {
    setIsPaletteDraggingOver(false);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPaletteDraggingOver(false);
    const paletteData = e.dataTransfer.getData("application/json");
    if (paletteData) {
      try {
        const parsed = JSON.parse(paletteData);
        if (parsed.type) {
          onAddField(parsed.type, parsed.label);
        }
      } catch (err) {
        console.error("Drop parse error:", err);
      }
    }
  };

  return (
    <div
      className="flex-1 bg-[#f8fafc] h-full flex flex-col overflow-hidden select-none min-h-0 min-w-0"
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      {/* Canvas Top Toolbar (Requirement 61) */}
      <div className="h-12 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-slate-800">{form.name}</h2>
            <span className="text-[11px] font-mono text-slate-400">({form.fields.length} fields)</span>
          </div>

          <div className="h-3.5 w-[1px] bg-slate-200" />

          {/* Layout Columns Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => onUpdateFormColumns(1)}
              className={`p-1 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                form.columns === 1
                  ? "bg-white text-blue-600 shadow-3xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="1 Column Layout"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="text-[11px]">1 Col</span>
            </button>
            <button
              onClick={() => onUpdateFormColumns(2)}
              className={`p-1 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                form.columns === 2
                  ? "bg-white text-blue-600 shadow-3xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="2 Column Layout"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="text-[11px]">2 Cols</span>
            </button>
          </div>
        </div>

        {onNavigateToWorkflows && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateToWorkflows}
            icon={<Zap className="w-3.5 h-3.5 text-amber-500" />}
          >
            Form Workflows
          </Button>
        )}
      </div>

      {/* Canvas Drop Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Header Card */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-3xs">
            <h1 className="text-lg font-bold text-slate-900">{form.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {form.description || "Fill out the fields below and submit your entry."}
            </p>
          </div>

          {/* Drag Overlay Notice if hovering from palette */}
          {isPaletteDraggingOver && (
            <div className="p-4 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/70 text-center text-blue-700 font-medium text-xs animate-pulse">
              Drop field here to add to form
            </div>
          )}

          {/* Fields List / Empty State */}
          {form.fields.length === 0 ? (
            <div className="py-16 px-6 bg-white rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">No fields in this form yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Drag fields from the left palette or click any field type to start building your form.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddField("text", "Single Line Text")}
              >
                + Add Single Line Text
              </Button>
            </div>
          ) : (
            <div
              className={`grid gap-3 ${
                form.columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
              }`}
            >
              {form.fields.map((field, index) => {
                // If field is subform, make it full-width across columns
                const isFullWidth = field.type === "subform" || form.columns === 1;

                return (
                  <div
                    key={field.id}
                    className={isFullWidth && form.columns === 2 ? "md:col-span-2" : ""}
                  >
                    <FieldCard
                      field={field}
                      isSelected={selectedFieldId === field.id}
                      onSelect={() => onSelectField(field)}
                      onDuplicate={() => onDuplicateField(field.id)}
                      onDelete={() => onDeleteField(field.id)}
                      onMoveUp={
                        index > 0 ? () => onReorderFields(index, index - 1) : undefined
                      }
                      onMoveDown={
                        index < form.fields.length - 1
                          ? () => onReorderFields(index, index + 1)
                          : undefined
                      }
                      isFirst={index === 0}
                      isLast={index === form.fields.length - 1}
                      dragIndex={index}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Submit Button Preview */}
          {form.fields.length > 0 && (
            <div className="p-4 bg-white/70 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  disabled
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg text-xs opacity-80 cursor-not-allowed shadow-3xs"
                >
                  Save Record
                </button>
                <button
                  disabled
                  className="px-3 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs opacity-80 cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Preview of form submission buttons
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
