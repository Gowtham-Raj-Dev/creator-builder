"use client";

import React, { useEffect, useState } from "react";
import { AppDefinition } from "@/types/schema";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { getAiSettings, getGlobalAiSettings, getAppAiOverride, saveAiSettings, saveAppAiOverride, hasActiveKey, listGeminiModels, AiSettings, AiProvider } from "@/lib/ai/claude";
import { CheckCircle2, AlertTriangle } from "lucide-react";

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

/** Provider + API key management (global platform keys or per-app override). */
export const AiProviderSettings: React.FC<{ app: AppDefinition; onSaved?: () => void }> = ({ app, onSaved }) => {
  const { showToast } = useToast();
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [keys, setKeys] = useState({ anthropic: "", gemini: "", groq: "" });
  const [geminiModels, setGeminiModels] = useState<Array<{ id: string; label: string; inputLimit?: number }> | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [scope, setScope] = useState<"global" | "app">("global");
  const [useOwn, setUseOwn] = useState(false);
  const [effective, setEffective] = useState<(AiSettings & { source: "app" | "global" }) | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const loadScope = async (sc: "global" | "app") => {
    const st = sc === "global" ? await getGlobalAiSettings() : { ...(await getGlobalAiSettings()), ...(await getAppAiOverride(app.id)) };
    setAi({ aiProvider: st.aiProvider, geminiModel: st.geminiModel, groqModel: st.groqModel });
    setKeys({ anthropic: st.anthropicApiKey || "", gemini: st.geminiApiKey || "", groq: st.groqApiKey || "" });
  };
  const refreshEffective = async () => { setEffective(await getAiSettings()); setHasKey(await hasActiveKey()); };
  useEffect(() => {
    getAppAiOverride(app.id).then((o) => { const own = Boolean(o.useOwnKeys); setUseOwn(own); const sc = own ? "app" : "global"; setScope(sc); loadScope(sc); });
    refreshEffective();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  const loadGeminiModels = async (key: string) => {
    if (!key.trim()) { setModelsError("Enter the Gemini API key first."); return; }
    setModelsBusy(true); setModelsError(null);
    try { const list = await listGeminiModels(key.trim()); setGeminiModels(list); if (!list.length) setModelsError("This key has no text models available."); }
    catch (e: any) { setModelsError(e?.message || "Could not load models"); }
    finally { setModelsBusy(false); }
  };

  if (!ai) return <div className="p-6 text-xs text-slate-400">Loading settings…</div>;

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Key scope</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button type="button" onClick={() => { setUseOwn(false); setScope("global"); loadScope("global"); }} className={`text-left p-3 rounded-xl border text-xs ${!useOwn ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-semibold text-slate-900">Global (all apps)</div><div className="text-[11px] text-slate-500">One provider + key shared by every application. Editable from any app.</div></button>
          <button type="button" onClick={() => { setUseOwn(true); setScope("app"); loadScope("app"); }} className={`text-left p-3 rounded-xl border text-xs ${useOwn ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="font-semibold text-slate-900">This app only — {app.name}</div><div className="text-[11px] text-slate-500">Separate provider/keys for this app; other apps keep using the global keys.</div></button>
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
          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-2 items-end">
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
          <p className="text-[11px] text-slate-500">Each model has its own free-tier quota (requests per minute / per day). If one model returns 429, switch to another — Flash-Lite models usually have the highest limits. Check the exact ids and limits at aistudio.google.com → Usage &amp; billing.</p>
        </div>
      )}
      {ai.aiProvider === "groq" && <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-2"><Input type="password" label="Groq API key" value={keys.groq} onChange={(e) => setKeys({ ...keys, groq: e.target.value })} placeholder="gsk_…" /><Select label="Model" value={ai.groqModel} onChange={(e) => setAi({ ...ai, groqModel: e.target.value })}><option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option><option value="qwen/qwen3-32b">qwen3-32b</option><option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option></Select></div>}
      {ai.aiProvider === "anthropic" && <Input type="password" label="Anthropic API key" value={keys.anthropic} onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })} placeholder="sk-ant-…" />}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-slate-500">Keys are stored in Firestore <code>platform/settings</code> (owner-only rules) and used directly from your browser.</p>
        <Button onClick={async () => {
          const payload = { aiProvider: ai.aiProvider, anthropicApiKey: keys.anthropic.trim(), geminiApiKey: keys.gemini.trim(), groqApiKey: keys.groq.trim(), geminiModel: ai.geminiModel, groqModel: ai.groqModel };
          if (scope === "app") await saveAppAiOverride(app.id, { useOwnKeys: true, ...payload });
          else { await saveAiSettings(payload); if (!useOwn) await saveAppAiOverride(app.id, { useOwnKeys: false }); }
          await refreshEffective();
          onSaved?.();
          showToast(scope === "app" ? `Keys saved for ${app.name}` : "Global AI settings saved", "success");
        }}>Save {scope === "app" ? "for this app" : "globally"}</Button>
      </div>
      {effective && <p className={`text-[11px] flex items-center gap-1 ${hasKey ? "text-emerald-700" : "text-amber-700"}`}>{hasKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />} In effect for this app: <strong>{effective.aiProvider}</strong> via {effective.source === "app" ? "app-specific keys" : "global keys"}{hasKey ? "" : " — no key set"}.</p>}
    </div>
  );
};
