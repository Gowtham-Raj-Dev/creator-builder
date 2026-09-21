/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppDefinition, FieldDefinition, FormDefinition, RecordDefinition, SubformColumn } from "@/types/schema";
import { generateId } from "@/lib/utils/idGenerator";
import { generateNextAutoNumber } from "@/lib/engine/autoNumberEngine";
import { askAi, extractJsonLoose } from "./claude";
import { evaluateRowFormula, coerceFormulaResult } from "@/lib/engine/formulaEngine";

/**
 * AI sample-data generator.
 * 1. Orders the selected forms so lookup targets are generated first.
 * 2. Asks the model for realistic rows keyed by link name; lookups are given as the
 *    target's display value (e.g. "Chennai"), subforms as arrays of rows.
 * 3. Resolves lookups against existing + newly generated records, applies autonumbers,
 *    and returns RecordDefinitions ready to insert (flagged isSample).
 */

const SKIP_TYPES = new Set(["section", "formula", "rollup", "autonumber", "signature", "file", "image"]);

function describeField(f: FieldDefinition | SubformColumn, app: AppDefinition, forms: FormDefinition[]): string | null {
  if (SKIP_TYPES.has(f.type)) return null;
  if ("formula" in f && f.formula?.expression) return null;
  let t: string = f.type;
  if (f.type === "lookup" && f.lookup) {
    const tf = forms.find((x) => x.id === f.lookup!.targetFormId);
    const disp = tf?.fields.find((x) => x.id === f.lookup!.displayFieldId);
    t = `lookup → give the "${disp?.label || "name"}" value of an existing/generated ${tf?.name || "record"}${f.lookup.multiple ? " (array)" : ""}`;
  } else if ((f.type === "dropdown" || f.type === "radio" || f.type === "multiselect") && f.options?.length) t = `${f.type}: one of ${JSON.stringify(f.options)}${f.type === "multiselect" ? " (array)" : ""}`;
  else if (f.type === "subform" && "subform" in f && f.subform) t = `subform: array of 1-5 rows with { ${f.subform.columns.map((c) => { const d = describeField(c, app, forms); return d ? `${c.linkName}: ${d}` : null; }).filter(Boolean).join("; ")} }`;
  else if (f.type === "date") t = "date YYYY-MM-DD (within the last 6 months)";
  else if (f.type === "datetime") t = "ISO datetime";
  else if (f.type === "currency") t = "number (INR)";
  else if (f.type === "checkbox") t = "boolean";
  else if (f.type === "users") t = "email of an app member";
  else if (f.type === "address") t = 'object {line1, city, state, pincode, country:"India"}';
  else if (f.type === "geolocation") t = "object {lat, lng} in India";
  else if (f.type === "rating") t = `integer 1-${("ratingMax" in f && f.ratingMax) || 5}`;
  else if (f.type === "percentage") t = "number 0-100";
  return t;
}

/** Topological order: forms whose lookups point to other selected forms come after them. */
export function orderFormsByDependency(forms: FormDefinition[]): FormDefinition[] {
  const ids = new Set(forms.map((f) => f.id));
  const deps = (f: FormDefinition) => {
    const out = new Set<string>();
    for (const fld of f.fields) {
      if (fld.type === "lookup" && fld.lookup && ids.has(fld.lookup.targetFormId) && fld.lookup.targetFormId !== f.id) out.add(fld.lookup.targetFormId);
      if (fld.type === "subform") for (const c of fld.subform?.columns || []) if (c.type === "lookup" && c.lookup && ids.has(c.lookup.targetFormId) && c.lookup.targetFormId !== f.id) out.add(c.lookup.targetFormId);
    }
    return out;
  };
  const done: FormDefinition[] = [];
  const seen = new Set<string>();
  const visit = (f: FormDefinition, stack: Set<string>) => {
    if (seen.has(f.id) || stack.has(f.id)) return;
    stack.add(f.id);
    for (const d of deps(f)) { const df = forms.find((x) => x.id === d); if (df) visit(df, stack); }
    stack.delete(f.id);
    seen.add(f.id);
    done.push(f);
  };
  forms.forEach((f) => visit(f, new Set()));
  return done;
}

export interface SampleGenResult { records: RecordDefinition[]; perForm: Record<string, number>; warnings: string[] }

export async function generateSampleData(
  app: AppDefinition,
  formIds: string[],
  countPerForm: number,
  existing: Record<string, RecordDefinition[]>,
  user: { email: string; name: string },
  onProgress?: (msg: string) => void
): Promise<SampleGenResult> {
  const forms = orderFormsByDependency(app.forms.filter((f) => formIds.includes(f.id)));
  const generated: Record<string, RecordDefinition[]> = {};
  const warnings: string[] = [];
  const now = new Date().toISOString();

  // Pool used for resolving lookups: existing records + generated so far
  const pool = (formId: string) => [...(existing[formId] || []).filter((r) => !r.deleted), ...(generated[formId] || [])];
  const resolveLookup = (fld: { lookup?: FieldDefinition["lookup"] }, value: any): any => {
    if (!fld.lookup) return value;
    const recs = pool(fld.lookup.targetFormId);
    const disp = fld.lookup.displayFieldId;
    const one = (v: any) => {
      if (v === undefined || v === null || v === "") return "";
      const sv = String(v).trim().toLowerCase();
      const hit = recs.find((r) => String(r.data?.[disp] ?? "").trim().toLowerCase() === sv) || recs.find((r) => r.id === v) || recs.find((r) => String(r.data?.[disp] ?? "").toLowerCase().includes(sv));
      return hit ? hit.id : recs.length ? recs[Math.floor(Math.random() * recs.length)].id : "";
    };
    if (fld.lookup.multiple) return (Array.isArray(value) ? value : [value]).map(one).filter(Boolean);
    return one(Array.isArray(value) ? value[0] : value);
  };

  for (const form of forms) {
    onProgress?.(`Generating ${countPerForm} ${form.name} records…`);
    const fieldDocs = form.fields.map((f) => { const d = describeField(f, app, app.forms); return d ? `  "${f.linkName}": ${d}${f.required ? " (required)" : ""}` : null; }).filter(Boolean).join("\n");
    // give the model the available lookup display values so it references real ones
    const lookupHints = form.fields.flatMap((f) => {
      const cols = f.type === "subform" ? (f.subform?.columns || []) : [f];
      return cols.filter((c) => c.type === "lookup" && c.lookup).map((c) => {
        const recs = pool(c.lookup!.targetFormId);
        const tf = app.forms.find((x) => x.id === c.lookup!.targetFormId);
        const vals = recs.map((r) => r.data?.[c.lookup!.displayFieldId]).filter((v) => v !== undefined && v !== "").slice(0, 40);
        return vals.length ? `${tf?.name || "?"} values available: ${JSON.stringify(vals)}` : `${tf?.name || "?"}: NO records exist yet — leave that field empty`;
      });
    });
    const system = `You generate realistic sample business data for an Indian SME app (Tamil Nadu / India names, cities, GST rates, INR amounts). Output ONLY a JSON array of ${countPerForm} objects. Keys are exactly the field keys given. Use varied, plausible values; keep dates within the last 6 months; unique names/codes; phone numbers 10 digits starting 6-9.`;
    const userMsg = `Form "${form.name}" fields:\n{\n${fieldDocs}\n}\n${lookupHints.length ? "\nLookup references:\n" + lookupHints.join("\n") : ""}\n\nReturn a JSON array of ${countPerForm} records.`;
    // Small batches keep each response well inside the output limit; a pause keeps free-tier RPM happy.
    const BATCH = 8;
    const rows: any[] = [];
    let batchNo = 0;
    while (rows.length < countPerForm) {
      const want = Math.min(BATCH, countPerForm - rows.length);
      if (batchNo > 0 || Object.keys(generated).length > 0) await new Promise((r) => setTimeout(r, 4000));
      onProgress?.(`Generating ${form.name} (${rows.length + want}/${countPerForm})…`);
      try {
        const text = await askAi(system.replace(`${countPerForm} objects`, `${want} objects`), userMsg.replace(`${countPerForm} records`, `${want} records${rows.length ? `, different from these already generated names: ${JSON.stringify(rows.slice(-8).map((r) => Object.values(r)[0]))}` : ""}`), undefined, 8000, { json: true });
        const parsed = extractJsonLoose(text);
        const got = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : [];
        if (!got.length) { warnings.push(`${form.name}: model returned no rows in batch ${batchNo + 1}`); break; }
        rows.push(...got);
      } catch (e: any) {
        warnings.push(`${form.name}: ${e?.message || "generation failed"}${rows.length ? ` (kept ${rows.length} rows)` : ""}`);
        break;
      }
      batchNo++;
    }
    if (!rows.length) continue;

    const recs: RecordDefinition[] = [];
    for (const row of rows.slice(0, countPerForm)) {
      const data: Record<string, any> = {};
      for (const f of form.fields) {
        if (f.type === "section" || f.type === "formula" || f.type === "rollup") continue;
        let v = row?.[f.linkName] ?? row?.[f.label] ?? row?.[f.id];
        if (f.type === "autonumber" && f.autonumber) { data[f.id] = generateNextAutoNumber(f.autonumber, [...pool(form.id), ...recs], f.id); continue; }
        if (v === undefined) { if (f.type === "checkbox") v = false; else if (f.type === "subform" || f.type === "multiselect" || (f.type === "lookup" && f.lookup?.multiple)) v = []; else continue; }
        if (f.type === "lookup") v = resolveLookup(f, v);
        else if (f.type === "subform" && f.subform) {
          v = (Array.isArray(v) ? v : []).map((r: any) => {
            const out: Record<string, any> = { id: generateId("row") };
            for (const c of f.subform!.columns) {
              let cv = r?.[c.linkName] ?? r?.[c.label] ?? r?.[c.id];
              if (c.type === "lookup") cv = resolveLookup(c, cv);
              if (cv === undefined) cv = c.defaultValue ?? "";
              out[c.id] = cv;
            }
            // row formulas
            for (const c of f.subform!.columns) if (c.formula?.expression) out[c.id] = coerceFormulaResult(evaluateRowFormula(c.formula.expression, out, f.subform!.columns, { forms: app.forms }), "number", c.formula.decimalPlaces ?? 2);
            return out;
          });
        } else if (["number", "currency", "decimal", "percentage", "rating"].includes(f.type)) v = Number(v) || 0;
        else if (f.type === "checkbox") v = Boolean(v);
        else if ((f.type === "dropdown" || f.type === "radio") && f.options?.length && !f.options.includes(v)) v = f.options[Math.floor(Math.random() * f.options.length)];
        data[f.id] = v;
      }
      recs.push({ id: generateId("rec"), appId: app.id, formId: form.id, data, createdAt: now, updatedAt: now, createdBy: user.email, createdByName: user.name, isSample: true });
    }
    generated[form.id] = recs;
  }

  const records = Object.values(generated).flat();
  const perForm: Record<string, number> = {};
  for (const [fid, r] of Object.entries(generated)) perForm[fid] = r.length;
  return { records, perForm, warnings };
}
