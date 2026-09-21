import { AppDefinition } from "@/types/schema";

/** What would break or be removed if an entity were deleted — shown before any delete. */
export interface DeleteImpact {
  removed: string[]; // things deleted together with it
  broken: string[]; // things that keep existing but lose a reference
}

export function formDeleteImpact(app: AppDefinition, formId: string): DeleteImpact {
  const form = app.forms.find((f) => f.id === formId);
  const removed: string[] = []; const broken: string[] = [];
  if (!form) return { removed, broken };
  for (const r of app.reports) if (r.sourceFormId === formId) removed.push(`Report "${r.name}"`);
  for (const w of app.workflows) if (w.formId === formId) removed.push(`Workflow "${w.name}"`);
  for (const f of app.forms) {
    if (f.id === formId) continue;
    for (const x of f.fields) {
      if (x.type === "lookup" && x.lookup?.targetFormId === formId) broken.push(`Lookup ${f.name} › ${x.label}`);
      if (x.type === "rollup" && x.rollup?.sourceFormId === formId) broken.push(`Rollup ${f.name} › ${x.label}`);
      if (x.type === "subform") {
        if (x.subform?.targetFormId === formId) broken.push(`Subform ${f.name} › ${x.label} (rows are ${form.name} records)`);
        for (const c of x.subform?.columns || []) if (c.type === "lookup" && c.lookup?.targetFormId === formId) broken.push(`Lookup ${f.name} › ${x.label} › ${c.label}`);
      }
    }
  }
  for (const r of app.reports) {
    if (r.sourceFormId === formId) continue;
    for (const s of r.ledger?.sources || []) if (s.formId === formId) broken.push(`Ledger "${r.name}" source "${s.label}"`);
    if (r.ledger?.primaryFormId === formId) broken.push(`Ledger "${r.name}" (primary form)`);
  }
  for (const w of app.workflows) {
    if (w.formId === formId) continue;
    if (w.codeScript && new RegExp(`["'\`]${form.linkName}["'\`]`).test(w.codeScript)) broken.push(`Workflow "${w.name}" script uses "${form.linkName}"`);
    for (const a of w.actions) if (a.crossFormUpdate?.targetFormId === formId || a.createRecord?.targetFormId === formId) broken.push(`Workflow "${w.name}" action targets ${form.name}`);
  }
  for (const p of app.pages) {
    const walk = (comps: any[]): boolean => comps.some((c) => c.props?.formId === formId || c.props?.sourceFormId === formId || (c.props?.stats || []).some((s: any) => s.metric?.formId === formId) || (c.children && walk(c.children)));
    if (walk(p.components)) broken.push(`Page "${p.name}" widget`);
  }
  return { removed, broken };
}

export function reportDeleteImpact(app: AppDefinition, reportId: string): DeleteImpact {
  const broken: string[] = [];
  for (const p of app.pages) {
    const walk = (comps: any[]): boolean => comps.some((c) => c.props?.reportId === reportId || (c.children && walk(c.children)));
    if (walk(p.components)) broken.push(`Page "${p.name}" report widget`);
  }
  const walkNav = (items: any[]): void => { for (const it of items || []) { if (it.type === "report" && it.refId === reportId) broken.push(`Menu item "${it.label || "Report"}"`); if (it.children) walkNav(it.children); } };
  walkNav(app.settings?.navigation || []);
  return { removed: [], broken };
}

export function workflowDeleteImpact(app: AppDefinition, workflowId: string): DeleteImpact {
  const w = app.workflows.find((x) => x.id === workflowId);
  const form = w && app.forms.find((f) => f.id === w.formId);
  return { removed: [], broken: w && form ? [`${form.name} will no longer run "${w.name}" on ${w.trigger.type}`] : [] };
}
