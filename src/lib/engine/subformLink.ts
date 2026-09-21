import { AppDefinition, FieldDefinition, FormDefinition, RecordDefinition, SubformColumn, SubformConfig } from "@/types/schema";
import { generateId } from "@/lib/utils/idGenerator";
import { generateUniqueLinkName } from "@/lib/utils/linkName";

/**
 * "Use an existing form as a subform": rows of the subform are real records of the target form,
 * linked back to the parent through a lookup field. This module builds the columns, the link field,
 * and the record sync used by the runtime.
 */

/** Field types that can be edited as a subform column. */
const COLUMN_TYPES = new Set(["text", "textarea", "email", "phone", "url", "number", "decimal", "currency", "percentage", "date", "datetime", "time", "checkbox", "dropdown", "radio", "multiselect", "lookup", "formula", "rating", "color", "barcode", "users"]);

export const isLinkedSubform = (cfg?: SubformConfig): cfg is SubformConfig & { targetFormId: string; parentLinkFieldId: string } => Boolean(cfg && cfg.sourceType === "existing_form" && cfg.targetFormId && cfg.parentLinkFieldId);

/** Fields of the target form that can become columns (everything except layout, nested subforms, media and the parent link itself). */
export function linkableFields(target: FormDefinition, parentLinkFieldId?: string): FieldDefinition[] {
  return target.fields.filter((f) => COLUMN_TYPES.has(f.type) && f.id !== parentLinkFieldId);
}

/** Column definitions mirroring the chosen target fields; column id === target field id so rows map 1:1 onto records. */
export function buildLinkedColumns(target: FormDefinition, fieldIds: string[]): SubformColumn[] {
  return fieldIds.map((id) => target.fields.find((f) => f.id === id)).filter((f): f is FieldDefinition => Boolean(f)).map((f) => ({
    id: f.id, label: f.label, linkName: f.linkName, type: f.type, required: f.required, readonly: f.readonly || f.type === "formula", options: f.options, currencySymbol: f.currencySymbol,
    decimalPlaces: f.decimalPlaces, lookup: f.lookup, formula: f.formula, defaultValue: f.defaultValue, placeholder: f.placeholder, width: f.type === "lookup" ? 200 : ["number", "currency", "decimal", "percentage"].includes(f.type) ? 120 : 160,
  }));
}

/** Ensure the target form has a lookup pointing at the parent form; returns the (possibly updated) app and the link field id. */
export function ensureParentLink(app: AppDefinition, parentForm: FormDefinition, targetFormId: string): { app: AppDefinition; fieldId: string } {
  const target = app.forms.find((f) => f.id === targetFormId);
  if (!target) return { app, fieldId: "" };
  const existing = target.fields.find((f) => f.type === "lookup" && f.lookup?.targetFormId === parentForm.id && f.lookup?.relationshipType === "parent");
  if (existing) return { app, fieldId: existing.id };
  const label = parentForm.name;
  const field: FieldDefinition = {
    id: generateId("field"), label, linkName: generateUniqueLinkName(`${label} parent`, target.fields.map((f) => f.linkName)), type: "lookup", readonly: true,
    tooltip: `Set automatically when a row is entered from ${parentForm.name}`,
    lookup: { targetFormId: parentForm.id, displayFieldId: parentForm.titleFieldId || parentForm.fields.find((f) => f.type === "autonumber")?.id || parentForm.fields.find((f) => !["section", "subform"].includes(f.type))?.id || "", valueFieldId: "id", relationshipType: "parent", displayStyle: "dropdown" },
  };
  const next = { ...app, forms: app.forms.map((f) => (f.id === targetFormId ? { ...f, fields: [...f.fields, field], updatedAt: new Date().toISOString() } : f)) };
  return { app: next, fieldId: field.id };
}

/**
 * AI materialization helper: fields created with a `__linkForm` marker (the child form's name) become
 * existing-form subforms. Returns the full form list with the subform configured and the parent
 * lookup added to the child, plus which pre-existing forms were touched.
 */
export function resolveLinkedSubforms(allForms: FormDefinition[], newFormIds: Set<string>): { forms: FormDefinition[]; updatedExisting: FormDefinition[] } {
  let forms = allForms.map((f) => ({ ...f, fields: f.fields.map((x) => ({ ...x })) }));
  const touched = new Set<string>();
  for (const form of forms) {
    for (const field of form.fields) {
      const marker = (field as any).__linkForm as string | undefined;
      const wantCols = (field as any).__linkCols as string[] | undefined;
      delete (field as any).__linkForm; delete (field as any).__linkCols;
      if (field.type !== "subform" || !marker) continue;
      const target = forms.find((t) => t.id !== form.id && t.name.toLowerCase() === String(marker).toLowerCase());
      if (!target) continue;
      const res = ensureParentLink({ forms } as AppDefinition, form, target.id);
      forms = res.app.forms;
      if (!newFormIds.has(target.id)) touched.add(target.id);
      const t2 = forms.find((t) => t.id === target.id)!;
      const candidates = linkableFields(t2, res.fieldId);
      const chosen = wantCols?.length ? candidates.filter((c) => wantCols.some((w) => w.toLowerCase() === c.label.toLowerCase() || w.toLowerCase() === c.linkName)) : candidates.slice(0, 6);
      const columns = buildLinkedColumns(t2, (chosen.length ? chosen : candidates.slice(0, 6)).map((c) => c.id));
      const f2 = forms.find((x) => x.id === form.id)!.fields.find((x) => x.id === field.id)!;
      f2.subform = { ...(f2.subform || { sourceType: "inline", columns: [] }), sourceType: "existing_form", targetFormId: target.id, parentLinkFieldId: res.fieldId, linkedFieldIds: columns.map((c) => c.id), columns, showTotals: true, allowBulkAdd: true, allowDuplicateRow: true, totalColumnIds: columns.filter((c) => ["number", "currency", "decimal"].includes(c.type) || c.formula).map((c) => c.id) };
    }
  }
  return { forms, updatedExisting: forms.filter((f) => touched.has(f.id)) };
}

/** Make sure every report of a child form shows its parent lookup column (so "entered from" is visible). */
export function withParentLinkColumns(app: AppDefinition): AppDefinition {
  let changed = false;
  const reports = app.reports.map((r) => {
    const form = app.forms.find((f) => f.id === r.sourceFormId);
    if (!form || r.reportType === "ledger") return r;
    const missing = form.fields.filter((f) => f.type === "lookup" && f.lookup?.relationshipType === "parent" && !r.columns.some((c) => c.fieldId === f.id));
    if (!missing.length) return r;
    changed = true;
    const maxOrder = r.columns.reduce((m, c) => Math.max(m, c.order), -1);
    return { ...r, columns: [...r.columns, ...missing.map((f, i) => ({ fieldId: f.id, label: f.label, visible: true, order: maxOrder + 1 + i }))] };
  });
  return changed ? { ...app, reports } : app;
}

/** Marker stored on each row so re-saves update the same child record. */
export const CHILD_ID_KEY = "__childId";

export interface ChildSyncPlan {
  targetFormId: string;
  creates: Array<{ rowIndex: number; data: Record<string, any> }>;
  updates: Array<{ id: string; rowIndex: number; data: Record<string, any> }>;
  deletes: string[];
}

/** Diff the parent's rows against the child records that currently point at it. */
export function planChildSync(cfg: SubformConfig & { targetFormId: string; parentLinkFieldId: string }, parentId: string, rows: any[], childRecords: RecordDefinition[]): ChildSyncPlan {
  const mine = childRecords.filter((r) => !r.deleted && r.data?.[cfg.parentLinkFieldId] === parentId);
  const keep = new Set<string>();
  const plan: ChildSyncPlan = { targetFormId: cfg.targetFormId, creates: [], updates: [], deletes: [] };
  const colIds = cfg.columns.map((c) => c.id);
  const same = (r: RecordDefinition, data: Record<string, any>) => colIds.every((id) => String(r.data?.[id] ?? "") === String(data[id] ?? ""));
  rows.forEach((row, i) => {
    const data: Record<string, any> = { [cfg.parentLinkFieldId]: parentId };
    for (const id of colIds) if (row[id] !== undefined) data[id] = row[id];
    let childId: string | undefined = row?.[CHILD_ID_KEY];
    if (childId && !mine.some((r) => r.id === childId)) childId = undefined;
    // a row that lost its id (re-submitted form values) is re-attached to an identical unclaimed child instead of being created again
    if (!childId) childId = mine.find((r) => !keep.has(r.id) && same(r, data))?.id;
    if (childId) { keep.add(childId); plan.updates.push({ id: childId, rowIndex: i, data }); }
    else plan.creates.push({ rowIndex: i, data });
  });
  for (const r of mine) if (!keep.has(r.id)) plan.deletes.push(r.id);
  return plan;
}

/** Rows for the parent form built from child records (source of truth when editing a record that was saved with a linked subform). */
export function rowsFromChildren(cfg: SubformConfig & { targetFormId: string; parentLinkFieldId: string }, parentId: string, childRecords: RecordDefinition[]): any[] {
  return childRecords.filter((r) => !r.deleted && r.data?.[cfg.parentLinkFieldId] === parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => {
    const row: Record<string, any> = { [CHILD_ID_KEY]: r.id };
    for (const c of cfg.columns) row[c.id] = r.data?.[c.id];
    return row;
  });
}
