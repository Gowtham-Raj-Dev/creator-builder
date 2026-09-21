/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from "@anthropic-ai/sdk";
import { AppDefinition, FieldDefinition, FormDefinition, ReportDefinition, WorkflowDefinition } from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { generateId } from "@/lib/utils/idGenerator";
import { toLinkName, generateUniqueLinkName } from "@/lib/utils/linkName";
import { FUNCTION_DOCS } from "@/lib/engine/formulaEngine";
import { SCRIPT_API_DOCS } from "@/lib/engine/workflowEngine";
import { checkScriptSyntax } from "@/lib/engine/scriptInterpreter";
import { REPORT_TYPE_IDS, REPORT_TYPES_PROMPT, defaultConfigFor } from "@/lib/engine/reportTypes";
import { suggestLedgerSource, guessLedgerSources } from "@/lib/engine/healthCheck";
import { resolveLinkedSubforms } from "@/lib/engine/subformLink";

/**
 * Browser-side AI client (Anthropic Claude, Google Gemini or Groq). The platform runs as a
 * static site, so the owner's keys are kept in Firestore (platform/settings, owner-only rules)
 * and used directly from the browser.
 */
const ANTHROPIC_MODEL = "claude-opus-5";
const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash";
const GROQ_MODEL_DEFAULT = "llama-3.3-70b-versatile";

export type AiProvider = "anthropic" | "gemini" | "groq";

export interface AiSettings {
  aiProvider: AiProvider;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  geminiModel?: string;
  groqModel?: string;
}

/** Per-app override stored owner-only at platform/ai_<appId> (never inside the app doc members can read). */
export interface AppAiOverride extends Partial<AiSettings> { useOwnKeys?: boolean }

let cachedGlobal: AiSettings | null = null;
const cachedApp = new Map<string, AppAiOverride>();
let activeAppId: string | null = null;

/** Tell the AI client which app is active so per-app keys apply (called by the builder). */
export function setActiveAiApp(appId: string | null) { activeAppId = appId; }

function normalize(s: any): AiSettings {
  return { aiProvider: (s?.aiProvider as AiProvider) || (s?.geminiApiKey ? "gemini" : s?.groqApiKey ? "groq" : "anthropic"), anthropicApiKey: s?.anthropicApiKey || "", geminiApiKey: s?.geminiApiKey || "", groqApiKey: s?.groqApiKey || "", geminiModel: s?.geminiModel || GEMINI_MODEL_DEFAULT, groqModel: s?.groqModel || GROQ_MODEL_DEFAULT };
}

export async function getGlobalAiSettings(): Promise<AiSettings> {
  if (cachedGlobal) return cachedGlobal;
  cachedGlobal = normalize(await storageService.getPlatformSettings());
  return cachedGlobal;
}

export async function getAppAiOverride(appId: string): Promise<AppAiOverride> {
  if (cachedApp.has(appId)) return cachedApp.get(appId)!;
  const d = await storageService.getPlatformDoc(`ai_${appId}`);
  const o: AppAiOverride = { useOwnKeys: Boolean(d?.useOwnKeys), ...(d?.useOwnKeys ? normalize(d) : {}) };
  cachedApp.set(appId, o);
  return o;
}

/** Effective settings: the active app's own keys when enabled, otherwise the global platform keys. */
export async function getAiSettings(): Promise<AiSettings & { source: "app" | "global" }> {
  const g = await getGlobalAiSettings();
  if (activeAppId) {
    const o = await getAppAiOverride(activeAppId);
    if (o.useOwnKeys) return { ...normalize(o), source: "app" };
  }
  return { ...g, source: "global" };
}

export async function saveAiSettings(patch: Partial<AiSettings>) {
  const next = { ...(await getGlobalAiSettings()), ...patch };
  cachedGlobal = next;
  await storageService.savePlatformSettings(next);
}

export async function saveAppAiOverride(appId: string, override: AppAiOverride) {
  cachedApp.set(appId, override);
  await storageService.savePlatformDoc(`ai_${appId}`, override);
}

/** True when the active provider has a key. */
export async function hasActiveKey(): Promise<boolean> {
  const s = await getAiSettings();
  return Boolean(s.aiProvider === "gemini" ? s.geminiApiKey : s.aiProvider === "groq" ? s.groqApiKey : s.anthropicApiKey);
}

/** @deprecated kept for older imports */
export async function getApiKey(): Promise<string | null> { return (await hasActiveKey()) ? "configured" : null; }
export async function saveApiKey(key: string) { await saveAiSettings({ anthropicApiKey: key.trim(), aiProvider: "anthropic" }); }

async function client(): Promise<Anthropic> {
  const s = await getAiSettings();
  if (!s.anthropicApiKey) throw new Error("No Anthropic API key configured. Add it under AI Assistant → API key.");
  return new Anthropic({ apiKey: s.anthropicApiKey, dangerouslyAllowBrowser: true });
}

/** Lenient JSON extraction: fenced or bare, object or array. Salvages truncated arrays (keeps complete elements). */
export function extractJsonLoose(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  const raw = (fence ? fence[1] : text).trim();
  const oi = raw.indexOf("{"), ai = raw.indexOf("[");
  const start = oi < 0 ? ai : ai < 0 ? oi : Math.min(oi, ai);
  const snippet = (t: string) => ` The model replied: "${t.replace(/\s+/g, " ").slice(0, 160)}${t.length > 160 ? "…" : ""}"`;
  if (start < 0) throw new Error(`No JSON found in the AI response.${snippet(raw)}`);
  const isArr = raw[start] === "[";
  const end = isArr ? raw.lastIndexOf("]") : raw.lastIndexOf("}");
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through to salvage */ }
  if (!isArr) throw new Error(`The AI reply was not complete JSON (truncated or malformed).${snippet(raw)}`);
  // Truncated array: walk elements and keep every complete top-level object.
  const body = raw.slice(start + 1);
  const items: any[] = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && objStart >= 0) { try { items.push(JSON.parse(body.slice(objStart, i + 1))); } catch { /* skip broken */ } objStart = -1; } }
  }
  if (items.length === 0) throw new Error(`The AI reply had no complete JSON items (truncated or malformed).${snippet(raw)}`);
  console.warn(`AI response truncated — salvaged ${items.length} complete item(s).`);
  return items;
}

function extractJson(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw);
}

/** Send a prompt to the configured provider. onDelta receives partial text (Anthropic streams; others deliver once). */
export interface AskOptions { json?: boolean } // json → provider is forced into JSON-only output (Gemini responseMimeType / Groq response_format)

export async function askAi(system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, opts: AskOptions = {}): Promise<string> { return ask(system, user, onDelta, maxTokens, opts); }

async function ask(system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, opts: AskOptions = {}): Promise<string> {
  const s = await getAiSettings();
  if (s.aiProvider === "gemini") return askGemini(s, system, user, onDelta, maxTokens, opts);
  if (s.aiProvider === "groq") return askGroq(s, system, user, onDelta, maxTokens, opts);
  const c = await client();
  const stream = c.messages.stream({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  if (onDelta) stream.on("text", (t) => onDelta(t));
  const final = await stream.finalMessage();
  return final.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient provider errors (429 quota / 503 overload) with back-off, honouring "retry in Ns" hints. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || "");
      const transient = /\b(429|503|RESOURCE_EXHAUSTED|overloaded|rate limit)\b/i.test(msg);
      if (!transient || attempt === 3) break;
      const hinted = msg.match(/retry(?:\s+in|Delay["']?:\s*["']?)\s*(\d+(?:\.\d+)?)\s*s/i);
      const wait = hinted ? Math.min(90, Math.ceil(parseFloat(hinted[1])) + 1) * 1000 : (attempt + 1) * 15000;
      console.warn(`${label}: rate limited, retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function askGemini(s: AiSettings, system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, opts: AskOptions = {}): Promise<string> {
  if (!s.geminiApiKey) throw new Error("No Gemini API key configured. Get one free at aistudio.google.com/apikey and add it under AI Assistant → API key.");
  const model = s.geminiModel || GEMINI_MODEL_DEFAULT;
  return withRetry(() => askGeminiOnce(s.geminiApiKey!, model, system, user, onDelta, maxTokens, false, opts), "Gemini");
}

/** Text-capable Gemini models available to this key (exact ids), from the models endpoint. */
export async function listGeminiModels(apiKey: string): Promise<Array<{ id: string; label: string; description?: string; inputLimit?: number; outputLimit?: number }>> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`Could not list models (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const skip = /embedding|imagen|image|tts|audio|live|veo|video|aqa|learnlm|robotics|computer-use/i;
  return (json.models || [])
    .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent") && !skip.test(m.name))
    .map((m: any) => ({ id: String(m.name).replace(/^models\//, ""), label: m.displayName || String(m.name).replace(/^models\//, ""), description: m.description, inputLimit: m.inputTokenLimit, outputLimit: m.outputTokenLimit }))
    .sort((a: any, b: any) => a.id.localeCompare(b.id));
}

async function askGeminiOnce(apiKey: string, model: string, system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, noThinking = false, opts: AskOptions = {}): Promise<string> {
  // Thinking eats the output budget; these are structured calls, so keep it minimal per model family.
  const generationConfig: any = { maxOutputTokens: maxTokens, temperature: 0.3 };
  if (opts.json) generationConfig.responseMimeType = "application/json"; // model must emit valid JSON, no prose/markdown
  if (!noThinking) {
    if (/2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig }),
  });
  if (!res.ok || !res.body) {
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429) throw new Error(`Gemini error 429 (free-tier quota / rate limit for ${model}). ${body.match(/retry in [\d.]+s/i)?.[0] || "Wait a minute, or switch to another model (e.g. a Flash-Lite) under Provider & keys — each model has its own quota."}`);
    if (res.status === 404) throw new Error(`Gemini model "${model}" is not available for this API key. Go to AI Assistant → Provider & keys → click "Load exact models for this key" and pick one from that list.`);
    // an unsupported thinkingConfig for this model → retry once without it
    if (res.status === 400 && !noThinking && /thinking/i.test(body)) return askGeminiOnce(apiKey, model, system, user, onDelta, maxTokens, true, opts);
    if (res.status === 400 && opts.json && /mime|json/i.test(body)) return askGeminiOnce(apiKey, model, system, user, onDelta, maxTokens, noThinking, {});
    throw new Error(`Gemini error ${res.status}: ${body}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "", truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const json = JSON.parse(line.slice(5).trim());
        const t = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
        if (t) { out += t; onDelta?.(t); }
        if (json.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${json.promptFeedback.blockReason}`);
        if (json.candidates?.[0]?.finishReason === "MAX_TOKENS") truncated = true;
      } catch (e: any) { if (e?.message?.startsWith("Gemini blocked")) throw e; }
    }
  }
  if (!out) throw new Error("Gemini returned an empty response.");
  if (truncated) console.warn("Gemini output hit maxOutputTokens; JSON may be truncated (auto-repair will try to salvage).");
  return out;
}

async function askGroq(s: AiSettings, system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, opts: AskOptions = {}): Promise<string> {
  if (!s.groqApiKey) throw new Error("No Groq API key configured. Get one free at console.groq.com/keys.");
  return withRetry(() => askGroqOnce(s, system, user, onDelta, maxTokens, opts), "Groq");
}

async function askGroqOnce(s: AiSettings, system: string, user: string, onDelta?: (t: string) => void, maxTokens = 16000, opts: AskOptions = {}): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.groqApiKey}` },
    body: JSON.stringify({ model: s.groqModel || GROQ_MODEL_DEFAULT, max_tokens: Math.min(maxTokens, 8192), temperature: 0.3, ...(opts.json ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Groq returned an empty response.");
  onDelta?.(text);
  return text;
}

// ── App generator ────────────────────────────────────────────────────────────

const SCHEMA_DOC = `
You output ONLY a JSON object (no prose) with this shape:
{
  "forms": [{
    "name": "Vendor", "description": "…", "columns": 2,
    "fields": [
      { "label": "Vendor Name", "type": "text", "required": true },
      { "label": "Category", "type": "dropdown", "options": ["Raw material","Packing"] },
      { "label": "Rate", "type": "currency" },
      { "label": "Item", "type": "lookup", "lookupForm": "Item", "autoFill": [{ "from": "Rate", "to": "Rate" }] },
      { "label": "Line Items", "type": "subform", "columns": [
          { "label": "Item", "type": "lookup", "lookupForm": "Item", "autoFill": [{ "from": "Rate", "to": "Rate" }] },
          { "label": "Quantity", "type": "number" }, { "label": "Rate", "type": "currency" },
          { "label": "Amount", "type": "formula", "formula": "quantity * rate" } ] },
      { "label": "Total", "type": "formula", "formula": "sum(line_items.amount)" },
      { "label": "Items", "type": "subform", "linkForm": "Invoice Item", "columns": ["Product", "Quantity", "Rate", "Amount"] },
      { "label": "Total Purchased", "type": "rollup", "rollupForm": "Purchase", "rollupField": "Line Items.Quantity", "aggregate": "sum" },
      { "label": "PO Number", "type": "autonumber", "pattern": "PO/{YYYY}/{0000}" },
      { "label": "Basic Details", "type": "section" }
    ]
  }],
  "reports": [{ "name": "Stock Ledger", "form": "Item", "type": "ledger", "sources": [{ "label": "Purchases", "form": "Purchase", "matchField": "Line Items.Item", "qtyField": "Line Items.Quantity", "direction": "in" }, { "label": "Usage", "form": "Usage", "matchField": "Item", "qtyField": "Quantity", "direction": "out" }] },
               { "name": "Purchases by Vendor", "form": "Purchase", "type": "summary", "groupBy": "Vendor" },
               { "name": "Monthly Sales", "form": "Sales Invoice", "type": "chart", "chartType": "column", "groupBy": "Invoice Date", "metric": "sum", "field": "Grand Total" },
               { "name": "Receivables Aging", "form": "Sales Invoice", "type": "aging" }],
  "workflows": [{ "name": "Reduce stock", "form": "Usage", "trigger": "onSuccess", "script": "increment(\\"item\\", input.item, \\"stock\\", -Number(input.quantity));" }],
  "roles": [{ "name": "Store Manager", "preset": "full" }, { "name": "Staff", "preset": "view" }],
  "dashboard": { "kpis": [{ "label": "Total purchases", "form": "Purchase", "aggregate": "sum", "field": "Total" }], "charts": [{ "title": "Purchases by month", "form": "Purchase", "chartType": "column", "groupBy": "createdAt", "metric": "sum", "field": "Total" }] }
}
Field types: text, textarea, richtext, email, phone, url, number, decimal, currency, percentage, rating, dropdown, radio, checkbox, multiselect, date, datetime, time, lookup, subform, users, formula, rollup, autonumber, file, image, signature, address, geolocation, barcode, color, section.
Subforms: either inline ("columns": [field objects]) or backed by an existing/child form ("linkForm": "<form name>", "columns": [labels of that form's fields]) — use linkForm when the user asks for the line items as a separate form (so rows are records of that form, linked to the parent automatically). The child form must be defined in "forms" (e.g. "Invoice Item" with Product lookup, Quantity, Rate, Amount formula) or already exist.
Rules: use "section" fields to group; lookups reference other forms by name; formulas use snake_case link names of labels (e.g. "Vendor Name" → vendor_name) and functions: ${FUNCTION_DOCS.slice(0, 14).map((d) => d.sig).join(", ")}.
Workflow scripts MUST be plain modern JavaScript (NOT Zoho Deluge): use "for (const row of input.items) { … }", "if (…) { … }", "const x = …", "showError(\"msg\")" to block, "confirm(\"msg\")" to ask, "blockSubmit()" — never "for each", "cancel submit", "info", "alert" statements without parentheses. Subform rows are accessed as input.<subform_link_name> (an array) and columns by link name (row.quantity). API: ${SCRIPT_API_DOCS.slice(0, 16).map((d) => d.sig).join("; ")}. Triggers: onLoad, onUserInput, onValidate, onSubmit, onSuccess.
Report types (use "type"): ${REPORT_TYPE_IDS.join(", ")}. Choose per business need:\n${REPORT_TYPES_PROMPT}
Give every app 4–8 reports beyond the default tables: at least one chart, one summary/pivot, and finance/stock views (aging, ledger) where money or stock is involved; kanban/funnel for pipelines; scheduler/gantt/calendar for bookings, projects, appointments; checklist for tasks; tree for categories/BOM.
Master forms (Item, Vendor, Customer) first, then transactions. Keep it practical for an Indian SME. 3–8 forms.`;

export interface GeneratedApp { forms: FormDefinition[]; reports: ReportDefinition[]; workflows: WorkflowDefinition[]; roles: Array<{ name: string; preset: "full" | "view" | "none" }>; dashboard?: any; raw: any; /** pre-existing forms changed by the generation (e.g. a parent lookup added for a linked subform) */ updatedForms?: FormDefinition[]; }

export interface GenerateOptions {
  /** false (default): only the automatic table report per form; no AI-suggested reports, no dashboard. */
  suggestReports?: boolean;
}

export async function generateAppFromDescription(description: string, existing: AppDefinition, onDelta?: (t: string) => void, opts: GenerateOptions = {}): Promise<GeneratedApp> {
  const extra = opts.suggestReports ? "" : "\nIMPORTANT: output \"reports\": [] and omit \"dashboard\" — every form automatically gets its own table report; do not design any additional reports unless the user explicitly asks for a specific report in the description.";
  const text = await ask(`You are an expert Zoho-Creator-style app architect. ${SCHEMA_DOC}${extra}`, `Design an application for: ${description}\n\nExisting forms in this app (reuse names if relevant): ${existing.forms.map((f) => f.name).join(", ") || "none"}.`, onDelta, 24000, { json: true });
  const raw = extractJson(text);
  if (!opts.suggestReports && !/\breport|dashboard|chart|kanban|ledger|aging|pivot\b/i.test(description)) { raw.reports = []; delete raw.dashboard; }
  const result = materialize(raw, existing);
  // Auto-repair scripts the model wrote in the wrong dialect (e.g. Deluge) before handing them over.
  await Promise.all(result.workflows.map(async (w) => {
    if (!w.codeScript) return;
    const chk = checkScriptSyntax(w.codeScript);
    if (chk.ok) return;
    try {
      const form = [...existing.forms, ...result.forms].find((f) => f.id === w.formId);
      if (form) w.codeScript = await fixScriptWithAi(w.codeScript, chk.error || "syntax error", form, { ...existing, forms: [...existing.forms, ...result.forms] });
    } catch { /* leave as-is; the builder shows the syntax error with a Fix button */ }
  }));
  return result;
}

/** Convert the AI JSON into real schema objects with ids, link names, lookups resolved by name. */
export function materialize(raw: any, existing: AppDefinition): GeneratedApp {
  const now = new Date().toISOString();
  const forms: FormDefinition[] = [];
  const byName = new Map<string, FormDefinition>();
  existing.forms.forEach((f) => byName.set(f.name.toLowerCase(), f));

  // pass 1: forms & simple fields
  for (const rf of raw.forms || []) {
    const name = String(rf.name || "Form");
    if (byName.has(name.toLowerCase())) continue;
    const form: FormDefinition = { id: generateId("form"), name, linkName: generateUniqueLinkName(name, [...existing.forms, ...forms].map((f) => f.linkName)), description: rf.description || "", columns: rf.columns === 1 || rf.columns === 3 ? rf.columns : 2, fields: [], createdAt: now, updatedAt: now };
    forms.push(form);
    byName.set(name.toLowerCase(), form);
  }
  const allForms = [...existing.forms, ...forms];
  const findForm = (n: string) => byName.get(String(n || "").toLowerCase());
  const findFieldIn = (form: FormDefinition | undefined, label: string) => form?.fields.find((f) => f.label.toLowerCase() === String(label).toLowerCase() || f.linkName === toLinkName(String(label)));

  const mkField = (rf: any, form: FormDefinition, inSubform = false): FieldDefinition => {
    const label = String(rf.label || "Field");
    const type = rf.type || "text";
    const f: FieldDefinition = { id: generateId(inSubform ? "col" : "field"), label, linkName: generateUniqueLinkName(label, form.fields.map((x) => x.linkName)), type, required: Boolean(rf.required), options: rf.options, decimalPlaces: ["number", "currency", "decimal", "percentage"].includes(type) ? 2 : undefined, currencySymbol: type === "currency" ? existing.settings?.currencySymbol || "₹" : undefined };
    if (type === "section") f.section = { collapsible: true, columns: 2 };
    if (type === "autonumber") f.autonumber = { prefix: rf.prefix || label.slice(0, 3).toUpperCase() + "-", startNumber: 1, digits: 5, pattern: rf.pattern, resetEvery: rf.pattern?.includes("{YYYY}") ? "yearly" : "never" };
    if (type === "formula") { f.formula = { expression: String(rf.formula || ""), resultType: rf.resultType || "number", decimalPlaces: 2 }; f.readonly = true; }
    if (type === "rating") f.ratingMax = 5;
    return f;
  };

  // pass 2: fields (lookups need all forms known)
  for (const rf of raw.forms || []) {
    const form = findForm(rf.name);
    if (!form || existing.forms.includes(form)) continue;
    for (const rfield of rf.fields || []) {
      const f = mkField(rfield, form);
      if (rfield.type === "lookup") {
        const target = findForm(rfield.lookupForm);
        if (target) f.lookup = { targetFormId: target.id, displayFieldId: "", valueFieldId: "id", relationshipType: "lookup", displayStyle: "dropdown", allowAddNew: true };
        else f.type = "text";
      }
      if (rfield.type === "subform") {
        f.subform = { sourceType: "inline", columns: [], showTotals: true, allowBulkAdd: true, allowDuplicateRow: true, totalColumnIds: [] };
        if (rfield.linkForm) { (f as any).__linkForm = String(rfield.linkForm); (f as any).__linkCols = Array.isArray(rfield.columns) ? rfield.columns.map((c: any) => (typeof c === "string" ? c : c?.label)).filter(Boolean) : undefined; }
        const tmp: FormDefinition = { ...form, fields: [] };
        for (const rc of rfield.linkForm ? [] : rfield.columns || []) {
          const col = mkField(rc, tmp, true);
          tmp.fields.push(col);
          const c: any = { id: col.id, label: col.label, linkName: col.linkName, type: col.type, required: col.required, options: col.options, currencySymbol: col.currencySymbol, decimalPlaces: col.decimalPlaces, width: col.type === "lookup" ? 200 : 130 };
          if (col.type === "formula" || rc.formula) { c.formula = { expression: String(rc.formula || ""), resultType: "number", decimalPlaces: 2 }; c.readonly = true; c.type = c.type === "formula" ? "currency" : c.type; f.subform.totalColumnIds!.push(c.id); }
          if (rc.type === "lookup") { const target = findForm(rc.lookupForm); if (target) c.lookup = { targetFormId: target.id, displayFieldId: "", relationshipType: "lookup", displayStyle: "dropdown", allowAddNew: true, __autoFill: rc.autoFill }; else c.type = "text"; }
          f.subform.columns.push(c);
        }
      }
      (f as any).__autoFill = rfield.autoFill;
      (f as any).__rollup = rfield.type === "rollup" ? rfield : undefined;
      form.fields.push(f);
    }
  }

  // pass 3: resolve display fields, auto-fill, rollups
  const displayOf = (form: FormDefinition) => form.fields.find((x) => x.type === "text")?.id || form.fields.find((x) => !["section", "subform"].includes(x.type))?.id || "";
  for (const form of forms) {
    for (const f of form.fields) {
      if (f.lookup) {
        const target = allForms.find((x) => x.id === f.lookup!.targetFormId)!;
        f.lookup.displayFieldId = displayOf(target);
        const af = (f as any).__autoFill;
        if (Array.isArray(af)) f.lookup.autoFill = af.map((a: any) => ({ sourceFieldId: findFieldIn(target, a.from)?.id || "", targetFieldId: findFieldIn(form, a.to)?.id || "" })).filter((a: any) => a.sourceFieldId && a.targetFieldId);
      }
      if (f.subform) for (const c of f.subform.columns) {
        if (c.lookup) {
          const target = allForms.find((x) => x.id === c.lookup!.targetFormId)!;
          c.lookup.displayFieldId = displayOf(target);
          const af = (c.lookup as any).__autoFill; delete (c.lookup as any).__autoFill;
          if (Array.isArray(af)) c.lookup.autoFill = af.map((a: any) => ({ sourceFieldId: findFieldIn(target, a.from)?.id || "", targetFieldId: f.subform!.columns.find((x) => x.label.toLowerCase() === String(a.to).toLowerCase())?.id || "" })).filter((a: any) => a.sourceFieldId && a.targetFieldId);
        }
      }
      const rr = (f as any).__rollup;
      if (rr) {
        const src = findForm(rr.rollupForm);
        const path = (label: string) => { if (!src) return ""; const [top, col] = String(label || "").split("."); const tf = findFieldIn(src, top); if (!tf) return ""; if (col && tf.subform) { const c = tf.subform.columns.find((x) => x.label.toLowerCase() === col.toLowerCase()); return c ? `${tf.id}.${c.id}` : tf.id; } return tf.id; };
        const matchTop = src?.fields.find((x) => x.type === "lookup" && x.lookup?.targetFormId === form.id);
        const matchSub = src?.fields.find((x) => x.type === "subform" && x.subform?.columns.some((c) => c.lookup?.targetFormId === form.id));
        const matchId = matchSub ? `${matchSub.id}.${matchSub.subform!.columns.find((c) => c.lookup?.targetFormId === form.id)!.id}` : matchTop?.id || "";
        f.rollup = { sourceFormId: src?.id || "", matchFieldId: matchId, aggregate: rr.aggregate || "sum", valueFieldId: path(rr.rollupField) || undefined, decimalPlaces: 2 };
        f.readonly = true;
      }
      delete (f as any).__autoFill; delete (f as any).__rollup;
    }
  }

  // linked subforms ("linkForm"): configure columns from the child form and add the parent lookup there
  const linked = resolveLinkedSubforms([...existing.forms, ...forms], new Set(forms.map((f) => f.id)));
  forms.splice(0, forms.length, ...linked.forms.filter((f) => forms.some((n) => n.id === f.id)));
  const updatedForms = linked.updatedExisting;

  // reports
  const reports: ReportDefinition[] = [];
  const usedLinks = existing.reports.map((r) => r.linkName);
  for (const form of forms) {
    const name = `${form.name} Report`;
    reports.push({ id: generateId("rep"), name, linkName: generateUniqueLinkName(name, [...usedLinks, ...reports.map((r) => r.linkName)]), sourceFormId: form.id, reportType: "table", columns: form.fields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: f.type !== "subform", order: i })), pageSize: 15, allowBulkActions: true, allowExport: true, allowImport: true, allowPrint: true, showInMenu: true, createdAt: now, updatedAt: now });
  }
  for (const rr of raw.reports || []) {
    const src = findForm(rr.form);
    if (!src) continue;
    const pathIn = (formName: string, label: string) => { const f = findForm(formName); if (!f) return ""; const [top, col] = String(label || "").split("."); const tf = findFieldIn(f, top); if (!tf) return ""; if (col && tf.subform) { const c = tf.subform.columns.find((x) => x.label.toLowerCase() === col.toLowerCase()); return c ? `${tf.id}.${c.id}` : ""; } return tf.id; };
    const rep: ReportDefinition = { id: generateId("rep"), name: rr.name, linkName: generateUniqueLinkName(rr.name, [...usedLinks, ...reports.map((r) => r.linkName)]), sourceFormId: src.id, reportType: rr.type || "table", columns: src.fields.filter((f) => f.type !== "section").map((f, i) => ({ fieldId: f.id, label: f.label, visible: f.type !== "subform", order: i })), pageSize: 15, allowExport: true, allowPrint: true, showInMenu: true, createdAt: now, updatedAt: now };
    if (!REPORT_TYPE_IDS.includes(rep.reportType!)) rep.reportType = "table";
    if (rr.groupBy) rep.groupByFieldId = findFieldIn(src, rr.groupBy)?.id;
    if (rr.type === "kanban") rep.kanban = { statusFieldId: findFieldIn(src, rr.statusField || "Status")?.id || src.fields.find((f) => f.type === "dropdown")?.id || "" };
    // chart / aging / gantt / scheduler / … : detect sensible fields from the form (the model only names the type)
    Object.assign(rep, defaultConfigFor(rep.reportType!, rep, src));
    if (rr.type === "chart" && rep.chart) { if (rr.chartType) rep.chart.chartType = rr.chartType; if (rr.groupBy) rep.chart.groupFieldId = findFieldIn(src, rr.groupBy)?.id || rep.chart.groupFieldId; if (rr.field) rep.chart.valueFieldId = findFieldIn(src, rr.field)?.id; if (rr.metric) rep.chart.aggregate = rr.metric; }
    if (rr.type === "ledger") rep.ledger = { primaryFormId: src.id, displayFieldIds: src.fields.filter((f) => ["text", "autonumber", "dropdown"].includes(f.type)).slice(0, 3).map((f) => f.id), openingBalanceFieldId: findFieldIn(src, "Opening Stock")?.id || findFieldIn(src, "Opening Balance")?.id, minLevelFieldId: findFieldIn(src, "Minimum Level")?.id || findFieldIn(src, "Reorder Level")?.id, unitFieldId: findFieldIn(src, "Unit")?.id, sources: (rr.sources || []).map((s: any) => { const sf = findForm(s.form); const sug = sf ? suggestLedgerSource(sf, src.id) : null; return { id: generateId("src"), label: s.label || sf?.name || "Source", formId: sf?.id || "", matchFieldId: pathIn(s.form, s.matchField) || sug?.matchFieldId || "", qtyFieldId: pathIn(s.form, s.qtyField) || sug?.qtyFieldId || "", direction: s.direction === "out" ? "out" : "in", dateFieldId: sf?.fields.find((f) => f.type === "date" || f.type === "datetime")?.id, refFieldId: sf?.fields.find((f) => f.type === "autonumber")?.id }; }).filter((s: any) => s.formId && s.matchFieldId && s.qtyFieldId) };
    if (rr.type === "ledger" && rep.ledger && !rep.ledger.sources.length) rep.ledger.sources = guessLedgerSources({ ...existing, forms: allForms } as AppDefinition, src.id);
    reports.push(rep);
  }

  // workflows
  const workflows: WorkflowDefinition[] = (raw.workflows || []).map((w: any) => { const f = findForm(w.form); return f ? { id: generateId("wf"), name: w.name, description: w.description || "", formId: f.id, mode: "code" as const, codeScript: String(w.script || ""), trigger: { type: w.trigger || "onUserInput" }, actions: [], active: true, version: 1, createdAt: now, updatedAt: now } : null; }).filter(Boolean);

  return { forms, reports, workflows, roles: raw.roles || [], dashboard: raw.dashboard, raw, updatedForms };
}

// ── Script repair ────────────────────────────────────────────────────────────

const FENCE = "```";

/** Rewrite a broken workflow script into valid sandbox JavaScript. Throws if the result still fails to parse. */
export async function fixScriptWithAi(script: string, error: string, form: FormDefinition, app: Pick<AppDefinition, "forms">): Promise<string> {
  const fields = form.fields
    .filter((f) => f.type !== "section")
    .map((f) => `input.${f.linkName} (${f.type}${f.subform ? `; rows have: ${f.subform.columns.map((c) => c.linkName).join(", ")}` : ""})`)
    .join("\n");
  const others = app.forms
    .filter((f) => f.id !== form.id)
    .map((f) => `${f.linkName}: ${f.fields.filter((x) => x.type !== "section").map((x) => x.linkName).join(", ")}`)
    .join("\n");
  const system = [
    "You fix workflow scripts for a low-code platform. The runtime is a sandboxed JavaScript subset (ES2020): const/let, if/else, for…of, while, functions, template strings, arrays/objects. NOT Deluge, NOT Python.",
    'Never use "for each", "cancel submit", "info", or statements without parentheses.',
    "Host API:",
    SCRIPT_API_DOCS.map((d) => `${d.sig} — ${d.desc}`).join("\n"),
    'Rules: read/write fields via input.<link_name>; subform rows via for (const row of input.<subform>) with row.<column>; get("form_link", id) returns a record whose fields are by link name; to block saving call showError("…") or blockSubmit("…"); to ask the user call confirm("…").',
    `Reply ONLY with the corrected script inside a ${FENCE}js fence, no explanation.`,
  ].join("\n");
  const user = `Form "${form.name}" fields:\n${fields}\n\nOther forms (link name: fields):\n${others}\n\nParser error: ${error}\n\nScript to fix:\n${FENCE}\n${script}\n${FENCE}`;
  const text = await ask(system, user, undefined, 4000);
  const fence = text.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
  const fixed = (fence ? fence[1] : text).trim();
  const chk = checkScriptSyntax(fixed);
  if (!chk.ok) throw new Error(`AI fix still has a syntax error: ${chk.error}`);
  return fixed;
}


// ── Formula writer ───────────────────────────────────────────────────────────

export async function writeFormula(request: string, form: FormDefinition, app: AppDefinition): Promise<{ expression: string; explanation: string }> {
  const fields = form.fields.filter((f) => f.type !== "section").map((f) => `${f.linkName} (${f.type}${f.subform ? `: columns ${f.subform.columns.map((c) => c.linkName).join(", ")}` : f.lookup ? `→ ${app.forms.find((x) => x.id === f.lookup!.targetFormId)?.name}: ${app.forms.find((x) => x.id === f.lookup!.targetFormId)?.fields.map((x) => x.linkName).join(", ")}` : ""})`).join("\n");
  const text = await ask(`You write formulas for a low-code platform. Available functions:\n${FUNCTION_DOCS.map((d) => `${d.sig} — ${d.desc}`).join("\n")}\nSubform columns: sum(subform.column). Lookup fields: lookup.field. Reply ONLY with JSON {"expression": "...", "explanation": "..."}.`, `Form "${form.name}" fields:\n${fields}\n\nWrite a formula for: ${request}`, undefined, 2000);
  return extractJson(text);
}

// ── Natural-language report query ────────────────────────────────────────────

export async function nlQuery(question: string, app: AppDefinition): Promise<{ formId: string; filters: any[]; groupBy?: string; aggregate?: string; field?: string; view?: string; explanation: string }> {
  const desc = app.forms.map((f) => `${f.name} [id ${f.id}]: ${f.fields.filter((x) => x.type !== "section").map((x) => `${x.label} [${x.id}, ${x.type}${x.options ? ": " + x.options.join("|") : ""}]`).join(", ")}`).join("\n");
  const text = await ask(`Translate a business question into a report query over these forms. Reply ONLY JSON: {"formId": "...", "filters": [{"fieldId": "...", "operator": "equals|contains|greater_than|less_than|between|date_preset|in", "value": "...", "preset": "this_month|last_month|this_year|last_7_days|last_30_days"}], "groupBy": "fieldId?", "aggregate": "sum|count|avg", "field": "fieldId?", "view": "table|summary|pivot|kanban", "explanation": "..."}. Use field ids exactly.`, `Forms:\n${desc}\n\nQuestion: ${question}`, undefined, 2000);
  return extractJson(text);
}

/** Free-form assistant answer about the app (schema-aware). */
export async function askAssistant(question: string, app: AppDefinition, onDelta?: (t: string) => void): Promise<string> {
  const summary = app.forms.map((f) => `- ${f.name}: ${f.fields.filter((x) => x.type !== "section").map((x) => `${x.linkName}(${x.type})`).join(", ")}`).join("\n");
  return ask(`You are the in-product assistant for a low-code app builder (forms, lookups, subforms, formulas, rollups, workflows in a JS sandbox, reports, dashboards, roles). Be concise and practical. Formula functions: ${FUNCTION_DOCS.map((d) => d.name).join(", ")}. Script API: ${SCRIPT_API_DOCS.map((d) => d.sig).join("; ")}.`, `App "${app.name}" forms:\n${summary}\n\nQuestion: ${question}`, onDelta, 4000);
}
