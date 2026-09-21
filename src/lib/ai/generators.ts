import { AppDefinition, FieldDefinition, FormDefinition, ReportDefinition, ReportFilter, ReportType, WorkflowDefinition, WorkflowTriggerType } from "@/types/schema";
import { generateId } from "@/lib/utils/idGenerator";
import { generateUniqueLinkName, toLinkName } from "@/lib/utils/linkName";
import { checkScriptSyntax } from "@/lib/engine/scriptInterpreter";
import { SCRIPT_API_DOCS } from "@/lib/engine/workflowEngine";
import { REPORT_TYPES_PROMPT, REPORT_TYPE_IDS, defaultConfigFor } from "@/lib/engine/reportTypes";
import { askAi, extractJsonLoose, materialize, fixScriptWithAi } from "./claude";
import { resolveLinkedSubforms } from "@/lib/engine/subformLink";

const now = () => new Date().toISOString();

/** Resolve a field reference the model may have written as id, link name, label, or "Subform.Column". */
function fieldResolver(form: FormDefinition | undefined) {
  return (ref: any): string | undefined => {
    if (!form || ref === undefined || ref === null || ref === "") return undefined;
    const s = String(ref);
    if (["createdAt", "updatedAt", "createdBy"].includes(s)) return s;
    const [top, col] = s.split(".");
    const find = <T extends { id: string; linkName: string; label: string }>(list: T[], key: string): T | undefined => list.find((f) => f.id === key) || list.find((f) => f.linkName === key || f.linkName === toLinkName(key)) || list.find((f) => f.label.toLowerCase() === key.toLowerCase());
    const tf = find(form.fields, top);
    if (!tf) return undefined;
    if (col) { const c = tf.subform ? find(tf.subform.columns, col) : undefined; return c ? `${tf.id}.${c.id}` : undefined; }
    return tf.id;
  };
}

const CONFIG_DOC = `Report definition keys you may set (all optional): name, description, reportType (${REPORT_TYPE_IDS.join("|")}), columns:[{fieldId, visible, label?, width?, aggregate?}], defaultSortField, defaultSortOrder, filterGroups:[{logic:"AND|OR", filters:[{fieldId, operator, value, value2?, preset?}]}], quickFilterFieldIds, groupByFieldId, groupAggregates:[{fieldId, aggregate}], showRunningTotal, runningTotalFieldId, conditionalFormats:[{fieldId, operator, value, color:"rose|amber|emerald|blue|purple", applyTo:"cell|row"}], allowInlineEdit, pageSize,
kanban:{statusFieldId, titleFieldId?, cardFieldIds?}, calendar:{dateFieldId, endDateFieldId?, titleFieldId?}, pivot:{rowFieldId, columnFieldId?, valueFieldId?, aggregate}, grid:{titleFieldId?, subtitleFieldId?, imageFieldId?, cardFieldIds?},
chart:{chartType:"column|bar|stacked|line|area|pie|donut", groupFieldId ("createdAt" allowed), seriesFieldId?, valueFieldId?, aggregate, dateBucket?:"day|week|month|year", limit?},
ranking:{groupFieldId, valueFieldId?, aggregate, top?, order?:"desc|asc", targetValue?}, funnel:{stageFieldId, valueFieldId?, wonStages?:[option text]},
aging:{dateFieldId, amountFieldId, paidFieldId?, partyFieldId?, buckets?:[30,60,90], dueDays?}, tree:{parentFieldId (lookup to same form), titleFieldId?, detailFieldIds?},
list:{titleFieldId?, subtitleFieldId?, metaFieldIds?, badgeFieldId?, avatarFieldId?}, checklist:{doneFieldId (checkbox), titleFieldId?, dueFieldId?, assigneeFieldId?, hideDone?},
scheduler:{resourceFieldId, dateFieldId, endDateFieldId?, titleFieldId?, mode?:"week|month"}, gantt:{startFieldId, endFieldId?, titleFieldId?, groupFieldId?, progressFieldId?, colorFieldId?},
ledger:{primaryFormId, displayFieldIds, openingBalanceFieldId?, minLevelFieldId?, unitFieldId?, sources:[{label, formId, matchFieldId ("Subform.Column" path allowed), qtyFieldId, direction:"in|out", dateFieldId?, refFieldId?, filters?}]}.
Field references: use the field id; "SubformLabel.ColumnLabel" is accepted for subform paths. Operators: equals|not_equals|contains|greater_than|less_than|between|in|is_empty|is_not_empty|is_true|is_false|date_preset.
Report types and when to use them:\n${REPORT_TYPES_PROMPT}`;

/** Walk a report patch and map every *FieldId(s)/formId reference onto real ids. Unknown refs are dropped. */
function sanitizeReportPatch(patch: any, app: AppDefinition, form: FormDefinition): Partial<ReportDefinition> {
  const rid = fieldResolver(form);
  const out: any = {};
  const walk = (obj: any, ctxForm: FormDefinition): any => {
    if (Array.isArray(obj)) return obj.map((x) => walk(x, ctxForm)).filter((x) => x !== undefined);
    if (!obj || typeof obj !== "object") return obj;
    const res: any = {};
    let f = ctxForm;
    if (typeof obj.formId === "string") { const tf = app.forms.find((x) => x.id === obj.formId || x.linkName === obj.formId || x.name.toLowerCase() === String(obj.formId).toLowerCase()); if (tf) { res.formId = tf.id; f = tf; } }
    if (typeof obj.primaryFormId === "string") { const tf = app.forms.find((x) => x.id === obj.primaryFormId || x.name.toLowerCase() === String(obj.primaryFormId).toLowerCase()); if (tf) res.primaryFormId = tf.id; }
    const r = fieldResolver(f);
    for (const [k, v] of Object.entries(obj)) {
      if (k === "formId" || k === "primaryFormId") continue;
      if (/FieldIds$/.test(k)) res[k] = (Array.isArray(v) ? v : [v]).map(r).filter(Boolean);
      else if (/(FieldId|fieldId)$/.test(k) || k === "defaultSortField") { const id = r(v); if (id) res[k] = id; }
      else if (k === "wonStages" || k === "buckets") res[k] = v;
      else res[k] = walk(v, f);
    }
    return res;
  };
  const ALLOWED = ["name", "description", "reportType", "columns", "defaultSortField", "defaultSortOrder", "filterGroups", "quickFilterFieldIds", "groupByFieldId", "groupAggregates", "showRunningTotal", "runningTotalFieldId", "conditionalFormats", "allowInlineEdit", "pageSize", "showInMenu", "kanban", "calendar", "pivot", "grid", "chart", "ranking", "funnel", "aging", "tree", "list", "checklist", "scheduler", "gantt", "ledger"];
  for (const k of ALLOWED) if (patch[k] !== undefined) out[k] = walk(patch[k], form);
  if (out.reportType && !REPORT_TYPE_IDS.includes(out.reportType)) delete out.reportType;
  if (Array.isArray(out.columns)) {
    // model gives a list of columns (maybe partial): merge onto the form's fields, keep order given
    const given: any[] = out.columns.filter((c: any) => c && c.fieldId);
    const known = new Set(given.map((c) => c.fieldId));
    out.columns = [...given.map((c, i) => ({ fieldId: c.fieldId, label: c.label || form.fields.find((f) => f.id === c.fieldId)?.label || c.fieldId, visible: c.visible !== false, order: i, width: c.width, aggregate: c.aggregate })), ...form.fields.filter((f) => f.type !== "section" && !known.has(f.id)).map((f, i) => ({ fieldId: f.id, label: f.label, visible: false, order: given.length + i }))];
  }
  if (Array.isArray(out.filterGroups)) out.filterGroups = out.filterGroups.map((g: any) => ({ id: g.id || generateId("grp"), logic: g.logic === "OR" ? "OR" : "AND", filters: (g.filters || []).filter((x: any) => x.fieldId).map((x: any) => ({ id: x.id || generateId("flt"), ...x })) }));
  if (Array.isArray(out.conditionalFormats)) out.conditionalFormats = out.conditionalFormats.filter((c: any) => c.fieldId).map((c: any) => ({ id: c.id || generateId("cf"), applyTo: c.applyTo === "row" ? "row" : "cell", color: c.color || "rose", operator: c.operator || "equals", ...c }));
  if (out.ledger?.sources) out.ledger.sources = out.ledger.sources.filter((s: any) => s.formId && s.matchFieldId && s.qtyFieldId).map((s: any) => ({ id: s.id || generateId("src"), direction: s.direction === "out" ? "out" : "in", label: s.label || "Source", ...s }));
  void rid;
  return out;
}

// ── Edit an existing report from a prompt ────────────────────────────────────

export interface ReportPatchProposal { patch: Partial<ReportDefinition>; explanation: string; changedKeys: string[] }

export async function patchReportWithAi(report: ReportDefinition, prompt: string, app: AppDefinition): Promise<ReportPatchProposal> {
  const form = app.forms.find((f) => f.id === report.sourceFormId);
  if (!form) throw new Error("The report's source form no longer exists.");
  const { createdAt, updatedAt, id, linkName, ...current } = report; void createdAt; void updatedAt; void id; void linkName;
  const text = await askAi(
    `You edit an existing report of a low-code platform. Reply ONLY with JSON: {"patch":{…only the keys that must change…},"explanation":"one or two sentences"}.\n${CONFIG_DOC}\nRules: keep everything the user did not ask to change; when the user's problem is a wrong/missing configuration (e.g. ledger source not mapped to the subform column, kanban with no status field), fix that configuration. For ledger sources of a transaction with line items, matchFieldId and qtyFieldId must both be "Subform.Column" paths of the SAME subform. If the request needs a field that does not exist, say so in the explanation instead of inventing ids.`,
    `Current report (source form "${form.name}"):\n${JSON.stringify(current)}\n\nForms:\n${describeForms(app)}\n\nRequest: ${prompt}`,
    undefined,
    6000,
    { json: true }
  );
  const raw = extractJsonLoose(text);
  const patch = sanitizeReportPatch(raw.patch || raw, app, form);
  if (patch.reportType && patch.reportType !== report.reportType) Object.assign(patch, { ...defaultConfigFor(patch.reportType, { ...report, ...patch }, form), ...patch });
  const changedKeys = Object.keys(patch).filter((k) => JSON.stringify((report as any)[k]) !== JSON.stringify((patch as any)[k]));
  if (!changedKeys.length) throw new Error(raw.explanation ? `No change applied — ${raw.explanation}` : "The AI did not propose any change. Try a more specific request.");
  return { patch, explanation: raw.explanation || "", changedKeys };
}

// ── Edit an existing form from a prompt ──────────────────────────────────────

export interface FormPatchProposal { form: FormDefinition; explanation: string; summary: string[]; /** other existing forms changed (parent lookup added for a linked subform) */ updatedForms?: FormDefinition[] }

function buildField(rf: any, form: FormDefinition, app: AppDefinition, inSubform = false): FieldDefinition {
  const label = String(rf.label || "Field");
  const type = rf.type || "text";
  const f: FieldDefinition = { id: generateId(inSubform ? "col" : "field"), label, linkName: generateUniqueLinkName(label, form.fields.map((x) => x.linkName)), type, required: Boolean(rf.required), options: Array.isArray(rf.options) ? rf.options : undefined, placeholder: rf.placeholder, tooltip: rf.helpText || rf.tooltip, defaultValue: rf.defaultValue, decimalPlaces: ["number", "currency", "decimal", "percentage"].includes(type) ? 2 : undefined, currencySymbol: type === "currency" ? app.settings?.currencySymbol || "₹" : undefined };
  if (type === "section") f.section = { collapsible: true, columns: 2 };
  if (type === "autonumber") f.autonumber = { prefix: rf.prefix || label.slice(0, 3).toUpperCase() + "-", startNumber: 1, digits: 5, pattern: rf.pattern, resetEvery: rf.pattern?.includes("{YYYY}") ? "yearly" : "never" };
  if (type === "formula") { f.formula = { expression: String(rf.formula || ""), resultType: rf.resultType || "number", decimalPlaces: 2 }; f.readonly = true; }
  if (type === "rating") f.ratingMax = 5;
  if (type === "lookup") {
    const target = app.forms.find((x) => x.name.toLowerCase() === String(rf.lookupForm || "").toLowerCase() || x.id === rf.lookupForm || x.linkName === rf.lookupForm);
    if (target) f.lookup = { targetFormId: target.id, displayFieldId: target.titleFieldId || target.fields.find((x) => x.type === "text")?.id || target.fields.find((x) => !["section", "subform"].includes(x.type))?.id || "", valueFieldId: "id", relationshipType: "lookup", displayStyle: "dropdown", allowAddNew: true, autoFill: Array.isArray(rf.autoFill) ? rf.autoFill.map((a: any) => ({ sourceFieldId: fieldResolver(target)(a.from) || "", targetFieldId: fieldResolver(form)(a.to) || "" })).filter((a: any) => a.sourceFieldId && a.targetFieldId) : undefined };
    else f.type = "text";
  }
  if (type === "subform") {
    f.subform = { sourceType: "inline", columns: [], showTotals: true, allowBulkAdd: true, allowDuplicateRow: true, totalColumnIds: [] };
    if (rf.linkForm) { (f as any).__linkForm = String(rf.linkForm); (f as any).__linkCols = Array.isArray(rf.columns) ? rf.columns.map((c: any) => (typeof c === "string" ? c : c?.label)).filter(Boolean) : undefined; }
    const tmp: FormDefinition = { ...form, fields: [] };
    for (const rc of rf.linkForm ? [] : rf.columns || []) {
      const col = buildField(rc, tmp, app, true); tmp.fields.push(col);
      const c: any = { id: col.id, label: col.label, linkName: col.linkName, type: col.type, required: col.required, options: col.options, currencySymbol: col.currencySymbol, decimalPlaces: col.decimalPlaces, lookup: col.lookup, width: col.type === "lookup" ? 200 : 130 };
      if (col.type === "formula" || rc.formula) { c.formula = { expression: String(rc.formula || ""), resultType: "number", decimalPlaces: 2 }; c.readonly = true; if (c.type === "formula") c.type = "currency"; f.subform.totalColumnIds!.push(c.id); }
      f.subform.columns.push(c);
    }
  }
  return f;
}

export async function patchFormWithAi(form: FormDefinition, prompt: string, app: AppDefinition): Promise<FormPatchProposal> {
  const text = await askAi(
    `You edit an existing form of a low-code platform. Reply ONLY with JSON:
{"ops":[
  {"op":"add","field":{"label":"…","type":"…","required"?:true,"options"?:[…],"lookupForm"?:"<form name>","autoFill"?:[{"from":"<target field>","to":"<this form field>"}],"formula"?:"expr","pattern"?:"INV/{YYYY}/{0000}","columns"?:[…subform columns…],"linkForm"?:"<existing form name whose records become the subform rows>","placeholder"?:"…","helpText"?:"…","defaultValue"?:…},"after":"<field id or null for top>"},
  {"op":"update","fieldId":"<id>","patch":{"label"?,"required"?,"options"?,"placeholder"?,"tooltip"?,"defaultValue"?,"readonly"?,"hidden"?,"width"?:"full|half|third|two_thirds","formula"?:"expr","visibilityRule"?:"expr","validation"?:{"requiredIf"?:"expr","rules"?:[{"expression":"…","message":"…"}]},"optionColors"?:{"Paid":"#16a34a"},"unique"?:true,"min"?,"max"?}},
  {"op":"remove","fieldId":"<id>"},
  {"op":"move","fieldId":"<id>","after":"<field id or null>"}
],"formPatch":{"name"?,"description"?,"columns"?:1|2|3,"titleFieldId"?},"explanation":"…"}
Types: text, textarea, richtext, email, phone, url, number, decimal, currency, percentage, rating, dropdown, radio, checkbox, multiselect, date, datetime, time, lookup, subform, users, formula, rollup, autonumber, file, image, signature, address, geolocation, barcode, color, section.
Formulas/rules use snake_case link names (Unit Price → unit_price; subform sums: sum(items.amount)). Use field ids exactly as listed. Only do what is asked; do not remove fields unless asked.`,
    `Form to edit: ${form.name} [id ${form.id}]\n\nAll forms:\n${describeForms(app)}\n\nRequest: ${prompt}`,
    undefined,
    6000,
    { json: true }
  );
  const raw = extractJsonLoose(text);
  const next: FormDefinition = { ...form, fields: [...form.fields] };
  const resolve = fieldResolver(next);
  const summary: string[] = [];
  const insertAfter = (field: FieldDefinition, after: any) => {
    const idx = after ? next.fields.findIndex((f) => f.id === resolve(after)) : -1;
    next.fields.splice(idx >= 0 ? idx + 1 : after ? next.fields.length : 0, 0, field);
  };
  for (const op of raw.ops || []) {
    if (op.op === "add" && op.field) { const f = buildField(op.field, next, app); insertAfter(f, op.after); summary.push(`Added ${f.label} (${f.type})`); }
    else if (op.op === "update") { const id = resolve(op.fieldId); const i = next.fields.findIndex((f) => f.id === id); if (i < 0) continue; const p = op.patch || {}; const cur = next.fields[i]; const upd: FieldDefinition = { ...cur, ...p, formula: p.formula !== undefined ? { ...(cur.formula || { resultType: "number", decimalPlaces: 2 }), expression: String(p.formula) } : cur.formula, validation: p.validation ? { ...(cur.validation || {}), ...p.validation, rules: p.validation.rules?.map((r: any) => ({ id: r.id || generateId("rule"), expression: r.expression, message: r.message })) || cur.validation?.rules } : cur.validation }; if (p.formula !== undefined && upd.type !== "formula") upd.readonly = true; next.fields[i] = upd; summary.push(`Updated ${cur.label}: ${Object.keys(p).join(", ")}`); }
    else if (op.op === "remove") { const id = resolve(op.fieldId); const f = next.fields.find((x) => x.id === id); if (f) { next.fields = next.fields.filter((x) => x.id !== id); summary.push(`Removed ${f.label}`); } }
    else if (op.op === "move") { const id = resolve(op.fieldId); const f = next.fields.find((x) => x.id === id); if (f) { next.fields = next.fields.filter((x) => x.id !== id); insertAfter(f, op.after); summary.push(`Moved ${f.label}`); } }
  }
  if (raw.formPatch) { const fp = raw.formPatch; if (fp.name) next.name = String(fp.name); if (fp.description !== undefined) next.description = String(fp.description); if ([1, 2, 3].includes(fp.columns)) next.columns = fp.columns; if (fp.titleFieldId) next.titleFieldId = resolve(fp.titleFieldId); if (Object.keys(fp).length) summary.push(`Form settings: ${Object.keys(fp).join(", ")}`); }
  if (!summary.length) throw new Error(raw.explanation ? `No change applied — ${raw.explanation}` : "The AI did not propose any change. Try naming the field(s) to change.");
  // subforms backed by an existing form: configure columns + add the parent lookup to the child form
  const linked = resolveLinkedSubforms(app.forms.map((f) => (f.id === next.id ? next : f)), new Set<string>());
  const finalForm = linked.forms.find((f) => f.id === next.id) || next;
  return { form: { ...finalForm, updatedAt: now() }, explanation: raw.explanation || "", summary, updatedForms: linked.updatedExisting.filter((f) => f.id !== next.id) };
}

/** Compact schema description with ids, so the model can reference fields precisely. */
function describeForms(app: AppDefinition, only?: string[]): string {
  return app.forms
    .filter((f) => !only || only.includes(f.id))
    .map((f) => `${f.name} [id ${f.id}, link ${f.linkName}]:\n` + f.fields.filter((x) => x.type !== "section").map((x) => `  - ${x.label} [id ${x.id}, link ${x.linkName}, ${x.type}${x.options ? ", options: " + x.options.join("|") : ""}${x.lookup ? ", lookup→" + (app.forms.find((t) => t.id === x.lookup!.targetFormId)?.name || "?") : ""}${x.subform ? ", subform cols: " + x.subform.columns.map((c) => `${c.label}[${c.id}, ${c.linkName}, ${c.type}]`).join(", ") : ""}]`).join("\n"))
    .join("\n\n");
}

// ── New report from prompt ───────────────────────────────────────────────────

export interface ReportProposal { report: ReportDefinition; explanation: string }

export async function generateReportFromPrompt(prompt: string, app: AppDefinition, preferredFormId?: string): Promise<ReportProposal> {
  const text = await askAi(
    `You design reports for a low-code platform. Reply ONLY with JSON: {"formId":"<source form id>", "explanation":"one sentence", …report keys…}.\n${CONFIG_DOC}\nRules: use field ids exactly as given; for checkbox fields use operator is_true / is_false; for dropdowns use equals with the option text; "columns" lists the visible columns in order. Pick the report type that best fits the request and ALWAYS include that type's config object (e.g. reportType "aging" → "aging":{…}, "ledger" → "ledger":{…} with sources mapped to subform paths like "Items.Product" / "Items.Quantity").`,
    `Forms:\n${describeForms(app)}\n\n${preferredFormId ? `Preferred source form id: ${preferredFormId}\n` : ""}Request: ${prompt}`,
    undefined,
    5000,
    { json: true }
  );
  const raw = extractJsonLoose(text);
  const form = app.forms.find((f) => f.id === raw.formId || f.name.toLowerCase() === String(raw.formId || "").toLowerCase()) || app.forms.find((f) => f.id === preferredFormId);
  if (!form) throw new Error("The AI did not pick a valid source form.");
  // legacy flat keys from older prompts
  if (raw.kanbanStatusFieldId && !raw.kanban) raw.kanban = { statusFieldId: raw.kanbanStatusFieldId };
  if (raw.calendarDateFieldId && !raw.calendar) raw.calendar = { dateFieldId: raw.calendarDateFieldId };
  if (Array.isArray(raw.filters) && !raw.filterGroups) raw.filterGroups = [{ logic: "AND", filters: raw.filters }];
  if (Array.isArray(raw.columns) && raw.columns.length && typeof raw.columns[0] === "string") raw.columns = raw.columns.map((c: string) => ({ fieldId: c, visible: true }));
  if (raw.sortFieldId && !raw.defaultSortField) raw.defaultSortField = raw.sortFieldId;
  if (raw.sortOrder && !raw.defaultSortOrder) raw.defaultSortOrder = raw.sortOrder;
  const patch = sanitizeReportPatch(raw, app, form);
  const type: ReportType = patch.reportType || "table";
  const name = String(patch.name || raw.name || `${form.name} Report`);
  const base: ReportDefinition = {
    id: generateId("rep"),
    name,
    linkName: generateUniqueLinkName(name, app.reports.map((r) => r.linkName)),
    description: patch.description || raw.explanation || "",
    sourceFormId: form.id,
    reportType: type,
    columns: form.fields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: f.type !== "subform", order: i })),
    filterGroups: [],
    defaultSortOrder: "desc",
    pageSize: 15,
    allowBulkActions: true,
    allowExport: true,
    allowPrint: true,
    showInMenu: true,
    createdAt: now(),
    updatedAt: now(),
  };
  const report: ReportDefinition = { ...base, ...defaultConfigFor(type, { ...base, ...patch }, form), ...patch, name, id: base.id, linkName: base.linkName, sourceFormId: form.id };
  return { report, explanation: raw.explanation || "" };
}

// ── New single form from prompt ──────────────────────────────────────────────

export interface FormProposal { form: FormDefinition; report: ReportDefinition; explanation: string; /** other forms that were created alongside (e.g. a child "Items" form) */ extraForms?: FormDefinition[]; extraReports?: ReportDefinition[]; /** existing forms changed (parent lookup added) */ updatedForms?: FormDefinition[] }

export async function generateFormFromPrompt(prompt: string, app: AppDefinition): Promise<FormProposal> {
  const text = await askAi(
    `You design ONE form for a low-code platform (plus a child form when line items must be a separate form). Reply ONLY with JSON: {"forms":[{ "name":"…","description":"…","columns":2,"fields":[…] }],"explanation":"…"}.
Field objects: { "label", "type", "required"?, "options"?: [...], "lookupForm"?: "<existing form name>", "autoFill"?: [{"from":"<target field label>","to":"<this form field label>"}], "columns"?: [subform column fields], "formula"?: "expr", "pattern"?: "INV/{YYYY}/{0000}" }.
Subform as a separate form: { "label": "Items", "type": "subform", "linkForm": "<child form name>", "columns": ["Product","Quantity","Rate","Amount"] } — put the child form FIRST in "forms" (or reference an existing form). Rows are then saved as records of that form, linked to the parent automatically.
Types: text, textarea, richtext, email, phone, url, number, decimal, currency, percentage, rating, dropdown, radio, checkbox, multiselect, date, datetime, time, lookup, subform, users, formula, rollup, autonumber, file, image, signature, address, geolocation, barcode, color, section.
Use "section" fields to group. Lookups MUST reference an existing form by its exact name. Formulas use snake_case link names of labels (Unit Price → unit_price); subform sums: sum(items.amount). Only output the single requested form.`,
    `Existing forms (for lookups):\n${describeForms(app)}\n\nCreate this form: ${prompt}`,
    undefined,
    6000,
    { json: true }
  );
  const raw = extractJsonLoose(text);
  const gen = materialize({ forms: (raw.forms || []).slice(0, 3) }, app);
  if (!gen.forms.length) throw new Error("The AI returned no form (maybe the name already exists). Try a different name.");
  // the "main" form is the one that links to the others (parent), else the last one listed
  const main = gen.forms.find((f) => f.fields.some((x) => x.type === "subform" && x.subform?.sourceType === "existing_form")) || gen.forms[gen.forms.length - 1];
  const extraForms = gen.forms.filter((f) => f.id !== main.id);
  return { form: main, report: gen.reports.find((r) => r.sourceFormId === main.id) || gen.reports[0], extraForms, extraReports: gen.reports.filter((r) => r.sourceFormId !== main.id), updatedForms: gen.updatedForms, explanation: raw.explanation || "" };
}

// ── New workflow (or lookup filter) from prompt ──────────────────────────────

export type WorkflowProposal =
  | { kind: "workflow"; workflow: WorkflowDefinition; explanation: string }
  | { kind: "lookup_filter"; targetFormId: string; filters: ReportFilter[]; affected: Array<{ formId: string; fieldId: string; columnId?: string; label: string }>; explanation: string };

export async function generateWorkflowFromPrompt(prompt: string, app: AppDefinition, formId: string): Promise<WorkflowProposal> {
  const form = app.forms.find((f) => f.id === formId);
  if (!form) throw new Error("Select a form first.");
  const text = await askAi(
    `You automate a low-code app. Decide what the request needs and reply ONLY with JSON, one of:
A) {"kind":"workflow","name":"…","description":"…","trigger":{"type":"onLoad|onEdit|onUserInput|onValidate|onSubmit|onSuccess|onDelete","fieldId":"<field id or subformFieldId.columnId, only for onUserInput>"},"script":"<JavaScript>","explanation":"…"}
B) {"kind":"lookup_filter","targetFormId":"<form id whose records must be hidden in lookups>","filters":[{"fieldId":"<field id in that form>","operator":"is_true|is_false|equals|not_equals|is_not_empty","value":"…"}],"explanation":"…"}
Use B when the request is about which records should be selectable/visible in lookup dropdowns (e.g. "inactive states must not appear when choosing a state"). Use A for calculations, validations, popups, stock updates, notifications, cross-form inserts.
Scripts MUST be plain JavaScript (NOT Deluge): const/let, if/else, for (const row of input.items) {…}, template strings. Fields: input.<link_name>; subform rows: row.<column_link>; other records: get("form_link", id) / fetch("form_link", {field: value}); block: showError("…") / setError("field", "…"); ask: confirm("…"); after-save data: insert/update/increment/remove.
Host API: ${SCRIPT_API_DOCS.map((d) => d.sig).join("; ")}.
Triggers: onUserInput for live reactions while typing (set fieldId when it concerns one field), onValidate/onSubmit before save, onSuccess after save (data changes), onLoad for defaults.`,
    `Target form: ${form.name} [id ${form.id}, link ${form.linkName}]\n\nAll forms:\n${describeForms(app)}\n\nRequest: ${prompt}`,
    undefined,
    4000,
    { json: true }
  );
  const raw = extractJsonLoose(text);

  if (raw.kind === "lookup_filter") {
    const target = app.forms.find((f) => f.id === raw.targetFormId) || form;
    const fid = (id: any) => (target.fields.some((f) => f.id === id) ? id : target.fields.find((f) => f.linkName === id || f.label === id)?.id);
    const filters: ReportFilter[] = (raw.filters || []).map((f: any) => ({ id: generateId("flt"), fieldId: fid(f.fieldId), operator: f.operator || "equals", value: f.value })).filter((f: ReportFilter) => f.fieldId);
    if (!filters.length) throw new Error("The AI could not map the filter to a field. Try naming the field (e.g. 'Active checkbox').");
    const affected: Array<{ formId: string; fieldId: string; columnId?: string; label: string }> = [];
    for (const f of app.forms) for (const fld of f.fields) {
      if (fld.type === "lookup" && fld.lookup?.targetFormId === target.id) affected.push({ formId: f.id, fieldId: fld.id, label: `${f.name} › ${fld.label}` });
      if (fld.type === "subform") for (const c of fld.subform?.columns || []) if (c.type === "lookup" && c.lookup?.targetFormId === target.id) affected.push({ formId: f.id, fieldId: fld.id, columnId: c.id, label: `${f.name} › ${fld.label} › ${c.label}` });
    }
    return { kind: "lookup_filter", targetFormId: target.id, filters, affected, explanation: raw.explanation || `Only ${target.name} records matching the filter will be selectable.` };
  }

  let script = String(raw.script || "");
  const chk = checkScriptSyntax(script);
  if (!chk.ok) script = await fixScriptWithAi(script, chk.error || "syntax error", form, app);
  const triggerType = (["onLoad", "onEdit", "onUserInput", "onValidate", "onSubmit", "onSuccess", "onDelete"].includes(raw.trigger?.type) ? raw.trigger.type : "onUserInput") as WorkflowTriggerType;
  let triggerField: string | undefined = raw.trigger?.fieldId || undefined;
  if (triggerField) {
    const [top, col] = String(triggerField).split(".");
    const tf = form.fields.find((f) => f.id === top || f.linkName === top || f.label === top);
    if (!tf) triggerField = undefined;
    else if (col) { const c = tf.subform?.columns.find((x) => x.id === col || x.linkName === col || x.label === col); triggerField = c ? `${tf.id}.${c.id}` : tf.id; }
    else triggerField = tf.id;
  }
  const workflow: WorkflowDefinition = { id: generateId("wf"), name: raw.name || "AI workflow", description: raw.description || raw.explanation || "", formId: form.id, mode: "code", codeScript: script, trigger: { type: triggerType, fieldId: triggerType === "onUserInput" ? triggerField : undefined }, actions: [], active: true, version: 1, createdAt: now(), updatedAt: now() };
  return { kind: "workflow", workflow, explanation: raw.explanation || "" };
}

// ── Cleanup: describe what to remove ─────────────────────────────────────────

export interface CleanupItem { kind: "form" | "report" | "workflow"; id: string; name: string; reason: string }
export interface CleanupProposal { items: CleanupItem[]; explanation: string }

/** Deterministic duplicate candidates so the model has facts to work from (same form + type + filters + columns, or same name). */
function duplicateReportGroups(app: AppDefinition): string[] {
  const sig = (r: ReportDefinition) => JSON.stringify({ f: r.sourceFormId, t: r.reportType || "table", g: r.groupByFieldId || "", flt: (r.filterGroups || []).map((g) => g.filters.map((x) => [x.fieldId, x.operator, x.value ?? "", x.preset ?? ""])), cols: r.columns.filter((c) => c.visible !== false).map((c) => c.fieldId).sort() });
  const groups = new Map<string, ReportDefinition[]>();
  for (const r of app.reports) groups.set(sig(r), [...(groups.get(sig(r)) || []), r]);
  const byName = new Map<string, ReportDefinition[]>();
  for (const r of app.reports) { const k = r.name.trim().toLowerCase().replace(/\s*\(\d+\)$|\s*copy$/i, ""); byName.set(k, [...(byName.get(k) || []), r]); }
  const out: string[] = [];
  for (const list of groups.values()) if (list.length > 1) out.push(`identical config: ${list.map((r) => `${r.name} [${r.id}, created ${r.createdAt.slice(0, 10)}]`).join(" | ")}`);
  for (const list of byName.values()) if (list.length > 1) out.push(`same name: ${list.map((r) => `${r.name} [${r.id}, ${r.reportType || "table"}, created ${r.createdAt.slice(0, 10)}]`).join(" | ")}`);
  return out;
}

export async function planCleanup(prompt: string, app: AppDefinition): Promise<CleanupProposal> {
  const reports = app.reports.map((r) => `- ${r.name} [id ${r.id}] form=${app.forms.find((f) => f.id === r.sourceFormId)?.name || "?"} type=${r.reportType || "table"} filters=${(r.filterGroups || []).reduce((n, g) => n + g.filters.length, 0)} showInMenu=${r.showInMenu !== false} created=${r.createdAt.slice(0, 10)}`).join("\n");
  const forms = app.forms.map((f) => `- ${f.name} [id ${f.id}] fields=${f.fields.filter((x) => x.type !== "section").length} reports=${app.reports.filter((r) => r.sourceFormId === f.id).length} workflows=${app.workflows.filter((w) => w.formId === f.id).length}`).join("\n");
  const workflows = app.workflows.map((w) => `- ${w.name} [id ${w.id}] form=${app.forms.find((f) => f.id === w.formId)?.name || "?"} trigger=${w.trigger.type} active=${w.active}`).join("\n");
  const dupes = duplicateReportGroups(app);
  const text = await askAi(
    `You help clean up a low-code app. The user describes what to remove; you reply ONLY with JSON: {"items":[{"kind":"report|form|workflow","id":"<id>","reason":"…"}],"explanation":"…"}.
Rules: be conservative — only include things the request clearly covers. For duplicates keep the OLDEST (first created) or the one shown in the menu and remove the others. Never remove a form that other forms depend on unless the user names it explicitly. Use ids exactly as listed.`,
    `Reports:\n${reports || "(none)"}\n\nForms:\n${forms}\n\nWorkflows:\n${workflows || "(none)"}\n\nDetected duplicate reports:\n${dupes.length ? dupes.join("\n") : "(none)"}\n\nRequest: ${prompt}`,
    undefined, 3000, { json: true }
  );
  const raw = extractJsonLoose(text);
  const items: CleanupItem[] = (raw.items || []).map((it: any) => {
    const kind = it.kind as CleanupItem["kind"];
    const name = kind === "report" ? app.reports.find((r) => r.id === it.id)?.name : kind === "form" ? app.forms.find((f) => f.id === it.id)?.name : app.workflows.find((w) => w.id === it.id)?.name;
    return name ? { kind, id: String(it.id), name, reason: String(it.reason || "") } : null;
  }).filter(Boolean);
  if (!items.length) throw new Error(raw.explanation ? `Nothing to remove — ${raw.explanation}` : "The AI found nothing matching that description.");
  return { items, explanation: raw.explanation || "" };
}

// ── Print design from a prompt ───────────────────────────────────────────────

export interface PrintDesignProposal { html: string; css: string; explanation: string }

/** Generates an attractive print layout (HTML + CSS) that uses only this form's placeholders. */
export async function generatePrintDesign(prompt: string, form: FormDefinition, app: AppDefinition, current?: { html: string; css?: string }): Promise<PrintDesignProposal> {
  const fields = form.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => `{{${f.linkName}}} = ${f.label} (${f.type})${f.type === "lookup" ? `; linked-record fields: ${(app.forms.find((t) => t.id === f.lookup?.targetFormId)?.fields || []).filter((x) => !["section", "subform"].includes(x.type)).slice(0, 8).map((x) => `{{${f.linkName}.${x.linkName}}} = ${x.label}`).join(", ")}` : ""}`).join("\n");
  const subs = form.fields.filter((f) => f.type === "subform").map((f) => `Subform "${f.label}": loop {{#${f.linkName}}} … {{/${f.linkName}}} with columns ${(f.subform?.columns || []).map((c) => `{{${c.linkName}}} = ${c.label} (${c.type})`).join(", ")}; totals {{sum ${f.linkName}.<column>}}; count {{${f.linkName}.count}}; {{row.index}} = serial number`).join("\n");
  const rules = [
    "Use ONLY these placeholders (never invent field names): form fields, subform loops, and system tags {{app.name}}, {{app.logo}}, {{today}}, {{now}}, {{record.id}}, {{user.name}}, {{words <currency_field>}} (amount in words), {{#if <field>}}…{{/if}}.",
    "Output the BODY markup only inside a <div class=\"doc\"> (no <html>/<head>/<body>/<script>), with all styling in \"css\" (classes, not inline <style> tags).",
    "Page is A4 unless told otherwise; base font 12px; clean professional layout: header band with app name/logo and document title, two-column party/meta blocks, a striped items table with right-aligned numbers (class \"num\"), totals block on the right, amount in words, notes/terms, signature area, footer. Subtle brand colour #2563eb (or the colour the user asks for), thin borders, good spacing. Colours must survive printing (solid backgrounds, light tints only).",
    "Put the subform loop INSIDE <tbody> of the items table. Use {{sum items.amount}}-style tags for totals when a column is numeric.",
    "Keep it self-contained and print-safe (no external fonts/images except {{app.logo}}).",
  ].map((r) => `- ${r}`).join("\n");
  const text = await askAi(
    `You design print documents (invoice, receipt, delivery challan, quotation, report sheet…) for a low-code platform. Reply ONLY with JSON: {"html":"…","css":"…","explanation":"one sentence"}.\nRules:\n${rules}`,
    `App: ${app.name}\nForm: ${form.name} [link ${form.linkName}]\nFields:\n${fields}\n${subs ? `\n${subs}\n` : ""}${current?.html ? `\nCurrent design (improve it, keep the same placeholders):\n${current.html.slice(0, 4000)}\n` : ""}\nDesign request: ${prompt}`,
    undefined, 9000, { json: true }
  );
  const raw = extractJsonLoose(text);
  const html = String(raw.html || "").trim();
  if (!html) throw new Error("The AI returned no HTML. Try describing the document (e.g. 'GST tax invoice with blue header').");
  return { html, css: String(raw.css || ""), explanation: raw.explanation || "" };
}

// ── Dashboard from a prompt ──────────────────────────────────────────────────

export interface DashboardProposal { name: string; components: any[]; explanation: string }

/** Builds a page (heading, date filter, KPI cards, charts, report/quick-link widgets) from a description. */
export async function generateDashboardFromPrompt(prompt: string, app: AppDefinition): Promise<DashboardProposal> {
  const desc = app.forms.map((f) => `${f.name} [id ${f.id}]: ${f.fields.filter((x) => !["section", "subform"].includes(x.type)).map((x) => `${x.label} [${x.id}, ${x.type}${x.options ? ": " + x.options.join("|") : ""}]`).join(", ")}`).join("\n");
  const reports = app.reports.map((r) => `${r.name} [id ${r.id}, ${r.reportType || "table"}, form ${app.forms.find((f) => f.id === r.sourceFormId)?.name || "?"}]`).join("\n");
  const shape = `{"name":"…","explanation":"one sentence","widgets":[
 {"type":"heading","width":12,"title":"…","subtitle":"…"},
 {"type":"filter_panel","width":12,"defaultPreset":"this_month|last_7_days|today|null"},
 {"type":"stat_card","width":12,"stats":[{"label":"…","formId":"<form id>","aggregate":"count|sum|avg","fieldId":"<numeric field id or null>","filters":[{"fieldId":"…","operator":"equals|is_true|not_equals","value":"…"}],"compare":"last_month|last_year|none","prefix":"₹","compact":true}]},
 {"type":"chart","width":6,"title":"…","chartType":"column|bar|stacked|line|area|pie|donut|funnel|gauge","formId":"…","groupByFieldId":"<field id or createdAt>","dateBucket":"month|week|day","metric":"sum|count|avg","measureFieldId":"<numeric field id or null>","seriesFieldId":"<dropdown/lookup id or null>","limit":8},
 {"type":"report_embed","width":12,"reportId":"<report id>","view":"table|kanban|aging|chart|null","pageSize":8},
 {"type":"quick_links","width":12,"links":[{"label":"New invoice","formId":"<form id>","action":"new"}]}
]}`;
  const text = await askAi(
    `You design dashboards for a low-code platform. Reply ONLY with JSON:\n${shape}\nRules: use ids exactly; 4 KPIs max; 2–4 charts (money → sum of the currency field, statuses → donut/funnel, time → column by date with month bucket); one report widget for the most important list; always start with a heading then the date filter. Widths add up to 12 per row.`,
    `App: ${app.name}\nForms:\n${desc}\n\nReports:\n${reports || "(none)"}\n\nDashboard request: ${prompt}`,
    undefined, 5000, { json: true }
  );
  const raw = extractJsonLoose(text);
  const fieldOk = (formId: string, id: any) => Boolean(id) && (id === "createdAt" || app.forms.find((f) => f.id === formId)?.fields.some((x) => x.id === id));
  const components = (raw.widgets || []).map((w: any) => {
    const width = [3, 4, 6, 8, 12].includes(w.width) ? w.width : 12;
    const base = { id: generateId("comp"), type: w.type, width };
    switch (w.type) {
      case "heading": return { ...base, props: { title: w.title || raw.name || "Dashboard", subtitle: w.subtitle || "" } };
      case "filter_panel": return { ...base, props: { label: "Date range", defaultPreset: w.defaultPreset || undefined } };
      case "stat_card": return { ...base, props: { stats: (w.stats || []).filter((s: any) => app.forms.some((f) => f.id === s.formId)).map((s: any) => ({ label: s.label || "KPI", prefix: s.prefix || "", compact: s.compact !== false, metric: { formId: s.formId, aggregate: s.aggregate || "count", fieldId: fieldOk(s.formId, s.fieldId) ? s.fieldId : undefined, compare: s.compare || "last_month", filters: (s.filters || []).filter((f: any) => fieldOk(s.formId, f.fieldId)).map((f: any) => ({ id: generateId("flt"), ...f })) } })) } };
      case "chart": return app.forms.some((f) => f.id === w.formId) ? { ...base, props: { title: w.title || "Chart", chartType: w.chartType || "column", formId: w.formId, groupByFieldId: fieldOk(w.formId, w.groupByFieldId) ? w.groupByFieldId : "createdAt", dateBucket: w.dateBucket || "month", metric: w.metric || "count", measureFieldId: fieldOk(w.formId, w.measureFieldId) ? w.measureFieldId : undefined, seriesFieldId: fieldOk(w.formId, w.seriesFieldId) ? w.seriesFieldId : undefined, limit: w.limit || 8, drilldown: true } } : null;
      case "report_embed": return app.reports.some((r) => r.id === w.reportId) ? { ...base, props: { reportId: w.reportId, view: w.view || undefined, pageSize: w.pageSize || 8 } } : null;
      case "quick_links": return { ...base, props: { links: (w.links || []).filter((l: any) => app.forms.some((f) => f.id === l.formId)).map((l: any) => ({ label: l.label, formId: l.formId, action: l.action === "list" ? "list" : "new" })) } };
      default: return null;
    }
  }).filter(Boolean);
  if (!components.length) throw new Error("The AI produced no usable widgets. Mention which forms and numbers you want to see.");
  return { name: String(raw.name || "Dashboard"), components, explanation: raw.explanation || "" };
}

// ── Map a user's own HTML/CSS to this form's placeholders ────────────────────

/**
 * Takes a design the user already has (their own HTML/CSS, e.g. from a designer or another tool)
 * and returns the same design with the right {{placeholders}} inserted wherever a field belongs:
 * static sample values replaced, tables turned into subform loops, totals wired to {{sum …}}.
 */
export async function mapHtmlToPlaceholders(html: string, form: FormDefinition, app: AppDefinition, hint?: string): Promise<PrintDesignProposal> {
  const fields = form.fields.filter((f) => f.type !== "section" && f.type !== "subform").map((f) => `{{${f.linkName}}} = ${f.label} (${f.type})${f.type === "lookup" ? ` → linked fields: ${(app.forms.find((t) => t.id === f.lookup?.targetFormId)?.fields || []).filter((x) => !["section", "subform"].includes(x.type)).slice(0, 8).map((x) => `{{${f.linkName}.${x.linkName}}} = ${x.label}`).join(", ")}` : ""}`).join("\n");
  const subs = form.fields.filter((f) => f.type === "subform").map((f) => `Subform "${f.label}": wrap ONE table row with {{#${f.linkName}}} … {{/${f.linkName}}}; columns ${(f.subform?.columns || []).map((c) => `{{${c.linkName}}} = ${c.label}`).join(", ")}; totals {{sum ${f.linkName}.<column>}}; {{row.index}} = serial`).join("\n");
  const text = await askAi(
    `You convert a user's existing print design into a template for a low-code platform. Keep the user's layout, classes and CSS EXACTLY as they are; only replace the places where data belongs with the correct placeholders. Reply ONLY with JSON: {"html":"…","css":"…","explanation":"what was mapped, and anything you could not map"}.
Rules:
- Replace sample/static values (names, numbers, dates, addresses, invoice numbers) with the matching {{placeholder}} from the list. Keep labels/headings as text.
- For an items table keep ONE <tr> in <tbody> and wrap it with the subform loop tags; put {{row.index}} in a serial column if there is one; use {{sum subform.column}} for totals rows when the column is numeric.
- Company/app name → {{app.name}}, logo <img> → {{app.logo}}, print date → {{today}}. Amount in words → {{words <currency_field>}}.
- If the input contains <style> or inline styles keep them; return CSS separately in "css" only if the input had a separate stylesheet, otherwise leave "css" empty and keep <style> inside "html".
- Never invent placeholders that are not in the list; leave a short HTML comment <!-- no field for: … --> where nothing fits.`,
    `Form: ${form.name}\nFields:\n${fields}\n${subs ? `\n${subs}\n` : ""}${hint ? `\nUser note: ${hint}\n` : ""}\nUser's HTML/CSS:\n${html.slice(0, 24000)}`,
    undefined, 12000, { json: true }
  );
  const raw = extractJsonLoose(text);
  const out = String(raw.html || "").trim();
  if (!out) throw new Error("The AI returned no HTML. Paste the full markup of your design (HTML with its CSS).");
  return { html: out, css: String(raw.css || ""), explanation: raw.explanation || "" };
}
