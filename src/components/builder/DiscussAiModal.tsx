"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppDefinition } from "@/types/schema";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { discussWithAi, DiscussMessage, DiscussAction } from "@/lib/ai/discuss";
import { hasActiveKey, setActiveAiApp } from "@/lib/ai/claude";
import { getBuilderUrl, getLiveAppUrl, BuilderTab } from "@/lib/utils/routes";
import { MessageSquare, Send, Sparkles, Wand2, ExternalLink, BookOpen, CheckCircle2, AlertTriangle, XCircle, RotateCcw } from "lucide-react";

const STARTERS = [
  "What can I build with this platform for my business?",
  "Can I reduce product stock automatically when an invoice is saved?",
  "How do I stop inactive customers appearing in lookups?",
  "Can members see only their own invoices?",
  "Can I send a WhatsApp / SMS when a bill is created?",
  "Show me what is missing in my app for GST invoicing",
];

/**
 * Chat with a platform-aware consultant: it knows every capability and limit, reads the current app,
 * and answers "possible / partial / not possible" with actions — open a builder tab, or run one of the
 * AI tabs with a ready prompt ("shall I do it for you?").
 */
export const DiscussAiModal: React.FC<{ isOpen: boolean; onClose: () => void; app: AppDefinition; audience: "owner" | "member" }> = ({ isOpen, onClose, app, audience }) => {
  const router = useRouter();
  const [messages, setMessages] = useState<DiscussMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isOpen) { setActiveAiApp(app.id); hasActiveKey().then(setHasKey).catch(() => setHasKey(false)); } }, [isOpen, app.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput(""); setError(null);
    const next = [...messages, { role: "user" as const, text: question }];
    setMessages(next); setBusy(true);
    try { setMessages([...next, await discussWithAi(messages, question, app, audience)]); }
    catch (e: any) { setError(e?.message || "AI request failed"); }
    finally { setBusy(false); }
  };

  const runAction = (a: DiscussAction) => {
    if (a.type === "ai_prompt") {
      const params = new URLSearchParams({ app: app.linkName, tab: "ai", aiTab: a.aiTab || "newworkflow", prompt: a.prompt || "" });
      if (a.formId) params.set("formId", a.formId);
      router.push(`/builder/editor?${params.toString()}`); onClose();
    } else if (a.type === "builder") { router.push(getBuilderUrl(app.linkName, { tab: (a.tab || "forms") as BuilderTab, form: a.form, report: a.report })); onClose(); }
    else if (a.type === "docs") window.open(`/docs#${a.anchor || ""}`, "_blank");
    else if (a.type === "live") { router.push(getLiveAppUrl(app.linkName, { form: a.form, report: a.report })); onClose(); }
  };

  const Feas: React.FC<{ f?: DiscussMessage["feasibility"] }> = ({ f }) => !f ? null : f === "yes" ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-px"><CheckCircle2 className="w-3 h-3" />Possible</span> : f === "partial" ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-px"><AlertTriangle className="w-3 h-3" />Partly — needs a workaround</span> : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-px"><XCircle className="w-3 h-3" />Not possible here</span>;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Discuss with AI" description={`Ask what is possible in ${app.name}. The assistant knows every feature and limit of the platform and reads your app.`} maxWidth="3xl" icon={<MessageSquare className="w-4 h-4 text-indigo-600" />} bodyClassName="!p-0">
      <div className="flex flex-col h-[min(70vh,640px)]">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/60">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-indigo-100 bg-white p-4 text-xs text-slate-700 leading-relaxed"><Sparkles className="w-4 h-4 text-indigo-600 inline mr-1.5" />Describe what you want your business app to do — e.g. a rule, a report, an automation, a permission. I&apos;ll tell you whether it&apos;s possible on this platform, how to do it in <strong>{app.name}</strong>, and offer to do it for you.</div>
              <div className="flex flex-wrap gap-1.5">{STARTERS.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="text-[11px] px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{s}</button>)}</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-blue-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-3xs"}`}>
                {m.role === "assistant" && <div className="mb-1.5"><Feas f={m.feasibility} /></div>}
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.actions.map((a, j) => (
                      <button key={j} type="button" onClick={() => runAction(a)} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${a.type === "ai_prompt" ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" : "bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-700"}`} title={a.prompt || ""}>
                        {a.type === "ai_prompt" ? <Wand2 className="w-3 h-3" /> : a.type === "docs" ? <BookOpen className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}{a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 text-xs text-slate-500 flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />Analysing your app…</div></div>}
          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-slate-200 bg-white p-3 flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }} rows={2} placeholder={hasKey ? "Ask anything — e.g. 'Can I block saving an invoice when stock is low?'" : "No AI key configured — add one under AI Assistant → Provider & keys"} disabled={!hasKey} className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/25 disabled:bg-slate-50" />
          {messages.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setError(null); }} icon={<RotateCcw className="w-3.5 h-3.5" />} title="Start over" />}
          <Button onClick={() => ask(input)} loading={busy} disabled={!input.trim() || !hasKey} icon={<Send className="w-3.5 h-3.5" />}>Ask</Button>
        </div>
      </div>
    </Modal>
  );
};
