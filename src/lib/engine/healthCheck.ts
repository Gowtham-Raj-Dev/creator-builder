import { AppDefinition, FormDefinition, LedgerSource, ReportDefinition } from "@/types/schema";
import { validateFormulaSyntax } from "./formulaEngine";
import { checkScriptSyntax } from "./scriptInterpreter";
import { REPORT_TYPE_META, defaultConfigFor } from "./reportTypes";

export interface HealthIssue {
  id: string;
  severity: "error" | "warning" | "info";
  area: "form" | "report" | "workflow" | "page" | "role" | "app";
  entityId?: string;
  entityName: string;
  message: string;
  fix?: string;
  /** When set, `applyHealthFix` can repair this issue automatically. */
  autoFix?: { label: string; kind: "ledger_source" | "ledger_add_sources" | "view_config" | "prune_columns"; reportId: string; sourceId?: string };
}

// ── Ledger helpers (shared by the check and the auto-fix) ────────────────────

/** Path options in `form` that point at `primaryId` (lookup or subform.column) and numeric quantity paths. */
function ledgerPaths(form: FormDefinition, primaryId: string) {
  const lookups: Array<{ id: string; subformId?: string; label: string }> = [];
  const qtys: Array<{ id: string; subformId?: string; label: string }> = [];
  const isQty = (f: { type: string; formula?: { resultType?: string } }) => ["number", "decimal", "currency"].includes(f.type) || (f.type === "formula" && f.formula?.resultType === "number");
  for (const f of form.fields) {
    if (f.type === "lookup" && f.lookup?.targetFormId === primaryId) lookups.push({ id: f.id, label: f.label });
    if (isQty(f)) qtys.push({ id: f.id, label: f.label });
    if (f.type === "subform") for (const c of f.subform?.columns || []) {
      if (c.type === "lookup" && c.lookup?.targetFormId === primaryId) lookups.push({ id: `${f.id}.${c.id}`, subformId: f.id, label: `${f.label} › ${c.label}` });
      if (isQty(c)) qtys.push({ id: `${f.id}.${c.id}`, subformId: f.id, label: `${f.label} › ${c.label}` });
    }
  }
  return { lookups, qtys };
}

const qtyScore = (label: string) => (/\bqty\b|quantity|nos|units?/i.test(label) ? 3 : /amount|total|value|rate|price/i.test(label) ? 0 : 1);

/** Best (match, qty) pair for a ledger source in `form`: prefer subform pairs from the same subform, prefer "Quantity"-like labels. */
export function suggestLedgerSource(form: FormDefinition, primaryId: string): { matchFieldId: string; qtyFieldId: string } | null {
  const { lookups, qtys } = ledgerPaths(form, primaryId);
  let best: { matchFieldId: string; qtyFieldId: string; score: number } | null = null;
  for (const l of lookups) for (const q of qtys) {
    if (l.subformId !== q.subformId) continue; // must live in the same place
    const score = qtyScore(q.label) + (l.subformId ? 1 : 0);
    if (!best || score > best.score) best = { matchFieldId: l.id, qtyFieldId: q.id, score };
  }
  return best ? { matchFieldId: best.matchFieldId, qtyFieldId: best.qtyFieldId } : null;
}

function validateLedgerSource(src: LedgerSource, srcForm: FormDefinition, primaryId: string): string | null {
  const { lookups, qtys } = ledgerPaths(srcForm, primaryId);
  const m = lookups.find((x) => x.id === src.matchFieldId);
  const q = qtys.find((x) => x.id === src.qtyFieldId);
  if (!src.matchFieldId || !m) return `Item lookup is not set or no longer points to the ledger's item form`;
  if (!src.qtyFieldId || !q) return `Quantity field is not set or is not numeric`;
  if (m.subformId !== q.subformId) return `Item lookup (${m.label}) and Quantity (${q.label}) must be in the same subform`;
  if (src.filters?.length) for (const f of src.filters) {
    const ff = srcForm.fields.find((x) => x.id === f.fieldId);
    if (!ff) return `"Only count records where" refers to a deleted field`;
    if (ff.options?.length && f.value !== undefined && f.value !== "" && ["equals", "not_equals"].includes(f.operator) && !ff.options.includes(String(f.value))) return `Filter value "${f.value}" is not one of ${ff.label}'s options (${ff.options.join(", ")})`;
  }
  return null;
}

/** Guess which forms flow in/out of the primary form (transactions with a lookup to it) when a ledger has no sources. */
export function guessLedgerSources(app: AppDefinition, primaryId: string): LedgerSource[] {
  const out: LedgerSource[] = [];
  for (const f of app.forms) {
    if (f.id === primaryId) continue;
    const s = suggestLedgerSource(f, primaryId);
    if (!s) continue;
    const direction: "in" | "out" = /purchase|receipt|grn|inward|production|opening|return in|receive/i.test(f.name) ? "in" : "out";
    const dateField = f.fields.find((x) => x.type === "date" || x.type === "datetime");
    const refField = f.fields.find((x) => x.type === "autonumber");
    out.push({ id: `src_${f.id}`, label: f.name, formId: f.id, direction, dateFieldId: dateField?.id, refFieldId: refField?.id, ...s });
  }
  return out;
}

/** Apply an auto-fixable issue to the app definition (pure). Returns the same app when nothing applies. */
export function applyHealthFix(app: AppDefinition, issue: HealthIssue): AppDefinition {
  const fx = issue.autoFix;
  if (!fx) return app;
  const rep = app.reports.find((r) => r.id === fx.reportId);
  if (!rep) return app;
  let next: ReportDefinition = rep;
  if (fx.kind === "ledger_source" && rep.ledger) {
    next = { ...rep, ledger: { ...rep.ledger, sources: rep.ledger.sources.map((s) => { if (s.id !== fx.sourceId) return s; const sf = app.forms.find((f) => f.id === s.formId); const sug = sf && suggestLedgerSource(sf, rep.ledger!.primaryFormId); return sug ? { ...s, ...sug, filters: validateLedgerSource({ ...s, ...sug }, sf!, rep.ledger!.primaryFormId)?.startsWith("Filter value") ? [] : s.filters } : s; }) } };
  } else if (fx.kind === "ledger_add_sources") {
    const primaryId = rep.ledger?.primaryFormId || rep.sourceFormId;
    const base = rep.ledger || defaultConfigFor("ledger", rep, app.forms.find((f) => f.id === rep.sourceFormId)!).ledger!;
    next = { ...rep, ledger: { ...base, primaryFormId: primaryId, sources: guessLedgerSources(app, primaryId) } };
  } else if (fx.kind === "prune_columns") {
    const src = app.forms.find((f) => f.id === rep.sourceFormId);
    if (src) next = { ...rep, columns: rep.columns.filter((c) => ["createdAt", "updatedAt", "createdBy"].includes(c.fieldId) || src.fields.some((f) => f.id === c.fieldId)) };
  } else if (fx.kind === "view_config") {
    const form = app.forms.find((f) => f.id === rep.sourceFormId);
    if (form && rep.reportType) { const key = rep.reportType as keyof ReportDefinition; const stripped = { ...rep, [key]: undefined }; next = { ...rep, ...defaultConfigFor(rep.reportType, stripped, form) }; }
  }
  if (next === rep) return app;
  return { ...app, reports: app.reports.map((r) => (r.id === rep.id ? { ...next, updatedAt: new Date().toISOString() } : r)) };
}

/**
 * Static analysis of an app schema: broken lookups, dangling references,
 * invalid formulas/scripts, unused fields, permission gaps.
 */
export function runHealthCheck(app: AppDefinition): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const formIds = new Set(app.forms.map((f) => f.id));
  const push = (i: Omit<HealthIssue, "id">) => issues.push({ ...i, id: `hi_${issues.length + 1}` });

  const fieldRefCount = new Map<string, number>(); // `${formId}.${fieldId}` -> uses

  const noteRef = (formId: string, fieldId?: string) => {
    if (!fieldId) return;
    const key = `${formId}.${fieldId.split(".")[0]}`;
    fieldRefCount.set(key, (fieldRefCount.get(key) || 0) + 1);
  };

  // Forms & fields
  for (const form of app.forms) {
    if (form.fields.length === 0) push({ severity: "warning", area: "form", entityId: form.id, entityName: form.name, message: "Form has no fields.", fix: "Add fields in the form builder." });
    const linkNames = new Set<string>();
    for (const field of form.fields) {
      if (linkNames.has(field.linkName)) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: `Duplicate link name "${field.linkName}".` });
      linkNames.add(field.linkName);

      if (field.type === "lookup") {
        if (!field.lookup?.targetFormId || !formIds.has(field.lookup.targetFormId)) {
          push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Lookup points to a form that no longer exists.", fix: "Re-select the related form." });
        } else {
          const tf = app.forms.find((f) => f.id === field.lookup!.targetFormId)!;
          if (!tf.fields.some((f) => f.id === field.lookup!.displayFieldId)) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Lookup display field was deleted.", fix: "Choose a display field." });
          for (const af of field.lookup.autoFill || []) {
            if (!tf.fields.some((f) => f.id === af.sourceFieldId)) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Auto-fill source field no longer exists." });
            if (!form.fields.some((f) => f.id === af.targetFieldId)) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Auto-fill target field no longer exists." });
          }
          if (field.lookup.cascade?.parentFieldId && !form.fields.some((f) => f.id === field.lookup!.cascade!.parentFieldId)) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Cascading parent field was deleted." });
        }
      }
      if (field.type === "subform") {
        for (const col of field.subform?.columns || []) {
          if (col.type === "lookup" && (!col.lookup?.targetFormId || !formIds.has(col.lookup.targetFormId))) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label} › ${col.label}`, message: "Subform lookup column points to a missing form." });
          if (col.formula?.expression) {
            const v = validateFormulaSyntax(col.formula.expression);
            if (!v.ok) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label} › ${col.label}`, message: `Row formula error: ${v.error}` });
          }
        }
        if ((field.subform?.columns || []).length === 0) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Subform has no columns." });
      }
      if (field.type === "formula") {
        if (!field.formula?.expression) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Formula field has no expression." });
        else {
          const v = validateFormulaSyntax(field.formula.expression);
          if (!v.ok) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: `Formula error: ${v.error}` });
        }
      }
      if (field.type === "rollup") {
        const r = field.rollup;
        if (!r?.sourceFormId || !formIds.has(r.sourceFormId)) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Rollup source form is missing." });
        else if (!r.matchFieldId) push({ severity: "warning", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Rollup has no match (lookup) field." });
      }
      if (field.visibilityRule) {
        const v = validateFormulaSyntax(field.visibilityRule);
        if (!v.ok) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: `Visibility rule error: ${v.error}` });
      }
      for (const rule of field.validation?.rules || []) {
        const v = validateFormulaSyntax(rule.expression);
        if (!v.ok) push({ severity: "error", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: `Validation rule error: ${v.error}` });
      }
    }
  }

  // Reports
  for (const rep of app.reports) {
    const src = app.forms.find((f) => f.id === rep.sourceFormId);
    if (!src) { push({ severity: "error", area: "report", entityId: rep.id, entityName: rep.name, message: "Report source form was deleted.", fix: "Delete this report or re-point it." }); continue; }
    const SYSTEM_COLS = ["createdAt", "updatedAt", "createdBy"];
    const stale = rep.columns.filter((col) => !SYSTEM_COLS.includes(col.fieldId) && !src.fields.some((f) => f.id === col.fieldId));
    if (stale.length) push({ severity: "warning", area: "report", entityId: rep.id, entityName: rep.name, message: `${stale.length} column${stale.length > 1 ? "s" : ""} (${stale.map((c) => `"${c.label}"`).join(", ")}) refer to fields that no longer exist.`, fix: "Remove the stale columns.", autoFix: { label: "Remove stale columns", kind: "prune_columns", reportId: rep.id } });
    for (const flt of rep.filters || []) if (!src.fields.some((f) => f.id === flt.fieldId) && !["createdAt", "updatedAt", "createdBy"].includes(flt.fieldId)) push({ severity: "warning", area: "report", entityId: rep.id, entityName: rep.name, message: "A filter refers to a deleted field." });
    // view-specific configuration (every type declares what it needs in reportTypes.ts)
    const meta = REPORT_TYPE_META[rep.reportType || "table"];
    if (meta?.needs && rep.reportType !== "ledger") {
      const missing = meta.needs.filter((path) => { const [k, sub] = path.split("."); const v = (rep as any)[k]?.[sub]; return !v; });
      const dangling = meta.needs.filter((path) => { const [k, sub] = path.split("."); const v = (rep as any)[k]?.[sub]; return v && v !== "createdAt" && !src.fields.some((f) => f.id === v); });
      if (missing.length || dangling.length) {
        const canGuess = Object.keys(defaultConfigFor(rep.reportType!, { ...rep, [rep.reportType!]: undefined } as any, src)).length > 0;
        push({ severity: "warning", area: "report", entityId: rep.id, entityName: rep.name, message: `${meta.label} view is missing ${[...missing, ...dangling].map((p) => p.split(".")[1]).join(", ")}${dangling.length ? " (field was deleted)" : ""}.`, fix: `Set it under View config → ${meta.label}.`, autoFix: canGuess ? { label: "Auto-detect fields", kind: "view_config", reportId: rep.id } : undefined });
      }
    }
    if (rep.reportType === "ledger") {
      const primaryId = rep.ledger?.primaryFormId || rep.sourceFormId;
      const sources = rep.ledger?.sources || [];
      if (!sources.length) push({ severity: "error", area: "report", entityId: rep.id, entityName: rep.name, message: "Ledger has no inflow/outflow sources, so every balance equals the opening value.", fix: "Add sources (e.g. Purchase → in, Sales Invoice → out).", autoFix: guessLedgerSources(app, primaryId).length ? { label: "Add sources automatically", kind: "ledger_add_sources", reportId: rep.id } : undefined });
      for (const s of sources) {
        const sf = app.forms.find((f) => f.id === s.formId);
        if (!sf) { push({ severity: "error", area: "report", entityId: rep.id, entityName: rep.name, message: `Ledger source "${s.label}" points to a missing form.` }); continue; }
        const problem = validateLedgerSource(s, sf, primaryId);
        if (problem) push({ severity: "error", area: "report", entityId: rep.id, entityName: `${rep.name} › ${s.label}`, message: `${problem} — this source contributes nothing to the balance.`, fix: "Open View config → Ledger sources and pick the subform's item column and quantity column.", autoFix: suggestLedgerSource(sf, primaryId) ? { label: "Fix mapping", kind: "ledger_source", reportId: rep.id, sourceId: s.id } : undefined });
      }
      if (rep.ledger && !rep.ledger.minLevelFieldId) push({ severity: "info", area: "report", entityId: rep.id, entityName: rep.name, message: "No minimum-level field: status will always show OK.", fix: "Choose a 'Minimum level' field in the ledger settings." });
    }
    rep.columns.forEach((c) => noteRef(rep.sourceFormId, c.fieldId));
  }

  // Workflows
  for (const wf of app.workflows) {
    const form = app.forms.find((f) => f.id === wf.formId);
    if (!form) { push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: "Workflow belongs to a deleted form." }); continue; }
    if (wf.trigger.fieldId && wf.trigger.type === "onUserInput") {
      const top = wf.trigger.fieldId.split(".")[0];
      if (!form.fields.some((f) => f.id === top || f.linkName === top)) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: "Trigger field no longer exists." });
      noteRef(form.id, top);
    }
    if (wf.mode === "code" && wf.codeScript) {
      const s = checkScriptSyntax(wf.codeScript);
      if (!s.ok) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: `Script syntax error: ${s.error}` });
    }
    for (const a of wf.actions) {
      if (a.targetFieldId && a.targetFieldId !== "*") { // "*" = all fields (visibility / read-only actions)
        const [top, col] = a.targetFieldId.split(".");
        const target = form.fields.find((f) => f.id === top || f.linkName === top);
        if (!target) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: `Action "${a.type}" targets a deleted field.` });
        else if (col && !(target.subform?.columns || []).some((c) => c.id === col || c.linkName === col)) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: `Action "${a.type}" targets a deleted column of "${target.label}".` });
        noteRef(form.id, top);
      }
      if (a.crossFormUpdate && !formIds.has(a.crossFormUpdate.targetFormId)) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: "Cross-form update targets a missing form." });
      if (a.createRecord && !formIds.has(a.createRecord.targetFormId)) push({ severity: "error", area: "workflow", entityId: wf.id, entityName: wf.name, message: "Create-record action targets a missing form." });
      for (const c of a.visualConditions || []) if (!form.fields.some((f) => f.id === c.fieldId || f.linkName === c.fieldId)) push({ severity: "warning", area: "workflow", entityId: wf.id, entityName: wf.name, message: "A condition refers to a deleted field." });
    }
    if (!wf.active) push({ severity: "info", area: "workflow", entityId: wf.id, entityName: wf.name, message: "Workflow is disabled." });
    if ((wf.trigger.type === "scheduled" || wf.trigger.type === "webhook")) push({ severity: "info", area: "workflow", entityId: wf.id, entityName: wf.name, message: `"${wf.trigger.type}" triggers need a Cloud Function/Scheduler to run server-side.` });
  }

  // Pages
  for (const page of app.pages) {
    const walk = (comps: any[]) => {
      for (const c of comps) {
        const fid = c.props?.formId || c.props?.sourceFormId;
        if (fid && !formIds.has(fid)) push({ severity: "warning", area: "page", entityId: page.id, entityName: `${page.name} › ${c.type}`, message: "Widget refers to a deleted form." });
        const rid = c.props?.reportId;
        if (rid && !app.reports.some((r) => r.id === rid)) push({ severity: "warning", area: "page", entityId: page.id, entityName: `${page.name} › ${c.type}`, message: "Widget refers to a deleted report." });
        if (c.children) walk(c.children);
      }
    };
    walk(page.components);
  }

  // Roles / members
  for (const m of app.members) if (!app.roles.some((r) => r.id === m.roleId)) push({ severity: "error", area: "role", entityName: m.email, message: "Member is assigned to a deleted role.", fix: "Assign a designation." });
  if (app.members.length > 0 && app.roles.length === 0) push({ severity: "warning", area: "role", entityName: "Roles", message: "Members exist but no roles are defined." });
  for (const role of app.roles) {
    for (const form of app.forms) if (!role.forms[form.id] && !role.defaultForm && !role.isAdmin) push({ severity: "info", area: "role", entityId: role.id, entityName: role.name, message: `No permission set for form "${form.name}" (defaults to no access).` });
  }

  // Unused fields (never referenced by reports/workflows and not shown in any report)
  for (const form of app.forms) {
    const reps = app.reports.filter((r) => r.sourceFormId === form.id);
    for (const field of form.fields) {
      if (field.type === "section") continue;
      const shown = reps.some((r) => r.columns.some((c) => c.fieldId === field.id && c.visible !== false));
      if (field.type === "lookup" && field.lookup?.relationshipType === "parent") continue; // auto-managed back-reference of a linked subform
      if (!shown && !fieldRefCount.get(`${form.id}.${field.id}`)) push({ severity: "info", area: "form", entityId: form.id, entityName: `${form.name} › ${field.label}`, message: "Field is not displayed in any report or used by workflows." });
    }
  }

  if (app.forms.length === 0) push({ severity: "info", area: "app", entityName: app.name, message: "App has no forms yet." });
  if (!app.pages.some((p) => p.isHome) && app.pages.length > 1) push({ severity: "info", area: "app", entityName: app.name, message: "No page is marked as Home; the first page will be used." });

  return issues;
}
