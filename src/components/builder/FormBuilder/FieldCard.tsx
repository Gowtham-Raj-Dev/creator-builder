"use client";

import React from "react";
import { FieldDefinition } from "@/types/schema";
import {
  GripVertical,
  Copy,
  Trash2,
  Sliders,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Search,
  Table,
  Lock,
} from "lucide-react";

interface FieldCardProps {
  field: FieldDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  dragIndex: number;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

export const FieldCard: React.FC<FieldCardProps> = ({
  field,
  isSelected,
  onSelect,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  dragIndex,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, dragIndex)}
      onDragOver={(e) => onDragOver(e, dragIndex)}
      onDrop={(e) => onDrop(e, dragIndex)}
      onClick={onSelect}
      className={`group relative p-3.5 bg-white rounded-xl border transition-all duration-150 cursor-pointer shadow-3xs ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
          : "border-slate-200 hover:border-slate-300 hover:shadow-2xs"
      }`}
    >
      {/* Top row: Drag handle, label, linkName, type pill, action buttons */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="cursor-grab active:cursor-grabbing text-slate-300 group-hover:text-slate-500 p-0.5 -ml-1">
            <GripVertical className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-900 truncate">
                {field.label}
              </span>
              {field.required && <span className="text-rose-500 font-bold text-xs">*</span>}
              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {field.linkName}
              </span>
            </div>

            {field.description && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{field.description}</p>
            )}
          </div>
        </div>

        {/* Quick action buttons on hover / focus */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {onMoveUp && !isFirst && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
              title="Move Up"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}

          {onMoveDown && !isLast && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
              title="Move Down"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Duplicate Field"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
            title="Delete Field"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Visual representation of field control */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          {field.type === "lookup" && (
            <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
              <Search className="w-3 h-3" /> Lookup Field
            </span>
          )}
          {field.type === "subform" && (
            <span className="flex items-center gap-1 text-[11px] text-purple-600 font-medium">
              <Table className="w-3 h-3" /> Subform ({field.subform?.columns.length || 0} cols)
            </span>
          )}
          {field.type === "autonumber" && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
              <Sparkles className="w-3 h-3" /> Auto Number ({field.autonumber?.prefix || ""})
            </span>
          )}
          {field.readonly && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <Lock className="w-3 h-3" /> Read Only
            </span>
          )}
          {field.unique && (
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">Unique</span>
          )}
        </div>

        <span className="text-[11px] font-mono text-slate-400 capitalize">{field.type}</span>
      </div>
    </div>
  );
};
