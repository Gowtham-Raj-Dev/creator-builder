"use client";

import React from "react";
import { FieldDefinition, RecordDefinition } from "@/types/schema";
import { Input, Select, Textarea, FieldLabel } from "@/components/ui/FormControls";
import { LookupField } from "./LookupField";
import { SubformField, SubformChangeMeta } from "./SubformField";
import { RatingField, ColorField, MultiSelectField, UsersField, AddressField, GeoField, BarcodeField, SignatureField, RichTextField, FileField } from "./fields/ExtraFields";
import { formatCurrency } from "@/lib/utils/formatters";
import { Sigma, Sparkles, Database, Lock } from "lucide-react";

interface DynamicFieldProps {
  field: FieldDefinition;
  value: any;
  onChange: (value: any, meta?: { lookupRecord?: RecordDefinition | RecordDefinition[]; subform?: SubformChangeMeta }) => void;
  error?: string;
  isReadonly?: boolean;
  isHidden?: boolean;
  parentValues?: Record<string, any>;
  computedValue?: any; // for formula / rollup display
}

export const DynamicField: React.FC<DynamicFieldProps> = ({ field, value, onChange, error, isReadonly = false, isHidden = false, parentValues, computedValue }) => {
  if (isHidden) return null;
  const disabled = isReadonly || Boolean(field.readonly);
  const helper = field.description;

  switch (field.type) {
    case "lookup":
      if (!field.lookup) return <Input label={field.label} disabled value="Lookup not configured" />;
      return (
        <LookupField
          label={field.label}
          value={value ?? (field.lookup.multiple ? [] : "")}
          onChange={(v, rec) => onChange(v, { lookupRecord: rec })}
          lookupConfig={field.lookup}
          error={error}
          disabled={disabled}
          required={field.required}
          tooltip={field.tooltip}
          description={helper}
          parentValue={field.lookup.cascade?.parentFieldId ? parentValues?.[field.lookup.cascade.parentFieldId] : undefined}
        />
      );

    case "subform":
      if (!field.subform) return null;
      return <SubformField field={field} rows={Array.isArray(value) ? value : []} onChange={(rows, meta) => onChange(rows, { subform: meta })} disabled={disabled} error={error} parentValues={parentValues} />;

    case "autonumber":
      return (
        <div className="w-full space-y-1.5">
          <FieldLabel tooltip={field.tooltip}>{field.label}</FieldLabel>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 text-sm font-mono text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-500" />
            {value || "Generated on save"}
          </div>
        </div>
      );

    case "formula": {
      const v = computedValue ?? value;
      const display = field.formula?.resultType === "number" ? (typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: field.formula.decimalPlaces ?? 2 }) : v ?? 0) : field.formula?.resultType === "boolean" ? (v ? "Yes" : "No") : String(v ?? "");
      return (
        <div className="w-full space-y-1.5">
          <FieldLabel tooltip={field.tooltip || field.formula?.expression}>{field.label}</FieldLabel>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50/60 text-sm font-semibold text-indigo-900 tabular-nums">
            <Sigma className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate">{field.currencySymbol ? formatCurrency(Number(v) || 0, field.currencySymbol, field.formula?.decimalPlaces ?? 2) : display}</span>
          </div>
          {helper && <p className="text-[11px] text-slate-500">{helper}</p>}
        </div>
      );
    }

    case "rollup": {
      const v = computedValue ?? value ?? 0;
      return (
        <div className="w-full space-y-1.5">
          <FieldLabel tooltip={field.tooltip}>{field.label}</FieldLabel>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/60 text-sm font-semibold text-emerald-900 tabular-nums">
            <Database className="w-4 h-4 text-emerald-500 shrink-0" />
            {field.currencySymbol ? formatCurrency(Number(v) || 0, field.currencySymbol, field.rollup?.decimalPlaces ?? 2) : Number(v).toLocaleString("en-IN", { maximumFractionDigits: field.rollup?.decimalPlaces ?? 2 })}
            <span className="ml-auto text-[10px] font-medium text-emerald-600 uppercase tracking-wider">{field.rollup?.aggregate}</span>
          </div>
          {helper && <p className="text-[11px] text-slate-500">{helper}</p>}
        </div>
      );
    }

    case "checkbox":
      return (
        <div className="w-full pt-5">
          <label className={`flex items-center gap-2.5 text-slate-800 text-sm font-medium ${disabled ? "opacity-60" : "cursor-pointer"}`}>
            <input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>{field.label}</span>
            {field.required && <span className="text-rose-500">*</span>}
          </label>
          {helper && <p className="text-[11px] text-slate-500 pl-7">{helper}</p>}
          {error && <p className="text-xs text-rose-600 font-medium pl-7">{error}</p>}
        </div>
      );

    case "textarea":
      return <Textarea label={field.label} required={field.required} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} error={error} helperText={helper} tooltip={field.tooltip} rows={3} maxLength={field.maxLength} />;

    case "richtext":
      return <RichTextField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;

    case "dropdown":
      return (
        <Select label={field.label} value={value || ""} required={field.required} disabled={disabled} error={error} helperText={helper} tooltip={field.tooltip} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder || `Select ${field.label}…`}</option>
          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </Select>
      );

    case "radio":
      return (
        <div className="w-full space-y-2">
          <FieldLabel required={field.required} tooltip={field.tooltip}>{field.label}</FieldLabel>
          <div className="flex items-center gap-2 flex-wrap">
            {(field.options || []).map((opt) => {
              const on = value === opt;
              return (
                <label key={opt} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
                  <input type="radio" name={field.id} disabled={disabled} value={opt} checked={on} onChange={(e) => onChange(e.target.value)} className="hidden" />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          {!error && helper && <p className="text-[11px] text-slate-500">{helper}</p>}
        </div>
      );

    case "multiselect":
      return <MultiSelectField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;

    case "currency":
      return (
        <Input label={field.label} type="number" step="any" required={field.required} disabled={disabled} error={error} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))} prefixIcon={<span className="text-xs font-bold">{field.currencySymbol || "₹"}</span>} placeholder={field.placeholder || "0.00"} helperText={helper} tooltip={field.tooltip} min={field.min} max={field.max} className="text-right tabular-nums" />
      );

    case "percentage":
      return (
        <Input label={field.label} type="number" step="any" required={field.required} disabled={disabled} error={error} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))} suffix={<span className="text-xs font-semibold text-slate-400">%</span>} placeholder="0" helperText={helper} tooltip={field.tooltip} min={field.min} max={field.max} className="text-right tabular-nums" />
      );

    case "number":
    case "decimal":
      return (
        <Input label={field.label} type="number" step={field.type === "decimal" ? "any" : field.decimalPlaces ? "any" : "1"} required={field.required} disabled={disabled} error={error} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder={field.placeholder || "0"} helperText={helper} tooltip={field.tooltip} min={field.min} max={field.max} className="text-right tabular-nums" />
      );

    case "date":
    case "datetime":
    case "time":
      return <Input label={field.label} type={field.type === "datetime" ? "datetime-local" : field.type} required={field.required} disabled={disabled} error={error} value={value || ""} onChange={(e) => onChange(e.target.value)} helperText={helper} tooltip={field.tooltip} />;

    case "rating": return <RatingField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "color": return <ColorField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "users": return <UsersField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "address": return <AddressField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "geolocation": return <GeoField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "barcode": return <BarcodeField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "signature": return <SignatureField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;
    case "file":
    case "image":
      return <FileField field={field} value={value} onChange={onChange} error={error} disabled={disabled} />;

    case "section":
      return null; // rendered by DynamicForm layout

    default: {
      const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "text";
      return (
        <Input label={field.label} type={inputType} required={field.required} disabled={disabled} error={error} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} helperText={helper} tooltip={field.tooltip} maxLength={field.maxLength} suffix={disabled && field.readonly ? <Lock className="w-3.5 h-3.5" /> : undefined} />
      );
    }
  }
};
