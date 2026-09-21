/**
 * Route helpers. The platform ships as a static export (GitHub Pages / Firebase Hosting),
 * so every app is served through two universal runners that physically exist:
 *   /app?app=<linkName>…            live application
 *   /builder/editor?app=<linkName>… builder
 * Pretty URLs (/<app>/<form>/new, /builder/<app>/forms/<form>) are rewritten to these
 * by not-found.tsx / 404.html on the client.
 */

export interface LiveAppRouteOptions {
  form?: string;
  report?: string;
  page?: string;
  action?: "new" | "edit" | "trash";
  recordId?: string;
  prefill?: Record<string, string>;
  view?: string;
}

export type BuilderTab =
  | "forms"
  | "reports"
  | "workflows"
  | "pages"
  | "relationships"
  | "users"
  | "navigation"
  | "versions"
  | "audit"
  | "health"
  | "settings"
  | "ai";

export interface BuilderRouteOptions {
  tab?: BuilderTab;
  form?: string;
  report?: string;
  workflow?: string;
  page?: string;
}

export function getLiveAppUrl(appLinkName: string, options?: LiveAppRouteOptions): string {
  const params = new URLSearchParams();
  params.set("app", (appLinkName || "").trim().toLowerCase());
  if (options?.report) params.set("report", options.report);
  else if (options?.page) params.set("page", options.page);
  else if (options?.form) {
    params.set("form", options.form);
    if (options.action === "new") params.set("action", "new");
    else if (options.action === "trash") params.set("action", "trash");
    else if (options.recordId) params.set("record", options.recordId);
  }
  if (options?.view) params.set("view", options.view);
  if (options?.prefill) for (const [k, v] of Object.entries(options.prefill)) params.set(`prefill_${k}`, v);
  return `/app?${params.toString()}`;
}

export function getBuilderUrl(appLinkName: string, options?: BuilderRouteOptions): string {
  const params = new URLSearchParams();
  params.set("app", (appLinkName || "").trim().toLowerCase());
  if (options?.tab) params.set("tab", options.tab);
  if (options?.form) params.set("form", options.form);
  if (options?.report) params.set("report", options.report);
  if (options?.workflow) params.set("workflow", options.workflow);
  if (options?.page) params.set("page", options.page);
  return `/builder/editor?${params.toString()}`;
}

/** Absolute share URL for an app (uses current origin + basePath). */
export function getShareUrl(appLinkName: string): string {
  if (typeof window === "undefined") return getLiveAppUrl(appLinkName);
  const path = window.location.pathname;
  const idx = path.indexOf("/builder");
  const base = idx > 0 ? path.slice(0, idx) : path.startsWith("/app") ? "" : path.replace(/\/(app|builder).*$/, "");
  return `${window.location.origin}${base}${getLiveAppUrl(appLinkName)}`;
}
