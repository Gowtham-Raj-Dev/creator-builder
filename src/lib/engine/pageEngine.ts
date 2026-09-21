import { AppDefinition, FormDefinition, RecordDefinition, ReportFilter, AggregateType, DatePreset } from "@/types/schema";
import { resolveLookupDisplay } from "./lookupEngine";
import { recordMatchesFilters, aggregateValues, getRawValue, presetRange } from "./reportEngine";
import { evaluateFormula } from "./formulaEngine";

/** Validated categorical palette (dataviz reference instance, light + dark steps). */
export const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const CHART_COLORS_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

export function findForm(key: string, app: Pick<AppDefinition, "forms">): FormDefinition | undefined {
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return app.forms.find((f) => f.id === key || f.linkName === key || f.name.toLowerCase().replace(/[^a-z0-9]/g, "") === norm || f.linkName.replace(/[^a-z0-9]/g, "") === norm);
}

function findField(form: FormDefinition, key: string) {
  const k = key.toLowerCase();
  return form.fields.find((f) => f.id === key || f.linkName.toLowerCase() === k || f.label.toLowerCase() === k);
}

export interface GlobalPageFilter {
  datePreset?: DatePreset | "";
  dateFrom?: string;
  dateTo?: string;
  dateFieldByForm?: Record<string, string>; // formId -> date field id (auto if missing)
}

/** Presets a page date-filter widget shows when it doesn't choose its own. */
export const DEFAULT_FILTER_PRESETS: DatePreset[] = ["today", "yesterday", "last_7_days", "this_week", "this_month", "last_month", "this_year"];

export const isGlobalFilterActive =(gf?: GlobalPageFilter) => Boolean(gf && (gf.datePreset || gf.dateFrom || gf.dateTo));

/** The [from, to] range a page-level date filter resolves to (either bound may be null). */
export function resolveGlobalRange(gf?: GlobalPageFilter): [Date | null, Date | null] {
  if (!isGlobalFilterActive(gf)) return [null, null];
  let from: Date | null = null, to: Date | null = null;
  if (gf!.datePreset) [from, to] = presetRange(gf!.datePreset);
  if (gf!.dateFrom) { from = new Date(`${gf!.dateFrom}T00:00:00`); }
  if (gf!.dateTo) { to = new Date(`${gf!.dateTo}T23:59:59.999`); }
  return [from, to];
}

/** Which date field of `form` the page filter compares against (explicit choice → first date field → createdAt). */
export function globalDateFieldFor(form: FormDefinition, gf?: GlobalPageFilter): string | undefined {
  return gf?.dateFieldByForm?.[form.id] || form.fields.find((f) => f.type === "date" || f.type === "datetime")?.id;
}

const recordDate = (r: RecordDefinition, dateFieldId?: string): Date | null => {
  const raw = dateFieldId ? r.data?.[dateFieldId] : r.createdAt;
  if (!raw) return null;
  const s = String(raw);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s); // date-only values are local midnight, not UTC
  return isNaN(d.getTime()) ? null : d;
};

/** Predicate form of the page filter, so report widgets can share the exact same rule. */
export function globalFilterPredicate(form: FormDefinition, gf?: GlobalPageFilter): ((r: RecordDefinition) => boolean) | null {
  const [from, to] = resolveGlobalRange(gf);
  if (!from && !to) return null;
  const dateFieldId = globalDateFieldFor(form, gf);
  return (r) => { const d = recordDate(r, dateFieldId); return Boolean(d) && (!from || d! >= from) && (!to || d! <= to); };
}

function applyGlobalFilter(records: RecordDefinition[], form: FormDefinition, gf?: GlobalPageFilter): RecordDefinition[] {
  const pred = globalFilterPredicate(form, gf);
  return pred ? records.filter(pred) : records;
}

/**
 * Metric evaluation used by KPI cards:
 *   { formId, aggregate, fieldId?, filters?, compare?: "last_month" | "last_period" }
 */
export interface MetricConfig {
  formId: string;
  aggregate: AggregateType;
  fieldId?: string;
  filters?: ReportFilter[];
  formula?: string; // optional: free-form formula evaluated with {count,sum,...} context
  compare?: "none" | "previous_period" | "last_month" | "last_year";
  dateFieldId?: string;
}

export interface MetricResult {
  value: number; // the headline number: all matching records, narrowed by the page date filter when one is set
  previous?: number; // value of the comparison period
  changePct?: number;
  compareLabel?: string; // e.g. "vs last month", "vs previous 7 days"
  periodValue?: number; // when no page filter is active: this month's / this year's value the change refers to
}

export function computeMetric(cfg: MetricConfig, app: Pick<AppDefinition, "forms">, recordsMap: Record<string, RecordDefinition[]>, gf?: GlobalPageFilter): MetricResult {
  const form = app.forms.find((f) => f.id === cfg.formId);
  if (!form) return { value: 0 };
  let recs = (recordsMap[form.id] || []).filter((r) => !r.deleted);
  if (cfg.filters?.length) recs = recs.filter((r) => recordMatchesFilters(r, cfg.filters!, form));
  const current = applyGlobalFilter(recs, form, gf);
  const agg = (list: RecordDefinition[]) => (cfg.formula ? Number(evaluateFormula(cfg.formula, { count: list.length, sum: aggregateValues(list.map((r) => getRawValue(r, cfg.fieldId || "", form)), "sum"), avg: aggregateValues(list.map((r) => getRawValue(r, cfg.fieldId || "", form)), "avg") })) || 0 : cfg.aggregate === "count" ? list.length : aggregateValues(list.map((r) => getRawValue(r, cfg.fieldId || "", form)), cfg.aggregate));
  const value = agg(current);
  if (!cfg.compare || cfg.compare === "none") return { value };

  const dateFieldId = cfg.dateFieldId || globalDateFieldFor(form, gf);
  const inRange = (r: RecordDefinition, s: Date, e: Date) => { const d = recordDate(r, dateFieldId); return Boolean(d) && d! >= s && d! <= e; };
  const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10);

  // A page date filter defines the current period: compare with the period of the same length just before it.
  const [gFrom, gTo] = resolveGlobalRange(gf);
  if (gFrom && gTo) {
    const len = gTo.getTime() - gFrom.getTime() + 1;
    const prevEnd = new Date(gFrom.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - len + 1);
    if (cfg.compare === "last_year") { prevStart.setTime(gFrom.getTime()); prevStart.setFullYear(prevStart.getFullYear() - 1); prevEnd.setTime(gTo.getTime()); prevEnd.setFullYear(prevEnd.getFullYear() - 1); }
    const prev = agg(recs.filter((r) => inRange(r, prevStart, prevEnd)));
    const days = Math.round(len / 86400000);
    return { value, previous: prev, changePct: pct(value, prev), compareLabel: cfg.compare === "last_year" ? "vs same period last year" : days === 1 ? "vs previous day" : `vs previous ${days} days` };
  }

  // No page filter: the headline stays all-time; the trend line compares this month (or year) with the last one.
  const now = new Date();
  let curStart: Date, prevStart: Date, prevEnd: Date;
  if (cfg.compare === "last_year") {
    curStart = new Date(now.getFullYear(), 0, 1);
    prevStart = new Date(now.getFullYear() - 1, 0, 1); prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else {
    curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }
  const cur = agg(recs.filter((r) => inRange(r, curStart, now)));
  const prev = agg(recs.filter((r) => inRange(r, prevStart, prevEnd)));
  return { value, periodValue: cur, previous: prev, changePct: pct(cur, prev), compareLabel: cfg.compare === "last_year" ? "this year vs last year" : "this month vs last month" };
}

/**
 * Resolves {{form.count}} {{form.sum(field)}} {{form.avg(field)}} {{form.count(field=value)}} in text.
 */
export function evaluatePageExpression(text: string, app: Pick<AppDefinition, "forms">, recordsMap: Record<string, RecordDefinition[]>, gf?: GlobalPageFilter): string {
  if (!text || typeof text !== "string") return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const m = expr.trim().match(/^([a-zA-Z0-9_-]+)\.(count|sum|avg|min|max)(?:\(([^)]*)\))?$/i);
    if (!m) return match;
    const form = findForm(m[1], app);
    if (!form) return match;
    const agg = m[2].toLowerCase() as AggregateType;
    const arg = (m[3] || "").trim();
    let recs = applyGlobalFilter((recordsMap[form.id] || []).filter((r) => !r.deleted), form, gf);
    let fieldKey = arg;
    const cond = arg.match(/^([a-zA-Z0-9_]+)\s*(=|==|!=)\s*(.+)$/);
    if (cond) {
      const f = findField(form, cond[1]);
      const want = cond[3].replace(/^["']|["']$/g, "").toLowerCase();
      recs = recs.filter((r) => { const v = f ? (f.type === "lookup" && f.lookup ? resolveLookupDisplay(r.data?.[f.id], recordsMap[f.lookup.targetFormId] || [], f.lookup.displayFieldId) : r.data?.[f.id]) : undefined; const eq = String(v ?? "").toLowerCase() === want; return cond[2] === "!=" ? !eq : eq; });
      fieldKey = "";
    }
    if (agg === "count") return recs.length.toLocaleString("en-IN");
    const f = findField(form, fieldKey);
    const v = aggregateValues(recs.map((r) => (f ? r.data?.[f.id] : r.data?.[fieldKey])), agg);
    return (Math.round(v * 100) / 100).toLocaleString("en-IN");
  });
}

export interface ChartDataPoint { label: string; value: number; percentage: number; color: string; }
export interface ChartSeries { name: string; color: string; points: Array<{ label: string; value: number }>; }

/** Aggregated chart data (single series). */
export function computeChartData(formId: string, groupByFieldId: string, metric: AggregateType, measureFieldId: string | undefined, app: Pick<AppDefinition, "forms">, recordsMap: Record<string, RecordDefinition[]>, opts: { filters?: ReportFilter[]; gf?: GlobalPageFilter; sort?: "value" | "label"; limit?: number; dateBucket?: "day" | "week" | "month" | "year" } = {}): ChartDataPoint[] {
  const form = app.forms.find((f) => f.id === formId);
  if (!form) return [];
  let records = (recordsMap[form.id] || []).filter((r) => !r.deleted);
  if (opts.filters?.length) records = records.filter((r) => recordMatchesFilters(r, opts.filters!, form));
  records = applyGlobalFilter(records, form, opts.gf);
  const groupField = findField(form, groupByFieldId);
  const measureField = measureFieldId ? findField(form, measureFieldId) : undefined;
  const buckets: Record<string, any[]> = {};
  for (const rec of records) {
    let key = "Unspecified";
    if (groupField) {
      const raw = rec.data?.[groupField.id];
      if (raw !== undefined && raw !== null && raw !== "") {
        if (groupField.type === "lookup" && groupField.lookup) key = resolveLookupDisplay(raw, recordsMap[groupField.lookup.targetFormId] || [], groupField.lookup.displayFieldId);
        else if ((groupField.type === "date" || groupField.type === "datetime") && opts.dateBucket) key = bucketDate(String(raw), opts.dateBucket);
        else if (groupField.type === "checkbox") key = raw ? "Yes" : "No";
        else key = Array.isArray(raw) ? raw.join(", ") : String(raw);
      }
    } else if (groupByFieldId === "createdAt") key = bucketDate(rec.createdAt, opts.dateBucket || "month");
    (buckets[key] = buckets[key] || []).push(metric === "count" ? 1 : measureField ? rec.data?.[measureField.id] : 1);
  }
  const entries = Object.entries(buckets).map(([label, vals]) => ({ label, value: Math.round(aggregateValues(vals, metric) * 100) / 100 }));
  const sorted = opts.sort === "label" || opts.dateBucket ? entries.sort((a, b) => a.label.localeCompare(b.label)) : entries.sort((a, b) => b.value - a.value);
  const limited = opts.limit && sorted.length > opts.limit ? [...sorted.slice(0, opts.limit), { label: "Other", value: sorted.slice(opts.limit).reduce((s, e) => s + e.value, 0) }] : sorted;
  const total = limited.reduce((s, e) => s + e.value, 0);
  return limited.map((e, i) => ({ ...e, percentage: total > 0 ? Math.round((e.value / total) * 100) : 0, color: CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)] }));
}

/** Multi-series: group by X, split by series field (stacked / grouped bars, multi-line). */
export function computeSeriesData(formId: string, xFieldId: string, seriesFieldId: string, metric: AggregateType, measureFieldId: string | undefined, app: Pick<AppDefinition, "forms">, recordsMap: Record<string, RecordDefinition[]>, opts: { filters?: ReportFilter[]; gf?: GlobalPageFilter; dateBucket?: "day" | "week" | "month" | "year" } = {}): { labels: string[]; series: ChartSeries[] } {
  const form = app.forms.find((f) => f.id === formId);
  if (!form) return { labels: [], series: [] };
  let records = (recordsMap[form.id] || []).filter((r) => !r.deleted);
  if (opts.filters?.length) records = records.filter((r) => recordMatchesFilters(r, opts.filters!, form));
  records = applyGlobalFilter(records, form, opts.gf);
  const xf = findField(form, xFieldId); const sf = findField(form, seriesFieldId); const mf = measureFieldId ? findField(form, measureFieldId) : undefined;
  const disp = (f: typeof xf, raw: any) => { if (!f) return "—"; if (raw === undefined || raw === null || raw === "") return "Unspecified"; if (f.type === "lookup" && f.lookup) return resolveLookupDisplay(raw, recordsMap[f.lookup.targetFormId] || [], f.lookup.displayFieldId); if ((f.type === "date" || f.type === "datetime") && opts.dateBucket) return bucketDate(String(raw), opts.dateBucket); return String(raw); };
  const grid: Record<string, Record<string, any[]>> = {};
  const labels = new Set<string>(); const seriesNames = new Set<string>();
  for (const r of records) {
    const x = xf ? disp(xf, r.data?.[xf.id]) : bucketDate(r.createdAt, opts.dateBucket || "month");
    const s = disp(sf, r.data?.[sf?.id || ""]);
    labels.add(x); seriesNames.add(s);
    ((grid[s] = grid[s] || {})[x] = grid[s][x] || []).push(metric === "count" ? 1 : mf ? r.data?.[mf.id] : 1);
  }
  const labelList = Array.from(labels).sort();
  const names = Array.from(seriesNames).slice(0, 8);
  return { labels: labelList, series: names.map((n, i) => ({ name: n, color: CHART_COLORS[i], points: labelList.map((l) => ({ label: l, value: Math.round(aggregateValues(grid[n]?.[l] || [], metric) * 100) / 100 })) })) };
}

function bucketDate(raw: string, bucket: "day" | "week" | "month" | "year"): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "Unknown";
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0");
  if (bucket === "year") return String(y);
  if (bucket === "month") return `${y}-${m}`;
  if (bucket === "week") { const start = new Date(d); start.setDate(d.getDate() - d.getDay()); return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")} wk`; }
  return `${y}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
