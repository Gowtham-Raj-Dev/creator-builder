"use client";

import React, { useState } from "react";
import { FieldType } from "@/types/schema";
import {
  Type, AlignLeft, Mail, Phone, Link as LinkIcon, Hash, DollarSign, Percent, Calculator, ChevronDown, CircleDot, CheckSquare, ListFilter, Calendar, Clock, CalendarClock,
  Search, Table, UploadCloud, Image as ImageIcon, Sparkles, Sigma, Database, Star, Palette, PenTool, MapPin, ScanLine, Users, Home, Heading, FileText,
} from "lucide-react";

export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  icon: React.ReactNode;
  category: "Layout" | "Basic" | "Numeric" | "Choice" | "Date" | "Relationship" | "Computed" | "Media" | "Advanced";
  description: string;
}

export const FIELD_TYPES: FieldTypeInfo[] = [
  { type: "section", label: "Section", icon: <Heading className="w-4 h-4" />, category: "Layout", description: "Collapsible group with its own column layout" },
  { type: "text", label: "Single Line", icon: <Type className="w-4 h-4" />, category: "Basic", description: "Short text" },
  { type: "textarea", label: "Multi Line", icon: <AlignLeft className="w-4 h-4" />, category: "Basic", description: "Paragraph text" },
  { type: "richtext", label: "Rich Text", icon: <FileText className="w-4 h-4" />, category: "Basic", description: "Formatted text (bold, lists)" },
  { type: "email", label: "Email", icon: <Mail className="w-4 h-4" />, category: "Basic", description: "Validated email address" },
  { type: "phone", label: "Phone", icon: <Phone className="w-4 h-4" />, category: "Basic", description: "Telephone number" },
  { type: "url", label: "URL", icon: <LinkIcon className="w-4 h-4" />, category: "Basic", description: "Web link" },
  { type: "number", label: "Number", icon: <Hash className="w-4 h-4" />, category: "Numeric", description: "Whole number" },
  { type: "decimal", label: "Decimal", icon: <Calculator className="w-4 h-4" />, category: "Numeric", description: "Floating point" },
  { type: "currency", label: "Currency", icon: <DollarSign className="w-4 h-4" />, category: "Numeric", description: "Money with symbol" },
  { type: "percentage", label: "Percentage", icon: <Percent className="w-4 h-4" />, category: "Numeric", description: "Percent value" },
  { type: "rating", label: "Rating", icon: <Star className="w-4 h-4" />, category: "Numeric", description: "Star rating" },
  { type: "dropdown", label: "Dropdown", icon: <ChevronDown className="w-4 h-4" />, category: "Choice", description: "Single choice list" },
  { type: "radio", label: "Radio", icon: <CircleDot className="w-4 h-4" />, category: "Choice", description: "Radio pills" },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="w-4 h-4" />, category: "Choice", description: "Yes / No" },
  { type: "multiselect", label: "Multi Select", icon: <ListFilter className="w-4 h-4" />, category: "Choice", description: "Multiple choices" },
  { type: "date", label: "Date", icon: <Calendar className="w-4 h-4" />, category: "Date", description: "Date picker" },
  { type: "datetime", label: "Date & Time", icon: <CalendarClock className="w-4 h-4" />, category: "Date", description: "Timestamp" },
  { type: "time", label: "Time", icon: <Clock className="w-4 h-4" />, category: "Date", description: "Time picker" },
  { type: "lookup", label: "Lookup", icon: <Search className="w-4 h-4 text-blue-600" />, category: "Relationship", description: "Link to another form (searchable, multi, cascading, auto-fill)" },
  { type: "subform", label: "Subform", icon: <Table className="w-4 h-4 text-purple-600" />, category: "Relationship", description: "Line items grid with row formulas & totals" },
  { type: "users", label: "User", icon: <Users className="w-4 h-4" />, category: "Relationship", description: "Assign to an app member" },
  { type: "formula", label: "Formula", icon: <Sigma className="w-4 h-4 text-indigo-600" />, category: "Computed", description: "Real-time calculated value" },
  { type: "rollup", label: "Rollup", icon: <Database className="w-4 h-4 text-emerald-600" />, category: "Computed", description: "SUM / COUNT from another form" },
  { type: "autonumber", label: "Auto Number", icon: <Sparkles className="w-4 h-4 text-amber-600" />, category: "Computed", description: "Sequential ID with pattern" },
  { type: "file", label: "File Upload", icon: <UploadCloud className="w-4 h-4" />, category: "Media", description: "Attachments (Firebase Storage)" },
  { type: "image", label: "Image", icon: <ImageIcon className="w-4 h-4" />, category: "Media", description: "Photo with preview" },
  { type: "signature", label: "Signature", icon: <PenTool className="w-4 h-4" />, category: "Media", description: "Draw a signature" },
  { type: "address", label: "Address", icon: <Home className="w-4 h-4" />, category: "Advanced", description: "Composite address" },
  { type: "geolocation", label: "Geo Location", icon: <MapPin className="w-4 h-4" />, category: "Advanced", description: "GPS lat/lng" },
  { type: "barcode", label: "Barcode / QR", icon: <ScanLine className="w-4 h-4" />, category: "Advanced", description: "Scan with camera" },
  { type: "color", label: "Color", icon: <Palette className="w-4 h-4" />, category: "Advanced", description: "Color picker" },
];

export const CATEGORIES: FieldTypeInfo["category"][] = ["Layout", "Basic", "Numeric", "Choice", "Date", "Relationship", "Computed", "Media", "Advanced"];

export const FieldPalette: React.FC<{ onAddField: (type: FieldType, label: string) => void }> = ({ onAddField }) => {
  const [search, setSearch] = useState("");
  const filtered = FIELD_TYPES.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()) || f.category.toLowerCase().includes(search.toLowerCase()) || f.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-60 border-r border-slate-200 bg-white h-full flex flex-col shrink-0 select-none min-h-0">
      <div className="p-3 border-b border-slate-100 shrink-0">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Field types</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter fields…" className="w-full text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
      </div>
      <div className="p-2.5 overflow-y-auto flex-1 min-h-0 space-y-3">
        {CATEGORIES.map((cat) => {
          const items = filtered.filter((f) => f.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">{cat}</div>
              <div className="grid grid-cols-2 gap-1">
                {items.map((f) => (
                  <button key={f.type} draggable onDragStart={(e) => { e.dataTransfer.setData("application/json", JSON.stringify({ type: f.type, label: f.label })); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => onAddField(f.type, f.type === "section" ? "New Section" : f.label)} className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-700 bg-slate-50/60 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/80 hover:border-blue-300 rounded-md transition-all text-left group cursor-grab active:cursor-grabbing" title={`${f.description} — drag or click to add`}>
                    <span className="text-slate-500 group-hover:text-blue-600 shrink-0">{f.icon}</span>
                    <span className="font-medium truncate">{f.label}</span>
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
