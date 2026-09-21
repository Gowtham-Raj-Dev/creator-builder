import { AppDefinition, FieldDefinition, FormDefinition, RecordDefinition, RollupConfig, AggregateType } from "@/types/schema";
import { recordMatchesFilters } from "./reportEngine";

/**
 * Rollup fields aggregate records of ANOTHER form that point back to this record
 * via a lookup (either a top-level lookup field or a lookup column inside a subform).
 *
 * matchFieldId / valueFieldId accept "fieldId" or "subformFieldId.columnId".
 */

function aggregate(values: number[], type: AggregateType): number {
  if (type === "count") return values.length;
  if (values.length === 0) return 0;
  switch (type) {
    case "sum": return values.reduce((s, v) => s + v, 0);
    case "avg": return values.reduce((s, v) => s + v, 0) / values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    default: return 0;
  }
}

function num(v: any): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function computeRollup(
  config: RollupConfig,
  targetRecordId: string,
  app: Pick<AppDefinition, "forms">,
  recordsMap: Record<string, RecordDefinition[]>
): number {
  const sourceForm = app.forms.find((f) => f.id === config.sourceFormId);
  if (!sourceForm || !targetRecordId) return 0;
  const sourceRecords = (recordsMap[config.sourceFormId] || []).filter((r) => !r.deleted);

  const [matchTop, matchCol] = config.matchFieldId.split(".");
  const [valTop, valCol] = (config.valueFieldId || "").split(".");

  const values: number[] = [];

  for (const rec of sourceRecords) {
    if (config.filters?.length && !recordMatchesFilters(rec, config.filters, sourceForm, "AND")) continue;

    if (matchCol) {
      // match is a subform column → iterate rows
      const rows: any[] = Array.isArray(rec.data?.[matchTop]) ? rec.data[matchTop] : [];
      for (const row of rows) {
        const mv = row[matchCol];
        const matches = Array.isArray(mv) ? mv.includes(targetRecordId) : mv === targetRecordId;
        if (!matches) continue;
        if (config.aggregate === "count" && !config.valueFieldId) { values.push(1); continue; }
        if (valCol && valTop === matchTop) values.push(num(row[valCol]));
        else if (valTop && !valCol) values.push(num(rec.data?.[valTop]));
        else values.push(1);
      }
    } else {
      const mv = rec.data?.[matchTop];
      const matches = Array.isArray(mv) ? mv.includes(targetRecordId) : mv === targetRecordId;
      if (!matches) continue;
      if (config.aggregate === "count" && !config.valueFieldId) { values.push(1); continue; }
      if (valCol) {
        const rows: any[] = Array.isArray(rec.data?.[valTop]) ? rec.data[valTop] : [];
        rows.forEach((row) => values.push(num(row[valCol])));
      } else if (valTop) {
        values.push(num(rec.data?.[valTop]));
      } else values.push(1);
    }
  }

  const result = aggregate(values, config.aggregate);
  const p = Math.pow(10, config.decimalPlaces ?? 2);
  return Math.round(result * p) / p;
}

/** Compute all rollup fields of a form for one record. */
export function computeRollupsForRecord(
  form: FormDefinition,
  record: RecordDefinition,
  app: Pick<AppDefinition, "forms">,
  recordsMap: Record<string, RecordDefinition[]>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of form.fields) {
    if (f.type === "rollup" && f.rollup) out[f.id] = computeRollup(f.rollup, record.id, app, recordsMap);
  }
  return out;
}

export function describeRollup(field: FieldDefinition, app: Pick<AppDefinition, "forms">): string {
  const cfg = field.rollup;
  if (!cfg) return "";
  const src = app.forms.find((f) => f.id === cfg.sourceFormId);
  const [vt, vc] = (cfg.valueFieldId || "").split(".");
  let valLabel = "";
  if (src && vt) {
    const top = src.fields.find((f) => f.id === vt);
    valLabel = vc ? `${top?.label}.${top?.subform?.columns.find((c) => c.id === vc)?.label}` : top?.label || vt;
  }
  return `${cfg.aggregate.toUpperCase()}(${src?.name || "?"}${valLabel ? "." + valLabel : ""})`;
}
