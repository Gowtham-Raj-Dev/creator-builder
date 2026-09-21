import { AppDefinition, CURRENT_APP_SCHEMA_VERSION, ReportDefinition } from "@/types/schema";

/**
 * Per-app schema migrations. Each step upgrades from version N to N+1.
 * Runs on read so old apps keep working; the upgraded version is persisted on next save.
 */
type Migration = (app: AppDefinition) => AppDefinition;

const migrations: Record<number, Migration> = {
  // v1 → v2: introduce roles/members/sharing
  1: (app) => ({
    ...app,
    roles: app.roles || [],
    members: app.members || [],
    memberEmails: app.memberEmails || [],
    builders: app.builders || [],
    builderEmails: app.builderEmails || [],
    sharing: app.sharing || { mode: "private" },
  }),
  // v2 → v3: form columns default, field width default
  2: (app) => ({
    ...app,
    forms: app.forms.map((f) => ({ ...f, columns: f.columns || 2 })),
  }),
  // v3 → v4: legacy reconciliation → generic ledger
  3: (app) => ({
    ...app,
    reports: app.reports.map((r) => migrateReconciliation(r)),
  }),
  // v4 → v5: workflows get version + mode default
  4: (app) => ({
    ...app,
    workflows: app.workflows.map((w) => ({ ...w, mode: w.mode || "visual", version: w.version || 1 })),
  }),
  // v5 → v6: settings defaults
  5: (app) => ({
    ...app,
    settings: {
      theme: "light",
      accentColor: "#2563eb",
      currencySymbol: "₹",
      dateFormat: "DD MMM YYYY",
      showGlobalSearch: true,
      enableTrash: true,
      enableAudit: true,
      enableComments: true,
      ...(app.settings || {}),
    },
  }),
};

function migrateReconciliation(r: ReportDefinition): ReportDefinition {
  if (r.reportType !== ("reconciliation" as any) || !r.reconciliationConfig) return r;
  const c = r.reconciliationConfig;
  return {
    ...r,
    reportType: "ledger",
    ledger: {
      primaryFormId: c.primaryFormId,
      displayFieldIds: [],
      sources: [
        {
          id: "src_in",
          label: "Inflow",
          formId: c.inflowFormId,
          matchFieldId: c.inflowMatchFieldId,
          qtyFieldId: c.inflowQtyFieldId,
          direction: "in",
        },
        {
          id: "src_out",
          label: "Outflow",
          formId: c.outflowFormId,
          matchFieldId: c.outflowMatchFieldId,
          qtyFieldId: c.outflowQtyFieldId,
          direction: "out",
        },
      ],
    },
  };
}

export function migrateApp(app: AppDefinition): AppDefinition {
  let current = app;
  let v = current.schemaVersion || 1;
  while (v < CURRENT_APP_SCHEMA_VERSION) {
    const step = migrations[v];
    if (step) current = step(current);
    v += 1;
  }
  return { ...current, schemaVersion: CURRENT_APP_SCHEMA_VERSION };
}
