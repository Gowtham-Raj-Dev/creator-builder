import { AppDefinition } from "@/types/schema";
import { REPORT_TYPES } from "@/lib/engine/reportTypes";
import { SCRIPT_API_DOCS } from "@/lib/engine/workflowEngine";
import { FUNCTION_DOCS } from "@/lib/engine/formulaEngine";
import { FIELD_GROUPS, FORM_FEATURES, WORKFLOW_TRIGGERS, WORKFLOW_ACTIONS, DASHBOARD_WIDGETS, GOVERNANCE, AI_FEATURES } from "@/lib/docs/capabilities";
import { askAi, extractJsonLoose } from "./claude";

/**
 * "Discuss with AI": a platform-aware consultant. It knows exactly what this builder can and
 * cannot do, sees the user's current app, and answers with (a) an explanation, (b) concrete
 * actions — a builder location to click, a ready prompt for one of the AI tabs, or a docs link.
 */

export interface DiscussAction {
  type: "builder" | "ai_prompt" | "docs" | "live";
  label: string;
  /** builder: tab (forms|reports|workflows|pages|users|navigation|settings|health|ai) + optional form/report link name */
  tab?: string;
  form?: string;
  report?: string;
  /** ai_prompt: which AI tab and the prompt to prefill */
  aiTab?: "generate" | "newform" | "newreport" | "newworkflow" | "newdashboard" | "formula" | "query";
  prompt?: string;
  formId?: string; // for newworkflow (target form)
  /** docs: anchor id on /docs */
  anchor?: string;
}

export interface DiscussMessage { role: "user" | "assistant"; text: string; actions?: DiscussAction[]; feasibility?: "yes" | "partial" | "no" }

const CANNOT = [
  "Access data of a different app (each app is isolated).",
  "Call external APIs and read the response inside a form (callWebhook only sends; reading back needs a Cloud Function).",
  "Scheduled / webhook-triggered workflows and real email delivery run only with Firebase Cloud Functions / the Trigger Email extension.",
  "Generate PDFs from scripts (use the Print button), read Excel/PDF contents, OTP/login flows, payment collection, WhatsApp/SMS without a webhook service.",
  "Bulk-process thousands of records inside one save (scripts have a step limit) — use report import or a Cloud Function.",
  "Nested subforms (a subform inside a subform).",
  "Members cannot edit the app design; only the platform owner builds. Members use the published version with their role's permissions.",
];

function capabilityDoc(): string {
  const fields = FIELD_GROUPS.map((g) => `${g.title}: ${g.items.map((i) => i.name).join(", ")}`).join("\n");
  return `PLATFORM CAPABILITIES (authoritative — never claim features outside this list):
Fields (${FIELD_GROUPS.reduce((s, g) => s + g.items.length, 0)}): ${fields}
Form features: ${FORM_FEATURES.map((f) => `${f.name} — ${f.desc}`).join("; ")}
Lookups: searchable, multi, filtered (e.g. Active = Yes only), cascading (State → City), auto-fill, add-new inline, multi-column display. Subforms: blank (columns defined inline) or backed by an existing form (rows become that form's records with a parent lookup), row formulas, totals, min/max rows, import rows from another record.
Formulas: ${FUNCTION_DOCS.map((f) => f.name).join(", ")}; dot access through lookups (customer.credit_limit); sum(items.amount).
Report views (${REPORT_TYPES.length}): ${REPORT_TYPES.map((t) => `${t.label} (${t.useCases[0]})`).join("; ")}. Every report: filters with date presets, saved views, group totals, conditional formatting, inline edit, CSV/Excel export, CSV import, print, runtime view switching, trash/restore.
Workflows — triggers: ${WORKFLOW_TRIGGERS.map((t) => t.name).join(", ")}. No-code actions: ${WORKFLOW_ACTIONS.map((a) => a.name).join("; ")}. Script API (plain JavaScript sandbox): ${SCRIPT_API_DOCS.map((d) => d.sig).join("; ")}.
Dashboards: ${DASHBOARD_WIDGETS.map((w) => w.name).join("; ")} with a page date filter (Today / Last 7 days / This month / custom) driving all widgets.
Users & control: ${GOVERNANCE.map((g) => g.name).join("; ")}.
AI tabs: ${AI_FEATURES.map((a) => a.name).join("; ")}; New dashboard (page with KPIs/charts from a description); Print designs tab (builder → Print designs: invoice/receipt/challan layouts with field placeholders, AI-generated, default per form).
CANNOT / LIMITS: ${CANNOT.join(" ")}`;
}

function appSummary(app: AppDefinition): string {
  const forms = app.forms.map((f) => `- ${f.name} [link ${f.linkName}]: ${f.fields.filter((x) => x.type !== "section").map((x) => `${x.label}(${x.type}${x.type === "lookup" ? "→" + (app.forms.find((t) => t.id === x.lookup?.targetFormId)?.name || "?") : ""}${x.type === "subform" ? ": " + (x.subform?.columns || []).map((c) => c.label).join("/") : ""})`).join(", ")}`).join("\n");
  const reports = app.reports.map((r) => `- ${r.name} [${r.linkName}] (${r.reportType || "table"} on ${app.forms.find((f) => f.id === r.sourceFormId)?.name || "?"})`).join("\n");
  const workflows = app.workflows.map((w) => `- ${w.name} (${app.forms.find((f) => f.id === w.formId)?.name || "?"} · ${w.trigger.type} · ${w.mode}${w.active ? "" : " · disabled"})`).join("\n");
  const pages = app.pages.map((p) => `- ${p.name} (${p.components.length} widgets)`).join("\n");
  const roles = app.roles.map((r) => r.name).join(", ");
  return `CURRENT APP "${app.name}" [link ${app.linkName}]\nForms:\n${forms || "(none)"}\nReports:\n${reports || "(none)"}\nWorkflows:\n${workflows || "(none)"}\nPages:\n${pages || "(none)"}\nRoles: ${roles || "(none)"} · Members: ${app.members.length} · Published: ${app.publishedVersion ? "v" + app.publishedVersion : "not yet"}`;
}

export async function discussWithAi(history: DiscussMessage[], question: string, app: AppDefinition, audience: "owner" | "member"): Promise<DiscussMessage> {
  const system = `You are the in-product consultant of "YourBuilder", a Zoho-Creator-style low-code platform. The person asking is the ${audience === "owner" ? "app OWNER (can edit the builder)" : "a MEMBER (uses the live app; cannot edit the design — suggest what to ask the owner)"}.
${capabilityDoc()}

Your job: (1) understand what they want, (2) say clearly whether it is possible here — "yes", "partial" (possible with a workaround / Cloud Function) or "no", (3) explain briefly how, using THIS app's real form/field names, (4) give concrete actions.
Reply ONLY with JSON:
{"feasibility":"yes|partial|no","answer":"plain text, 3–8 short sentences or a short numbered list, Indian business context, no markdown headings",
 "actions":[
   {"type":"ai_prompt","label":"Let AI create the workflow","aiTab":"newworkflow","formId":"<form id>","prompt":"<complete prompt naming forms/fields/trigger/outcome>"},
   {"type":"ai_prompt","label":"…","aiTab":"newform|newreport|newdashboard|generate|formula|query","prompt":"…"},
   {"type":"builder","label":"Open the Sales Invoice form","tab":"forms","form":"<form link name>"},
   {"type":"builder","label":"Open users & roles","tab":"users"},
   {"type":"docs","label":"Read: lookups","anchor":"fields-lookup"}
 ]}
Rules: at most 4 actions; prefer an ai_prompt action whenever the AI tabs can do the work ("shall I do it?"), plus a builder action for the manual way. For members, only "docs" and "live" actions. Docs anchors: start-flow, fields-types, fields-lookup, fields-subform, fields-formula, fields-validation, reports-types, reports-config, pages-widgets, wf-triggers, wf-actions, script-api, script-recipes, users-roles, users-publish, ai-prompts, faq-list. Never invent fields that do not exist — if something is missing, say which field/form to add first.`;
  const convo = history.slice(-8).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");
  const text = await askAi(system, `${appSummary(app)}\n\nConversation so far:\n${convo || "(start)"}\n\nUser: ${question}`, undefined, 3000, { json: true });
  const raw = extractJsonLoose(text);
  const actions: DiscussAction[] = (raw.actions || []).filter((a: any) => a && a.type && a.label).slice(0, 4).map((a: any) => ({ ...a, formId: a.formId && app.forms.some((f) => f.id === a.formId) ? a.formId : app.forms.find((f) => f.name.toLowerCase() === String(a.formId || "").toLowerCase() || f.linkName === a.formId)?.id }));
  return { role: "assistant", text: String(raw.answer || raw.explanation || "").trim() || "I could not form an answer — try rephrasing.", actions, feasibility: ["yes", "partial", "no"].includes(raw.feasibility) ? raw.feasibility : undefined };
}
