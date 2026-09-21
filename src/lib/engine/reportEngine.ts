import { buildXlsx } from "@/lib/utils/xlsx";
import {
  AggregateType,
  ConditionalFormat,
  DatePreset,
  FieldDefinition,
  FilterGroup,
  FormDefinition,
  RecordDefinition,
  ReportFilter,
  ReportOperator,
} from "@/types/schema";

// ── value access ─────────────────────────────────────────────────────────────

export const SYSTEM_FIELDS: Array<{ id: string; label: string; type: "date" | "text" }> = [
  { id: "createdAt", label: "Created At", type: "date" },
  { id: "updatedAt", label: "Updated At", type: "date" },
  { id: "createdBy", label: "Created By", type: "text" },
  { id: "updatedBy", label: "Updated By", type: "text" },
];

export function getRawValue(rec: RecordDefinition, fieldKey: string, form?: FormDefinition): any {
  if (fieldKey === "createdAt" || fieldKey === "updatedAt" || fieldKey === "createdBy" || fieldKey === "updatedBy" || fieldKey === "id") {
    return (rec as any)[fieldKey];
  }
  if (rec.data && fieldKey in rec.data) return rec.data[fieldKey];
  if (form) {
    const f = form.fields.find((x) => x.linkName === fieldKey || x.label === fieldKey);
    if (f) return rec.data?.[f.id];
  }
  return undefined;
}

export function toNumber(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function isBlankValue(v: any): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

// ── date presets ─────────────────────────────────────────────────────────────

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "last_90_days", label: "Last 90 days" },
];

export function presetRange(preset: DatePreset, now = new Date()): [Date, Date] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const d = (x: Date, n: number) => { const r = new Date(x); r.setDate(r.getDate() + n); return r; };
  switch (preset) {
    case "today": return [start, end];
    case "yesterday": return [d(start, -1), d(end, -1)];
    case "this_week": { const s = d(start, -start.getDay()); return [s, d(s, 6)]; }
    case "last_week": { const s = d(start, -start.getDay() - 7); const e = d(s, 6); e.setHours(23, 59, 59, 999); return [s, e]; }
    case "this_month": return [new Date(start.getFullYear(), start.getMonth(), 1), new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)];
    case "last_month": return [new Date(start.getFullYear(), start.getMonth() - 1, 1), new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999)];
    case "this_quarter": { const q = Math.floor(start.getMonth() / 3) * 3; return [new Date(start.getFullYear(), q, 1), new Date(start.getFullYear(), q + 3, 0, 23, 59, 59, 999)]; }
    case "this_year": return [new Date(start.getFullYear(), 0, 1), new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999)];
    case "last_year": return [new Date(start.getFullYear() - 1, 0, 1), new Date(start.getFullYear() - 1, 11, 31, 23, 59, 59, 999)];
    case "last_7_days": return [d(start, -6), end];
    case "last_30_days": return [d(start, -29), end];
    case "last_90_days": return [d(start, -89), end];
    default: return [start, end];
  }
}

// ── filter evaluation ────────────────────────────────────────────────────────

export function evaluateFilter(rec: RecordDefinition, filter: ReportFilter, form?: FormDefinition): boolean {
  const raw = getRawValue(rec, filter.fieldId, form);
  const op: ReportOperator = filter.operator;
  const target = filter.value;

  switch (op) {
    case "is_empty": return isBlankValue(raw);
    case "is_not_empty": return !isBlankValue(raw);
    case "is_true": return raw === true || String(raw).toLowerCase() === "true";
    case "is_false": return !(raw === true || String(raw).toLowerCase() === "true");
    case "equals":
      if (Array.isArray(raw)) return raw.some((v) => String(v).toLowerCase() === String(target ?? "").toLowerCase());
      if (typeof raw === "boolean") return raw === (target === true || String(target).toLowerCase() === "true");
      return String(raw ?? "").trim().toLowerCase() === String(target ?? "").trim().toLowerCase();
    case "not_equals":
      if (Array.isArray(raw)) return !raw.some((v) => String(v).toLowerCase() === String(target ?? "").toLowerCase());
      return String(raw ?? "").trim().toLowerCase() !== String(target ?? "").trim().toLowerCase();
    case "contains": return String(Array.isArray(raw) ? raw.join(",") : raw ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "not_contains": return !String(Array.isArray(raw) ? raw.join(",") : raw ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "starts_with": return String(raw ?? "").toLowerCase().startsWith(String(target ?? "").toLowerCase());
    case "ends_with": return String(raw ?? "").toLowerCase().endsWith(String(target ?? "").toLowerCase());
    case "greater_than": return compare(raw, target) > 0;
    case "greater_or_equal": return compare(raw, target) >= 0;
    case "less_than": return compare(raw, target) < 0;
    case "less_or_equal": return compare(raw, target) <= 0;
    case "between": return compare(raw, target) >= 0 && compare(raw, filter.value2) <= 0;
    case "in": {
      const list = Array.isArray(target) ? target : String(target ?? "").split(",").map((s) => s.trim());
      const vals = Array.isArray(raw) ? raw : [raw];
      return vals.some((v) => list.map((x) => String(x).toLowerCase()).includes(String(v ?? "").toLowerCase()));
    }
    case "date_preset": {
      if (!filter.preset) return true;
      const d = new Date(String(raw ?? ""));
      if (isNaN(d.getTime())) return false;
      const [s, e] = presetRange(filter.preset);
      return d >= s && d <= e;
    }
    default: return true;
  }
}

function compare(a: any, b: any): number {
  const da = typeof a === "string" && /^\d{4}-\d{2}-\d{2}/.test(a) ? new Date(a) : null;
  const db = typeof b === "string" && /^\d{4}-\d{2}-\d{2}/.test(b) ? new Date(b) : null;
  if (da && db && !isNaN(da.getTime()) && !isNaN(db.getTime())) return da.getTime() - db.getTime();
  const na = toNumber(a); const nb = toNumber(b);
  if (!isNaN(na) && !isNaN(nb) && (typeof a === "number" || /^-?\d/.test(String(a)))) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export function recordMatchesFilters(rec: RecordDefinition, filters: ReportFilter[], form?: FormDefinition, logic: "AND" | "OR" = "AND"): boolean {
  if (!filters || filters.length === 0) return true;
  const results = filters.map((f) => evaluateFilter(rec, f, form));
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/** Filter groups: groups are OR-ed together, each group applies its own logic. */
export function recordMatchesGroups(rec: RecordDefinition, groups: FilterGroup[], form?: FormDefinition): boolean {
  const active = (groups || []).filter((g) => g.filters.length > 0);
  if (active.length === 0) return true;
  return active.some((g) => recordMatchesFilters(rec, g.filters, form, g.logic));
}

// ── search ───────────────────────────────────────────────────────────────────

export function recordMatchesSearch(rec: RecordDefinition, q: string, displayValue: (rec: RecordDefinition, fieldId: string) => string, fieldIds: string[]): boolean {
  if (!q.trim()) return true;
  const needle = q.toLowerCase();
  if (rec.id.toLowerCase().includes(needle)) return true;
  return fieldIds.some((fid) => displayValue(rec, fid).toLowerCase().includes(needle));
}

// ── sorting ──────────────────────────────────────────────────────────────────

export function sortRecords(records: RecordDefinition[], fieldId: string | null, order: "asc" | "desc", form?: FormDefinition): RecordDefinition[] {
  if (!fieldId) return records;
  const sorted = [...records].sort((a, b) => compare(getRawValue(a, fieldId, form), getRawValue(b, fieldId, form)));
  return order === "desc" ? sorted.reverse() : sorted;
}

// ── aggregates / grouping ────────────────────────────────────────────────────

export function aggregateValues(values: any[], type: AggregateType): number {
  const nums = values.filter((v) => !isBlankValue(v)).map(toNumber);
  if (type === "count") return values.filter((v) => !isBlankValue(v)).length;
  if (nums.length === 0) return 0;
  switch (type) {
    case "sum": return nums.reduce((s, v) => s + v, 0);
    case "avg": return nums.reduce((s, v) => s + v, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    default: return 0;
  }
}

export interface RecordGroup {
  key: string;
  label: string;
  records: RecordDefinition[];
  aggregates: Record<string, number>;
}

export function groupRecords(
  records: RecordDefinition[],
  groupFieldId: string,
  displayValue: (rec: RecordDefinition, fieldId: string) => string,
  aggregates: Array<{ fieldId: string; aggregate: AggregateType }> = []
): RecordGroup[] {
  const map = new Map<string, RecordGroup>();
  for (const rec of records) {
    const label = displayValue(rec, groupFieldId) || "(Blank)";
    const key = label.toLowerCase();
    if (!map.has(key)) map.set(key, { key, label, records: [], aggregates: {} });
    map.get(key)!.records.push(rec);
  }
  const groups = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  for (const g of groups) {
    for (const agg of aggregates) {
      g.aggregates[`${agg.fieldId}:${agg.aggregate}`] = aggregateValues(g.records.map((r) => getRawValue(r, agg.fieldId)), agg.aggregate);
    }
  }
  return groups;
}

export interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  cells: Record<string, Record<string, number>>; // row -> col -> value
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export function pivotRecords(
  records: RecordDefinition[],
  rowFieldId: string,
  colFieldId: string | undefined,
  valueFieldId: string | undefined,
  aggregate: AggregateType,
  displayValue: (rec: RecordDefinition, fieldId: string) => string
): PivotResult {
  const buckets: Record<string, Record<string, any[]>> = {};
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  for (const rec of records) {
    const r = displayValue(rec, rowFieldId) || "(Blank)";
    const c = colFieldId ? displayValue(rec, colFieldId) || "(Blank)" : "Total";
    rowSet.add(r); colSet.add(c);
    buckets[r] = buckets[r] || {};
    buckets[r][c] = buckets[r][c] || [];
    buckets[r][c].push(valueFieldId ? getRawValue(rec, valueFieldId) : 1);
  }
  const rowKeys = Array.from(rowSet).sort();
  const colKeys = Array.from(colSet).sort();
  const cells: PivotResult["cells"] = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grand = 0;
  const allVals: any[] = [];
  for (const r of rowKeys) {
    cells[r] = {};
    const rowVals: any[] = [];
    for (const c of colKeys) {
      const vals = buckets[r]?.[c] || [];
      cells[r][c] = vals.length ? aggregateValues(vals, aggregate) : 0;
      rowVals.push(...vals);
      colTotals[c] = (colTotals[c] || 0) + (aggregate === "sum" || aggregate === "count" ? cells[r][c] : 0);
    }
    rowTotals[r] = aggregateValues(rowVals, aggregate);
    allVals.push(...rowVals);
  }
  if (aggregate !== "sum" && aggregate !== "count") {
    for (const c of colKeys) colTotals[c] = aggregateValues(rowKeys.flatMap((r) => buckets[r]?.[c] || []), aggregate);
  }
  grand = aggregateValues(allVals, aggregate);
  return { rowKeys, colKeys, cells, rowTotals, colTotals, grandTotal: grand };
}

// ── conditional formatting ───────────────────────────────────────────────────

export const FORMAT_COLORS: Record<string, { cell: string; row: string; label: string }> = {
  rose: { cell: "bg-rose-100 text-rose-800 font-semibold", row: "bg-rose-50/70", label: "Red" },
  amber: { cell: "bg-amber-100 text-amber-800 font-semibold", row: "bg-amber-50/70", label: "Amber" },
  emerald: { cell: "bg-emerald-100 text-emerald-800 font-semibold", row: "bg-emerald-50/70", label: "Green" },
  blue: { cell: "bg-blue-100 text-blue-800 font-semibold", row: "bg-blue-50/70", label: "Blue" },
  purple: { cell: "bg-purple-100 text-purple-800 font-semibold", row: "bg-purple-50/70", label: "Purple" },
  slate: { cell: "bg-slate-200 text-slate-700 font-semibold", row: "bg-slate-100", label: "Grey" },
};

export function conditionalClasses(rec: RecordDefinition, formats: ConditionalFormat[] = [], form?: FormDefinition): { row: string; cells: Record<string, string> } {
  let row = "";
  const cells: Record<string, string> = {};
  for (const cf of formats) {
    const matched = evaluateFilter(rec, { fieldId: cf.fieldId, operator: cf.operator, value: cf.value, value2: cf.value2 }, form);
    if (!matched) continue;
    const c = FORMAT_COLORS[cf.color] || FORMAT_COLORS.slate;
    if (cf.applyTo === "row") row = c.row;
    else cells[cf.fieldId] = c.cell;
  }
  return { row, cells };
}

// ── export / import ──────────────────────────────────────────────────────────

export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Excel-compatible export (HTML table saved as .xls opens directly in Excel). */
export function downloadExcel(filename: string, headers: string[], rows: string[][], sheetName?: string) {
  // real .xlsx (OOXML zip) — Excel opens it silently; the old HTML-as-.xls trick triggered a "format doesn't match" warning
  const name = filename.replace(/\.xlsx?$/i, "") + ".xlsx";
  const bytes = buildXlsx(sheetName || name.replace(/\.xlsx$/i, ""), headers, rows);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Coerce an imported cell string into the field's storage type. */
export function coerceImportValue(field: FieldDefinition, raw: string, lookupResolver?: (field: FieldDefinition, text: string) => string | undefined): any {
  const s = (raw ?? "").trim();
  if (s === "") return field.type === "checkbox" ? false : "";
  switch (field.type) {
    case "number": case "decimal": case "currency": case "percentage": case "rating":
      return toNumber(s);
    case "checkbox":
      return ["true", "yes", "1", "y"].includes(s.toLowerCase());
    case "multiselect":
      return s.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
    case "lookup":
      return lookupResolver ? lookupResolver(field, s) ?? s : s;
    case "date": {
      const d = new Date(s);
      if (isNaN(d.getTime())) {
        const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); // DD/MM/YYYY
        if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        return s;
      }
      return d.toISOString().slice(0, 10);
    }
    default:
      return s;
  }
}
