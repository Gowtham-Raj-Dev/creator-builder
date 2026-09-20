"use client";

import React, { useState } from "react";
import { FieldType } from "@/types/schema";
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Link as LinkIcon,
  Hash,
  DollarSign,
  Percent,
  Calculator,
  ChevronDown,
  CircleDot,
  CheckSquare,
  ListFilter,
  Calendar,
  Clock,
  CalendarClock,
  Search,
  Table,
  UploadCloud,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

interface FieldTypeInfo {
  type: FieldType;
  label: string;
  icon: React.ReactNode;
  category: "Basic" | "Numeric" | "Choice" | "Date" | "Relationship" | "Other";
  description: string;
}

export const FIELD_TYPES: FieldTypeInfo[] = [
  // Basic
  { type: "text", label: "Single Line", icon: <Type className="w-4 h-4" />, category: "Basic", description: "Short text string" },
  { type: "textarea", label: "Multi Line", icon: <AlignLeft className="w-4 h-4" />, category: "Basic", description: "Long multi-line text paragraph" },
  { type: "email", label: "Email", icon: <Mail className="w-4 h-4" />, category: "Basic", description: "Validated email address" },
  { type: "phone", label: "Phone", icon: <Phone className="w-4 h-4" />, category: "Basic", description: "Telephone number with formatting" },
  { type: "url", label: "URL", icon: <LinkIcon className="w-4 h-4" />, category: "Basic", description: "Web link address" },

  // Numeric
  { type: "number", label: "Number", icon: <Hash className="w-4 h-4" />, category: "Numeric", description: "Whole or decimal numeric value" },
  { type: "currency", label: "Currency", icon: <DollarSign className="w-4 h-4" />, category: "Numeric", description: "Monetary amount with symbol (₹, $)" },
  { type: "percentage", label: "Percentage", icon: <Percent className="w-4 h-4" />, category: "Numeric", description: "Percent ratio (e.g. 15%)" },
  { type: "decimal", label: "Decimal", icon: <Calculator className="w-4 h-4" />, category: "Numeric", description: "Precise floating point number" },

  // Choice
  { type: "dropdown", label: "Dropdown", icon: <ChevronDown className="w-4 h-4" />, category: "Choice", description: "Single-choice selectable menu" },
  { type: "radio", label: "Radio", icon: <CircleDot className="w-4 h-4" />, category: "Choice", description: "Radio selection list" },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="w-4 h-4" />, category: "Choice", description: "Boolean Yes/No toggle" },
  { type: "multiselect", label: "Multi Select", icon: <ListFilter className="w-4 h-4" />, category: "Choice", description: "Multiple choices selection" },

  // Date
  { type: "date", label: "Date", icon: <Calendar className="w-4 h-4" />, category: "Date", description: "Calendar date picker" },
  { type: "datetime", label: "Date & Time", icon: <CalendarClock className="w-4 h-4" />, category: "Date", description: "Timestamp date and time" },
  { type: "time", label: "Time", icon: <Clock className="w-4 h-4" />, category: "Date", description: "Hour and minute picker" },

  // Relationship
  { type: "lookup", label: "Lookup", icon: <Search className="w-4 h-4 text-blue-600" />, category: "Relationship", description: "Link to records in another form" },
  { type: "subform", label: "Subform", icon: <Table className="w-4 h-4 text-purple-600" />, category: "Relationship", description: "Embedded line items grid" },

  // Other
  { type: "file", label: "File Upload", icon: <UploadCloud className="w-4 h-4" />, category: "Other", description: "Document or file attachment" },
  { type: "image", label: "Image", icon: <ImageIcon className="w-4 h-4" />, category: "Other", description: "Photo or image asset" },
  { type: "autonumber", label: "Auto Number", icon: <Sparkles className="w-4 h-4 text-amber-600" />, category: "Other", description: "Sequential ID (e.g. CUS-00001)" },
];

interface FieldPaletteProps {
  onAddField: (type: FieldType, label: string) => void;
}

export const FieldPalette: React.FC<FieldPaletteProps> = ({ onAddField }) => {
  const [search, setSearch] = useState("");

  const filtered = FIELD_TYPES.filter(
    (f) =>
      f.label.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories: Array<FieldTypeInfo["category"]> = [
    "Basic",
    "Numeric",
    "Choice",
    "Date",
    "Relationship",
    "Other",
  ];

  const handleDragStart = (e: React.DragEvent, type: FieldType, label: string) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ type, label }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="w-64 border-r border-slate-200 bg-white h-full flex flex-col shrink-0 select-none min-h-0">
      <div className="p-3 border-b border-slate-100 shrink-0">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Field Types
        </h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter fields..."
          className="w-full text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="p-3 overflow-y-auto flex-1 min-h-0 space-y-4">
        {categories.map((cat) => {
          const items = filtered.filter((f) => f.category === cat);
          if (items.length === 0) return null;

          return (
            <div key={cat} className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                {cat}
              </div>
              <div className="grid grid-cols-1 gap-1">
                {items.map((field) => (
                  <button
                    key={field.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, field.type, field.label)}
                    onClick={() => onAddField(field.type, field.label)}
                    className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-700 bg-slate-50/50 hover:bg-blue-50/70 hover:text-blue-700 border border-slate-200/80 hover:border-blue-300 rounded-md transition-all text-left group cursor-grab active:cursor-grabbing"
                    title={`${field.description} (Drag or Click to add)`}
                  >
                    <span className="text-slate-500 group-hover:text-blue-600 transition-colors">
                      {field.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{field.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
