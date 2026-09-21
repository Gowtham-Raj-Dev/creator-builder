import { AppDefinition, AppRole, FormPermission, ReportPermission, RecordDefinition } from "@/types/schema";
import { isPlatformOwner } from "./config";

export interface EffectivePermissions {
  isOwner: boolean; // platform owner or app owner → can manage builder collaborators, delete the app
  isBuilder: boolean; // per-app builder collaborator (app.builderEmails)
  isAdmin: boolean; // role.isAdmin → full data access
  isMember: boolean;
  isPublicViewer: boolean;
  roleId?: string;
  roleName?: string;
  canEditBuilder: boolean; // owner or builder collaborator → may open the builder for this app
  form: (formId: string) => FormPermission;
  report: (reportId: string) => ReportPermission;
  page: (pageId: string) => boolean;
  canSeeRecord: (formId: string, record: RecordDefinition, email?: string | null) => boolean;
  fieldRule: (formId: string, fieldId: string) => "hidden" | "readonly" | undefined;
}

export const FULL_FORM_PERMISSION: FormPermission = {
  view: true,
  create: true,
  edit: true,
  delete: true,
  print: true,
  export: true,
  import: true,
  recordScope: "all",
};

export const VIEW_ONLY_FORM_PERMISSION: FormPermission = {
  view: true,
  create: false,
  edit: false,
  delete: false,
  print: true,
  export: false,
  import: false,
  recordScope: "all",
};

export const NO_FORM_PERMISSION: FormPermission = {
  view: false,
  create: false,
  edit: false,
  delete: false,
  print: false,
  export: false,
  import: false,
  recordScope: "all",
};

export const FULL_REPORT_PERMISSION: ReportPermission = { view: true, print: true, export: true };
export const VIEW_REPORT_PERMISSION: ReportPermission = { view: true, print: true, export: false };
export const NO_REPORT_PERMISSION: ReportPermission = { view: false, print: false, export: false };

export function createDefaultRole(name: string, app: AppDefinition, preset: "full" | "view" | "none" = "view"): AppRole {
  const fp = preset === "full" ? FULL_FORM_PERMISSION : preset === "view" ? VIEW_ONLY_FORM_PERMISSION : NO_FORM_PERMISSION;
  const rp = preset === "full" ? FULL_REPORT_PERMISSION : preset === "view" ? VIEW_REPORT_PERMISSION : NO_REPORT_PERMISSION;
  const role: AppRole = {
    id: `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    color: "#2563eb",
    isAdmin: false,
    defaultForm: { ...fp },
    forms: {},
    reports: {},
    pages: {},
    createdAt: new Date().toISOString(),
  };
  app.forms.forEach((f) => (role.forms[f.id] = { ...fp }));
  app.reports.forEach((r) => (role.reports[r.id] = { ...rp }));
  app.pages.forEach((p) => (role.pages[p.id] = { view: preset !== "none" }));
  return role;
}

/** True when `email` was given per-app builder access by the app owner. */
export function isAppBuilder(app: AppDefinition | null | undefined, email?: string | null): boolean {
  const lower = (email || "").trim().toLowerCase();
  if (!app || !lower) return false;
  return (app.builderEmails || []).includes(lower) || (app.builders || []).some((b) => b.email.toLowerCase() === lower);
}

export function computePermissions(app: AppDefinition | null, email?: string | null): EffectivePermissions {
  const lower = (email || "").toLowerCase();
  const platformOwner = isPlatformOwner(lower);
  const appOwner = Boolean(app?.ownerEmail && app.ownerEmail.toLowerCase() === lower);
  const isOwner = platformOwner || appOwner;
  const isBuilder = !isOwner && isAppBuilder(app, lower);
  const canEditBuilder = isOwner || isBuilder;

  const member = app?.members.find((m) => m.email.toLowerCase() === lower && m.status !== "disabled");
  const role = member ? app?.roles.find((r) => r.id === member.roleId) : undefined;
  const isAdmin = canEditBuilder || Boolean(role?.isAdmin);
  const isPublicViewer = !canEditBuilder && !member && app?.sharing?.mode === "public_view";
  const publicRole = isPublicViewer && app?.sharing?.defaultRoleId ? app.roles.find((r) => r.id === app.sharing?.defaultRoleId) : undefined;
  const activeRole = role || publicRole;

  const form = (formId: string): FormPermission => {
    if (isAdmin) return FULL_FORM_PERMISSION;
    if (activeRole) return activeRole.forms[formId] || activeRole.defaultForm || NO_FORM_PERMISSION;
    if (isPublicViewer) return VIEW_ONLY_FORM_PERMISSION;
    return NO_FORM_PERMISSION;
  };

  const report = (reportId: string): ReportPermission => {
    if (isAdmin) return FULL_REPORT_PERMISSION;
    if (activeRole) {
      if (activeRole.reports[reportId]) return activeRole.reports[reportId];
      // fall back to source form view permission
      const rep = app?.reports.find((r) => r.id === reportId);
      if (rep) {
        const fp = form(rep.sourceFormId);
        return { view: fp.view, print: fp.print, export: fp.export };
      }
      return NO_REPORT_PERMISSION;
    }
    if (isPublicViewer) return VIEW_REPORT_PERMISSION;
    return NO_REPORT_PERMISSION;
  };

  const page = (pageId: string): boolean => {
    if (isAdmin) return true;
    if (activeRole) return activeRole.pages[pageId]?.view ?? true;
    return isPublicViewer;
  };

  const canSeeRecord = (formId: string, record: RecordDefinition, userEmail?: string | null) => {
    const fp = form(formId);
    if (!fp.view) return false;
    if (fp.recordScope === "own" && !isAdmin) {
      return (record.createdBy || "").toLowerCase() === (userEmail || lower);
    }
    return true;
  };

  const fieldRule = (formId: string, fieldId: string) => {
    if (isAdmin) return undefined;
    return form(formId).fieldRules?.[fieldId];
  };

  return {
    isOwner,
    isBuilder,
    isAdmin,
    isMember: Boolean(member),
    isPublicViewer,
    roleId: activeRole?.id,
    roleName: activeRole?.name,
    canEditBuilder,
    form,
    report,
    page,
    canSeeRecord,
    fieldRule,
  };
}
