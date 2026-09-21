import { AppDefinition, FormDefinition, RecordDefinition, ReportFilter } from "@/types/schema";
import { recordMatchesFilters, aggregateValues, getRawValue, presetRange } from "@/lib/engine/reportEngine";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { askAi, nlQuery } from "./claude";

export interface DataAnswer {
  form: FormDefinition;
  question: string;
  count: number; // matching records
  total: number; // all records of the form
  aggregate?: { label: string; value: number; fieldLabel: string };
  groups?: Array<{ label: string; count: number; value?: number }>;
  filters: Array<{ label: string; operator: string; value: string }>;
  narrative: string; // plain-language answer
  sample: Array<Record<string, string>>; // first few matching rows (display values)
}

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Ask a question about the data: the model only turns the question into a query plan;
 * the numbers are computed here from the real records, then summarised in plain language.
 */
export async function answerDataQuestion(question: string, app: AppDefinition, loadRecords: (formId: string) => Promise<RecordDefinition[]>): Promise<DataAnswer> {
  const plan = await nlQuery(question, app);
  const form = app.forms.find((f) => f.id === plan.formId) || app.forms.find((f) => f.name.toLowerCase() === String(plan.formId || "").toLowerCase());
  if (!form) throw new Error("Could not tell which form the question is about. Name the form (e.g. 'Sales Invoice').");
  const all = (await loadRecords(form.id)).filter((r) => !r.deleted);
  // lookups need their target records for display / grouping
  const lookupTargets = new Set(form.fields.filter((f) => f.type === "lookup" && f.lookup?.targetFormId).map((f) => f.lookup!.targetFormId));
  const targetRecords: Record<string, RecordDefinition[]> = {};
  for (const id of lookupTargets) targetRecords[id] = (await loadRecords(id)).filter((r) => !r.deleted);
  const fieldOf = (ref: any) => form.fields.find((f) => f.id === ref || f.linkName === ref || f.label.toLowerCase() === String(ref || "").toLowerCase());
  const display = (r: RecordDefinition, fieldId: string): string => {
    const f = form.fields.find((x) => x.id === fieldId);
    const raw = r.data?.[fieldId];
    if (!f) return String(raw ?? "");
    if (f.type === "lookup" && f.lookup) return resolveLookupDisplay(raw, targetRecords[f.lookup.targetFormId] || [], f.lookup.displayFieldId) || "";
    if (f.type === "checkbox") return raw ? "Yes" : "No";
    if (raw === undefined || raw === null) return "";
    return Array.isArray(raw) ? raw.join(", ") : String(raw);
  };

  // normalise the model's filters onto real field ids; drop the ones it invented
  const filters: ReportFilter[] = (plan.filters || []).map((f: any) => ({ ...f, fieldId: fieldOf(f.fieldId)?.id || (["createdAt", "updatedAt", "createdBy"].includes(f.fieldId) ? f.fieldId : "") })).filter((f: ReportFilter) => f.fieldId && f.operator);
  const matching = filters.length ? all.filter((r) => recordMatchesFilters(r, filters, form)) : all;

  const aggField = plan.field ? fieldOf(plan.field) : undefined;
  const agg = plan.aggregate && plan.aggregate !== "count" && aggField ? { label: plan.aggregate, value: aggregateValues(matching.map((r) => getRawValue(r, aggField.id, form)), plan.aggregate as any), fieldLabel: aggField.label } : undefined;

  const groupField = plan.groupBy ? fieldOf(plan.groupBy) : undefined;
  let groups: DataAnswer["groups"];
  if (groupField) {
    const map = new Map<string, RecordDefinition[]>();
    for (const r of matching) { const k = display(r, groupField.id) || "(Blank)"; map.set(k, [...(map.get(k) || []), r]); }
    groups = Array.from(map.entries()).map(([label, recs]) => ({ label, count: recs.length, value: aggField ? aggregateValues(recs.map((r) => getRawValue(r, aggField.id, form)), (plan.aggregate as any) || "sum") : undefined })).sort((a, b) => (b.value ?? b.count) - (a.value ?? a.count)).slice(0, 15);
  }

  const filterDesc = filters.map((f) => { const fl = form.fields.find((x) => x.id === f.fieldId)?.label || f.fieldId; const v = f.operator === "date_preset" && f.preset ? `${f.preset.replace(/_/g, " ")} (${presetRange(f.preset).map((d) => d.toLocaleDateString("en-IN")).join(" → ")})` : f.value2 !== undefined ? `${f.value} – ${f.value2}` : String(f.value ?? ""); return { label: fl, operator: f.operator.replace(/_/g, " "), value: v }; });
  const titleId = form.titleFieldId || form.fields.find((f) => f.type === "autonumber")?.id || form.fields.find((f) => !["section", "subform"].includes(f.type))?.id || "";
  const showFields = [titleId, ...form.fields.filter((f) => !["section", "subform", "richtext", "file", "image", "signature"].includes(f.type) && f.id !== titleId).slice(0, 4).map((f) => f.id)].filter(Boolean);
  const sample = matching.slice(0, 5).map((r) => Object.fromEntries(showFields.map((id) => [form.fields.find((f) => f.id === id)?.label || id, display(r, id)])));

  // facts → short narrative (the model never invents numbers; it only phrases what we computed)
  const facts = [
    `Form: ${form.name}. Total records in the form: ${all.length}.`,
    filters.length ? `Filters applied: ${filterDesc.map((f) => `${f.label} ${f.operator} ${f.value}`).join("; ")}. Matching records: ${matching.length}.` : `No filters — all ${matching.length} records considered.`,
    agg ? `${agg.label} of ${agg.fieldLabel}: ${fmt(agg.value)}.` : "",
    groups?.length ? `By ${groupField!.label}: ${groups.map((g) => `${g.label} = ${g.value !== undefined ? fmt(g.value) : g.count}`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  let narrative = "";
  try {
    narrative = (await askAi("You answer a business user's question about their data. Use ONLY the facts given (never invent or change numbers). Reply in 2–4 plain sentences, Indian number formatting, no markdown, no headings.", `Question: ${question}\n\nFacts:\n${facts}`, undefined, 600)).trim();
  } catch { /* fall back to the deterministic summary */ }
  if (!narrative) narrative = agg ? `${agg.label === "sum" ? "Total" : agg.label} ${agg.fieldLabel} across ${matching.length} ${form.name} record${matching.length === 1 ? "" : "s"}${filters.length ? " matching your filters" : ""}: ${fmt(agg.value)}.` : `${matching.length} ${form.name} record${matching.length === 1 ? "" : "s"}${filters.length ? " match your filters" : " in total"}.`;

  return { form, question, count: matching.length, total: all.length, aggregate: agg, groups, filters: filterDesc, narrative, sample };
}
