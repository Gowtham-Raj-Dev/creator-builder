import { FieldDefinition, FormDefinition, RecordDefinition } from "@/types/schema";
import { evaluateFormula, isBlank } from "./formulaEngine";

export interface ValidationErrors {
  [fieldId: string]: string;
}

const NUMERIC_TYPES = ["number", "currency", "percentage", "decimal", "rating"];
const TEXT_TYPES = ["text", "textarea", "richtext", "barcode"];

export interface ValidationOptions {
  hiddenFields?: Record<string, boolean>; // runtime hidden (skipped)
  context?: Record<string, any>; // formula context for requiredIf / rules
  readonlyFieldIds?: Set<string>;
}

export function validateField(
  field: FieldDefinition,
  val: any,
  data: Record<string, any>,
  existingRecords: RecordDefinition[],
  currentRecordId: string | undefined,
  opts: ValidationOptions
): string | undefined {
  const ctx = opts.context || data;
  const blank = isBlank(val);

  // Conditional required
  let required = Boolean(field.required);
  if (!required && field.validation?.requiredIf) {
    required = Boolean(evaluateFormula(field.validation.requiredIf, ctx));
  }
  if (required && blank) return field.validation?.customMessage || `${field.label} is required`;
  if (blank) return undefined;

  // Unique
  if (field.unique) {
    const dup = existingRecords.some((rec) => {
      if (rec.deleted) return false;
      if (currentRecordId && rec.id === currentRecordId) return false;
      const other = rec.data?.[field.id];
      return String(other ?? "").trim().toLowerCase() === String(val).trim().toLowerCase();
    });
    if (dup) return `${field.label} must be unique. "${val}" already exists.`;
  }

  // Type-specific
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) return "Please enter a valid email address";
  if (field.type === "url") {
    try { new URL(String(val)); } catch { return "Please enter a valid URL (e.g. https://example.com)"; }
  }
  if (field.type === "phone") {
    const digits = String(val).replace(/[^0-9]/g, "");
    if (digits.length < 7 || digits.length > 15) return "Please enter a valid phone number (7-15 digits)";
  }
  if (NUMERIC_TYPES.includes(field.type)) {
    const n = Number(val);
    if (isNaN(n)) return `${field.label} must be a number`;
    const min = field.min ?? field.validation?.min;
    const max = field.max ?? field.validation?.max;
    if (min !== undefined && n < min) return `${field.label} must be at least ${min}`;
    if (max !== undefined && n > max) return `${field.label} cannot exceed ${max}`;
  }
  if (TEXT_TYPES.includes(field.type)) {
    const s = String(val);
    const minL = field.minLength ?? field.validation?.minLength;
    const maxL = field.maxLength ?? field.validation?.maxLength;
    if (minL !== undefined && s.length < minL) return `${field.label} must be at least ${minL} characters`;
    if (maxL !== undefined && s.length > maxL) return `${field.label} cannot exceed ${maxL} characters`;
  }
  if (field.type === "subform" && Array.isArray(val)) {
    const minRows = field.subform?.minRows;
    const maxRows = field.subform?.maxRows;
    if (minRows && val.length < minRows) return `${field.label} needs at least ${minRows} row(s)`;
    if (maxRows && val.length > maxRows) return `${field.label} allows at most ${maxRows} row(s)`;
    const cols = field.subform?.columns || [];
    for (let i = 0; i < val.length; i++) {
      for (const c of cols) {
        if (c.required && isBlank(val[i]?.[c.id])) return `Row ${i + 1}: ${c.label} is required`;
      }
    }
  }
  if (field.validation?.pattern) {
    try {
      if (!new RegExp(field.validation.pattern).test(String(val))) return field.validation.patternMessage || `${field.label} does not match the required format`;
    } catch { /* invalid regex ignored */ }
  }
  // Cross-field rules
  for (const rule of field.validation?.rules || []) {
    if (!rule.expression) continue;
    const ok = evaluateFormula(rule.expression, ctx);
    if (!ok) return rule.message || `${field.label} is invalid`;
  }
  return undefined;
}

export function validateFormData(
  form: FormDefinition,
  data: Record<string, any>,
  existingRecords: RecordDefinition[] = [],
  currentRecordId?: string,
  opts: ValidationOptions = {}
): ValidationErrors {
  const errors: ValidationErrors = {};
  for (const field of form.fields) {
    if (field.type === "section" || field.type === "formula" || field.type === "rollup" || field.type === "autonumber") continue;
    if (field.hidden || opts.hiddenFields?.[field.id]) continue;
    const err = validateField(field, data[field.id], data, existingRecords, currentRecordId, opts);
    if (err) errors[field.id] = err;
  }
  return errors;
}
