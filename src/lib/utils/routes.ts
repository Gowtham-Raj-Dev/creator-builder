/**
 * Route generator utilities for Universal Static Runners on GitHub Pages
 */

export interface LiveAppRouteOptions {
  form?: string;
  report?: string;
  page?: string;
  action?: "new" | "edit";
  recordId?: string;
}

export interface BuilderRouteOptions {
  tab?: "forms" | "reports" | "workflows" | "pages" | "relationships" | "settings";
  form?: string;
  report?: string;
}

/**
 * Returns the URL for opening a live application runtime.
 * Defaults to the universal runner route `/app?app=<linkName>` which physically
 * exists in static export on GitHub Pages, avoiding 404 errors for dynamic apps.
 */
export function getLiveAppUrl(appLinkName: string, options?: LiveAppRouteOptions): string {
  const cleanLink = (appLinkName || "gowthamtest").trim().toLowerCase();
  const params = new URLSearchParams();
  params.set("app", cleanLink);

  if (options?.report) {
    params.set("report", options.report);
  } else if (options?.page) {
    params.set("page", options.page);
  } else if (options?.form) {
    params.set("form", options.form);
    if (options.action === "new") {
      params.set("action", "new");
    } else if (options.recordId) {
      params.set("record", options.recordId);
    }
  }

  return `/app?${params.toString()}`;
}

/**
 * Returns the URL for opening the visual application builder.
 * Defaults to the universal editor route `/builder/editor?app=<linkName>` which
 * physically exists in static export on GitHub Pages.
 */
export function getBuilderUrl(appLinkName: string, options?: BuilderRouteOptions): string {
  const cleanLink = (appLinkName || "gowthamtest").trim().toLowerCase();
  const params = new URLSearchParams();
  params.set("app", cleanLink);

  if (options?.tab) {
    params.set("tab", options.tab);
  }
  if (options?.form) {
    params.set("form", options.form);
  }
  if (options?.report) {
    params.set("report", options.report);
  }

  return `/builder/editor?${params.toString()}`;
}
