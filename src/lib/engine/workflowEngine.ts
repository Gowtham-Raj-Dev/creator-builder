/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AppDefinition,
  FieldDefinition,
  FormDefinition,
  RecordDefinition,
  SubformColumn,
  WorkflowAction,
  WorkflowDefinition,
  WorkflowTriggerType,
} from "@/types/schema";
import { evaluateFormula, buildFormulaContext, isBlank, FUNCTIONS, evaluateRowFormula, coerceFormulaResult } from "./formulaEngine";
import { evaluateFilter } from "./reportEngine";
import { runScript } from "./scriptInterpreter";
import { generateId } from "@/lib/utils/idGenerator";

// ── result types ─────────────────────────────────────────────────────────────

export interface DataOperation {
  type: "insert" | "update" | "delete" | "increment";
  formId: string;
  recordId?: string;
  data?: Record<string, any>;
  fieldId?: string;
  amount?: number;
  tempId?: string;
}

export interface PopupAlert {
  title?: string;
  message: string;
  type: "warning" | "error" | "info" | "confirm";
  blockSubmit: boolean; // error → always block; confirm → user decides; warning/info → informational
}

export interface WorkflowResult {
  updatedValues: Record<string, any>;
  fieldVisibility: Record<string, boolean>; // fieldId -> hidden
  fieldReadonly: Record<string, boolean>; // fieldId -> readonly
  validationErrors: Record<string, string>;
  messages: Array<{ type: "info" | "warning" | "error" | "success"; text: string }>;
  shouldBlockSubmit: boolean;
  popupAlert?: PopupAlert;
  dataOps: DataOperation[];
  emails: Array<{ to: string[]; cc?: string[]; subject: string; html: string }>;
  webhooks: Array<{ url: string; method: string; headers?: Record<string, string>; body?: any }>;
  notifications: Array<{ toUsers: string[]; title: string; body: string }>;
  logs: Array<{ workflowId: string; workflowName: string; status: "success" | "error" | "blocked"; messages: string[]; durationMs: number }>;
}

export interface WorkflowContext {
  app?: Pick<AppDefinition, "forms" | "workflows" | "members" | "roles"> | AppDefinition | null;
  recordsMap?: Record<string, RecordDefinition[]>;
  user?: { email: string; name: string } | null;
  record?: RecordDefinition | null;
  isEdit?: boolean;
}

function emptyResult(values: Record<string, any>): WorkflowResult {
  return {
    updatedValues: { ...values },
    fieldVisibility: {},
    fieldReadonly: {},
    validationErrors: {},
    messages: [],
    shouldBlockSubmit: false,
    dataOps: [],
    emails: [],
    webhooks: [],
    notifications: [],
    logs: [],
  };
}

// ── field resolution helpers ─────────────────────────────────────────────────

export function findField(form: FormDefinition, key?: string) {
  if (!key) return undefined;
  const k = key.toLowerCase();
  return form.fields.find(
    (f) => f.id === key || f.linkName.toLowerCase() === k || f.label.toLowerCase() === k || f.label.toLowerCase().replace(/\s+/g, "_") === k
  );
}

/** Every field a script/action can target (sections are layout only). */
const allFieldIds = (form: FormDefinition) => form.fields.filter((f) => f.type !== "section").map((f) => f.id);

/**
 * Key used in fieldVisibility / fieldReadonly for a target: a field id, or "<subformId>.<columnId>" for one
 * column of a subform (hideField("items.rate"), setReadonly("items.available_qty")).
 */
export function resolveTargetKey(form: FormDefinition, key: string): string {
  const [top, col] = String(key).split(".");
  const f = findField(form, top);
  if (!f) return key;
  if (!col) return f.id;
  const c = f.subform?.columns.find((x) => x.id === col || x.linkName === col || x.label === col || x.label.toLowerCase().replace(/\s+/g, "_") === col.toLowerCase());
  return c ? `${f.id}.${c.id}` : `${f.id}.${col}`;
}

function findFormByKey(forms: FormDefinition[], key: string) {
  const k = key.toLowerCase();
  return forms.find((f) => f.id === key || f.linkName.toLowerCase() === k || f.name.toLowerCase() === k);
}

function getFieldValue(values: Record<string, any>, form: FormDefinition, key: string) {
  const f = findField(form, key);
  return f ? values[f.id] : values[key];
}

/** Resolve "field" or "subform.column" into concrete values (arrays for subform columns). */
function resolvePathValues(values: Record<string, any>, form: FormDefinition, path: string): any[] {
  const [top, col] = path.split(".");
  const f = findField(form, top);
  if (!f) return [];
  if (col && f.type === "subform") {
    const rows = Array.isArray(values[f.id]) ? values[f.id] : [];
    const colDef = f.subform?.columns.find((c) => c.id === col || c.linkName === col);
    return rows.map((r: any) => r[colDef?.id || col]);
  }
  return [values[f.id]];
}

// ── subform rows written by scripts ──────────────────────────────────────────

const columnOf = (columns: SubformColumn[], k: string) => columns.find((c) => c.id === k || c.linkName === k || c.label === k || c.label.toLowerCase().replace(/\s+/g, "_") === k.toLowerCase());

/** Hidden key on row proxies that reveals the underlying row object. */
const ROW_TARGET = Symbol("rowTarget");
const CHILD_KEY = "__childId";

/**
 * Rows that belong (or have belonged, during this run) to one subform value, indexed so scripted rows
 * can be matched back to them. Kept for the whole run so sort/reverse/swap — which rewrite indexes one
 * by one — still find the original row and keep its id / child-record link.
 */
class ExistingRows {
  private byId = new Map<string, Record<string, any>>();
  private byChild = new Map<string, Record<string, any>>();
  private set = new Set<Record<string, any>>();
  constructor(current?: any) { if (Array.isArray(current)) for (const r of current) this.add(r); }
  add(r: any) {
    if (!r || typeof r !== "object") return;
    this.set.add(r);
    if (typeof r.id === "string") this.byId.set(r.id, r);
    if (typeof r[CHILD_KEY] === "string") this.byChild.set(r[CHILD_KEY], r);
  }
  /** The stored row a scripted row refers to (same object / proxy of it / same id / same child record), if any. */
  match(raw: any): Record<string, any> | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const target = raw[ROW_TARGET];
    if (target && this.set.has(target)) return target;
    if (this.set.has(raw)) return raw;
    if (typeof raw.id === "string" && this.byId.has(raw.id)) return this.byId.get(raw.id);
    if (typeof raw[CHILD_KEY] === "string" && this.byChild.has(raw[CHILD_KEY])) return this.byChild.get(raw[CHILD_KEY]);
    return undefined;
  }
}

/**
 * Turn a row a script built (keys by link name / label / id, possibly a proxy over another
 * record's row) into a real subform row: keys = column ids only, every column present, own row id.
 * Rows that already belong to this field keep their identity (row id + linked child record).
 */
function normalizeRow(raw: any, columns: SubformColumn[], existing: ExistingRows, claimed?: Set<Record<string, any>>): Record<string, any> {
  const src: Record<string, any> = raw && typeof raw === "object" ? raw : {};
  let keep = existing.match(raw);
  if (keep && claimed) { if (claimed.has(keep)) keep = undefined; else claimed.add(keep); } // a second copy of the same row is a new row
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    const col = columnOf(columns, k);
    if (col) out[col.id] = src[k];
  }
  for (const c of columns) if (!(c.id in out)) out[c.id] = c.defaultValue !== undefined ? c.defaultValue : c.type === "checkbox" ? false : "";
  out.id = typeof keep?.id === "string" ? keep.id : generateId("row");
  if (typeof keep?.[CHILD_KEY] === "string") out[CHILD_KEY] = keep[CHILD_KEY];
  return out;
}

function normalizeRows(value: any, columns: SubformColumn[], current: any, known?: ExistingRows): Record<string, any>[] {
  const existing = known ?? new ExistingRows(current);
  const claimed = new Set<Record<string, any>>();
  const list = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  return list.map((r) => normalizeRow(r, columns, existing, claimed));
}

/** Rows that ended up sharing an id (push(input.items[0]), spread) become separate rows so child sync never collapses them. */
function dedupeRowIds(rows: Record<string, any>[]): Record<string, any>[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r || typeof r !== "object" || typeof r.id !== "string") return r;
    if (!seen.has(r.id)) { seen.add(r.id); return r; }
    const copy: Record<string, any> = { ...r, id: generateId("row") };
    delete copy[CHILD_KEY];
    return copy;
  });
}

/** Recompute formula columns (amount = qty * rate …) so rows filled by a script show correct totals. */
function recomputeRowFormulas(rows: Record<string, any>[], columns: SubformColumn[], opts: { forms?: FormDefinition[]; recordsMap?: Record<string, RecordDefinition[]>; user?: any }) {
  const formulaCols = columns.filter((c) => c.formula?.expression);
  if (!formulaCols.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (let pass = 0; pass < 2; pass++) {
      for (const col of formulaCols) {
        const v = evaluateRowFormula(col.formula!.expression, out, columns, opts);
        out[col.id] = coerceFormulaResult(v, col.formula!.resultType || "number", col.formula!.decimalPlaces ?? col.decimalPlaces ?? 2);
      }
    }
    return out;
  });
}

/** After workflows ran: make sure every subform value is a well-formed row array with formulas up to date. */
function finalizeSubforms(values: Record<string, any>, form: FormDefinition, before: Record<string, any>, opts: { forms?: FormDefinition[]; recordsMap?: Record<string, RecordDefinition[]>; user?: any }) {
  for (const f of form.fields) {
    if (f.type !== "subform" || !f.subform) continue;
    const v = values[f.id];
    if (v === before[f.id]) continue; // untouched by any workflow
    const cols = f.subform.columns || [];
    const wellFormed = Array.isArray(v) && v.every((r) => r && typeof r === "object" && !r[ROW_TARGET] && Object.keys(r).every((k) => k === "id" || k === CHILD_KEY || cols.some((c) => c.id === k)));
    const rows = dedupeRowIds(wellFormed ? v : normalizeRows(v, cols, before[f.id]));
    values[f.id] = recomputeRowFormulas(rows, cols, opts);
  }
}

// ── visual conditions ────────────────────────────────────────────────────────

export function evaluateVisualConditions(action: WorkflowAction, values: Record<string, any>, form: FormDefinition, ctx: Record<string, any>): boolean {
  if (action.visualConditions && action.visualConditions.length > 0) {
    const results = action.visualConditions.map((cond) => {
      let rightVal = cond.value;
      if (cond.compareType === "field" && cond.compareFieldId) rightVal = getFieldValue(values, form, cond.compareFieldId);
      const f = findField(form, cond.fieldId);
      const fake: RecordDefinition = { id: "", formId: form.id, appId: "", data: values, createdAt: "", updatedAt: "" };
      return evaluateFilter(fake, { fieldId: f?.id || cond.fieldId, operator: cond.operator, value: rightVal, value2: undefined }, form);
    });
    return action.conditionLogic === "OR" ? results.some(Boolean) : results.every(Boolean);
  }
  if (action.condition) return Boolean(evaluateFormula(action.condition, ctx));
  return true;
}

// ── main ─────────────────────────────────────────────────────────────────────

export function executeWorkflows(
  workflows: WorkflowDefinition[],
  triggerType: WorkflowTriggerType,
  triggerFieldId: string | undefined,
  currentValues: Record<string, any>,
  form: FormDefinition,
  ctx: WorkflowContext = {}
): WorkflowResult {
  const result = emptyResult(currentValues);
  const forms = ctx.app?.forms || [form];
  const snapshot = { ...currentValues };

  const relevant = workflows.filter((wf) => {
    if (!wf.active) return false;
    if (wf.formId !== form.id) return false;
    const tt = wf.trigger.type;
    // The form fires a single "onLoad" for both new and edit; the workflow decides which it wants.
    if (triggerType === "onLoad") {
      if (tt === "onOpen") return true; // new + edit
      if (tt === "onEdit") return Boolean(ctx.isEdit); // edit only
      if (tt === "onLoad") return !ctx.isEdit; // new only
      return false;
    }
    if (tt !== triggerType) return false;
    if (triggerType === "onUserInput" && wf.trigger.fieldId) {
      const want = wf.trigger.fieldId;
      if (!triggerFieldId) return false;
      if (want === triggerFieldId) return true;
      const [wantTop, wantCol] = want.split(".");
      const [gotTop, gotCol] = triggerFieldId.split(".");
      const topField = findField(form, wantTop);
      const topMatch = topField ? topField.id === gotTop || topField.linkName === gotTop : wantTop === gotTop;
      if (!topMatch) return false;
      if (!wantCol) return true; // subform-level trigger fires on any column
      if (!gotCol) return false;
      const colDef = topField?.subform?.columns.find((c) => c.id === wantCol || c.linkName === wantCol);
      return colDef ? colDef.id === gotCol || colDef.linkName === gotCol : wantCol === gotCol;
    }
    return true;
  });

  for (const wf of relevant) {
    const started = performance.now();
    const before = result.messages.length;
    try {
      if (wf.mode === "code" && wf.codeScript) {
        runCodeWorkflow(wf, result, form, forms, ctx);
      } else {
        runVisualWorkflow(wf, result, form, forms, ctx);
      }
      result.logs.push({
        workflowId: wf.id,
        workflowName: wf.name,
        status: result.shouldBlockSubmit ? "blocked" : "success",
        messages: result.messages.slice(before).map((m) => `${m.type}: ${m.text}`),
        durationMs: Math.round(performance.now() - started),
      });
    } catch (err: any) {
      const text = `Workflow "${wf.name}" failed: ${err?.message || err}`;
      result.messages.push({ type: "error", text });
      result.logs.push({ workflowId: wf.id, workflowName: wf.name, status: "error", messages: [text], durationMs: Math.round(performance.now() - started) });
    }
  }

  if (relevant.length) finalizeSubforms(result.updatedValues, form, snapshot, { forms, recordsMap: ctx.recordsMap, user: ctx.user });
  return result;
}

// ── code mode ────────────────────────────────────────────────────────────────

/** One proxy per row object, so `input.items.indexOf(row)`, `includes`, and `===` behave like plain arrays. */
const ROW_PROXIES = new WeakMap<object, any>();

function rowProxy(row: Record<string, any>, columns: Array<{ id: string; linkName: string; label: string }>, onWrite?: () => void) {
  const cached = ROW_PROXIES.get(row);
  if (cached) return cached;
  const keyOf = (k: string) => columns.find((c) => c.id === k || c.linkName === k || c.label === k)?.id ?? k;
  const proxy = new Proxy(row, {
    get: (t, k) => (k === ROW_TARGET ? t : typeof k === "string" ? t[keyOf(k)] : undefined),
    set: (t, k, v) => { if (typeof k === "string") { t[keyOf(k)] = v; onWrite?.(); } return true; },
    has: (t, k) => typeof k === "string" && keyOf(k) in t,
    ownKeys: () => Array.from(new Set([...columns.map((c) => c.linkName), ...Object.keys(row)])),
    getOwnPropertyDescriptor: (t, k) => ({ enumerable: true, configurable: true, value: typeof k === "string" ? t[keyOf(k)] : undefined }),
  });
  ROW_PROXIES.set(row, proxy);
  return proxy;
}

/**
 * Live view of a subform's rows: `input.items[0].qty = 5`, `input.items.push({...})`,
 * `input.items.splice(i, 1)` all write straight into the form value. Rows pushed in are
 * normalized (link names → column ids, row id added).
 */
function rowsProxy(rows: Record<string, any>[], columns: SubformColumn[], known: ExistingRows, onWrite: () => void) {
  return new Proxy(rows, {
    get: (t, k) => {
      if (typeof k === "string" && /^\d+$/.test(k)) { const r = t[Number(k)]; return r && typeof r === "object" ? rowProxy(r, columns, onWrite) : r; }
      return Reflect.get(t, k);
    },
    set: (t, k, v) => {
      if (typeof k === "string" && /^\d+$/.test(k)) { const row = normalizeRow(v, columns, known); known.add(row); t[Number(k)] = row; onWrite(); }
      else { (t as any)[k] = v; if (k === "length") onWrite(); }
      return true;
    },
  });
}

function recordProxy(rec: RecordDefinition, f: FormDefinition) {
  const data = { ...(rec.data || {}) };
  const base: Record<string, any> = { id: rec.id, createdAt: rec.createdAt, updatedAt: rec.updatedAt, createdBy: rec.createdBy };
  return new Proxy(base, {
    get: (t, k) => {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      const fld = findField(f, k);
      const v = fld ? data[fld.id] : data[k];
      if (fld?.type === "subform" && Array.isArray(v)) return v.map((r) => rowProxy({ ...r }, fld.subform?.columns || []));
      return v;
    },
    has: (t, k) => typeof k === "string" && (k in t || Boolean(findField(f, k))),
    ownKeys: () => [...Object.keys(base), ...f.fields.map((x) => x.linkName)],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

function runCodeWorkflow(wf: WorkflowDefinition, result: WorkflowResult, form: FormDefinition, forms: FormDefinition[], ctx: WorkflowContext) {
  const values = result.updatedValues;
  const keyOf = (k: string) => findField(form, k)?.id ?? k;

  const fieldById = (id: string) => form.fields.find((f) => f.id === id);

  // Subform arrays are copied on first access so in-place edits (input.items[0].qty = 5) never mutate the
  // form state the caller passed in. `known` keeps row identity for the whole run; `dirty` records real
  // writes so a script that only reads rows leaves the original array (and its formula values) untouched.
  const owned = new Map<string, { known: ExistingRows; original: any }>();
  const dirty = new Set<string>();
  const own = (t: Record<string, any>, id: string) => {
    let o = owned.get(id);
    if (!o) {
      const copy = Array.isArray(t[id]) ? t[id].map((r: any) => (r && typeof r === "object" ? { ...r } : r)) : [];
      o = { known: new ExistingRows(copy), original: t[id] };
      owned.set(id, o);
      t[id] = copy;
    }
    return o;
  };
  const subformProxy = (t: Record<string, any>, id: string, fld: FieldDefinition) => rowsProxy(t[id], fld.subform?.columns || [], own(t, id).known, () => dirty.add(id));

  /** Assign a field value from a script; subform values are normalized into proper rows. */
  const assign = (t: Record<string, any>, id: string, v: any, fld?: FieldDefinition) => {
    if (fld?.type === "subform") {
      const o = own(t, id);
      const rows = normalizeRows(v, fld.subform?.columns || [], t[id], o.known);
      rows.forEach((r) => o.known.add(r));
      t[id] = rows;
      dirty.add(id);
    } else t[id] = v;
  };

  // `input` proxy: read/write field values by linkName / label / id
  const input = new Proxy(values, {
    get: (t, k) => {
      if (typeof k !== "string") return undefined;
      const id = keyOf(k);
      const fld = fieldById(id);
      if (fld?.type === "subform") { own(t, id); return subformProxy(t, id, fld); }
      return t[id];
    },
    set: (t, k, v) => { if (typeof k === "string") { const id = keyOf(k); assign(t, id, v, fieldById(id)); } return true; },
    has: (t, k) => typeof k === "string" && keyOf(k) in t,
    ownKeys: () => form.fields.map((f) => f.linkName),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });

  const fieldNameOf = (k: string) => findField(form, k)?.id ?? k;
  /** "*" (or "all") means every field of the form; "subform.column" one column; otherwise the one field. */
  const targetsOf = (k: string) => (k === "*" || (String(k).toLowerCase() === "all" && !findField(form, k)) ? allFieldIds(form) : [resolveTargetKey(form, k)]);
  const setAll = (bag: Record<string, boolean>, ids: string[], v: boolean) => { for (const id of ids) bag[id] = v; };

  const api: Record<string, any> = {
    input,
    record: ctx.record ? { id: ctx.record.id, createdAt: ctx.record.createdAt, createdBy: ctx.record.createdBy } : null,
    user: ctx.user || { email: "", name: "" },
    form: { id: form.id, name: form.name, linkName: form.linkName },
    isEdit: Boolean(ctx.isEdit),

    // UI
    showPopup: (msg: any, type?: string, title?: string) => {
      const t = (type || "warning") as PopupAlert["type"];
      result.popupAlert = { title: title || undefined, message: String(msg), type: t, blockSubmit: t === "error" };
      if (t === "error") result.shouldBlockSubmit = true;
    },
    alert: (msg: any) => { result.popupAlert = { message: String(msg), type: "info", blockSubmit: false }; },
    confirm: (msg: any) => { result.popupAlert = { message: String(msg), type: "confirm", blockSubmit: false }; },
    showError: (msg: any) => { result.popupAlert = { message: String(msg), type: "error", blockSubmit: true }; result.shouldBlockSubmit = true; },
    showMessage: (msg: any, type?: string) => result.messages.push({ type: (type as any) || "info", text: String(msg) }),
    setError: (field: string, msg: any) => { result.validationErrors[fieldNameOf(field)] = String(msg); result.shouldBlockSubmit = true; },
    blockSubmit: (msg?: any) => { result.shouldBlockSubmit = true; if (msg) result.messages.push({ type: "error", text: String(msg) }); },
    cancelSubmit: () => { result.shouldBlockSubmit = true; },
    hideField: (f: string) => setAll(result.fieldVisibility, targetsOf(f), true),
    showField: (f: string) => setAll(result.fieldVisibility, targetsOf(f), false),
    setReadonly: (f: string, v = true) => setAll(result.fieldReadonly, targetsOf(f), Boolean(v)),
    setEditable: (f: string) => setAll(result.fieldReadonly, targetsOf(f), false),
    disableField: (f: string) => setAll(result.fieldReadonly, targetsOf(f), true),
    enableField: (f: string) => setAll(result.fieldReadonly, targetsOf(f), false),
    /** Lock the whole form (optionally keep some fields editable): disableAll() / disableAll(["notes", "status"]) */
    disableAll: (except?: string | string[]) => { const keep = new Set(([] as string[]).concat(except || []).map(fieldNameOf)); setAll(result.fieldReadonly, allFieldIds(form).filter((id) => !keep.has(id)), true); },
    enableAll: () => setAll(result.fieldReadonly, allFieldIds(form), false),
    lockForm: (except?: string | string[]) => api.disableAll(except),
    hideAll: (except?: string | string[]) => { const keep = new Set(([] as string[]).concat(except || []).map(fieldNameOf)); setAll(result.fieldVisibility, allFieldIds(form).filter((id) => !keep.has(id)), true); },
    showAll: () => setAll(result.fieldVisibility, allFieldIds(form), false),
    setValue: (f: string, v: any) => { const id = fieldNameOf(f); assign(values, id, v, fieldById(id)); },
    getValue: (f: string) => values[fieldNameOf(f)],

    // Data
    fetch: (formKey: string, filter?: any) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      let recs = (ctx.recordsMap?.[f.id] || []).filter((r) => !r.deleted).map((r) => recordProxy(r, f));
      if (typeof filter === "function") recs = recs.filter((r) => Boolean(filter(r)));
      else if (filter && typeof filter === "object") recs = recs.filter((r) => Object.entries(filter).every(([k, v]) => String((r as any)[k] ?? "").toLowerCase() === String(v ?? "").toLowerCase()));
      return recs;
    },
    get: (formKey: string, id: string) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      const rec = (ctx.recordsMap?.[f.id] || []).find((r) => r.id === id);
      return rec ? recordProxy(rec, f) : null;
    },
    lookup: (formKey: string, id: string) => api.get(formKey, id),
    insert: (formKey: string, data: Record<string, any>) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      const mapped: Record<string, any> = {};
      for (const [k, v] of Object.entries(data || {})) mapped[findField(f, k)?.id ?? k] = v;
      const tempId = `tmp_${Math.random().toString(36).slice(2, 8)}`;
      result.dataOps.push({ type: "insert", formId: f.id, data: mapped, tempId });
      return tempId;
    },
    update: (formKey: string, id: string, data: Record<string, any>) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      const mapped: Record<string, any> = {};
      for (const [k, v] of Object.entries(data || {})) mapped[findField(f, k)?.id ?? k] = v;
      result.dataOps.push({ type: "update", formId: f.id, recordId: id, data: mapped });
    },
    increment: (formKey: string, id: string, field: string, amount: number) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      result.dataOps.push({ type: "increment", formId: f.id, recordId: id, fieldId: findField(f, field)?.id ?? field, amount: Number(amount) || 0 });
    },
    remove: (formKey: string, id: string) => {
      const f = findFormByKey(forms, formKey);
      if (!f) throw new Error(`Form "${formKey}" not found`);
      result.dataOps.push({ type: "delete", formId: f.id, recordId: id });
    },

    // Integrations (queued; executed after successful save)
    sendEmail: (opts: { to: string | string[]; cc?: string | string[]; subject: string; body: string }) => {
      result.emails.push({ to: ([] as string[]).concat(opts.to), cc: opts.cc ? ([] as string[]).concat(opts.cc) : undefined, subject: opts.subject, html: opts.body });
    },
    notify: (users: string | string[], title: string, body: string) => result.notifications.push({ toUsers: ([] as string[]).concat(users), title, body }),
    callWebhook: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: any }) =>
      result.webhooks.push({ url, method: opts?.method || "POST", headers: opts?.headers, body: opts?.body }),

    // Helpers
    today: () => FUNCTIONS.today([], {}),
    now: () => FUNCTIONS.now([], {}),
    formatDate: (d: any, f?: string) => FUNCTIONS.formatdate([d, f], {}),
    dateDiff: (a: any, b: any, unit?: string) => FUNCTIONS.datediff([a, b, unit], {}),
    dateAdd: (d: any, n: number, unit?: string) => FUNCTIONS.dateadd([d, n, unit], {}),
    round: (v: any, d?: number) => FUNCTIONS.round([v, d], {}),
    sum: (arr: any[], field?: string) => (Array.isArray(arr) ? arr.reduce((s, x) => s + (Number(field ? x?.[field] : x) || 0), 0) : 0),
    isEmpty: (v: any) => isBlank(v),
    formula: (expr: string) => evaluateFormula(expr, buildFormulaContext(form, values, { forms, recordsMap: ctx.recordsMap, user: ctx.user })),
  };

  // Backward-compat: expose field values as bare globals (read + write). Subforms share the same
  // write-through rows proxy as input.<name>, so legacy `for (const r of items) r.qty = 1` is normalized too.
  const bare: Record<string, any> = {};
  for (const f of form.fields) {
    if (f.type === "section") continue;
    bare[f.linkName] = f.type === "subform" ? (own(values, f.id), subformProxy(values, f.id, f)) : values[f.id];
  }

  const run = runScript(wf.codeScript!, { ...bare, ...api });
  for (const f of form.fields) {
    if (f.type === "section") continue;
    // detect bare-global writes (legacy style: total = qty * rate)
    const g = run.globals?.[f.linkName];
    if (g !== undefined && g !== bare[f.linkName] && !(g instanceof Object && typeof g !== "object")) assign(values, f.id, g, f);
  }
  // rows that were only read keep the caller's original array (no spurious "changed" / formula recompute)
  for (const [id, o] of owned) if (!dirty.has(id)) values[id] = o.original;
  run.logs.forEach((l) => result.messages.push({ type: "info", text: l }));
  if (!run.ok) throw new Error(run.error || "Script error");
}

// ── visual mode ──────────────────────────────────────────────────────────────

function runVisualWorkflow(wf: WorkflowDefinition, result: WorkflowResult, form: FormDefinition, forms: FormDefinition[], ctx: WorkflowContext) {
  for (const action of wf.actions) {
    const fctx = buildFormulaContext(form, result.updatedValues, { forms, recordsMap: ctx.recordsMap, user: ctx.user, record: ctx.record });
    if (!evaluateVisualConditions(action, result.updatedValues, form, fctx)) continue;

    const targetField = findField(form, action.targetFieldId);
    const targetId = targetField?.id || action.targetFieldId;
    // visibility / readonly actions accept "*" = every field, or "subform.column" = one column
    const targetIds = action.targetFieldId === "*" ? allFieldIds(form) : action.targetFieldId ? [resolveTargetKey(form, action.targetFieldId)] : [];

    switch (action.type) {
      case "setValue":
        if (targetId) result.updatedValues[targetId] = action.value ?? "";
        break;
      case "copyField": {
        if (!targetId || !action.copySourceFieldId) break;
        const v = getFieldValue(result.updatedValues, form, action.copySourceFieldId) ?? "";
        result.updatedValues[targetId] = targetField?.type === "subform" ? normalizeRows(v, targetField.subform?.columns || [], result.updatedValues[targetId]) : v;
        break;
      }
      case "calculateValue": {
        if (!targetId) break;
        let v: any = action.value;
        if (action.visualCalculation) {
          const c = action.visualCalculation;
          const a = Number(getFieldValue(result.updatedValues, form, c.operand1FieldId)) || 0;
          const b = c.operand2Type === "field" && c.operand2FieldId ? Number(getFieldValue(result.updatedValues, form, c.operand2FieldId)) || 0 : Number(c.operand2Literal ?? 0);
          v = c.operation === "+" ? a + b : c.operation === "-" ? a - b : c.operation === "*" ? Math.round(a * b * 100) / 100 : b !== 0 ? Math.round((a / b) * 100) / 100 : 0;
        } else if (action.expression) {
          const expr = action.expression.trim();
          const quoted = expr.match(/^["'](.*)["']$/);
          if (quoted) v = quoted[1];
          else v = evaluateFormula(expr, fctx);
        }
        result.updatedValues[targetId] = v;
        break;
      }
      case "clearField": if (targetId) result.updatedValues[targetId] = ""; break;
      case "setHidden": for (const id of targetIds) result.fieldVisibility[id] = true; break;
      case "setVisible": for (const id of targetIds) result.fieldVisibility[id] = false; break;
      case "setReadonly": for (const id of targetIds) result.fieldReadonly[id] = true; break;
      case "setEditable": for (const id of targetIds) result.fieldReadonly[id] = false; break;
      case "showMessage": if (action.message) result.messages.push({ type: (action.popupType as any) === "error" ? "error" : "info", text: interpolate(action.message, fctx) }); break;
      case "validate": {
        if (!targetId) break;
        // condition already evaluated as "invalid when true"
        const msg = interpolate(action.message || "Invalid value", fctx);
        result.validationErrors[targetId] = msg;
        result.messages.push({ type: "error", text: msg });
        result.shouldBlockSubmit = true;
        break;
      }
      case "showPopup": {
        if (!action.message) break;
        const t = (action.popupType || "warning") as PopupAlert["type"];
        const block = t === "error" || action.blockSubmitOnPopup === true;
        result.popupAlert = { title: action.title, message: interpolate(action.message, fctx), type: t, blockSubmit: block };
        if (block) result.shouldBlockSubmit = true;
        break;
      }
      case "blockSubmit": result.shouldBlockSubmit = true; if (action.message) result.messages.push({ type: "error", text: interpolate(action.message, fctx) }); break;
      case "updateOtherForm": {
        const c = action.crossFormUpdate;
        if (!c) break;
        const ids = resolvePathValues(result.updatedValues, form, c.matchLookupFieldId);
        const amounts = resolvePathValues(result.updatedValues, form, c.sourceFieldId);
        const isRowWise = c.matchLookupFieldId.includes(".");
        ids.forEach((id, i) => {
          if (isBlank(id)) return;
          const amount = Number(isRowWise ? amounts[i] : amounts[0]) || 0;
          const targets = Array.isArray(id) ? id : [id];
          for (const tid of targets) {
            if (c.operation === "set") result.dataOps.push({ type: "update", formId: c.targetFormId, recordId: tid, data: { [c.updateFieldId]: amount } });
            else result.dataOps.push({ type: "increment", formId: c.targetFormId, recordId: tid, fieldId: c.updateFieldId, amount: c.operation === "decrement" ? -amount : amount });
          }
        });
        result.messages.push({ type: "info", text: `Queued ${ids.filter((x) => !isBlank(x)).length} ${c.operation} update(s) on ${forms.find((f) => f.id === c.targetFormId)?.name || "target form"}.` });
        break;
      }
      case "createRecord": {
        const c = action.createRecord;
        if (!c) break;
        const data: Record<string, any> = {};
        for (const m of c.fieldMap) {
          if (m.sourceType === "field") data[m.targetFieldId] = getFieldValue(result.updatedValues, form, m.source);
          else if (m.sourceType === "expression") data[m.targetFieldId] = evaluateFormula(m.source, fctx);
          else data[m.targetFieldId] = m.source;
        }
        result.dataOps.push({ type: "insert", formId: c.targetFormId, data });
        break;
      }
      case "deleteRecord": {
        if (ctx.record) result.dataOps.push({ type: "delete", formId: form.id, recordId: ctx.record.id });
        break;
      }
      case "sendEmail": {
        if (!action.email) break;
        result.emails.push({
          to: interpolate(action.email.to, fctx).split(/[;,]/).map((s) => s.trim()).filter(Boolean),
          cc: action.email.cc ? interpolate(action.email.cc, fctx).split(/[;,]/).map((s) => s.trim()).filter(Boolean) : undefined,
          subject: interpolate(action.email.subject, fctx),
          html: interpolate(action.email.body, fctx).replace(/\n/g, "<br/>"),
        });
        break;
      }
      case "callWebhook": {
        if (!action.webhook) break;
        let body: any = undefined;
        if (action.webhook.bodyTemplate) {
          const txt = interpolate(action.webhook.bodyTemplate, fctx);
          try { body = JSON.parse(txt); } catch { body = txt; }
        } else body = { form: form.linkName, record: ctx.record?.id, data: result.updatedValues };
        result.webhooks.push({ url: interpolate(action.webhook.url, fctx), method: action.webhook.method || "POST", headers: action.webhook.headers, body });
        break;
      }
      case "notify": {
        if (!action.notification) break;
        result.notifications.push({ toUsers: action.notification.toUsers, title: interpolate(action.notification.title, fctx), body: interpolate(action.notification.body, fctx) });
        break;
      }
      case "assignTask":
      case "requestApproval": {
        const a = action.approval;
        if (a?.statusFieldId) result.updatedValues[a.statusFieldId] = "Pending Approval";
        if (a?.approverEmails?.length) result.notifications.push({ toUsers: a.approverEmails, title: `Approval requested: ${form.name}`, body: interpolate(action.message || "A record needs your approval.", fctx) });
        break;
      }
    }
  }
}

/** Replace {{field}} / ${field} placeholders with values (formula expressions allowed inside). */
export function interpolate(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{([^}]+)\}\}|\$\{([^}]+)\}/g, (_m, a, b) => {
    const v = evaluateFormula((a || b).trim(), ctx);
    return v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  });
}

/** Builder helper: list of scriptable API names for the code editor. */
export const SCRIPT_API_DOCS: Array<{ name: string; sig: string; desc: string; group: string }> = [
  { name: "input", sig: "input.field_name", desc: "Read/write current form values (by link name)", group: "Form" },
  { name: "input.items", sig: "input.items.forEach(r => r.amount = r.qty * r.rate)", desc: "Subform rows (read/write)", group: "Form" },
  { name: "input.items = […]", sig: "input.items = po.items.map(r => ({ item: r.item, ordered_qty: r.quantity, rate: r.rate }))", desc: "Replace subform rows (keys by column link name; formula columns auto-recalculated)", group: "Form" },
  { name: "input.items.push", sig: "input.items.push({ item: id, quantity: 1 })", desc: "Append a subform row", group: "Form" },
  { name: "record", sig: "record.id", desc: "Current record (edit mode)", group: "Form" },
  { name: "user", sig: "user.email / user.name", desc: "Logged-in user", group: "Form" },
  { name: "isEdit", sig: "if (isEdit) …", desc: "True when editing an existing record", group: "Form" },
  { name: "fetch", sig: "fetch(\"item\", { category: \"Sugar\" })", desc: "Query records of a form (object or predicate filter)", group: "Data" },
  { name: "get", sig: "get(\"vendor\", input.vendor)", desc: "Read one record by id", group: "Data" },
  { name: "insert", sig: "insert(\"stock_log\", { item: input.item, qty: 5 })", desc: "Create a record in another form (after save)", group: "Data" },
  { name: "update", sig: "update(\"item\", id, { stock: 20 })", desc: "Update a record (after save)", group: "Data" },
  { name: "increment", sig: "increment(\"item\", id, \"stock\", -qty)", desc: "Add/subtract on a number field (after save)", group: "Data" },
  { name: "remove", sig: "remove(\"item\", id)", desc: "Delete a record (after save)", group: "Data" },
  { name: "showPopup", sig: "showPopup(\"Low stock\", \"warning\")", desc: "Popup: info | warning | confirm | error (error blocks)", group: "UI" },
  { name: "confirm", sig: "confirm(\"Continue anyway?\")", desc: "Ask user to continue or cancel submit", group: "UI" },
  { name: "showError", sig: "showError(\"Cannot save\")", desc: "Error popup that blocks submit", group: "UI" },
  { name: "setError", sig: "setError(\"qty\", \"Too high\")", desc: "Field error + block submit", group: "UI" },
  { name: "blockSubmit", sig: "blockSubmit(\"reason\")", desc: "Stop the save", group: "UI" },
  { name: "showMessage", sig: "showMessage(\"Saved!\", \"success\")", desc: "Banner message", group: "UI" },
  { name: "hideField / showField", sig: "hideField(\"discount\")", desc: "Toggle field visibility (\"*\" = all fields, \"items.rate\" = one subform column)", group: "UI" },
  { name: "setReadonly / setEditable", sig: "setReadonly(\"total\")", desc: "Lock/unlock a field (\"*\" = all fields, \"items.available_qty\" = one subform column); disableField/enableField are aliases", group: "UI" },
  { name: "disableAll / enableAll", sig: "disableAll([\"notes\"])", desc: "Lock every field (optionally keep some editable) — e.g. on load when status is Approved", group: "UI" },
  { name: "sendEmail", sig: "sendEmail({ to, subject, body })", desc: "Queue an email (Trigger Email extension)", group: "Integrations" },
  { name: "notify", sig: "notify(\"a@b.com\", \"Title\", \"Body\")", desc: "In-app notification", group: "Integrations" },
  { name: "callWebhook", sig: "callWebhook(url, { method, body })", desc: "HTTP call after save", group: "Integrations" },
  { name: "today / now", sig: "today()", desc: "Dates", group: "Helpers" },
  { name: "dateDiff / dateAdd", sig: "dateDiff(a, b, \"days\")", desc: "Date math", group: "Helpers" },
  { name: "sum", sig: "sum(input.items, \"amount\")", desc: "Sum array field", group: "Helpers" },
  { name: "console.log", sig: "console.log(input)", desc: "Debug output (shown in test mode)", group: "Helpers" },
];
