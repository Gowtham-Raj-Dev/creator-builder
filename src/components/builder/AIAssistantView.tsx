"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { useToast } from "@/context/ToastContext";
import { useAuth } from "@/context/AuthContext";
import { AiChat, AiChatKind, AiChatMessage } from "@/types/schema";
import { Button, IconButton } from "@/components/ui/Button";
import { Input, Select, Textarea, Badge, Toggle, Checkbox } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createDefaultRole } from "@/lib/auth/permissions";
import { generateId } from "@/lib/utils/idGenerator";
import { getAiSettings, setActiveAiApp, hasActiveKey, generateAppFromDescription, writeFormula, askAssistant, GeneratedApp, AiSettings } from "@/lib/ai/claude";
import { getBuilderUrl } from "@/lib/utils/routes";
import { generateSampleData, SampleGenResult } from "@/lib/ai/sampleData";
import { answerDataQuestion, DataAnswer } from "@/lib/ai/askData";
import { withParentLinkColumns } from "@/lib/engine/subformLink";
import { useAiChats, AiLogEvent } from "@/lib/ai/chats";
import { AiNewReport, AiNewForm, AiNewWorkflow, AiNewDashboard } from "./AiBuilders";
import { AiProviderSettings } from "./AiProviderSettings";
import { AiDeletePanel } from "./AiDeletePanel";
import { storageService } from "@/lib/storage/firestoreProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { Sparkles, Wand2, Sigma, Search, MessageSquare, KeyRound, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Database, Trash2, FileText, TableProperties, Zap, LayoutDashboard, Plus, Pencil, PanelLeftClose, PanelLeftOpen, ExternalLink, Bot, User as UserIcon, Send, ChevronDown, MessageSquarePlus } from "lucide-react";

// ── tools (each has its own chat history) ────────────────────────────────────

const TOOLS: Array<{ id: AiChatKind; label: string; desc: string; icon: React.ReactNode; tone: string; examples: string[] }> = [
  { id: "generate", label: "Generate app", desc: "Describe a whole application — forms, reports, workflows, roles and a dashboard are proposed together.", icon: <Wand2 className="w-4 h-4" />, tone: "from-violet-500 to-fuchsia-500", examples: ["A sweet shop purchase tracker with items, vendors, purchases with line items and a stock ledger", "Clinic appointments: patients, doctors, appointments with status and a daily schedule", "School fee management with students, fee heads, receipts and outstanding report"] },
  { id: "newform", label: "New form", desc: "Describe one form; it can look up existing forms and gets a default report.", icon: <FileText className="w-4 h-4" />, tone: "from-blue-500 to-cyan-500", examples: ["Vendor form: vendor code (auto number), name, phone, GSTIN, city lookup, payment terms dropdown, active checkbox", "Expense claim with employee lookup, date, category, amount, receipt image and approval status"] },
  { id: "newreport", label: "New report", desc: "Describe a view — filters, columns, grouping and the report type are picked for you.", icon: <TableProperties className="w-4 h-4" />, tone: "from-emerald-500 to-teal-500", examples: ["Pending invoices this month grouped by customer with total amount", "Invoices as a kanban by payment status", "Only active vendors sorted by name"] },
  { id: "newworkflow", label: "New workflow", desc: "Describe a rule in plain words — the script is checked against your fields and dry-run before you see it.", icon: <Zap className="w-4 h-4" />, tone: "from-amber-500 to-orange-500", examples: ["When Purchase Order is chosen, fill Line Items from that PO and copy the vendor", "Block save if issued quantity is more than available stock", "After save, reduce item stock by each line's quantity"] },
  { id: "newdashboard", label: "New dashboard", desc: "Say what you want to watch — KPI cards, charts, a report widget and quick links.", icon: <LayoutDashboard className="w-4 h-4" />, tone: "from-pink-500 to-rose-500", examples: ["Sales overview: this month's sales, outstanding, sales by month and top customers", "Stock health: low stock items, purchases vs sales by month"] },
  { id: "formula", label: "Formula writer", desc: "Describe a calculation; get a formula expression you can paste into a Formula field.", icon: <Sigma className="w-4 h-4" />, tone: "from-indigo-500 to-blue-500", examples: ["Total of line items plus 18% GST, rounded to 2 decimals", "Days between invoice date and today", "Full name from first and last name"] },
  { id: "query", label: "Ask data", desc: "Ask a question about your records — the answer is computed from real data.", icon: <Search className="w-4 h-4" />, tone: "from-sky-500 to-blue-600", examples: ["How many sales invoices are there?", "Total sales this month", "Unpaid invoices by customer", "Top 5 products by quantity sold"] },
  { id: "sample", label: "Sample data", desc: "Generate realistic test records for selected forms (tagged so they can be removed later).", icon: <Database className="w-4 h-4" />, tone: "from-slate-500 to-slate-700", examples: [] },
  { id: "chat", label: "Help", desc: "Ask anything about building this app — the assistant knows your forms and fields.", icon: <MessageSquare className="w-4 h-4" />, tone: "from-teal-500 to-emerald-600", examples: ["How do I reduce item stock when a usage entry is saved?", "What is the difference between a lookup and a subform?", "How can I lock a record after it is approved?"] },
];

/** Today / Yesterday / Previous 7 days / Older — like a chat app's history list. */
function dateGroup(iso: string): string {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Previous 7 days" : "Older";
}
const KIND_IDS = TOOLS.map((t) => t.id) as string[];

const relTime = (iso: string) => {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
};

// ── main view ────────────────────────────────────────────────────────────────

export const AIAssistantView: React.FC = () => {
  const { currentApp } = useAppBuilder();
  const { user } = useAuth();
  const router = useRouter();
  // deep link from "Discuss with AI": ?tab=ai&aiTab=newworkflow&prompt=…&formId=…
  const searchParams = useSearchParams();
  const linkTab = searchParams.get("aiTab") || "";
  const linkPrompt = searchParams.get("prompt") || "";
  const linkFormId = searchParams.get("formId") || "";
  const [kind, setKind] = useState<AiChatKind | "settings">(KIND_IDS.includes(linkTab) || linkTab === "settings" ? (linkTab as AiChatKind | "settings") : "generate");
  const [active, setActive] = useState<Partial<Record<AiChatKind, string | null>>>({});
  const activeRef = useRef(active); // read by tool callbacks that outlive a render (streams, late applies)
  const selectChat = (k: AiChatKind, id: string | null) => { activeRef.current = { ...activeRef.current, [k]: id }; setActive(activeRef.current); setEpoch((e) => e + 1); setSeed(null); };
  const [sidebar, setSidebar] = useState(true);
  const [epoch, setEpoch] = useState(0); // bumps only when the user switches chat — never when a chat is auto-created mid-generation
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null); // example chip → composer
  const [manage, setManage] = useState(false); // New form / report / workflow: "Create" vs "Manage existing"
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [effective, setEffective] = useState<(AiSettings & { source: "app" | "global" }) | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<AiChat | null>(null);
  const chatsApi = useAiChats(currentApp?.id, user?.email);
  const { chats, create, rename, remove, append, patchMessage } = chatsApi;

  const refreshEffective = async () => { setEffective(await getAiSettings()); setHasKey(await hasActiveKey()); };
  useEffect(() => {
    if (!currentApp) return;
    setActiveAiApp(currentApp.id);
    refreshEffective();
    return () => setActiveAiApp(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApp?.id]);
  // a deep link with a prompt always starts a fresh chat for that tool
  useEffect(() => { if (linkTab && KIND_IDS.includes(linkTab) && linkPrompt) { setKind(linkTab as AiChatKind); selectChat(linkTab as AiChatKind, null); } }, [linkTab, linkPrompt]);

  const tool = TOOLS.find((t) => t.id === kind);
  const kindChats = useMemo(() => (kind === "settings" ? [] : chats.filter((c) => c.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), [chats, kind]);
  const activeId = kind === "settings" ? null : active[kind] ?? null;
  const activeChat = activeId ? chats.find((c) => c.id === activeId) || null : null;

  /** Logger handed to each tool: a new turn (prompt + reply) or a status update on an earlier reply.
   *  Writes into the tool's active chat, creating one when the user is on "New chat". */
  const log = useCallback((k: AiChatKind, e: AiLogEvent) => {
    let id = activeRef.current[k];
    if (!id) { const c = create(k); id = c.id; activeRef.current = { ...activeRef.current, [k]: id }; setActive(activeRef.current); }
    if (e.prompt !== undefined) append(id, [{ id: generateId("msg"), role: "user", text: e.prompt }, { id: e.id, role: "assistant", text: e.reply || "", status: e.status, link: e.link }]);
    else patchMessage(id, e.id, { ...(e.reply !== undefined ? { text: e.reply } : {}), ...(e.status ? { status: e.status } : {}), ...(e.link ? { link: e.link } : {}) });
  }, [create, append, patchMessage]);
  const logFor = (k: AiChatKind) => (e: AiLogEvent) => log(k, e);

  if (!currentApp) return null;
  const providerLabel = effective?.aiProvider === "gemini" ? `Gemini · ${effective.geminiModel}` : effective?.aiProvider === "groq" ? `Groq · ${effective.groqModel}` : "Claude";
  const composerKey = `${kind}:${epoch}:${seed?.n || 0}:${linkPrompt ? linkTab : ""}`;
  const initialPrompt = seed?.text || (linkTab === kind && linkPrompt ? linkPrompt : undefined);
  const pickTool = (k: AiChatKind | "settings") => { setKind(k); setEpoch((e) => e + 1); setSeed(null); setManage(false); };
  const manageKind = kind === "newform" ? "form" : kind === "newreport" ? "report" : kind === "newworkflow" ? "workflow" : null;

  return (
    <div className="flex-1 flex h-full min-h-0 overflow-hidden bg-slate-100/60">
      {/* ── history sidebar ─────────────────────────────────────────────── */}
      {sidebar && (
        <aside className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0">
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm"><Sparkles className="w-4 h-4" /></span> AI Assistant</div>
              <IconButton size="sm" onClick={() => setSidebar(false)} title="Hide history"><PanelLeftClose className="w-4 h-4" /></IconButton>
            </div>
            {/* tool picker */}
            <Dropdown
              align="left"
              width="w-full"
              className="w-full [&>div:first-child]:w-full"
              trigger={
                <button type="button" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left">
                  <span className={`w-6 h-6 rounded-md bg-gradient-to-br ${tool?.tone || "from-slate-400 to-slate-600"} text-white flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5`}>{kind === "settings" ? <KeyRound className="w-4 h-4" /> : tool?.icon}</span>
                  <span className="min-w-0 flex-1 text-xs font-semibold text-slate-900 truncate">{kind === "settings" ? "Provider & keys" : tool?.label}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              }
              items={TOOLS.map((t) => ({ id: t.id, label: t.label, icon: <span className={`w-5 h-5 rounded-md bg-gradient-to-br ${t.tone} text-white flex items-center justify-center [&>svg]:w-3 [&>svg]:h-3 ${t.id === kind ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}>{t.icon}</span>, onClick: () => pickTool(t.id) }))}
            />
            {kind !== "settings" && <Button className="w-full justify-center" size="sm" icon={<MessageSquarePlus className="w-3.5 h-3.5" />} onClick={() => selectChat(kind as AiChatKind, null)}>New {tool?.label.toLowerCase()} chat</Button>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 border-t border-slate-100 pt-2">
            {kind !== "settings" && (
              <>
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{tool?.label} · history {kindChats.length > 0 && <span className="text-slate-300">({kindChats.length})</span>}</div>
                {!chatsApi.loaded && <div className="px-2 py-3 text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>}
                {chatsApi.loaded && kindChats.length === 0 && <div className="mx-2 my-2 rounded-xl border border-dashed border-slate-200 p-3 text-[11px] text-slate-400 text-center">No chats yet.<br />Every prompt starts a chat you can come back to.</div>}
                {["Today", "Yesterday", "Previous 7 days", "Older"].map((g) => {
                  const list = kindChats.filter((c) => dateGroup(c.updatedAt) === g);
                  if (!list.length) return null;
                  return (
                    <div key={g} className="mb-2">
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">{g}</div>
                      {list.map((c) => {
                        const on = c.id === activeId;
                        const isRenaming = renaming?.id === c.id;
                        const prompts = c.messages.filter((m) => m.role === "user").length;
                        return (
                          <div key={c.id} className={`group flex items-center gap-1 rounded-lg pl-2.5 pr-1 ${on ? "bg-slate-900 text-white shadow-sm" : "hover:bg-slate-100 text-slate-700"}`}>
                            {isRenaming ? (
                              <input autoFocus value={renaming.title} onChange={(e) => setRenaming({ id: c.id, title: e.target.value })} onBlur={() => { rename(c.id, renaming.title); setRenaming(null); }} onKeyDown={(e) => { if (e.key === "Enter") { rename(c.id, renaming.title); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} className="flex-1 min-w-0 text-xs my-1 px-1.5 py-1 rounded border border-blue-300 text-slate-900 bg-white" />
                            ) : (
                              <button type="button" onClick={() => selectChat(kind as AiChatKind, c.id)} onDoubleClick={() => setRenaming({ id: c.id, title: c.title })} className="flex-1 min-w-0 text-left py-1.5">
                                <div className="text-xs font-medium truncate">{c.title}</div>
                                <div className={`text-[10px] ${on ? "text-white/60" : "text-slate-400"}`}>{prompts} prompt{prompts === 1 ? "" : "s"} · {relTime(c.updatedAt)}</div>
                              </button>
                            )}
                            {!isRenaming && (
                              <span className={`flex items-center shrink-0 ${on ? "" : "opacity-0 group-hover:opacity-100"}`}>
                                <button type="button" title="Rename" onClick={() => setRenaming({ id: c.id, title: c.title })} className={`w-6 h-6 rounded flex items-center justify-center ${on ? "text-white/70 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-slate-700 hover:bg-slate-200"}`}><Pencil className="w-3 h-3" /></button>
                                <button type="button" title="Delete chat" onClick={() => setDeleting(c)} className={`w-6 h-6 rounded flex items-center justify-center ${on ? "text-white/70 hover:text-rose-200 hover:bg-white/10" : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"}`}><Trash2 className="w-3 h-3" /></button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          <button type="button" onClick={() => pickTool("settings")} className={`px-4 py-3 border-t border-slate-100 text-xs font-medium flex items-center gap-2 ${kind === "settings" ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}><KeyRound className="w-4 h-4" /> Provider &amp; keys <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[120px]">{providerLabel}</span></button>
        </aside>
      )}

      {/* ── main pane ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3">
          {!sidebar && <IconButton size="sm" onClick={() => setSidebar(true)} title="Show history"><PanelLeftOpen className="w-4 h-4" /></IconButton>}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">{kind === "settings" ? <><KeyRound className="w-4 h-4 text-slate-500" /> Provider &amp; keys</> : <><span className={`w-6 h-6 rounded-md bg-gradient-to-br ${tool?.tone} text-white flex items-center justify-center`}>{tool?.icon}</span> {activeChat ? activeChat.title : `New ${tool?.label.toLowerCase()} chat`}</>}</div>
            <div className="text-[11px] text-slate-500 truncate">{kind === "settings" ? "Choose the AI provider and where its key comes from." : activeChat ? `${tool?.label} · ${activeChat.messages.filter((m) => m.role === "user").length} prompt(s) · started ${relTime(activeChat.createdAt)}` : tool?.desc}</div>
          </div>
          {kind !== "settings" && activeChat && <Button size="xs" variant="outline" icon={<Plus className="w-3 h-3" />} onClick={() => selectChat(kind as AiChatKind, null)}>New chat</Button>}
          <span className="hidden md:inline text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">{providerLabel}{effective?.source === "app" ? " · app keys" : ""}</span>
        </div>

        {hasKey === false && kind !== "settings" && (
          <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No API key configured for the selected provider yet.</span><Button size="xs" variant="outline" onClick={() => setKind("settings")}>Add key</Button></div>
        )}

        {kind === "settings" ? (
          <div className="flex-1 overflow-y-auto p-5"><div className="max-w-4xl mx-auto"><AiProviderSettings app={currentApp} onSaved={refreshEffective} /></div></div>
        ) : (
          <>
            {/* transcript (or the landing hero for a fresh chat) */}
            <Transcript chat={activeChat} tool={tool!} onOpen={(link) => router.push(link)} onExample={(text) => setSeed({ text, n: (seed?.n || 0) + 1 })} />
            {/* composer = the tool itself */}
            <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-slate-100 to-transparent">
              <div key={composerKey} className="max-w-4xl mx-auto rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/60 p-4 max-h-[58vh] overflow-y-auto">
                {manageKind && (
                  <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-slate-100 w-fit text-xs font-semibold">
                    <button type="button" onClick={() => setManage(false)} className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${!manage ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Create new {manageKind}</button>
                    <button type="button" onClick={() => setManage(true)} className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${manage ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Trash2 className="w-3.5 h-3.5 text-rose-500" /> Manage existing {manageKind}s</button>
                  </div>
                )}
                {manageKind && manage ? <AiDeletePanel kind={manageKind} /> : <>
                {kind === "generate" && <GenerateAppComposer app={currentApp} disabled={!hasKey} initialPrompt={initialPrompt} onLog={logFor("generate")} />}
                {kind === "newform" && <AiNewForm disabled={!hasKey} initialPrompt={initialPrompt} onLog={logFor("newform")} />}
                {kind === "newreport" && <AiNewReport disabled={!hasKey} initialPrompt={initialPrompt} initialFormId={linkTab === "newreport" ? linkFormId : undefined} onLog={logFor("newreport")} />}
                {kind === "newworkflow" && <AiNewWorkflow disabled={!hasKey} initialPrompt={initialPrompt} initialFormId={linkTab === "newworkflow" ? linkFormId : undefined} onAddKey={() => setKind("settings")} onLog={logFor("newworkflow")} />}
                {kind === "newdashboard" && <AiNewDashboard disabled={!hasKey} initialPrompt={initialPrompt} onLog={logFor("newdashboard")} />}
                {kind === "formula" && <FormulaComposer app={currentApp} disabled={!hasKey} initialPrompt={initialPrompt} onLog={logFor("formula")} />}
                {kind === "query" && <AskDataComposer app={currentApp} disabled={!hasKey} initialPrompt={initialPrompt} onLog={logFor("query")} />}
                {kind === "sample" && <SampleDataComposer app={currentApp} disabled={!hasKey} onLog={logFor("sample")} />}
                {kind === "chat" && <HelpComposer app={currentApp} disabled={!hasKey} chat={activeChat} onLog={logFor("chat")} />}
                </>}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) { remove(deleting.id); if (activeRef.current[deleting.kind] === deleting.id) selectChat(deleting.kind, null); } setDeleting(null); }} title="Delete this chat?" message={`"${deleting?.title}" and its ${deleting?.messages.length || 0} messages will be removed from the history. Anything already created in the app stays.`} confirmText="Delete chat" />
    </div>
  );
};

// ── transcript ───────────────────────────────────────────────────────────────

const STATUS: Record<NonNullable<AiChatMessage["status"]>, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  applied: { label: "Applied", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  discarded: { label: "Discarded", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  error: { label: "Failed", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const Transcript: React.FC<{ chat: AiChat | null; tool: (typeof TOOLS)[number]; onOpen: (link: string) => void; onExample: (text: string) => void }> = ({ chat, tool, onOpen, onExample }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const count = chat?.messages.length || 0;
  const lastText = chat?.messages[count - 1]?.text.length || 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [chat?.id, count, lastText]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
      <div className="max-w-4xl mx-auto space-y-3">
        {!chat || chat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 md:py-16">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${tool.tone} text-white flex items-center justify-center shadow-lg shadow-slate-300/50 mb-4 [&>svg]:w-7 [&>svg]:h-7`}>{tool.icon}</div>
            <h2 className="text-lg font-bold text-slate-900">{tool.label}</h2>
            <p className="text-xs text-slate-500 max-w-md mt-1">{tool.desc}</p>
            {tool.examples.length > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {tool.examples.map((ex) => (
                  <button key={ex} type="button" onClick={() => onExample(ex)} className="text-left text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-3 hover:border-blue-300 hover:shadow-sm transition-all flex items-start gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /><span>{ex}</span></button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-6">Type below and press Enter — your prompt and the result are kept in this chat.</p>
          </div>
        ) : chat.messages.map((m) => (
          <div key={m.id} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${tool.tone} text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}><Bot className="w-4 h-4" /></div>}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-3xs ${m.role === "user" ? "bg-blue-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}>
              <div className="whitespace-pre-wrap break-words">{m.text || (m.role === "assistant" ? <span className="text-slate-500 inline-flex items-center gap-1.5"><span className="flex gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" /><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" /><span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" /></span> generating…</span> : "")}</div>
              {(m.status || m.link) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {m.status && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span>}
                  {m.link && <button type="button" onClick={() => onOpen(m.link!)} className="text-[10px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Open</button>}
                  <span className="text-[10px] text-slate-400 ml-auto">{relTime(m.at)}</span>
                </div>
              )}
            </div>
            {m.role === "user" && <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-0.5"><UserIcon className="w-4 h-4" /></div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

// ── composers for the tools that live in this file ───────────────────────────

const useRun = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(false); } };
  return { busy, error, run };
};
const ErrorBox: React.FC<{ error: string }> = ({ error }) => (error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div> : null);

type ComposerProps = { app: any; disabled: boolean; initialPrompt?: string; onLog: (e: AiLogEvent) => void };

const GenerateAppComposer: React.FC<ComposerProps> = ({ app, disabled, initialPrompt, onLog }) => {
  const { updateCurrentApp, createPage } = useAppBuilder();
  const { showToast } = useToast();
  const router = useRouter();
  const { busy, error, run } = useRun();
  const [description, setDescription] = useState(initialPrompt || "");
  const [suggestReports, setSuggestReports] = useState(false);
  const [stream, setStream] = useState("");
  const [generated, setGenerated] = useState<(GeneratedApp & { msgId: string }) | null>(null);

  const generate = () => run(async () => {
    setStream("");
    const msgId = generateId("msg");
    onLog({ id: msgId, prompt: description, reply: "" });
    try {
      const g = await generateAppFromDescription(description, app, (t) => setStream((s) => s + t), { suggestReports });
      setGenerated({ ...g, msgId });
      onLog({ id: msgId, reply: `Proposal: ${g.forms.length} form(s) — ${g.forms.map((f) => f.name).join(", ")}; ${g.reports.length} report(s); ${g.workflows.length} workflow(s)${g.roles?.length ? `; roles: ${g.roles.map((r) => r.name).join(", ")}` : ""}${g.dashboard ? "; + dashboard" : ""}. Review the proposal below and click Apply.`, status: "proposed" });
    } catch (e: any) { onLog({ id: msgId, reply: `Could not generate: ${e?.message || e}`, status: "error" }); throw e; }
  });
  const apply = () => {
    if (!generated) return;
    updateCurrentApp((prev) => {
      const next = { ...prev, forms: [...prev.forms.map((f) => (generated.updatedForms || []).find((u) => u.id === f.id) || f), ...generated.forms], reports: [...prev.reports, ...generated.reports], workflows: [...prev.workflows, ...generated.workflows] };
      const roles = [...prev.roles];
      for (const r of generated.roles || []) if (!roles.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) roles.push(createDefaultRole(r.name, next, r.preset || "view"));
      return withParentLinkColumns({ ...next, roles });
    });
    if (generated.dashboard && (generated.dashboard.kpis?.length || generated.dashboard.charts?.length)) {
      const page = createPage("Dashboard", "Generated by AI");
      const findForm = (n: string) => [...app.forms, ...generated.forms].find((f: any) => f.name.toLowerCase() === String(n).toLowerCase());
      const findField = (formName: string, label: string) => findForm(formName)?.fields.find((f: any) => f.label.toLowerCase() === String(label || "").toLowerCase())?.id;
      const comps: any[] = [{ id: generateId("comp"), type: "heading", width: 12, props: { title: `${app.name} Dashboard`, subtitle: "" } }, { id: generateId("comp"), type: "filter_panel", width: 12, props: { label: "Date range" } }];
      const kpis = (generated.dashboard.kpis || []).map((k: any) => ({ label: k.label, metric: { formId: findForm(k.form)?.id, aggregate: k.aggregate || "count", fieldId: findField(k.form, k.field), compare: "last_month" }, compact: true })).filter((k: any) => k.metric.formId);
      if (kpis.length) comps.push({ id: generateId("comp"), type: "stat_card", width: 12, props: { stats: kpis } });
      for (const c of generated.dashboard.charts || []) { const f = findForm(c.form); if (!f) continue; comps.push({ id: generateId("comp"), type: "chart", width: 6, props: { title: c.title, chartType: c.chartType || "column", formId: f.id, groupByFieldId: c.groupBy === "createdAt" ? "createdAt" : findField(c.form, c.groupBy) || "createdAt", metric: c.metric || "count", measureFieldId: findField(c.form, c.field), dateBucket: "month" } }); }
      setTimeout(() => updateCurrentApp((prev) => ({ ...prev, pages: prev.pages.map((p) => (p.id === page.id ? { ...p, components: comps, isHome: true } : p)) })), 50);
    }
    showToast(`Added ${generated.forms.length} forms, ${generated.reports.length} reports, ${generated.workflows.length} workflows`, "success");
    onLog({ id: generated.msgId, status: "applied", link: getBuilderUrl(app.linkName, { tab: "forms" }) });
    setGenerated(null);
    router.push(getBuilderUrl(app.linkName, { tab: "forms" }));
  };

  return (
    <div className="space-y-3">
      <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && description.trim() && !disabled && !busy) { e.preventDefault(); generate(); } }} placeholder="e.g. A sweet shop purchase tracker: maintain Items (with unit, rate, opening stock, minimum level), Vendors, Purchase entries with line items (item, qty, rate, amount, total), daily Usage entries, and a stock ledger showing balance per item with low-stock alerts. Store manager can do everything; staff can only add usage." />
      <div className="flex items-center gap-3 flex-wrap"><Button loading={busy} disabled={!description.trim() || disabled} onClick={generate} icon={<Wand2 className="w-3.5 h-3.5" />}>Generate</Button><Toggle size="sm" checked={suggestReports} onChange={setSuggestReports} label="Also suggest extra reports & a dashboard" /><span className="text-[11px] text-slate-400">Nothing is added until you click Apply.</span></div>
      {busy && stream && <pre className="text-[10px] font-mono bg-slate-900 text-emerald-200 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">{stream.slice(-1200)}</pre>}
      <ErrorBox error={error} />
      {generated && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Proposal ready</h3><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { onLog({ id: generated.msgId, status: "discarded" }); setGenerated(null); }}>Discard</Button><Button size="sm" onClick={apply} icon={<ArrowRight className="w-3.5 h-3.5" />}>Apply to app</Button></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-2"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Forms ({generated.forms.length})</div>{generated.forms.map((f) => <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="font-semibold text-slate-900">{f.name}</div><div className="flex flex-wrap gap-1 mt-1">{f.fields.map((x) => <Badge key={x.id} variant={x.type === "lookup" ? "primary" : x.type === "subform" ? "purple" : x.type === "formula" || x.type === "rollup" ? "indigo" : x.type === "section" ? "dark" : "default"}>{x.label}</Badge>)}</div></div>)}</div>
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Reports ({generated.reports.length})</div>{generated.reports.map((r) => <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 flex justify-between"><span className="font-medium text-slate-800">{r.name}</span><Badge>{r.reportType}</Badge></div>)}
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pt-2">Workflows ({generated.workflows.length})</div>{generated.workflows.map((w) => <div key={w.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"><div className="font-medium text-slate-800">{w.name} <span className="text-slate-400">· {w.trigger.type}</span></div><code className="block text-[10px] text-slate-500 truncate">{w.codeScript}</code></div>)}
              {generated.roles?.length > 0 && <><div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pt-2">Roles</div><div className="flex flex-wrap gap-1">{generated.roles.map((r) => <Badge key={r.name} variant="indigo">{r.name} · {r.preset}</Badge>)}</div></>}
              {generated.dashboard && <div className="text-[11px] text-slate-500 pt-2">+ Dashboard page with {(generated.dashboard.kpis || []).length} KPIs and {(generated.dashboard.charts || []).length} charts</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FormulaComposer: React.FC<ComposerProps> = ({ app, disabled, initialPrompt, onLog }) => {
  const { showToast } = useToast();
  const { busy, error, run } = useRun();
  const [formId, setFormId] = useState("");
  const [ask, setAsk] = useState(initialPrompt || "");
  const [out, setOut] = useState<{ expression: string; explanation: string } | null>(null);
  const go = () => run(async () => {
    const form = app.forms.find((f: any) => f.id === formId);
    const msgId = generateId("msg");
    onLog({ id: msgId, prompt: `${form.name}: ${ask}`, reply: "" });
    try {
      const r = await writeFormula(ask, form, app);
      setOut(r);
      onLog({ id: msgId, reply: `${r.expression}\n\n${r.explanation}` });
    } catch (e: any) { onLog({ id: msgId, reply: `Could not write the formula: ${e?.message || e}`, status: "error" }); throw e; }
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3 items-end">
        <Select label="Form" value={formId} onChange={(e) => setFormId(e.target.value)}><option value="">Choose…</option>{app.forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Input label="What should it calculate?" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && formId && ask.trim() && !disabled && !busy) go(); }} placeholder="e.g. total of line items plus 18% GST, rounded to 2 decimals" />
      </div>
      <Button loading={busy} disabled={!formId || !ask.trim() || disabled} onClick={go} icon={<Sigma className="w-3.5 h-3.5" />}>Write formula</Button>
      <ErrorBox error={error} />
      {out && <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2"><code className="block font-mono text-sm text-indigo-800">{out.expression}</code><p className="text-xs text-slate-600">{out.explanation}</p><Button size="xs" variant="outline" onClick={() => { navigator.clipboard.writeText(out.expression); showToast("Copied — paste into a Formula field", "success"); }}>Copy</Button></div>}
    </div>
  );
};

const AskDataComposer: React.FC<ComposerProps> = ({ app, disabled, initialPrompt, onLog }) => {
  const { loadRecords } = useAppBuilder();
  const { busy, error, run } = useRun();
  const [question, setQuestion] = useState(initialPrompt || "");
  const [out, setOut] = useState<DataAnswer | null>(null);
  const go = () => run(async () => {
    const msgId = generateId("msg");
    const asked = question;
    onLog({ id: msgId, prompt: asked, reply: "" });
    setQuestion("");
    try {
      const r = await answerDataQuestion(asked, app, loadRecords);
      setOut(r);
      const table = r.groups?.length ? "\n" + r.groups.slice(0, 12).map((g: any) => `• ${g.label}: ${g.count}${r.aggregate ? ` · ${(g.value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : ""}`).join("\n") : "";
      onLog({ id: msgId, reply: `${r.narrative}${table}` });
    } catch (e: any) { onLog({ id: msgId, reply: `Could not answer: ${e?.message || e}`, status: "error" }); throw e; }
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How many sales invoices are there? · Total sales this month · Unpaid invoices by customer" onKeyDown={(e) => e.key === "Enter" && question.trim() && !disabled && !busy && go()} /></div>
        <Button loading={busy} disabled={!question.trim() || disabled} onClick={go} icon={<Search className="w-3.5 h-3.5" />}>Ask</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">{["How many sales invoices are there?", "Total sales this month", "Unpaid invoices by customer", "Top 5 products by quantity sold", "Customers added in the last 30 days"].map((q) => <button key={q} type="button" onClick={() => setQuestion(q)} className="text-[11px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-700">{q}</button>)}</div>
      <ErrorBox error={error} />
      {out && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 text-xs">
          <p className="text-sm text-slate-900 leading-relaxed">{out.narrative}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">{out.form.name}</Badge>
            <Badge variant="primary">{out.count} of {out.total} records</Badge>
            {out.aggregate && <Badge variant="indigo">{out.aggregate.label} {out.aggregate.fieldLabel}: {out.aggregate.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</Badge>}
            {out.filters.map((f: any, i: number) => <Badge key={i} variant="default">{f.label} {f.operator} {f.value}</Badge>)}
          </div>
          {out.groups?.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-1.5">Group</th><th className="text-right px-3 py-1.5">Records</th>{out.aggregate && <th className="text-right px-3 py-1.5">{out.aggregate.label} {out.aggregate.fieldLabel}</th>}</tr></thead><tbody className="divide-y divide-slate-100">{out.groups.map((g: any) => <tr key={g.label}><td className="px-3 py-1.5 font-medium">{g.label}</td><td className="px-3 py-1.5 text-right tabular-nums">{g.count}</td>{out.aggregate && <td className="px-3 py-1.5 text-right tabular-nums">{(g.value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>}</tr>)}</tbody></table></div>
          ) : out.sample.length ? (
            <details><summary className="cursor-pointer text-slate-500">Show first {out.sample.length} matching record{out.sample.length === 1 ? "" : "s"}</summary><div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr>{Object.keys(out.sample[0]).map((h) => <th key={h} className="text-left px-3 py-1.5 whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{out.sample.map((r: any, i: number) => <tr key={i}>{Object.values(r).map((v: any, j) => <td key={j} className="px-3 py-1.5 whitespace-nowrap">{v || "—"}</td>)}</tr>)}</tbody></table></div></details>
          ) : null}
        </div>
      )}
    </div>
  );
};

const SampleDataComposer: React.FC<Omit<ComposerProps, "initialPrompt">> = ({ app, disabled, onLog }) => {
  const { loadRecords } = useAppBuilder();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { busy, error, run } = useRun();
  const [forms, setForms] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<(SampleGenResult & { msgId: string }) | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const names = (ids: string[]) => ids.map((id) => app.forms.find((f: any) => f.id === id)?.name || id).join(", ");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><label className="text-xs font-medium text-slate-700">Forms</label><div className="flex gap-2 text-[11px]"><button type="button" className="text-blue-600 font-semibold" onClick={() => setForms(app.forms.map((f: any) => f.id))}>All</button><button type="button" className="text-slate-500" onClick={() => setForms([])}>None</button></div></div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">{app.forms.map((f: any) => <label key={f.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${forms.includes(f.id) ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}><Checkbox checked={forms.includes(f.id)} onChange={(v) => setForms((p) => (v ? [...p, f.id] : p.filter((x) => x !== f.id)))} />{f.name}</label>)}</div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-slate-700 flex items-center gap-2">Records per form<input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))} className="w-20 text-xs border border-slate-300 rounded-lg px-2 py-1.5" /></label>
        <Button loading={busy} disabled={forms.length === 0 || disabled} icon={<Database className="w-3.5 h-3.5" />} onClick={() => run(async () => {
          setResult(null);
          const msgId = generateId("msg");
          onLog({ id: msgId, prompt: `Generate ${count} sample records for ${names(forms)}`, reply: "" });
          try {
            const existing: Record<string, any[]> = {};
            for (const f of app.forms) existing[f.id] = await loadRecords(f.id);
            const res = await generateSampleData(app, forms, count, existing, { email: user?.email || "", name: user?.name || "" }, setProgress);
            setProgress("");
            setResult({ ...res, msgId });
            onLog({ id: msgId, reply: `${res.records.length} records ready — ${Object.entries(res.perForm).map(([fid, n]) => `${app.forms.find((f: any) => f.id === fid)?.name}: ${n}`).join(", ")}${res.warnings.length ? `\nWarnings: ${res.warnings.join("; ")}` : ""}. Click Insert to add them.`, status: "proposed" });
          } catch (e: any) { setProgress(""); onLog({ id: msgId, reply: `Could not generate: ${e?.message || e}`, status: "error" }); throw e; }
        })}>Generate</Button>
        <Button variant="outline" className="text-rose-600 ml-auto" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setWipeOpen(true)}>Remove all sample data</Button>
      </div>
      {busy && progress && <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />{progress}</div>}
      <ErrorBox error={error} />
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {result.records.length} records ready</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { onLog({ id: result.msgId, status: "discarded" }); setResult(null); }}>Discard</Button><Button size="sm" disabled={result.records.length === 0} onClick={async () => { await storageService.saveRecords(app.id, result.records); showToast(`${result.records.length} sample records inserted`, "success"); onLog({ id: result.msgId, status: "applied" }); setResult(null); }} icon={<ArrowRight className="w-3.5 h-3.5" />}>Insert into app</Button></div></div>
          <div className="flex flex-wrap gap-1.5">{Object.entries(result.perForm).map(([fid, n]) => <Badge key={fid} variant="success">{app.forms.find((f: any) => f.id === fid)?.name}: {n}</Badge>)}</div>
          {result.warnings.length > 0 && <ul className="text-[11px] text-amber-800 list-disc pl-4">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
      <ConfirmDialog isOpen={wipeOpen} onClose={() => setWipeOpen(false)} onConfirm={async () => { let n = 0; for (const f of app.forms) { const recs = await storageService.getRecords(app.id, f.id, { includeDeleted: true }); const ids = recs.filter((r) => r.isSample).map((r) => r.id); if (ids.length) { await storageService.deleteRecords(app.id, f.id, ids, { hard: true }); n += ids.length; } } showToast(`${n} sample records deleted`, "info"); onLog({ id: generateId("msg"), prompt: "Remove all sample data", reply: `${n} sample records deleted.`, status: "applied" }); }} title="Remove all sample data?" message="Every record generated by this tool (flagged as sample) will be permanently deleted from all forms. Records you entered manually are not touched." confirmText="Delete sample data" />
    </div>
  );
};

/** Help is a real conversation: the transcript is the chat, and earlier turns are sent as context. */
const HelpComposer: React.FC<{ app: any; disabled: boolean; chat: AiChat | null; onLog: (e: AiLogEvent) => void }> = ({ app, disabled, chat, onLog }) => {
  const onStream = (msgId: string, text: string) => onLog({ id: msgId, reply: text });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    const question = q.trim();
    if (!question || busy || disabled) return;
    setQ(""); setError(""); setBusy(true);
    const msgId = generateId("msg");
    onLog({ id: msgId, prompt: question, reply: "" });
    const history = (chat?.messages || []).slice(-8).filter((m) => m.text).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.slice(0, 1200)}`).join("\n");
    let acc = "";
    try {
      await askAssistant(history ? `Previous conversation:\n${history}\n\nQuestion: ${question}` : question, app, (t) => { acc += t; onStream(msgId, acc); });
      if (!acc) onStream(msgId, "(no answer)");
    } catch (e: any) {
      setError(e?.message || String(e));
      onStream(msgId, `Sorry — ${e?.message || "the request failed"}.`);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <ErrorBox error={error} />
      <div className="flex items-end gap-2">
        <Textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask anything about building this app — e.g. How do I reduce item stock when a usage entry is saved?  (Enter to send, Shift+Enter for a new line)" className="resize-none" />
        <Button loading={busy} disabled={!q.trim() || disabled} onClick={send} icon={<Send className="w-3.5 h-3.5" />}>Send</Button>
      </div>
    </div>
  );
};
