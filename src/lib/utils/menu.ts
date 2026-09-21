import { AppDefinition, MenuSection, NavItem } from "@/types/schema";

export const DEFAULT_MENU_SECTIONS: MenuSection[] = [
  { id: "pages", label: "Dashboards & Pages", icon: "dashboard" },
  { id: "forms", label: "Modules", icon: "boxes" },
  { id: "reports", label: "Reports & Ledgers", icon: "chart" },
];

/** Sections configured for the app (built-ins are always present, user can rename/reorder/add). */
export function getMenuSections(app: Pick<AppDefinition, "settings">): MenuSection[] {
  const custom = app.settings?.menuSections;
  if (custom && custom.length) {
    const ids = new Set(custom.map((s) => s.id));
    return [...custom, ...DEFAULT_MENU_SECTIONS.filter((d) => !ids.has(d.id))];
  }
  return DEFAULT_MENU_SECTIONS;
}

/** Default section for an entity when none is assigned. */
export function defaultSectionFor(kind: "form" | "report" | "page", app: Pick<AppDefinition, "forms" | "reports">, refId: string): string {
  if (kind === "page") return "pages";
  if (kind === "form") return "forms";
  // a form's default (first non-ledger) report belongs with its module; other reports go to "reports"
  const rep = app.reports.find((r) => r.id === refId);
  if (!rep) return "reports";
  const isDefault = rep.reportType !== "ledger" && app.reports.find((x) => x.sourceFormId === rep.sourceFormId && x.reportType !== "ledger")?.id === rep.id;
  return isDefault ? "forms" : "reports";
}

/**
 * Build the automatic navigation: every visible page/form/report placed in its section.
 * A form's default report is represented by the form itself (opening the form shows that report),
 * so it is not listed twice.
 */
export function buildAutoNavigation(app: Pick<AppDefinition, "forms" | "reports" | "pages" | "settings">): NavItem[] {
  const sections = getMenuSections(app);
  const buckets = new Map<string, NavItem[]>();
  const put = (sectionId: string, item: NavItem) => { const key = sections.some((s) => s.id === sectionId) ? sectionId : "reports"; (buckets.get(key) || buckets.set(key, []).get(key)!).push(item); };

  for (const p of app.pages) put(p.menuSectionId || "pages", { id: `p_${p.id}`, type: "page", refId: p.id, icon: p.icon });
  for (const f of app.forms) put(f.menuSectionId || "forms", { id: `f_${f.id}`, type: "form", refId: f.id, icon: f.icon });
  for (const r of app.reports) {
    if (r.showInMenu === false) continue;
    const isDefault = r.reportType !== "ledger" && app.reports.find((x) => x.sourceFormId === r.sourceFormId && x.reportType !== "ledger")?.id === r.id;
    if (isDefault && !r.menuSectionId) continue; // shown via its form
    put(r.menuSectionId || "reports", { id: `r_${r.id}`, type: "report", refId: r.id, icon: r.icon });
  }
  return sections.filter((s) => (buckets.get(s.id) || []).length > 0).map((s) => ({ id: `sec_${s.id}`, type: "section", label: s.label, icon: s.icon, children: buckets.get(s.id) || [] }));
}
