import { AppDefinition, FieldDefinition, FormDefinition, PrintTemplate, RecordDefinition, PrintBlock, PrintDesign } from "@/types/schema";
import { resolveLookupDisplay } from "./lookupEngine";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";

/**
 * Print templates: plain HTML + CSS with {{placeholders}}.
 *   {{field_link}}                      value of a field (lookups resolved, currency/date formatted)
 *   {{field_link.raw}}                  unformatted value
 *   {{#items}} … {{col_link}} … {{/items}}   one copy per subform row (any subform link name works)
 *   {{items.count}} {{sum items.amount}}     row count / column total
 *   {{row.index}}                       1-based row number inside a loop
 *   {{app.name}} {{app.logo}} {{today}} {{now}} {{record.id}} {{record.createdAt}} {{user.name}} {{user.email}}
 *   {{words total}}                     amount in words (Indian numbering)
 *   {{#if field_link}} … {{/if}}        block shown only when the value is not blank
 */

export interface PrintContext {
  app: Pick<AppDefinition, "name" | "settings">;
  form: FormDefinition;
  record?: RecordDefinition | null;
  records?: RecordDefinition[]; // report print (several records)
  recordsMap: Record<string, RecordDefinition[]>;
  user?: { name?: string; email?: string } | null;
}

export interface PrintTag { tag: string; label: string; group: string; sample?: string }

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function displayFieldValue(field: FieldDefinition | { type: string; lookup?: any; currencySymbol?: string; decimalPlaces?: number }, raw: any, recordsMap: Record<string, RecordDefinition[]>): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (field.type === "lookup" && field.lookup) return resolveLookupDisplay(raw, recordsMap[field.lookup.targetFormId] || [], field.lookup.displayFieldId);
  if (field.type === "currency") return formatCurrency(Number(raw) || 0, field.currencySymbol || "₹", field.decimalPlaces ?? 2);
  if (field.type === "date") return formatDate(raw);
  if (field.type === "datetime") { const d = new Date(raw); return isNaN(d.getTime()) ? String(raw) : `${formatDate(raw)} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`; }
  if (field.type === "checkbox") return raw ? "Yes" : "No";
  if (field.type === "number" || field.type === "decimal") return Number(raw).toLocaleString("en-IN", { maximumFractionDigits: field.decimalPlaces ?? 2 });
  if (field.type === "percentage") return `${raw}%`;
  if (Array.isArray(raw)) return raw.join(", ");
  if (typeof raw === "object") return raw.url ? String(raw.name || raw.url) : JSON.stringify(raw);
  return String(raw);
}

/** Indian-style amount in words (₹ 1,23,456.50 → One Lakh Twenty Three Thousand …). */
export function amountInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? " " + ones[x % 10] : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  const whole = Math.floor(Math.abs(n)); const paise = Math.round((Math.abs(n) - whole) * 100);
  if (whole === 0 && paise === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(whole / 1e7), lakh = Math.floor((whole % 1e7) / 1e5), thousand = Math.floor((whole % 1e5) / 1000), rest = whole % 1000;
  if (crore) parts.push(`${three(crore)} Crore`); if (lakh) parts.push(`${two(lakh)} Lakh`); if (thousand) parts.push(`${two(thousand)} Thousand`); if (rest) parts.push(three(rest));
  let out = parts.join(" ");
  if (paise) out += `${out ? " and " : ""}${two(paise)} Paise`;
  return `${n < 0 ? "Minus " : ""}${out}`.trim();
}

/** Tags the designer can insert, grouped (form fields, each subform, system). */
export function printTagsFor(form: FormDefinition, record?: RecordDefinition | null, recordsMap: Record<string, RecordDefinition[]> = {}): PrintTag[] {
  const tags: PrintTag[] = [];
  for (const f of form.fields) {
    if (f.type === "section") continue;
    if (f.type === "subform") {
      tags.push({ tag: `{{#${f.linkName}}}\n  <tr><td>{{row.index}}</td>${(f.subform?.columns || []).map((c) => `<td>{{${c.linkName}}}</td>`).join("")}</tr>\n{{/${f.linkName}}}`, label: `Loop rows of ${f.label}`, group: `Subform: ${f.label}` });
      tags.push({ tag: `{{${f.linkName}.count}}`, label: `${f.label} row count`, group: `Subform: ${f.label}` });
      for (const c of f.subform?.columns || []) {
        tags.push({ tag: `{{${c.linkName}}}`, label: c.label, group: `Subform: ${f.label}`, sample: "(inside loop)" });
        if (["number", "currency", "decimal", "formula"].includes(c.type) || c.formula) tags.push({ tag: `{{sum ${f.linkName}.${c.linkName}}}`, label: `Total of ${c.label}`, group: `Subform: ${f.label}` });
      }
      continue;
    }
    tags.push({ tag: `{{${f.linkName}}}`, label: f.label, group: "Fields", sample: record ? displayFieldValue(f, record.data?.[f.id], recordsMap) : undefined });
    if (f.type === "lookup" && f.lookup) {
      tags.push({ tag: `{{${f.linkName}.<field>}}`, label: `${f.label} › field of the linked record (e.g. {{${f.linkName}.phone}})`, group: "Fields" });
    }
    if (f.type === "currency" || f.type === "formula") tags.push({ tag: `{{words ${f.linkName}}}`, label: `${f.label} in words`, group: "Fields" });
  }
  tags.push({ tag: "{{app.name}}", label: "App / company name", group: "System" }, { tag: "{{app.logo}}", label: "Logo <img> (if uploaded)", group: "System" }, { tag: "{{today}}", label: "Today's date", group: "System" }, { tag: "{{now}}", label: "Date & time", group: "System" }, { tag: "{{record.id}}", label: "Record id", group: "System" }, { tag: "{{record.createdAt}}", label: "Created on", group: "System" }, { tag: "{{user.name}}", label: "Printed by", group: "System" }, { tag: "{{#if field_link}}…{{/if}}", label: "Show block only when a field has a value", group: "System" });
  return tags;
}

function resolveValue(path: string, ctx: PrintContext, rec: RecordDefinition | null | undefined, scope: Record<string, any> | null, form: FormDefinition): string | undefined {
  const [head, ...rest] = path.split(".");
  if (head === "app") return rest[0] === "logo" ? (ctx.app.settings?.logo ? `<img src="${esc(ctx.app.settings.logo)}" alt="logo" style="max-height:64px">` : "") : rest[0] === "name" ? esc(ctx.app.name) : esc((ctx.app.settings as any)?.[rest[0]] ?? "");
  if (head === "today") return formatDate(new Date().toISOString());
  if (head === "now") return new Date().toLocaleString("en-IN");
  if (head === "user") return esc(rest[0] === "email" ? ctx.user?.email || "" : ctx.user?.name || ctx.user?.email || "");
  if (head === "record") return rec ? esc(rest[0] === "createdAt" ? formatDate(rec.createdAt) : rest[0] === "updatedAt" ? formatDate(rec.updatedAt) : rest[0] === "createdBy" ? rec.createdByName || rec.createdBy || "" : (rec as any)[rest[0]] ?? "") : "";
  if (head === "row" && scope) return rest[0] === "index" ? String(scope.__index ?? "") : esc(scope[rest[0]] ?? "");
  // subform column inside a loop
  if (scope) {
    const sub = form.fields.find((f) => f.type === "subform" && f.linkName === scope.__subform);
    const col = sub?.subform?.columns.find((c) => c.linkName === head || c.id === head);
    if (col) { const raw = scope[col.id] ?? scope[col.linkName]; return rest[0] === "raw" ? esc(raw ?? "") : esc(displayFieldValue(col as any, raw, ctx.recordsMap)); }
  }
  const field = form.fields.find((f) => f.linkName === head || f.id === head);
  if (!field || !rec) return undefined;
  const raw = rec.data?.[field.id];
  if (field.type === "subform" && rest[0] === "count") return String(Array.isArray(raw) ? raw.length : 0);
  if (rest[0] === "raw") return esc(raw ?? "");
  if (rest.length && field.type === "lookup" && field.lookup) {
    const target = ctx.recordsMap[field.lookup.targetFormId]?.find((r) => r.id === (Array.isArray(raw) ? raw[0] : raw));
    const tform = (ctx as any).forms?.find?.((f: FormDefinition) => f.id === field.lookup!.targetFormId) as FormDefinition | undefined;
    const tf = tform?.fields.find((f) => f.linkName === rest[0] || f.id === rest[0]);
    return target ? esc(tf ? displayFieldValue(tf, target.data?.[tf.id], ctx.recordsMap) : target.data?.[rest[0]] ?? "") : "";
  }
  return esc(displayFieldValue(field, raw, ctx.recordsMap));
}

/** Render a template body for one record (or a report of many). */
export function renderPrintTemplate(html: string, ctx: PrintContext & { forms?: FormDefinition[] }): string {
  const { form } = ctx;
  const rec = ctx.record;
  let out = html;
  // loops: {{#link}} … {{/link}} for every subform, plus {{#report_rows}} for reports
  for (const sf of form.fields.filter((f) => f.type === "subform")) {
    const re = new RegExp(`{{#${sf.linkName}}}([\\s\\S]*?){{/${sf.linkName}}}`, "g");
    out = out.replace(re, (_, body: string) => {
      const rows: any[] = rec && Array.isArray(rec.data?.[sf.id]) ? rec.data[sf.id] : [];
      if (!rows.length) return "";
      return rows.map((row, i) => renderBody(body, ctx, rec, { ...row, __index: i + 1, __subform: sf.linkName }, form)).join("");
    });
  }
  if (ctx.records && !rec) {
    out = out.replace(/{{#report_rows}}([\s\S]*?){{\/report_rows}}/g, (_, body: string) => ctx.records!.map((r, i) => renderBody(body, ctx, r, { __index: i + 1 }, form)).join(""));
    if (out.includes("{{#report_rows}}")) { // legacy single tag → auto table rows
      const cols = form.fields.filter((f) => !["subform", "section", "richtext", "file", "image", "signature"].includes(f.type));
      out = out.replace("{{#report_rows}}", ctx.records.map((r) => `<tr>${cols.map((c) => `<td>${esc(displayFieldValue(c, r.data?.[c.id], ctx.recordsMap))}</td>`).join("")}</tr>`).join(""));
    }
  }
  return renderBody(out, ctx, rec, null, form);
}

function renderBody(body: string, ctx: PrintContext & { forms?: FormDefinition[] }, rec: RecordDefinition | null | undefined, scope: Record<string, any> | null, form: FormDefinition): string {
  let out = body;
  // {{#if x}} … {{/if}}
  out = out.replace(/{{#if\s+([\w.]+)}}([\s\S]*?){{\/if}}/g, (_, path: string, inner: string) => (resolveValue(path, ctx, rec, scope, form) ? inner : ""));
  // {{sum items.amount}}
  out = out.replace(/{{sum\s+([\w]+)\.([\w]+)}}/g, (_, sub: string, col: string) => {
    const sf = form.fields.find((f) => f.type === "subform" && f.linkName === sub); const c = sf?.subform?.columns.find((x) => x.linkName === col || x.id === col);
    const rows: any[] = rec && sf && Array.isArray(rec.data?.[sf.id]) ? rec.data[sf.id] : [];
    const total = rows.reduce((s, r) => s + (Number(r[c?.id || col] ?? r[col]) || 0), 0);
    return c && c.type === "currency" ? formatCurrency(total, c.currencySymbol || "₹", c.decimalPlaces ?? 2) : total.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  });
  // {{words total}}
  out = out.replace(/{{words\s+([\w.]+)}}/g, (_, path: string) => { const f = form.fields.find((x) => x.linkName === path.split(".")[0]); const raw = f && rec ? rec.data?.[f.id] : undefined; return amountInWords(Number(raw) || 0); });
  // plain placeholders
  out = out.replace(/{{\s*([\w][\w.]*)\s*}}/g, (m, path: string) => { const v = resolveValue(path, ctx, rec, scope, form); return v === undefined ? m : v; });
  return out;
}

const PAPER: Record<NonNullable<PrintTemplate["paper"]>, string> = { A4: "210mm", A5: "148mm", Letter: "216mm", thermal80: "80mm" };

/** Complete printable HTML document for a template. */
export function buildPrintDocument(tpl: Pick<PrintTemplate, "html" | "css" | "paper" | "orientation">, ctx: PrintContext & { forms?: FormDefinition[] }, title = "Print"): string {
  const body = renderPrintTemplate(tpl.html, ctx);
  const width = PAPER[tpl.paper || "A4"];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: ${tpl.paper === "thermal80" ? "80mm auto" : `${tpl.paper || "A4"} ${tpl.orientation || "portrait"}`}; margin: ${tpl.paper === "thermal80" ? "4mm" : "12mm"}; }
  * { box-sizing: border-box; } body { margin: 0; font-family: Inter, "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: ${width}; max-width: 100%; margin: 0 auto; background: #fff; }
  table { border-collapse: collapse; width: 100%; } th, td { padding: 6px 8px; text-align: left; vertical-align: top; } .num { text-align: right; font-variant-numeric: tabular-nums; }
  ${tpl.css || ""}
</style></head><body><div class="page">${body}</div></body></html>`;
}

// ── Starter designs & snippets (single HTML with an embedded <style>) ────────

const BASE_CSS = `<style>
  .doc { padding: 6mm; color: #0f172a; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 20px; font-weight: 700; color: #2563eb; }
  .title { text-align: right; font-size: 18px; font-weight: 700; letter-spacing: .08em; }
  .title .sub { font-size: 11px; font-weight: 400; color: #64748b; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin: 10px 0; }
  .field { padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
  .field .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .field .value { display: block; font-size: 12px; font-weight: 600; margin-top: 2px; }
  .field.full { grid-column: 1 / -1; }
  .items { margin-top: 12px; }
  .items th { background: #eff6ff; border-bottom: 1px solid #bfdbfe; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #1e3a8a; }
  .items td { border-bottom: 1px solid #f1f5f9; } .items tr:nth-child(even) td { background: #f8fafc; }
  .totals { width: 46%; margin-left: auto; margin-top: 10px; } .totals td { padding: 4px 8px; }
  .totals .grand td { border-top: 2px solid #0f172a; font-weight: 700; font-size: 14px; }
  .words { margin-top: 8px; font-style: italic; color: #334155; }
  .foot { margin-top: 24px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .sign { margin-top: 36px; text-align: right; } .sign span { display: inline-block; border-top: 1px solid #0f172a; padding-top: 4px; min-width: 170px; font-size: 11px; }
</style>`;

const PRINTABLE = new Set(["text", "textarea", "richtext", "email", "phone", "url", "number", "decimal", "currency", "percentage", "date", "datetime", "time", "checkbox", "dropdown", "radio", "multiselect", "lookup", "autonumber", "formula", "rollup", "rating", "address", "geolocation", "barcode", "users", "color"]);

/** Labelled block for one field — what a click in the fields panel inserts. */
export function fieldBlockSnippet(f: FieldDefinition): string {
  if (f.type === "subform") return subformTableSnippet(f);
  const full = ["textarea", "richtext", "address"].includes(f.type) ? " full" : "";
  return `<div class="field${full}"><span class="label">${esc(f.label)}</span><span class="value">{{${f.linkName}}}</span></div>`;
}

/** Items table for a subform — header, loop rows and totals of numeric columns. */
export function subformTableSnippet(f: FieldDefinition): string {
  const cols = f.subform?.columns || [];
  const isNum = (c: { type: string; formula?: any }) => ["number", "currency", "decimal", "percentage"].includes(c.type) || Boolean(c.formula);
  const totals = cols.filter((c) => c.type === "currency" || (c.formula && c.type !== "number"));
  return `<table class="items">
  <thead><tr><th style="width:32px">#</th>${cols.map((c) => `<th${isNum(c) ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
  <tbody>
    {{#${f.linkName}}}<tr><td>{{row.index}}</td>${cols.map((c) => `<td${isNum(c) ? ' class="num"' : ""}>{{${c.linkName}}}</td>`).join("")}</tr>{{/${f.linkName}}}
  </tbody>
</table>${totals.length ? `
<table class="totals">${totals.map((c) => `<tr class="grand"><td>Total ${esc(c.label)}</td><td class="num">{{sum ${f.linkName}.${c.linkName}}}</td></tr>`).join("")}</table>` : ""}`;
}

/** A complete first design for a form: header, every field in a 2-column grid, items tables, footer. */
export function starterDesign(form: FormDefinition, appName: string, kind: "sheet" | "document" | "blank" = "document"): string {
  const head = `<div class="head">
    <div>{{app.logo}}<div class="brand">{{app.name}}</div></div>
    <div class="title">${esc(form.name).toUpperCase()}<div class="sub">${form.fields.find((f) => f.type === "autonumber") ? `No. {{${form.fields.find((f) => f.type === "autonumber")!.linkName}}} · ` : ""}{{today}}</div></div>
  </div>`;
  if (kind === "blank") return `${BASE_CSS}\n<div class="doc">\n  ${head}\n  <!-- click a field on the left to insert it here -->\n</div>`;
  const plain = form.fields.filter((f) => PRINTABLE.has(f.type));
  const subs = form.fields.filter((f) => f.type === "subform");
  const money = plain.filter((f) => f.type === "currency" && /total|grand|net|amount/i.test(f.label));
  const grid = `<div class="grid">\n    ${plain.map((f) => `  ${fieldBlockSnippet(f)}`).join("\n    ")}\n  </div>`;
  const tables = subs.map((s) => subformTableSnippet(s)).join("\n  ");
  const words = money.length ? `<div class="words">Amount in words: {{words ${money[money.length - 1].linkName}}}</div>` : "";
  return `${BASE_CSS}
<div class="doc">
  ${head}
  ${grid}
  ${tables}
  ${words}
  <div class="sign"><span>Authorised signatory</span></div>
  <div class="foot"><span>${esc(appName)}</span><span>Printed by {{user.name}} on {{now}}</span></div>
</div>`;
}

// ── Visual designer → HTML ───────────────────────────────────────────────────

const uid = () => `pb_${Math.random().toString(36).slice(2, 8)}`;

/** A sensible first design for a form: header, meta, fields, items tables, totals, notes, signature, footer. */
export function defaultDesign(form: FormDefinition): PrintDesign {
  const plain = form.fields.filter((f) => PRINTABLE.has(f.type));
  const subs = form.fields.filter((f) => f.type === "subform");
  const auto = plain.find((f) => f.type === "autonumber");
  const date = plain.find((f) => f.type === "date" || f.type === "datetime");
  const lookups = plain.filter((f) => f.type === "lookup");
  const money = plain.filter((f) => f.type === "currency" || (f.type === "formula" && f.formula?.resultType === "number"));
  const totalsRows = money.filter((f) => /total|grand|net|tax|gst|discount|round|balance|paid|received|due/i.test(f.label)).map((f) => ({ label: f.label, fieldId: f.id }));
  const grand = money.find((f) => /grand|net total|total amount/i.test(f.label)) || money[money.length - 1];
  const inTotals = new Set(totalsRows.map((r) => r.fieldId));
  const meta = [auto?.id, date?.id].filter(Boolean) as string[];
  const party = lookups[0];
  const rest = plain.filter((f) => !meta.includes(f.id) && !inTotals.has(f.id) && f.id !== party?.id && !["textarea", "richtext"].includes(f.type));
  const notes = plain.find((f) => ["textarea", "richtext"].includes(f.type));
  const blocks: PrintBlock[] = [
    { id: uid(), type: "header", title: form.name.toUpperCase(), showLogo: true, showAppName: true, metaFieldIds: meta },
    ...(party ? [{ id: uid(), type: "twoColumns" as const, left: { title: party.label, fieldIds: [party.id] }, right: { title: "Details", fieldIds: rest.slice(0, 4).map((f) => f.id) } }] : []),
    ...(rest.length > (party ? 4 : 0) ? [{ id: uid(), type: "fields" as const, fieldIds: rest.slice(party ? 4 : 0).map((f) => f.id), columns: 2 as const, style: "boxed" as const }] : []),
    ...subs.map((s) => ({ id: uid(), type: "items" as const, subformFieldId: s.id, columnIds: (s.subform?.columns || []).map((c) => c.id), showIndex: true, totalColumnIds: (s.subform?.columns || []).filter((c) => c.type === "currency" || (c.formula && c.type !== "number")).map((c) => c.id) })),
    ...(totalsRows.length ? [{ id: uid(), type: "totals" as const, rows: totalsRows, wordsFieldId: grand?.id }] : []),
    ...(notes ? [{ id: uid(), type: "notes" as const, title: notes.label, fieldId: notes.id }] : []),
    { id: uid(), type: "signature", labels: ["Receiver", "Authorised signatory"] },
    { id: uid(), type: "footer", text: "Thank you for your business", showPrintedBy: true },
  ];
  return { blocks, theme: { accent: "#2563eb", font: "sans", fontSize: 12, table: "striped", boxed: true } };
}

export const NEW_BLOCK: Record<PrintBlock["type"], (form: FormDefinition) => PrintBlock> = {
  header: (form) => ({ id: uid(), type: "header", title: form.name.toUpperCase(), showLogo: true, showAppName: true, metaFieldIds: [] }),
  fields: (form) => ({ id: uid(), type: "fields", fieldIds: form.fields.filter((f) => PRINTABLE.has(f.type)).slice(0, 4).map((f) => f.id), columns: 2, style: "boxed" }),
  twoColumns: () => ({ id: uid(), type: "twoColumns", left: { title: "Bill to", fieldIds: [] }, right: { title: "Details", fieldIds: [] } }),
  items: (form) => { const s = form.fields.find((f) => f.type === "subform"); return { id: uid(), type: "items", subformFieldId: s?.id || "", columnIds: (s?.subform?.columns || []).map((c) => c.id), showIndex: true, totalColumnIds: [] }; },
  totals: () => ({ id: uid(), type: "totals", rows: [] }),
  text: () => ({ id: uid(), type: "text", html: "<p>Your text here…</p>" }),
  notes: () => ({ id: uid(), type: "notes", title: "Terms & conditions", text: "Goods once sold will not be taken back." }),
  signature: () => ({ id: uid(), type: "signature", labels: ["Receiver", "Authorised signatory"] }),
  footer: () => ({ id: uid(), type: "footer", text: "Thank you for your business", showPrintedBy: true }),
  divider: () => ({ id: uid(), type: "divider" }),
  spacer: () => ({ id: uid(), type: "spacer", height: 16 }),
};

function themeCss(t: PrintDesign["theme"]): string {
  const accent = t.accent || "#2563eb";
  const font = t.font === "serif" ? "Georgia, 'Times New Roman', serif" : t.font === "mono" ? "'JetBrains Mono', Consolas, monospace" : "Inter, 'Segoe UI', Arial, sans-serif";
  const tbl = t.table === "grid" ? ".items td,.items th{border:1px solid #cbd5e1}" : t.table === "lines" ? ".items td{border-bottom:1px solid #e2e8f0}" : ".items td{border-bottom:1px solid #f1f5f9}.items tr:nth-child(even) td{background:#f8fafc}";
  const box = t.boxed === false ? ".field{border:none;background:none;padding:2px 0}" : "";
  return [
    "<style>",
    `.doc{padding:6mm;font-family:${font};font-size:${t.fontSize || 12}px;color:#0f172a}`,
    `.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${accent};padding-bottom:10px;margin-bottom:14px}`,
    `.brand{font-size:20px;font-weight:700;color:${accent}} .head img{max-height:56px;margin-bottom:4px;display:block}`,
    ".title{text-align:right;font-size:18px;font-weight:700;letter-spacing:.08em} .title .meta{font-size:11px;font-weight:400;color:#475569;margin-top:4px} .title .meta b{color:#0f172a}",
    `.sec{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${accent};font-weight:700;margin:12px 0 6px}`,
    ".grid{display:grid;gap:6px 14px;margin:6px 0} .g1{grid-template-columns:1fr} .g2{grid-template-columns:1fr 1fr} .g3{grid-template-columns:1fr 1fr 1fr}",
    ".field{padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc} .field .label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b} .field .value{display:block;font-weight:600;margin-top:2px} .field.full{grid-column:1/-1}",
    ".kv{width:100%} .kv td{padding:3px 6px;vertical-align:top} .kv td:first-child{color:#64748b;width:40%}",
    `.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0} .card{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px} .card .t{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${accent};font-weight:700;margin-bottom:4px} .card .v{font-weight:600} .card .l{font-size:10px;color:#64748b;margin-top:4px}`,
    `.items{margin-top:12px;width:100%;border-collapse:collapse} .items th{background:${accent}14;border-bottom:1px solid ${accent}55;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#1e293b;text-align:left;padding:6px 8px} .items td{padding:6px 8px} .num{text-align:right;font-variant-numeric:tabular-nums} ${tbl}`,
    ".totals{width:46%;margin-left:auto;margin-top:10px} .totals td{padding:4px 8px} .totals tr:last-child td{border-top:2px solid #0f172a;font-weight:700;font-size:14px}",
    ".words{margin-top:8px;font-style:italic;color:#334155}",
    `.notes{margin-top:12px;padding:8px 10px;border-left:3px solid ${accent};background:#f8fafc;font-size:11px;white-space:pre-wrap}`,
    ".signs{display:flex;justify-content:space-between;margin-top:40px} .signs span{display:inline-block;border-top:1px solid #0f172a;padding-top:4px;min-width:160px;font-size:11px;text-align:center}",
    ".foot{margin-top:24px;display:flex;justify-content:space-between;font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}",
    `.divider{border-top:1px solid #e2e8f0;margin:10px 0} .text{margin:6px 0} ${box}`,
    "</style>",
  ].join("\n");
}

/** Turn the block model into template HTML (with placeholders). */
export function renderDesign(design: PrintDesign, form: FormDefinition): string {
  const F = (id: string) => form.fields.find((f) => f.id === id);
  const fieldHtml = (id: string, plain = false) => { const f = F(id); if (!f) return ""; return plain ? `<tr><td>${esc(f.label)}</td><td><b>{{${f.linkName}}}</b></td></tr>` : fieldBlockSnippet(f); };
  const isNum = (c: { type: string; formula?: any }) => ["number", "currency", "decimal", "percentage"].includes(c.type) || Boolean(c.formula);
  const parts = design.blocks.map((b) => {
    switch (b.type) {
      case "header": {
        const meta = (b.metaFieldIds || []).map(F).filter(Boolean).map((f) => `<div><b>${esc(f!.label)}:</b> {{${f!.linkName}}}</div>`).join("");
        const brand = `<div>${b.showLogo ? "{{app.logo}}" : ""}${b.showAppName ? '<div class="brand">{{app.name}}</div>' : ""}</div>`;
        const title = `<div class="title">${esc(b.title)}<div class="meta">${meta}</div></div>`;
        return `<div class="head">${b.align === "right" ? title + brand : brand + title}</div>`;
      }
      case "fields": {
        const cols = b.columns || 2;
        const head = b.title ? `<div class="sec">${esc(b.title)}</div>` : "";
        if (b.style === "table") return `${head}<table class="kv">${b.fieldIds.map((id) => fieldHtml(id, true)).join("")}</table>`;
        return `${head}<div class="grid g${cols}">${b.fieldIds.map((id) => fieldHtml(id)).join("")}</div>`;
      }
      case "twoColumns": {
        const card = (c: { title?: string; fieldIds: string[] }) => `<div class="card">${c.title ? `<div class="t">${esc(c.title)}</div>` : ""}${c.fieldIds.map((id, i) => { const f = F(id); if (!f) return ""; return i === 0 ? `<div class="v">{{${f.linkName}}}</div>` : `<div class="l">${esc(f.label)}: {{${f.linkName}}}</div>`; }).join("")}</div>`;
        return `<div class="cols">${card(b.left)}${card(b.right)}</div>`;
      }
      case "items": {
        const sf = F(b.subformFieldId); if (!sf?.subform) return "";
        const cols = (sf.subform.columns || []).filter((c) => !b.columnIds || b.columnIds.includes(c.id));
        const totals = (sf.subform.columns || []).filter((c) => (b.totalColumnIds || []).includes(c.id));
        const idx = b.showIndex !== false;
        const table = `<table class="items"><thead><tr>${idx ? '<th style="width:32px">#</th>' : ""}${cols.map((c) => `<th${isNum(c) ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>{{#${sf.linkName}}}<tr>${idx ? "<td>{{row.index}}</td>" : ""}${cols.map((c) => `<td${isNum(c) ? ' class="num"' : ""}>{{${c.linkName}}}</td>`).join("")}</tr>{{/${sf.linkName}}}</tbody></table>`;
        const tot = totals.length ? `<table class="totals">${totals.map((c) => `<tr><td>Total ${esc(c.label)}</td><td class="num">{{sum ${sf.linkName}.${c.linkName}}}</td></tr>`).join("")}</table>` : "";
        return table + tot;
      }
      case "totals": {
        const rows = b.rows.map((r) => { const f = F(r.fieldId); return f ? `<tr><td>${esc(r.label || f.label)}</td><td class="num">{{${f.linkName}}}</td></tr>` : ""; }).join("");
        const wf = b.wordsFieldId ? F(b.wordsFieldId) : undefined;
        return `<table class="totals">${rows}</table>${wf ? `<div class="words">Amount in words: {{words ${wf.linkName}}}</div>` : ""}`;
      }
      case "text": return `<div class="text">${b.html}</div>`;
      case "notes": { const f = b.fieldId ? F(b.fieldId) : undefined; return `${b.title ? `<div class="sec">${esc(b.title)}</div>` : ""}<div class="notes">${f ? `{{${f.linkName}}}` : esc(b.text || "")}</div>`; }
      case "signature": return `<div class="signs">${b.labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`;
      case "footer": return `<div class="foot"><span>${esc(b.text || "")}</span><span>${b.showPrintedBy ? "Printed by {{user.name}} on {{now}}" : ""}</span></div>`;
      case "divider": return `<div class="divider"></div>`;
      case "spacer": return `<div style="height:${b.height || 16}px"></div>`;
      default: return "";
    }
  });
  return `${themeCss(design.theme)}\n<div class="doc">\n${parts.filter(Boolean).join("\n")}\n</div>`;
}
