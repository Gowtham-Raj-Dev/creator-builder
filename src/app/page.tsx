"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "@/components/ui/IconPicker";
import { FormBuilderMock, ReportMock, WorkflowMock, DashboardBuilderMock, RolesMock, AiMock } from "@/components/home/Mockups";
import { REPORT_TYPES } from "@/lib/engine/reportTypes";
import {
  FIELD_GROUPS, FORM_FEATURES, REPORT_DOCS, REPORT_FEATURES, WORKFLOW_TRIGGERS, WORKFLOW_ACTIONS, SCRIPT_GROUPS, SAMPLE_SCRIPT, FORMULA_FUNCTION_COUNT,
  DASHBOARD_WIDGETS, GOVERNANCE, AI_FEATURES, BUSINESS_EXAMPLES, DocItem,
} from "@/lib/docs/capabilities";
import {
  Layers, LogIn, ArrowRight, Sparkles, BookOpen, FormInput, TableProperties, Zap, LayoutDashboard, ShieldCheck, Building2, Check, ChevronDown, ChevronUp, Menu, X, Database, Users, Globe,
} from "lucide-react";

const NAV = [
  { id: "forms", label: "Forms & fields", icon: <FormInput className="w-3.5 h-3.5" /> },
  { id: "reports", label: "Reports", icon: <TableProperties className="w-3.5 h-3.5" /> },
  { id: "workflows", label: "Workflows", icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "dashboards", label: "Dashboards", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: "governance", label: "Users & control", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { id: "ai", label: "AI", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: "business", label: "For your business", icon: <Building2 className="w-3.5 h-3.5" /> },
];

const CATEGORY_LABEL: Record<string, string> = { list: "Lists", board: "Boards & tasks", time: "Time & scheduling", analytics: "Analytics", finance: "Finance & stock" };
const fieldCount = FIELD_GROUPS.reduce((s, g) => s + g.items.length, 0);

const Section: React.FC<{ id: string; eyebrow: string; title: string; lead: string; children: React.ReactNode; tone?: "white" | "slate" | "dark"; visual?: React.ReactNode; visualSide?: "left" | "right"; highlights?: string[] }> = ({ id, eyebrow, title, lead, children, tone = "white", visual, visualSide = "right", highlights }) => (
  <section id={id} className={`scroll-mt-20 ${tone === "slate" ? "bg-slate-50" : tone === "dark" ? "bg-slate-900 text-white" : "bg-white"}`}>
    <div className="max-w-[1400px] mx-auto px-6 xl:px-10 py-16 md:py-20 space-y-10">
      <div className={`grid gap-10 items-center ${visual ? "lg:grid-cols-2" : ""}`}>
        <div className={`${visual && visualSide === "left" ? "lg:order-2" : ""} max-w-2xl`}>
          <div className={`text-[11px] font-bold uppercase tracking-[0.2em] ${tone === "dark" ? "text-blue-300" : "text-blue-600"}`}>{eyebrow}</div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-2">{title}</h2>
          <p className={`text-sm mt-3 leading-relaxed ${tone === "dark" ? "text-slate-300" : "text-slate-600"}`}>{lead}</p>
          {highlights && <ul className="mt-5 grid sm:grid-cols-2 gap-2">{highlights.map((h) => <li key={h} className={`flex items-start gap-2 text-xs ${tone === "dark" ? "text-slate-200" : "text-slate-700"}`}><span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${tone === "dark" ? "bg-blue-500/30 text-blue-200" : "bg-emerald-50 text-emerald-600"}`}><Check className="w-2.5 h-2.5" /></span>{h}</li>)}</ul>}
        </div>
        {visual && <div className={`${visualSide === "left" ? "lg:order-1" : ""} min-w-0`}>{visual}</div>}
      </div>
      {children}
    </div>
  </section>
);

const ItemCard: React.FC<{ item: DocItem; accent?: string }> = ({ item, accent = "text-blue-600 bg-blue-50" }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:shadow-md transition-all h-full">
    <div className="flex items-start gap-3">
      {item.icon && <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}><Icon name={item.icon} className="w-4 h-4" /></span>}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{item.name}</div>
        <div className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</div>
        {item.example && <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1 mt-2 inline-block">e.g. {item.example}</div>}
      </div>
    </div>
  </div>
);

const Bullet: React.FC<{ item: DocItem }> = ({ item }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></span>
    <div><span className="text-sm font-semibold text-slate-900">{item.name}</span><span className="text-xs text-slate-600"> — {item.desc}</span>{item.example && <span className="block text-[11px] text-indigo-700 mt-0.5">e.g. {item.example}</span>}</div>
  </li>
);

/** Illustrative "product screenshot": a live dashboard window with a floating form card and a kanban card. Pure CSS/SVG, no assets. */
const HeroMockup: React.FC = () => {
  const bars = [42, 58, 50, 73, 66, 88, 79, 95];
  const rows = [["INV/2026/0041", "Kumar Traders", "Paid", "₹48,200"], ["INV/2026/0040", "Sri Textiles", "Partial", "₹1,12,750"], ["INV/2026/0039", "Anand Stores", "Unpaid", "₹22,000"]];
  const tone: Record<string, string> = { Paid: "bg-emerald-100 text-emerald-700", Partial: "bg-amber-100 text-amber-700", Unpaid: "bg-rose-100 text-rose-700" };
  return (
    <div className="relative mx-auto max-w-[560px] lg:max-w-none" aria-hidden>
      {/* glow */}
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-emerald-400/20 blur-2xl" />
      {/* main window: live dashboard */}
      <div className="relative rounded-2xl border border-white/15 bg-white text-slate-900 shadow-2xl overflow-hidden rotate-[-1.5deg]">
        <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 px-3"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className="ml-3 text-[10px] text-slate-400 font-mono">yourbuilder.app / sales_app / dashboard</span></div>
        <div className="flex">
          <div className="w-28 bg-slate-50 border-r border-slate-200 p-2.5 space-y-1.5 hidden sm:block">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1">Modules</div>
            {["Dashboard", "Customer", "Product", "Sales Invoice", "Payment"].map((m, i) => <div key={m} className={`text-[10px] px-2 py-1 rounded-md ${i === 0 ? "bg-blue-100 text-blue-700 font-semibold" : "text-slate-600"}`}>{m}</div>)}
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-2">Reports</div>
            {["Sales by month", "Receivables aging", "Stock status"].map((m) => <div key={m} className="text-[10px] px-2 py-1 rounded-md text-slate-600">{m}</div>)}
          </div>
          <div className="flex-1 p-3 space-y-3 bg-slate-50/60">
            <div className="flex items-center gap-1.5">
              {["All time", "Today", "Last 7 days", "This month"].map((c, i) => <span key={c} className={`text-[9px] px-2 py-0.5 rounded-md border ${i === 2 ? "bg-white border-blue-300 text-blue-700 font-semibold shadow-sm" : "border-slate-200 text-slate-500"}`}>{c}</span>)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["Sales", "₹4.8 L", "+12%", "text-emerald-600"], ["Invoices", "128", "+9", "text-emerald-600"], ["Outstanding", "₹1.2 L", "−6%", "text-rose-600"]].map(([l, v, c, t]) => (
                <div key={l} className="bg-white rounded-lg border border-slate-200 p-2"><div className="text-[9px] text-slate-500">{l}</div><div className="text-sm font-bold tabular-nums">{v}</div><div className={`text-[9px] font-semibold ${t}`}>{c} vs prev 7 days</div></div>
              ))}
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-2.5">
              <div className="text-[10px] font-semibold text-slate-700 mb-1.5">Sales by day</div>
              <svg viewBox="0 0 160 52" className="w-full h-14">
                {[0, 1, 2, 3].map((g) => <line key={g} x1="0" x2="160" y1={12 + g * 12} y2={12 + g * 12} stroke="#e2e8f0" strokeWidth="0.5" />)}
                {bars.map((h, i) => <rect key={i} x={6 + i * 19} y={50 - h * 0.4} width="12" height={h * 0.4} rx="2" fill={i === bars.length - 1 ? "#2563eb" : "#93c5fd"} />)}
              </svg>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1.4fr_.8fr_1fr] text-[9px] font-semibold text-slate-500 bg-slate-50 px-2 py-1 border-b border-slate-200"><span>Invoice</span><span>Customer</span><span>Status</span><span className="text-right">Total</span></div>
              {rows.map((r) => <div key={r[0]} className="grid grid-cols-[1.2fr_1.4fr_.8fr_1fr] text-[9.5px] px-2 py-1.5 border-b border-slate-100 items-center"><span className="font-mono text-slate-700">{r[0]}</span><span className="text-slate-700 truncate">{r[1]}</span><span><span className={`px-1.5 py-px rounded-full text-[8.5px] font-semibold ${tone[r[2]]}`}>{r[2]}</span></span><span className="text-right font-semibold tabular-nums">{r[3]}</span></div>)}
            </div>
          </div>
        </div>
      </div>
      {/* floating form card */}
      <div className="absolute -left-4 sm:-left-8 -bottom-8 w-[230px] rounded-xl border border-white/15 bg-white text-slate-900 shadow-2xl p-3 space-y-2 rotate-[2deg]">
        <div className="flex items-center justify-between"><span className="text-[10px] font-bold">New Sales Invoice</span><span className="text-[8px] px-1.5 py-px rounded-full bg-indigo-100 text-indigo-700 font-semibold">INV/2026/0042</span></div>
        <div className="space-y-1.5">
          <div><div className="text-[8px] text-slate-500">Customer</div><div className="h-6 rounded-md border border-blue-300 bg-blue-50/50 text-[9px] px-2 flex items-center justify-between">Kumar Traders <ChevronDown className="w-3 h-3 text-slate-400" /></div></div>
          <div className="grid grid-cols-3 gap-1 text-[8px] text-slate-500"><span>Product</span><span className="text-right">Qty</span><span className="text-right">Amount</span></div>
          {[["Silk Saree", "2", "9,600"], ["Cotton Lungi", "10", "3,200"]].map((r) => <div key={r[0]} className="grid grid-cols-3 gap-1 text-[9px] border-t border-slate-100 pt-1"><span className="truncate">{r[0]}</span><span className="text-right">{r[1]}</span><span className="text-right font-semibold">{r[2]}</span></div>)}
          <div className="flex justify-between text-[9px] pt-1 border-t border-slate-200"><span className="text-slate-500">Grand total (formula)</span><span className="font-bold">₹12,800</span></div>
        </div>
        <div className="text-[8.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> Workflow: stock reduced on save</div>
      </div>
      {/* floating kanban badge */}
      <div className="absolute -right-3 sm:-right-6 -top-6 rounded-xl border border-white/15 bg-white text-slate-900 shadow-2xl p-2.5 w-[150px] rotate-[3deg]">
        <div className="text-[9px] font-bold text-slate-700 mb-1.5 flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> Generated by AI</div>
        {[["7 forms", "bg-blue-50 text-blue-700"], ["13 reports", "bg-indigo-50 text-indigo-700"], ["4 workflows", "bg-emerald-50 text-emerald-700"]].map(([t, c]) => <div key={t} className={`text-[9px] font-semibold px-2 py-1 rounded-md mb-1 ${c}`}>{t}</div>)}
      </div>
    </div>
  );
};

export default function Home() {
  const { user, loading, canBuild } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openBiz, setOpenBiz] = useState<string | null>(BUSINESS_EXAMPLES[0].name);
  const workspace = canBuild ? "/builder" : "/app";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-6 xl:px-10 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <BrandLogo size={36} className="shadow-sm rounded-xl" />
            <span className="whitespace-nowrap"><span className="block text-sm font-bold tracking-tight">YourBuilder</span><span className="hidden xl:block text-[10px] text-slate-400 -mt-0.5">Low-code platform for every business</span></span>
          </Link>
          <nav className="hidden lg:flex items-center gap-0.5 text-[12px] font-medium text-slate-600 whitespace-nowrap">
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} className="px-2.5 py-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 flex items-center gap-1.5">{n.icon}{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/docs" className="hidden md:inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 px-3.5 py-2 rounded-lg"><BookOpen className="w-3.5 h-3.5" /> Docs</Link>
            {!loading && user ? (
              <Link href={workspace} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm">Open workspace <ArrowRight className="w-3.5 h-3.5" /></Link>
            ) : (
              <Link href="/login" className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm"><LogIn className="w-3.5 h-3.5" /> Sign in</Link>
            )}
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">{menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        {menuOpen && <nav className="lg:hidden border-t border-slate-100 bg-white px-6 py-3 grid grid-cols-2 gap-1 text-xs font-medium text-slate-700">{NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={() => setMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center gap-1.5">{n.icon}{n.label}</a>)}</nav>}
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 60% at 20% 10%, rgba(37,99,235,.45), transparent 60%), radial-gradient(50% 50% at 90% 30%, rgba(99,102,241,.35), transparent 60%), radial-gradient(40% 40% at 50% 100%, rgba(16,185,129,.25), transparent 60%)" }} />
        <div className="relative max-w-[1400px] mx-auto px-6 xl:px-10 py-20 md:py-28 grid lg:grid-cols-2 gap-10 xl:gap-14 items-center">
          <div className="space-y-6 min-w-0">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-blue-200 bg-white/10 border border-white/15 rounded-full px-3 py-1"><Sparkles className="w-3.5 h-3.5" /> Zoho-Creator-style builder · Firebase backend · AI inside</div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1]">Build the software your business runs on — <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-300 to-emerald-300">without writing an app</span>.</h1>
            <p className="text-base text-slate-300 leading-relaxed max-w-2xl">Forms with line items and lookups, {REPORT_TYPES.length} kinds of reports, real workflows, dashboards with date filters, roles, publish &amp; rollback — designed in a browser, live for your team in minutes.</p>
            <div className="flex flex-wrap gap-3">
              {!loading && user ? (
                <Link href={workspace} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 bg-white hover:bg-blue-50 px-5 py-3 rounded-xl shadow-lg">Open workspace <ArrowRight className="w-4 h-4" /></Link>
              ) : (
                <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 bg-white hover:bg-blue-50 px-5 py-3 rounded-xl shadow-lg"><LogIn className="w-4 h-4" /> Sign in to start building</Link>
              )}
              <a href="#forms" className="inline-flex items-center gap-2 text-sm font-semibold text-white border border-white/25 hover:bg-white/10 px-5 py-3 rounded-xl">See everything it can do <ChevronDown className="w-4 h-4" /></a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
              {[[`${fieldCount}+`, "field types"], [`${REPORT_TYPES.length}`, "report views"], [`${WORKFLOW_TRIGGERS.length}`, "workflow triggers"], [`${FORMULA_FUNCTION_COUNT}+`, "formula functions"]].map(([n, l]) => (
                <div key={l} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3"><div className="text-2xl font-bold tabular-nums">{n}</div><div className="text-[11px] text-slate-400">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="min-w-0 lg:pl-4 lg:pt-6">
            <HeroMockup />
          </div>
        </div>
        <div className="relative max-w-[1400px] mx-auto px-6 xl:px-10 pb-14">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["1", "Design forms", "Drag fields, add lookups & line items, set validations.", <FormInput key="a" className="w-4 h-4" />],
              ["2", "Add reports & dashboards", "Table, kanban, chart, aging, ledger… KPIs with date filters.", <TableProperties key="b" className="w-4 h-4" />],
              ["3", "Automate", "Workflows in no-code or JavaScript: stock, approvals, alerts.", <Zap key="c" className="w-4 h-4" />],
              ["4", "Share & publish", "Roles per designation, share link, versions with rollback.", <ShieldCheck key="d" className="w-4 h-4" />],
            ].map(([n, t, d, ic]) => (
              <div key={n as string} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3.5 flex gap-3 items-start">
                <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-200 flex items-center justify-center shrink-0">{ic}</span>
                <div><div className="text-sm font-semibold"><span className="text-blue-300 mr-1.5">{n as string}.</span>{t as string}</div><div className="text-[11px] text-slate-400 leading-snug mt-0.5">{d as string}</div></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-400"><span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Firestore realtime</span><span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Google / email sign-in</span><span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Works on phone &amp; tablet</span></div>
        </div>
      </section>

      {/* forms & fields */}
      <Section id="forms" eyebrow="Forms & fields" title={`${fieldCount}+ field types, line items and smart lookups`} lead="Every master and transaction your business needs — customers, products, invoices with items, purchase orders, tickets — with validations that stop wrong data at the door." visual={<FormBuilderMock />} highlights={["Drag & drop form builder with 1–3 columns and sections", "Lookups: searchable, filtered (Active only), cascading, auto-fill", "Line items with per-row formulas and totals", "Required-if, unique, regex and cross-field validations"]}>
        <div className="space-y-8">
          {FIELD_GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{g.title}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{g.items.map((it) => <ItemCard key={it.name} item={it} />)}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Form features</h3>
            <ul className="grid md:grid-cols-2 gap-4">{FORM_FEATURES.map((f) => <Bullet key={f.name} item={f} />)}</ul>
          </div>
        </div>
      </Section>

      {/* reports */}
      <Section id="reports" eyebrow="Reports" title={`${REPORT_TYPES.length} ways to look at the same data`} lead="Create a report once; users switch between Table, Kanban, Chart, Calendar… and save their favourite view. Every view is filterable, exportable and printable." tone="slate" visual={<ReportMock />} visualSide="left" highlights={["Switch view at runtime — save as default or per user", "Aging, ledger, funnel, gantt, scheduler for real business questions", "Filters with date presets, saved views, quick chips", "Group totals, conditional colours, inline edit, export"]}>
        <div className="space-y-8">
          {Object.entries(CATEGORY_LABEL).map(([cat, label]) => (
            <div key={cat}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{label}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{REPORT_DOCS.filter((r) => r.category === cat).map((r) => <ItemCard key={r.name} item={r} accent="text-indigo-600 bg-indigo-50" />)}</div>
            </div>
          ))}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">In every report</h3>
            <ul className="grid md:grid-cols-2 gap-4">{REPORT_FEATURES.map((f) => <Bullet key={f.name} item={f} />)}</ul>
          </div>
        </div>
      </Section>

      {/* workflows */}
      <Section id="workflows" eyebrow="Workflows" title="Automate the rules your staff keep forgetting" lead="No-code actions for the common cases, and a sandboxed JavaScript engine when you need cross-form logic — stock updates, credit checks, approvals, notifications." visual={<WorkflowMock />} highlights={["8 triggers from form load to after-save and delete", "No-code actions or plain JavaScript in a safe sandbox", "Popups: info · warning · confirm (continue anyway) · error (blocks)", "Test run with sample values and see logs before enabling"]}>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Triggers — when it runs</h3>
              <ul className="space-y-3">{WORKFLOW_TRIGGERS.map((t) => <Bullet key={t.name} item={t} />)}</ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">No-code actions</h3>
              <ul className="space-y-3">{WORKFLOW_ACTIONS.map((t) => <Bullet key={t.name} item={t} />)}</ul>
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl bg-slate-950 text-slate-100 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Script mode · plain JavaScript</span><span className="text-[10px] text-emerald-300">Test run · Logs · Fix with AI</span></div>
              <pre className="text-[11.5px] leading-relaxed overflow-x-auto whitespace-pre font-mono text-blue-100">{SAMPLE_SCRIPT}</pre>
            </div>
            <div className="rounded-2xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Script API</h3>
              {SCRIPT_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.title}</div>
                  <div className="flex flex-wrap gap-1.5">{g.items.map((i) => <span key={i.name} title={`${i.example} — ${i.desc}`} className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 cursor-help">{i.name}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* dashboards */}
      <Section id="dashboards" eyebrow="Dashboards" title="Pages that answer 'how is business today?'" lead="Drag KPI cards, charts, reports and forms onto a 12-column page. One date filter — Today, Last 7 days, This month — drives every widget." tone="slate" visual={<DashboardBuilderMock />} visualSide="left" highlights={["KPI cards with trend vs previous period", "9 chart types with drill-down to the report", "One date filter for every widget on the page", "Embed any report view or a data-entry form"]}>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{DASHBOARD_WIDGETS.map((w) => <ItemCard key={w.name} item={{ ...w, icon: "dashboard" }} accent="text-emerald-700 bg-emerald-50" />)}</div>
      </Section>

      {/* governance */}
      <Section id="governance" eyebrow="Users & control" title="Who sees what, and what changed" lead="The owner designs; members use the published app with exactly the permissions their designation allows." visual={<RolesMock />} highlights={["View / create / edit / delete / print / export per form", "Own-records-only scope, hidden or read-only fields per role", "Draft → publish → rollback, members always see the published app", "Audit log and health check with auto-fix"]}>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{GOVERNANCE.map((w) => <ItemCard key={w.name} item={{ ...w, icon: "shield" }} accent="text-amber-700 bg-amber-50" />)}</div>
      </Section>

      {/* ai */}
      <Section id="ai" eyebrow="AI assistant" title="Describe it. The builder makes it." lead="Generate whole apps, single forms, reports or workflows from a sentence; fix scripts; write formulas; ask questions about your data; fill demo records." tone="dark" visual={<AiMock />} visualSide="left" highlights={["Whole app from one paragraph — forms, reports, workflows, roles, dashboard", "Edit existing forms and reports by describing the change", "Broken script? Fix with AI rewrites it in plain JavaScript", "Free Gemini / Groq keys or Anthropic — global or per app"]}>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {AI_FEATURES.map((w) => (
            <div key={w.name} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="w-4 h-4 text-blue-300" />{w.name}</div>
              <div className="text-xs text-slate-300 mt-1.5 leading-relaxed">{w.desc}</div>
              {w.example && <div className="text-[11px] text-blue-200 mt-2">e.g. {w.example}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* business examples */}
      <Section id="business" eyebrow="For your business" title="Ready patterns for common businesses" lead="Each one is a set of forms, reports and workflows you can generate with AI or build by hand — then adapt.">
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-1">
            {BUSINESS_EXAMPLES.map((b) => (
              <button key={b.name} type="button" onClick={() => setOpenBiz(b.name)} className={`w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all ${openBiz === b.name ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${openBiz === b.name ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><Icon name={b.icon} className="w-4 h-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{b.name}</span><span className="block text-[11px] text-slate-500 truncate">{b.tagline}</span></span>
                <span className="ml-auto text-slate-400">{openBiz === b.name ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-8">
            {BUSINESS_EXAMPLES.filter((b) => b.name === openBiz).map((b) => (
              <div key={b.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-5 h-full">
                <div><div className="text-lg font-bold text-slate-900 flex items-center gap-2"><Icon name={b.icon} className="w-5 h-5 text-blue-600" />{b.name}</div><div className="text-xs text-slate-500">{b.tagline}</div></div>
                <div className="grid md:grid-cols-3 gap-4">
                  {[["Forms", b.forms, "text-blue-700 bg-blue-50 border-blue-100"], ["Reports", b.reports, "text-indigo-700 bg-indigo-50 border-indigo-100"], ["Workflows", b.workflows, "text-emerald-700 bg-emerald-50 border-emerald-100"]].map(([title, list, tone]) => (
                    <div key={title as string}><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title as string}</div><ul className="space-y-1.5">{(list as string[]).map((x) => <li key={x} className={`text-xs px-2.5 py-1.5 rounded-lg border ${tone}`}>{x}</li>)}</ul></div>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Tip: paste &quot;{b.tagline}&quot; into AI Assistant → Generate app to get this as a starting point.</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0" style={{ background: "radial-gradient(45% 60% at 10% 40%, rgba(37,99,235,.10), transparent 60%), radial-gradient(40% 60% at 90% 50%, rgba(99,102,241,.10), transparent 60%)" }} />
        <div className="relative max-w-[1400px] mx-auto px-6 xl:px-10 py-20 md:py-24">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-8 md:p-14 text-center space-y-6 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1"><Sparkles className="w-3.5 h-3.5" /> No installation · works in the browser · live in minutes</div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Ready to build your business app?</h2>
            <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">Sign in with the owner account to open the builder. Team members sign in with their own email and see only the apps shared with them, with the permissions of their designation.</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {!loading && user ? (
                <Link href={workspace} className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl shadow-md">Open workspace <ArrowRight className="w-4 h-4" /></Link>
              ) : (
                <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl shadow-md"><LogIn className="w-4 h-4" /> Sign in</Link>
              )}
              <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-6 py-3 rounded-xl"><BookOpen className="w-4 h-4" /> Read the documentation</Link>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 pt-6 max-w-2xl mx-auto">
              {[["Owner", "designs & publishes", <Layers key="o" className="w-4 h-4" />, "text-blue-600 bg-blue-50"], ["Members", "use the live app", <Users key="m" className="w-4 h-4" />, "text-emerald-600 bg-emerald-50"], ["Public link", "read-only sharing", <Globe key="p" className="w-4 h-4" />, "text-indigo-600 bg-indigo-50"]].map(([t, d, ic, tone]) => (
                <div key={t as string} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 flex items-center gap-3 text-left"><span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone as string}`}>{ic}</span><div><div className="text-sm font-bold text-slate-900">{t as string}</div><div className="text-[11px] text-slate-500">{d as string}</div></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 border-t border-white/10 text-slate-400 text-xs">
        <div className="max-w-[1400px] mx-auto px-6 xl:px-10 py-12 grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4 space-y-3">
            <div className="flex items-center gap-2.5"><BrandLogo size={36} /><span><span className="block text-sm font-bold text-white">YourBuilder</span><span className="block text-[10px] text-slate-500">Low-code platform for every business</span></span></div>
            <p className="leading-relaxed max-w-sm">Forms, reports, workflows, dashboards and roles — designed in the browser, stored in Firebase, shared with your team by designation.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]"><span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Firestore realtime</span><span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Google / email sign-in</span><span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Phone &amp; tablet</span></div>
          </div>
          <div className="md:col-span-2 md:col-start-6">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Build</div>
            <ul className="space-y-2">{NAV.slice(0, 4).map((n) => <li key={n.id}><a href={`#${n.id}`} className="hover:text-white flex items-center gap-1.5">{n.icon}{n.label}</a></li>)}</ul>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Run</div>
            <ul className="space-y-2">{NAV.slice(4).map((n) => <li key={n.id}><a href={`#${n.id}`} className="hover:text-white flex items-center gap-1.5">{n.icon}{n.label}</a></li>)}</ul>
          </div>
          <div className="md:col-span-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">Get started</div>
            <ul className="space-y-2">
              <li><Link href="/login" className="hover:text-white flex items-center gap-1.5"><LogIn className="w-3.5 h-3.5" /> Sign in</Link></li>
              <li><Link href="/docs" className="hover:text-white flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Documentation</Link></li>
              <li><Link href="/builder" className="hover:text-white flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Owner console</Link></li>
              <li><Link href="/app" className="hover:text-white flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> My apps (members)</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-[1400px] mx-auto px-6 xl:px-10 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>© {new Date().getFullYear()} YourBuilder. All rights reserved.</span>
            <span>Built with Next.js · Firebase · AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
