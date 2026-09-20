import { AppDefinition, FormDefinition, RecordDefinition } from "@/types/schema";
import { resolveLookupDisplay } from "./lookupEngine";

// Beautiful curated palette for charts
export const CHART_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
];

/**
 * Resolves dynamic expressions in page strings like:
 * {{customer_form.count}}
 * {{sales_invoice.sum(total_amount)}}
 * {{sales_invoice.avg(total_amount)}}
 */
export function evaluatePageExpression(
  text: string,
  app: AppDefinition,
  recordsMap: Record<string, RecordDefinition[]>
): string {
  if (!text || typeof text !== "string") return text;

  // Match anything inside {{ ... }}
  const regex = /\{\{([^}]+)\}\}/g;

  return text.replace(regex, (match, expr) => {
    const trimmed = expr.trim();

    // 1. Check for {{form.count}}
    const countMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\.count$/i);
    if (countMatch) {
      const formKey = countMatch[1];
      const form = findForm(formKey, app);
      if (form) {
        const count = (recordsMap[form.id] || []).length;
        return String(count);
      }
      return match;
    }

    // 2. Check for {{form.sum(field)}}
    const sumMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\.sum\(([a-zA-Z0-9_-]+)\)$/i);
    if (sumMatch) {
      const formKey = sumMatch[1];
      const fieldKey = sumMatch[2];
      const form = findForm(formKey, app);
      if (form) {
        const field = form.fields.find(
          (f) => f.id === fieldKey || f.linkName === fieldKey
        );
        const records = recordsMap[form.id] || [];
        let total = 0;
        for (const rec of records) {
          const val = field ? rec.data?.[field.id] : rec.data?.[fieldKey];
          if (val !== undefined && val !== null) {
            const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(num)) total += num;
          }
        }
        return total.toLocaleString("en-IN");
      }
      return match;
    }

    // 3. Check for {{form.avg(field)}}
    const avgMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\.avg\(([a-zA-Z0-9_-]+)\)$/i);
    if (avgMatch) {
      const formKey = avgMatch[1];
      const fieldKey = avgMatch[2];
      const form = findForm(formKey, app);
      if (form) {
        const field = form.fields.find(
          (f) => f.id === fieldKey || f.linkName === fieldKey
        );
        const records = recordsMap[form.id] || [];
        if (records.length === 0) return "0";
        let total = 0;
        let count = 0;
        for (const rec of records) {
          const val = field ? rec.data?.[field.id] : rec.data?.[fieldKey];
          if (val !== undefined && val !== null) {
            const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
            if (!isNaN(num)) {
              total += num;
              count++;
            }
          }
        }
        const avg = count > 0 ? total / count : 0;
        return (Math.round(avg * 100) / 100).toLocaleString("en-IN");
      }
      return match;
    }

    return match;
  });
}

/**
 * Finds a form by ID or linkName or lowercased name
 */
export function findForm(key: string, app: AppDefinition): FormDefinition | undefined {
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return app.forms.find((f) => {
    if (f.id === key || f.linkName === key) return true;
    const fNorm = f.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return fNorm === norm || f.linkName.replace(/[^a-z0-9]/g, "") === norm;
  });
}

export interface ChartDataPoint {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

/**
 * Computes aggregated chart data from form records
 */
export function computeChartData(
  formId: string,
  groupByFieldId: string,
  metric: "count" | "sum",
  measureFieldId: string | undefined,
  app: AppDefinition,
  recordsMap: Record<string, RecordDefinition[]>
): ChartDataPoint[] {
  const form = app.forms.find((f) => f.id === formId);
  if (!form) return [];

  const records = recordsMap[form.id] || [];
  if (records.length === 0) return [];

  const groupField = form.fields.find(
    (f) => f.id === groupByFieldId || f.linkName === groupByFieldId
  );
  const measureField = measureFieldId
    ? form.fields.find((f) => f.id === measureFieldId || f.linkName === measureFieldId)
    : undefined;

  const groups: Record<string, number> = {};

  for (const rec of records) {
    let groupKey = "Unspecified";

    if (groupField) {
      const raw = rec.data?.[groupField.id];
      if (raw !== undefined && raw !== null && raw !== "") {
        if (groupField.type === "lookup" && groupField.lookup) {
          const targetRecs = recordsMap[groupField.lookup.targetFormId] || [];
          groupKey = resolveLookupDisplay(raw, targetRecs, groupField.lookup.displayFieldId);
        } else {
          groupKey = String(raw);
        }
      }
    }

    let increment = 1;
    if (metric === "sum" && measureField) {
      const rawVal = rec.data?.[measureField.id];
      const num = parseFloat(String(rawVal).replace(/[^0-9.-]+/g, ""));
      increment = isNaN(num) ? 0 : num;
    }

    groups[groupKey] = (groups[groupKey] || 0) + increment;
  }

  const total = Object.values(groups).reduce((acc, v) => acc + v, 0);

  const points: ChartDataPoint[] = Object.entries(groups).map(([label, val], idx) => ({
    label,
    value: Math.round(val * 100) / 100,
    percentage: total > 0 ? Math.round((val / total) * 100) : 0,
    color: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  // Sort descending
  return points.sort((a, b) => b.value - a.value);
}
