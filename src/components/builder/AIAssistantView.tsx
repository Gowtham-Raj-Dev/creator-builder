"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { ReportDefinition } from "@/types/schema";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Tabs, Badge, Toggle } from "@/components/ui/FormControls";
import { createDefaultRole } from "@/lib/auth/permissions";
import { generateId } from "@/lib/utils/idGenerator";
import { getAiSettings, getGlobalAiSettings, getAppAiOverride, saveAiSettings, saveAppAiOverride, setActiveAiApp, hasActiveKey, listGeminiModels, generateAppFromDescription, writeFormula, nlQuery, askAssistant, GeneratedApp, AiSettings, AiProvider } from "@/lib/ai/claude";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";
import { generateSampleData, SampleGenResult } from "@/lib/ai/sampleData";
import { answerDataQuestion, DataAnswer } from "@/lib/ai/askData";
import { withParentLinkColumns } from "@/lib/engine/subformLink";
import { AiNewReport, AiNewForm, AiNewWorkflow, AiNewDashboard } from "./AiBuilders";
import { storageService } from "@/lib/storage/firestoreProvider";
import { useAuth } from "@/context/AuthContext";
import { Checkbox } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sparkles, Wand2, Sigma, Search, MessageSquare, KeyRound, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Database, Trash2, FileText, TableProperties, Zap, LayoutDashboard } from "lucide-react";

/** Gemini models selectable in settings. Quotas differ per model, so switching models is the quickest way around a 429. */
const GEMINI_MODELS: Array<{ id: string; label: string; group: string }> = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (default)", group: "Text" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (highest free quota)", group: "Text" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", group: "Text" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", group: "Text" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", group: "Text" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (slower, smarter)", group: "Text" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", group: "Text" },
];

export const AIAssistantView: React.FC = () => {
  const { currentApp, updateCurrentApp, createPage, loadRecords } = useAppBuilder();
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  // deep link from "Discuss with AI": ?tab=ai&aiTab=newworkflow&prompt=…&formId=…
  const searchParams = useSearchParams();
  const linkTab = searchParams.get("aiTab") || "";
  const linkPrompt = searchParams.get("prompt") || "";
  const linkFormId = searchParams.get("formId") || "";
  const [tab, setTab] = useState(["generate", "newform", "newreport", "newworkflow", "newdashboard", "formula", "query", "sample", "chat", "settings"].includes(linkTab) ? linkTab : "generate");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null); // the settings being edited (global or app)
  const [keys, setKeys] = useState({ anthropic: "", gemini: "", groq: "" });
  const [geminiModels, setGeminiModels] = useState<Array<{ id: string; label: string; inputLimit?: number }> | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const loadGeminiModels = async (key: string) => {
    if (!key.trim()) { setModelsError("Enter the Gemini API key first."); return; }
    setModelsBusy(true); setModelsError(null);
    try { const list = await listGeminiModels(key.trim()); setGeminiModels(list); if (!list.length) setModelsError("This key has no text models available."); }
    catch (e: any) { setModelsError(e?.message || "Could not load models"); }
    finally { setModelsBusy(false); }
  };
  const [scope, setScope] = useState<"global" | "app">("global");
  const [useOwn, setUseOwn] = useState(false);
  const [effective, setEffective] = useState<(AiSettings & { source: "app" | "global" }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");

  // generate
  const [description, setDescription] = useState(linkTab === "generate" ? linkPrompt : "");
  const [suggestReports, setSuggestReports] = useState(false);
  const [generated, setGenerated] = useState<GeneratedApp | null>(null);
  // formula
  const [formulaFormId, setFormulaFormId] = useState("");
  const [formulaAsk, setFormulaAsk] = useState(linkTab === "formula" ? linkPrompt : "");
  const [formulaOut, setFormulaOut] = useState<{ expression: string; explanation: string } | null>(null);
  // query
  const [question, setQuestion] = useState(linkTab === "query" ? linkPrompt : "");
  const [queryOut, setQueryOut] = useState<DataAnswer | null>(null);
  // sample data
  const [sampleForms, setSampleForms] = useState<string[]>([]);
  const [sampleCount, setSampleCount] = useState(10);
  const [sampleProgress, setSampleProgress] = useState("");
  const [sampleResult, setSampleResult] = useState<SampleGenResult | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  // chat
  const [chatQ, setChatQ] = useState("");
  const [chatA, setChatA] = useState("");

  const loadScope = async (sc: "global" | "app") => {
    if (!currentApp) return;
    const st = sc === "global" ? await getGlobalAiSettings() : { ...(await getGlobalAiSettings()), ...(await getAppAiOverride(currentApp.id)) };
    setAi({ aiProvider: st.aiProvider, geminiModel: st.geminiModel, groqModel: st.groqModel });
    setKeys({ anthropic: st.anthropicApiKey || "", gemini: st.geminiApiKey || "", groq: st.groqApiKey || "" });
  };
  const refreshEffective = async () => { setEffective(await getAiSettings()); setHasKey(await hasActiveKey()); };
  useEffect(() => {
    if (!currentApp) return;
    setActiveAiApp(currentApp.id);
    getAppAiOverride(currentApp.id).then((o) => { const own = Boolean(o.useOwnKeys); setUseOwn(own); const sc = own ? "app" : "global"; setScope(sc); loadScope(sc); });
    refreshEffective();
    return () => setActiveAiApp(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApp?.id]);
  if (!currentApp) return null;

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setStream(""); try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(false); } };

  const applyGenerated = () => {
    if (!generated) return;
    updateCurrentApp((prev) => {
      const next = { ...prev, forms: [...prev.forms.map((f) => (generated.updatedForms || []).find((u) => u.id === f.id) || f), ...generated.forms], reports: [...prev.reports, ...generated.reports], workflows: [...prev.workflows, ...generated.workflows] };
      const roles = [...prev.roles];
      for (const r of generated.roles || []) if (!roles.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) roles.push(createDefaultRole(r.name, next, r.preset || "view"));
      return withParentLinkColumns({ ...next, roles });
    });
    if (generated.dashboard && (generated.dashboard.kpis?.length || generated.dashboard.charts?.length)) {
      const page = createPage("Dashboard", "Generated by AI");
      const findForm = (n: string) => [...currentApp.forms, ...generated.forms].find((f) => f.name.toLowerCase() === String(n).toLowerCase());
      const findField = (formName: string, label: string) => findForm(formName)?.fields.find((f) => f.label.toLowerCase() === String(label || "").toLowerCase())?.id;
      const comps: any[] = [{ id: generateId("comp"), type: "heading", width: 12, props: { title: `${currentApp.name} Dashboard`, subtitle: "" } }, { id: generateId("comp"), type: "filter_panel", width: 12, props: { label: "Date range" } }];
      const kpis = (generated.dashboard.kpis || []).map((k: any) => ({ label: k.label, metric: { formId: findForm(k.form)?.id, aggregate: k.aggregate || "count", fieldId: findField(k.form, k.field), compare: "last_month" }, compact: true })).filter((k: any) => k.metric.formId);
      if (kpis.length) comps.push({ id: generateId("comp"), type: "stat_card", width: 12, props: { stats: kpis } });
      for (const c of generated.dashboard.charts || []) { const f = findForm(c.form); if (!f) continue; comps.push({ id: generateId("comp"), type: "chart", width: 6, props: { title: c.title, chartType: c.chartType || "column", formId: f.id, groupByFieldId: c.groupBy === "createdAt" ? "createdAt" : findField(c.form, c.groupBy) || "createdAt", metric: c.metric || "count", measureFieldId: findField(c.form, c.field), dateBucket: "month" } }); }
      setTimeout(() => updateCurrentApp((prev) => ({ ...prev, pages: prev.pages.map((p) => (p.id === page.id ? { ...p, components: comps, isHome: true } : p)) })), 50);
    }
    showToast(`Added ${generated.forms.length} forms, ${generated.reports.length} reports, ${generated.workflows.length} workflows`, "success");
    setGenerated(null);
    router.push(getBuilderUrl(currentApp.linkName, { tab: "forms" }));
  };

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
          <div><h1 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> AI Assistant</h1><p className="text-xs text-slate-500 mt-0.5">Describe an app to generate forms, reports, workflows and a dashboard. Write formulas and query data in plain English. Provider: <span className="font-semibold">{effective?.aiProvider === "gemini" ? `Google Gemini (${effective.geminiModel})` : effective?.aiProvider === "groq" ? `Groq (${effective.groqModel})` : "Anthropic Claude (claude-opus-5)"}</span> · <span className={effective?.source === "app" ? "text-indigo-700 font-semibold" : "text-slate-500"}>{effective?.source === "app" ? "app-specific keys" : "global platform keys"}</span>.</p></div>
          <Tabs className="w-full overflow-x-auto whitespace-nowrap [&>button]:shrink-0" size="sm" active={tab} onChange={setTab} tabs={[{ id: "generate", label: "Generate app", icon: <Wand2 className="w-3.5 h-3.5" /> }, { id: "newform", label: "New form", icon: <FileText className="w-3.5 h-3.5" /> }, { id: "newreport", label: "New report", icon: <TableProperties className="w-3.5 h-3.5" /> }, { id: "newworkflow", label: "New workflow", icon: <Zap className="w-3.5 h-3.5" /> }, { id: "newdashboard", label: "New dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5" /> }, { id: "formula", label: "Formula writer", icon: <Sigma className="w-3.5 h-3.5" /> }, { id: "query", label: "Ask data", icon: <Search className="w-3.5 h-3.5" /> }, { id: "sample", label: "Sample data", icon: <Database className="w-3.5 h-3.5" /> }, { id: "chat", label: "Help", icon: <MessageSquare className="w-3.5 h-3.5" /> }, { id: "settings", label: "Provider & keys", icon: <KeyRound className="w-3.5 h-3.5" /> }]} />
        </div>

        {hasKey === false && tab !== "settings" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No API key configured for the selected provider yet.</span><Button size="sm" variant="outline" onClick={() => setTab("settings")}>Add key</Button></div>
        )}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}

        {tab === "settings" && ai && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Key scope</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button type="button" onClick={() => { setUseOwn(false); setScope("global"); loadScope("global"); }} className={`text-left p-3 rounded-xl border text-xs ${!useOwn ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-semibold text-slate-900">Global (all apps)</div><div className="text-[11px] text-slate-500">One provider + key shared by every application. Editable from any app.</div></button>
                <button type="button" onClick={() => { setUseOwn(true); setScope("app"); loadScope("app"); }} className={`text-left p-3 rounded-xl border text-xs ${useOwn ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-semibold text-slate-900">This app only — {currentApp.name}</div><div className="text-[11px] text-slate-500">Separate provider/keys for this app; other apps keep using the global keys.</div></button>
              </div>
              {useOwn && <div className="flex gap-3 text-[11px]"><button type="button" className={`font-semibold ${scope === "app" ? "text-indigo-700 underline" : "text-slate-500"}`} onClick={() => { setScope("app"); loadScope("app"); }}>Editing: app keys</button><button type="button" className={`font-semibold ${scope === "global" ? "text-blue-700 underline" : "text-slate-500"}`} onClick={() => { setScope("global"); loadScope("global"); }}>Edit global keys instead</button></div>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Provider {scope === "app" ? "(for this app)" : "(global)"}</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {([
                  { id: "gemini", name: "Google Gemini", note: "Free tier · aistudio.google.com/apikey", key: "AIza…" },
                  { id: "groq", name: "Groq", note: "Free tier · console.groq.com/keys", key: "gsk_…" },
                  { id: "anthropic", name: "Anthropic Claude", note: "Paid · console.anthropic.com", key: "sk-ant-…" },
                ] as Array<{ id: AiProvider; name: string; note: string; key: string }>).map((p) => (
                  <button key={p.id} type="button" onClick={() => setAi({ ...ai, aiProvider: p.id })} className={`text-left p-3 rounded-xl border text-xs ${ai.aiProvider === p.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="font-semibold text-slate-900">{p.name}</div><div className="text-[11px] text-slate-500">{p.note}</div><div className="text-[10px] font-mono text-slate-400 mt-0.5">key looks like {p.key}</div>
                  </button>
                ))}
              </div>
            </div>
            {ai.aiProvider === "gemini" && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_260px] gap-2 items-end">
                  <Input type="password" label="Gemini API key" value={keys.gemini} onChange={(e) => setKeys({ ...keys, gemini: e.target.value })} placeholder="AIza…" />
                  <div className="space-y-1">
                    <Select label="Model" value={ai.geminiModel} onChange={(e) => setAi({ ...ai, geminiModel: e.target.value })}>
                      {(geminiModels || GEMINI_MODELS).map((m) => <option key={m.id} value={m.id}>{m.label}{"inputLimit" in m && m.inputLimit ? ` · ${Math.round(m.inputLimit / 1000)}k ctx` : ""}</option>)}
                      {ai.geminiModel && !(geminiModels || GEMINI_MODELS).some((m) => m.id === ai.geminiModel) && <option value={ai.geminiModel}>{ai.geminiModel}</option>}
                    </Select>
                    <button type="button" onClick={() => loadGeminiModels(keys.gemini)} disabled={modelsBusy} className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-50">{modelsBusy ? "Loading models…" : geminiModels ? `Reload models (${geminiModels.length} available for this key)` : "Load exact models for this key"}</button>
                  </div>
                </div>
                {modelsError && <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{modelsError}</p>}
                {geminiModels && <p className="text-[11px] text-emerald-700">Model ids loaded from Google for your key — these are guaranteed to exist. Selected: <code className="bg-emerald-50 px-1 rounded">{ai.geminiModel}</code></p>}
              </div>
            )}
            {ai.aiProvider === "gemini" && <p className="text-[11px] text-slate-500">Each model has its own free-tier quota (requests per minute / per day). If one model returns 429, switch to another — Flash-Lite models usually have the highest limits. Check the exact ids and limits at aistudio.google.com → Usage &amp; billing.</p>}
            {ai.aiProvider === "groq" && <div className="grid grid-cols-[1fr_260px] gap-2"><Input type="password" label="Groq API key" value={keys.groq} onChange={(e) => setKeys({ ...keys, groq: e.target.value })} placeholder="gsk_…" /><Select label="Model" value={ai.groqModel} onChange={(e) => setAi({ ...ai, groqModel: e.target.value })}><option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option><option value="qwen/qwen3-32b">qwen3-32b</option><option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option></Select></div>}
            {ai.aiProvider === "anthropic" && <Input type="password" label="Anthropic API key" value={keys.anthropic} onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })} placeholder="sk-ant-…" />}
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500">Keys are stored in Firestore <code>platform/settings</code> (owner-only rules) and used directly from your browser.</p>
              <Button onClick={async () => {
                const payload = { aiProvider: ai.aiProvider, anthropicApiKey: keys.anthropic.trim(), geminiApiKey: keys.gemini.trim(), groqApiKey: keys.groq.trim(), geminiModel: ai.geminiModel, groqModel: ai.groqModel };
                if (scope === "app") await saveAppAiOverride(currentApp.id, { useOwnKeys: true, ...payload });
                else { await saveAiSettings(payload); if (!useOwn) await saveAppAiOverride(currentApp.id, { useOwnKeys: false }); }
                await refreshEffective();
                showToast(scope === "app" ? `Keys saved for ${currentApp.name}` : "Global AI settings saved", "success");
              }}>Save {scope === "app" ? "for this app" : "globally"}</Button>
            </div>
            {effective && <p className={`text-[11px] flex items-center gap-1 ${hasKey ? "text-emerald-700" : "text-amber-700"}`}>{hasKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />} In effect for this app: <strong>{effective.aiProvider}</strong> via {effective.source === "app" ? "app-specific keys" : "global keys"}{hasKey ? "" : " — no key set"}.</p>}
          </div>
        )}

        {tab === "generate" && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-3">
              <Textarea label="Describe your application" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. A sweet shop purchase tracker: maintain Items (with unit, rate, opening stock, minimum level), Vendors, Purchase entries with line items (item, qty, rate, amount, total), daily Usage entries, and a stock ledger showing balance per item with low-stock alerts. Store manager can do everything; staff can only add usage." />
              <div className="flex items-center gap-3 flex-wrap"><Button loading={busy} disabled={!description.trim() || !hasKey} onClick={() => run(async () => { setGenerated(await generateAppFromDescription(description, currentApp, (t) => setStream((s) => s + t), { suggestReports })); })} icon={<Wand2 className="w-3.5 h-3.5" />}>Generate</Button><Toggle size="sm" checked={suggestReports} onChange={setSuggestReports} label="Also suggest extra reports & a dashboard" /><span className="text-[11px] text-slate-400">Off = each form gets only its default table report. Nothing is added until you click Apply.</span></div>
              {busy && stream && <pre className="text-[10px] font-mono bg-slate-900 text-emerald-200 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">{stream.slice(-1500)}</pre>}
            </div>
            {generated && (
              <div className="bg-white p-5 rounded-xl border border-emerald-200 shadow-3xs space-y-4">
                <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Proposal ready</h3><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setGenerated(null)}>Discard</Button><Button size="sm" onClick={applyGenerated} icon={<ArrowRight className="w-3.5 h-3.5" />}>Apply to app</Button></div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-2"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Forms ({generated.forms.length})</div>{generated.forms.map((f) => <div key={f.id} className="rounded-lg border border-slate-200 p-2.5"><div className="font-semibold text-slate-900">{f.name}</div><div className="flex flex-wrap gap-1 mt-1">{f.fields.map((x) => <Badge key={x.id} variant={x.type === "lookup" ? "primary" : x.type === "subform" ? "purple" : x.type === "formula" || x.type === "rollup" ? "indigo" : x.type === "section" ? "dark" : "default"}>{x.label}</Badge>)}</div></div>)}</div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reports ({generated.reports.length})</div>{generated.reports.map((r) => <div key={r.id} className="rounded-lg border border-slate-200 px-2.5 py-1.5 flex justify-between"><span className="font-medium text-slate-800">{r.name}</span><Badge>{r.reportType}</Badge></div>)}
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pt-2">Workflows ({generated.workflows.length})</div>{generated.workflows.map((w) => <div key={w.id} className="rounded-lg border border-slate-200 px-2.5 py-1.5"><div className="font-medium text-slate-800">{w.name} <span className="text-slate-400">· {w.trigger.type}</span></div><code className="block text-[10px] text-slate-500 truncate">{w.codeScript}</code></div>)}
                    {generated.roles?.length > 0 && <><div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pt-2">Roles</div><div className="flex flex-wrap gap-1">{generated.roles.map((r) => <Badge key={r.name} variant="indigo">{r.name} · {r.preset}</Badge>)}</div></>}
                    {generated.dashboard && <div className="text-[11px] text-slate-500 pt-2">+ Dashboard page with {(generated.dashboard.kpis || []).length} KPIs and {(generated.dashboard.charts || []).length} charts</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "newform" && <AiNewForm disabled={!hasKey} initialPrompt={linkTab === "newform" ? linkPrompt : undefined} />}
        {tab === "newreport" && <AiNewReport disabled={!hasKey} initialPrompt={linkTab === "newreport" ? linkPrompt : undefined} initialFormId={linkTab === "newreport" ? linkFormId : undefined} />}
        {tab === "newdashboard" && <AiNewDashboard disabled={!hasKey} initialPrompt={linkTab === "newdashboard" ? linkPrompt : undefined} />}
        {tab === "newworkflow" && <AiNewWorkflow disabled={!hasKey} initialPrompt={linkTab === "newworkflow" ? linkPrompt : undefined} initialFormId={linkTab === "newworkflow" ? linkFormId : undefined} />}

        {tab === "formula" && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-3">
            <div className="grid grid-cols-[200px_1fr] gap-3 items-end">
              <Select label="Form" value={formulaFormId} onChange={(e) => setFormulaFormId(e.target.value)}><option value="">Choose…</option>{currentApp.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
              <Input label="What should it calculate?" value={formulaAsk} onChange={(e) => setFormulaAsk(e.target.value)} placeholder="e.g. total of line items plus 18% GST, rounded to 2 decimals" />
            </div>
            <Button loading={busy} disabled={!formulaFormId || !formulaAsk.trim() || !hasKey} onClick={() => run(async () => { setFormulaOut(await writeFormula(formulaAsk, currentApp.forms.find((f) => f.id === formulaFormId)!, currentApp)); })} icon={<Sigma className="w-3.5 h-3.5" />}>Write formula</Button>
            {formulaOut && <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2"><code className="block font-mono text-sm text-indigo-800">{formulaOut.expression}</code><p className="text-xs text-slate-600">{formulaOut.explanation}</p><Button size="xs" variant="outline" onClick={() => { navigator.clipboard.writeText(formulaOut.expression); showToast("Copied — paste into a Formula field", "success"); }}>Copy</Button></div>}
          </div>
        )}

        {tab === "query" && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-3">
            <div><h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Search className="w-4 h-4 text-blue-600" /> Ask a question about your data</h3><p className="text-xs text-slate-500">The answer is computed from your real records (the AI only interprets the question and words the reply) — nothing is created or stored.</p></div>
            <div className="flex gap-2">
              <div className="flex-1"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How many sales invoices are there? · Total sales this month · Unpaid invoices by customer" onKeyDown={(e) => e.key === "Enter" && question.trim() && run(async () => setQueryOut(await answerDataQuestion(question, currentApp, loadRecords)))} /></div>
              <Button loading={busy} disabled={!question.trim() || !hasKey} onClick={() => run(async () => setQueryOut(await answerDataQuestion(question, currentApp, loadRecords)))} icon={<Search className="w-3.5 h-3.5" />}>Ask</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">{["How many sales invoices are there?", "Total sales this month", "Unpaid invoices by customer", "Top 5 products by quantity sold", "Customers added in the last 30 days"].map((q) => <button key={q} type="button" onClick={() => setQuestion(q)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-700">{q}</button>)}</div>
            {queryOut && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
                <p className="text-sm text-slate-900 leading-relaxed">{queryOut.narrative}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{queryOut.form.name}</Badge>
                  <Badge variant="primary">{queryOut.count} of {queryOut.total} records</Badge>
                  {queryOut.aggregate && <Badge variant="indigo">{queryOut.aggregate.label} {queryOut.aggregate.fieldLabel}: {queryOut.aggregate.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Badge>}
                  {queryOut.filters.map((f: any, i: number) => <Badge key={i} variant="default">{f.label} {f.operator} {f.value}</Badge>)}
                </div>
                {queryOut.groups?.length ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-1.5">Group</th><th className="text-right px-3 py-1.5">Records</th>{queryOut.aggregate && <th className="text-right px-3 py-1.5">{queryOut.aggregate.label} {queryOut.aggregate.fieldLabel}</th>}</tr></thead><tbody className="divide-y divide-slate-100">{queryOut.groups.map((g: any) => <tr key={g.label}><td className="px-3 py-1.5 font-medium">{g.label}</td><td className="px-3 py-1.5 text-right tabular-nums">{g.count}</td>{queryOut.aggregate && <td className="px-3 py-1.5 text-right tabular-nums">{(g.value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>}</tr>)}</tbody></table></div>
                ) : queryOut.sample.length ? (
                  <details><summary className="cursor-pointer text-slate-500">Show first {queryOut.sample.length} matching record{queryOut.sample.length === 1 ? "" : "s"}</summary><div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr>{Object.keys(queryOut.sample[0]).map((h) => <th key={h} className="text-left px-3 py-1.5 whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{queryOut.sample.map((r: any, i: number) => <tr key={i}>{Object.values(r).map((v: any, j) => <td key={j} className="px-3 py-1.5 whitespace-nowrap">{v || "—"}</td>)}</tr>)}</tbody></table></div></details>
                ) : null}
              </div>
            )}
          </div>
        )}

        {tab === "sample" && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
            <div><h3 className="text-sm font-semibold text-slate-900">Generate sample records</h3><p className="text-xs text-slate-500">Realistic Indian-business data for the selected forms. Master forms are generated first so lookups (Customer → City → State, Items → Product…) point to real records. Subform rows and dropdown options are respected. Everything is tagged so you can remove it later.</p></div>
            <div className="flex items-center justify-between"><label className="text-xs font-medium text-slate-700">Forms</label><div className="flex gap-2 text-[11px]"><button type="button" className="text-blue-600 font-semibold" onClick={() => setSampleForms(currentApp.forms.map((f) => f.id))}>All</button><button type="button" className="text-slate-500" onClick={() => setSampleForms([])}>None</button></div></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">{currentApp.forms.map((f) => <label key={f.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${sampleForms.includes(f.id) ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}><Checkbox checked={sampleForms.includes(f.id)} onChange={(v) => setSampleForms((p) => (v ? [...p, f.id] : p.filter((x) => x !== f.id)))} />{f.name}</label>)}</div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-2">Records per form<input type="number" min={1} max={50} value={sampleCount} onChange={(e) => setSampleCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))} className="w-20 text-xs border border-slate-300 rounded-lg px-2 py-1.5" /></label>
              <Button loading={busy} disabled={sampleForms.length === 0 || !hasKey} icon={<Database className="w-3.5 h-3.5" />} onClick={() => run(async () => {
                setSampleResult(null);
                const existing: Record<string, any[]> = {};
                for (const f of currentApp.forms) existing[f.id] = await loadRecords(f.id);
                const res = await generateSampleData(currentApp, sampleForms, sampleCount, existing, { email: user?.email || "", name: user?.name || "" }, setSampleProgress);
                setSampleProgress("");
                setSampleResult(res);
              })}>Generate</Button>
              <Button variant="outline" className="text-rose-600 ml-auto" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setWipeOpen(true)}>Remove all sample data</Button>
            </div>
            {busy && sampleProgress && <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />{sampleProgress}</div>}
            {sampleResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {sampleResult.records.length} records ready</span><Button size="sm" disabled={sampleResult.records.length === 0} onClick={async () => { await storageService.saveRecords(currentApp.id, sampleResult.records); showToast(`${sampleResult.records.length} sample records inserted`, "success"); setSampleResult(null); }} icon={<ArrowRight className="w-3.5 h-3.5" />}>Insert into app</Button></div>
                <div className="flex flex-wrap gap-1.5">{Object.entries(sampleResult.perForm).map(([fid, n]) => <Badge key={fid} variant="success">{currentApp.forms.find((f) => f.id === fid)?.name}: {n}</Badge>)}</div>
                {sampleResult.warnings.length > 0 && <ul className="text-[11px] text-amber-800 list-disc pl-4">{sampleResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                <details className="text-[11px]"><summary className="cursor-pointer text-slate-500">Preview first record of each form</summary><pre className="mt-2 bg-white border border-slate-200 rounded-lg p-2 max-h-48 overflow-auto font-mono text-[10px]">{JSON.stringify(Object.fromEntries(Object.keys(sampleResult.perForm).map((fid) => { const f = currentApp.forms.find((x) => x.id === fid); const r = sampleResult.records.find((x) => x.formId === fid); return [f?.name || fid, Object.fromEntries(Object.entries(r?.data || {}).map(([k, v]) => [f?.fields.find((x) => x.id === k)?.linkName || k, v]))]; })), null, 2)}</pre></details>
              </div>
            )}
            <ConfirmDialog isOpen={wipeOpen} onClose={() => setWipeOpen(false)} onConfirm={async () => { let n = 0; for (const f of currentApp.forms) { const recs = await storageService.getRecords(currentApp.id, f.id, { includeDeleted: true }); const ids = recs.filter((r) => r.isSample).map((r) => r.id); if (ids.length) { await storageService.deleteRecords(currentApp.id, f.id, ids, { hard: true }); n += ids.length; } } showToast(`${n} sample records deleted`, "info"); }} title="Remove all sample data?" message="Every record generated by this tool (flagged as sample) will be permanently deleted from all forms. Records you entered manually are not touched." confirmText="Delete sample data" />
          </div>
        )}

        {tab === "chat" && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-3">
            <Textarea label="Ask anything about building this app" rows={3} value={chatQ} onChange={(e) => setChatQ(e.target.value)} placeholder="e.g. How do I reduce item stock when a usage entry is saved?" />
            <Button loading={busy} disabled={!chatQ.trim() || !hasKey} onClick={() => run(async () => { setChatA(""); await askAssistant(chatQ, currentApp, (t) => setChatA((a) => a + t)); })} icon={<MessageSquare className="w-3.5 h-3.5" />}>Ask</Button>
            {(chatA || busy) && <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">{chatA || <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
