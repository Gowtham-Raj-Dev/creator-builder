"use client";

import React from "react";
import { Icon } from "@/components/ui/IconPicker";
import { Sparkles, Zap, Plus, Search, Eye, Play, Check, X, AlertTriangle, ChevronDown, GripVertical, Settings2, Filter, Lock } from "lucide-react";

/**
 * Illustrative screenshots of the builder & live app, drawn with CSS/SVG so they match the real UI
 * and stay crisp without image assets. Purely decorative (aria-hidden).
 */

const Window: React.FC<{ title: string; children: React.ReactNode; className?: string; tilt?: string }> = ({ title, children, className = "", tilt = "" }) => (
  <div className={`relative ${className}`} aria-hidden>
    <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-emerald-400/10 blur-2xl" />
    <div className={`relative rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl overflow-hidden ${tilt}`}>
      <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 px-3"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span className="ml-3 text-[10px] text-slate-400 font-mono truncate">{title}</span></div>
      {children}
    </div>
  </div>
);

const Tag: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = "bg-slate-100 text-slate-600" }) => <span className={`text-[8.5px] font-semibold px-1.5 py-px rounded-full ${tone}`}>{children}</span>;

// ── Form builder ─────────────────────────────────────────────────────────────

export const FormBuilderMock: React.FC = () => {
  const palette = [["file", "Text"], ["hash", "Number"], ["banknote", "Currency"], ["calendar", "Date"], ["list", "Dropdown"], ["link", "Lookup"], ["table", "Subform"], ["calculator", "Formula"], ["hash", "Auto no."], ["image", "Image"]];
  return (
    <Window title="builder / sales_app / forms / sales_invoice">
      <div className="flex text-[10px]">
        <div className="w-[104px] border-r border-slate-200 bg-slate-50 p-2 space-y-1 hidden sm:block">
          <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">Fields</div>
          {palette.map(([ic, l]) => <div key={l} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600"><Icon name={ic} className="w-3 h-3 text-slate-400" />{l}</div>)}
        </div>
        <div className="flex-1 p-3 space-y-2 bg-slate-50/60">
          <div className="flex items-center justify-between"><span className="font-bold text-[11px]">Sales Invoice</span><span className="flex gap-1"><Tag tone="bg-indigo-50 text-indigo-700"><Sparkles className="w-2.5 h-2.5 inline mr-0.5" />Edit with AI</Tag><Tag>2 columns</Tag></span></div>
          <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
            <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400">Basic details</div>
            <div className="grid grid-cols-2 gap-2">
              {[["Invoice No", "INV/2026/0042", "autonumber"], ["Invoice Date", "21 Sep 2026", "date"], ["Customer", "Kumar Traders ▾", "lookup · auto-fill"], ["Payment Status", "Unpaid ▾", "dropdown"]].map(([l, v, t]) => (
                <div key={l} className="rounded-md border border-slate-200 p-1.5"><div className="flex justify-between"><span className="text-[8.5px] text-slate-500">{l}</span><span className="text-[7.5px] text-slate-400">{t}</span></div><div className="text-[9.5px] font-medium mt-0.5">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border-2 border-blue-500 bg-white p-2 ring-2 ring-blue-500/20">
            <div className="flex justify-between items-center"><span className="text-[9.5px] font-semibold flex items-center gap-1"><GripVertical className="w-3 h-3 text-slate-300" />Items <Tag>subform</Tag></span><Tag tone="bg-emerald-50 text-emerald-700">totals on</Tag></div>
            <div className="grid grid-cols-[1.6fr_.6fr_.8fr_.8fr] gap-1 mt-1.5 text-[8.5px] text-slate-500"><span>Product (lookup)</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount = qty×rate</span></div>
            {[["Silk Saree", "2", "4,800", "9,600"], ["Cotton Lungi", "10", "320", "3,200"]].map((r) => <div key={r[0]} className="grid grid-cols-[1.6fr_.6fr_.8fr_.8fr] gap-1 text-[9px] border-t border-slate-100 py-1"><span>{r[0]}</span><span className="text-right">{r[1]}</span><span className="text-right">{r[2]}</span><span className="text-right font-semibold">{r[3]}</span></div>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 bg-white p-1.5"><div className="text-[8.5px] text-slate-500">Grand Total <span className="text-slate-400">formula</span></div><div className="text-[9.5px] font-mono text-indigo-700">sum(items.amount)</div></div>
            <div className="rounded-md border border-slate-200 bg-white p-1.5"><div className="text-[8.5px] text-slate-500">Cheque No <span className="text-slate-400">required-if</span></div><div className="text-[9px] font-mono text-indigo-700">payment_mode == &quot;Cheque&quot;</div></div>
          </div>
        </div>
        <div className="w-[132px] border-l border-slate-200 bg-white p-2 space-y-1.5 hidden md:block">
          <div className="flex items-center justify-between"><span className="text-[9px] font-bold">Lookup · Customer</span><Settings2 className="w-3 h-3 text-slate-400" /></div>
          {[["Related form", "Customer"], ["Display", "Name · City"], ["Filter", "Active = Yes"], ["Cascade", "State → City"], ["Auto-fill", "Phone, GSTIN"], ["Add new", "On"]].map(([k, v]) => <div key={k} className="flex justify-between text-[8.5px] border-b border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800">{v}</span></div>)}
          <div className="text-[8.5px] rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-1 flex items-center gap-1"><Check className="w-2.5 h-2.5" />Searchable · Multi-column</div>
        </div>
      </div>
    </Window>
  );
};

// ── Report views ─────────────────────────────────────────────────────────────

export const ReportMock: React.FC = () => {
  const lanes = [["Unpaid", "bg-rose-400", ["Anand Stores · ₹22,000", "Ravi Agencies · ₹8,400"]], ["Partial", "bg-amber-400", ["Sri Textiles · ₹1,12,750"]], ["Paid", "bg-emerald-500", ["Kumar Traders · ₹48,200", "Mega Mart · ₹31,000", "Lakshmi Silks · ₹9,600"]]] as const;
  return (
    <Window title="app / sales_app / reports / invoices">
      <div className="p-3 space-y-2.5 text-[10px] bg-slate-50/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-bold text-[11px]">Sales Invoices <Tag tone="bg-blue-50 text-blue-700">128 records</Tag></span>
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-500"><Search className="w-3 h-3" />Search…</span>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200">{["table", "grid", "kanban", "calendar", "list", "chart"].map((v) => <span key={v} className={`p-1 rounded ${v === "kanban" ? "bg-white shadow-sm text-blue-700" : "text-slate-400"}`}><Icon name={v === "list" ? "list" : v} className="w-3 h-3" /></span>)}<span className="p-1 text-slate-400 flex items-center"><ChevronDown className="w-3 h-3" /></span></div>
            <span className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white"><Filter className="w-3 h-3" />Filters <Tag tone="bg-blue-600 text-white">2</Tag></span>
          </div>
        </div>
        <div className="flex items-center gap-1.5"><Tag tone="bg-amber-50 text-amber-800 border border-amber-200">Previewing Kanban — default is Table</Tag><span className="text-[8.5px] text-slate-500">Remove changes · <span className="text-blue-700 font-semibold">Save as default view</span></span></div>
        <div className="grid grid-cols-3 gap-2">
          {lanes.map(([name, dot, cards]) => (
            <div key={name} className="rounded-lg bg-slate-100/80 border border-slate-200 p-1.5 space-y-1.5">
              <div className="flex items-center justify-between px-1"><span className="font-bold flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${dot}`} />{name}</span><Tag>{cards.length}</Tag></div>
              {cards.map((c) => <div key={c} className="rounded-md bg-white border border-slate-200 p-1.5 text-[9px] shadow-sm"><div className="font-semibold text-slate-800">{c.split(" · ")[0]}</div><div className="text-slate-500">{c.split(" · ")[1]} · Sep 2026</div></div>)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {[["Not due", "₹62,000", "text-slate-600"], ["0–30", "₹48,400", "text-emerald-700"], ["31–60", "₹22,000", "text-amber-700"], ["61–90", "₹8,400", "text-orange-700"], ["90+", "₹0", "text-rose-700"]].map(([l, v, t]) => <div key={l} className="rounded-md bg-white border border-slate-200 p-1.5"><div className={`text-[8px] font-bold uppercase ${t}`}>{l}</div><div className="text-[10px] font-bold tabular-nums">{v}</div></div>)}
        </div>
        <div className="text-[8.5px] text-slate-400">↑ the same data as an <strong className="text-slate-600">Aging</strong> report — switch views any time</div>
      </div>
    </Window>
  );
};

// ── Workflow builder ─────────────────────────────────────────────────────────

export const WorkflowMock: React.FC = () => (
  <Window title="builder / sales_app / workflows / reduce_stock">
    <div className="grid md:grid-cols-[1fr_1.25fr] text-[10px]">
      <div className="p-3 space-y-2 border-r border-slate-200 bg-slate-50/60">
        <div className="font-bold text-[11px] flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-500" />Reduce stock on save <Tag tone="bg-emerald-50 text-emerald-700">active</Tag></div>
        <div className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[8.5px] text-slate-500">Form · Trigger</div><div className="font-semibold">Sales Invoice · After save</div></div>
        <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400">No-code actions</div>
        {[["Update other form", "Product.Current Stock − Items.Qty"], ["Show popup", "warning · 'Stock below minimum'"], ["Notify", "owner@shop.in when total > ₹50,000"]].map(([a, d]) => <div key={a} className="rounded-lg border border-slate-200 bg-white p-2 flex items-start gap-2"><span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Zap className="w-3 h-3" /></span><div><div className="font-semibold">{a}</div><div className="text-[9px] text-slate-500">{d}</div></div></div>)}
        <div className="flex gap-1"><Tag tone="bg-slate-800 text-white"><Play className="w-2.5 h-2.5 inline mr-0.5" />Test run</Tag><Tag>Logs</Tag><Tag tone="bg-indigo-50 text-indigo-700"><Sparkles className="w-2.5 h-2.5 inline mr-0.5" />Fix with AI</Tag></div>
      </div>
      <div className="relative bg-slate-950 text-blue-100 p-3 font-mono text-[9.5px] leading-relaxed">
        <div className="text-[8.5px] text-slate-500 mb-1.5 font-sans">Script mode · JavaScript</div>
        <pre className="whitespace-pre">{`for (const row of input.items) {
  const p = get("product", row.product);
  if (row.quantity > p.current_stock) {
    setError("items", \`Only \${p.current_stock} left for \${p.name}\`);
  }
  increment("product", row.product,
    "current_stock", -row.quantity);
}
if (input.grand_total > 50000) {
  notify("owner@shop.in", "Big invoice",
    \`\${input.invoice_no}: ₹\${input.grand_total}\`);
}`}</pre>
        <div className="absolute right-3 bottom-3 w-[170px] rounded-lg bg-white text-slate-900 shadow-xl border border-amber-200 p-2 font-sans">
          <div className="flex items-center gap-1 text-[9.5px] font-bold text-amber-700"><AlertTriangle className="w-3 h-3" />Low stock</div>
          <div className="text-[8.5px] text-slate-600 mt-0.5">Only 1 left for Silk Saree. Continue anyway?</div>
          <div className="flex justify-end gap-1 mt-1.5"><Tag><X className="w-2.5 h-2.5 inline" /> Cancel</Tag><Tag tone="bg-blue-600 text-white">Continue</Tag></div>
        </div>
      </div>
    </div>
  </Window>
);

// ── Page / dashboard builder ─────────────────────────────────────────────────

export const DashboardBuilderMock: React.FC = () => (
  <Window title="builder / sales_app / pages / dashboard">
    <div className="flex text-[10px]">
      <div className="flex-1 p-3 bg-slate-50/60 space-y-2">
        <div className="flex items-center justify-between"><span className="font-bold text-[11px]">Dashboard <Tag tone="bg-amber-50 text-amber-700">Home page</Tag></span><span className="flex gap-1"><Tag>Open live</Tag><Tag tone="bg-blue-600 text-white"><Plus className="w-2.5 h-2.5 inline" /> Widget</Tag></span></div>
        <div className="grid grid-cols-12 gap-1.5">
          {[["Heading", 12, "Sales dashboard"], ["Date filter", 12, "Today · Last 7 days · This month · custom"], ["KPI cards", 12, "Sales · Invoices · Outstanding · Avg ticket"], ["Chart", 6, "column · Sales by month"], ["Chart", 6, "donut · by payment status"], ["Report", 8, "Receivables aging"], ["Quick links", 4, "New invoice · New customer"]].map(([t, w, d], i) => (
            <div key={i} style={{ gridColumn: `span ${w} / span ${w}` }} className={`rounded-lg border bg-white p-1.5 ${i === 3 ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200"}`}><div className="flex items-center justify-between"><span className="font-semibold">{t as string}</span><Tag>{w as number}/12</Tag></div><div className="text-[8.5px] text-slate-500 truncate">{d as string}</div></div>
          ))}
        </div>
      </div>
      <div className="w-[140px] border-l border-slate-200 bg-white p-2 space-y-1.5 hidden md:block">
        <div className="text-[9px] font-bold">Chart</div>
        {[["Chart type", "column"], ["Form", "Sales Invoice"], ["Group by", "Invoice Date"], ["Bucket", "month"], ["Metric", "sum · Grand Total"], ["Split by", "Payment Status"], ["Top N", "12"]].map(([k, v]) => <div key={k} className="flex justify-between text-[8.5px] border-b border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>)}
        <div className="text-[8.5px] flex items-center gap-1 text-blue-700"><Check className="w-2.5 h-2.5" />Click → open report filtered</div>
      </div>
    </div>
  </Window>
);

// ── Users & roles ────────────────────────────────────────────────────────────

export const RolesMock: React.FC = () => {
  const forms = ["Customer", "Product", "Sales Invoice", "Payment"];
  const roles = [["Admin", [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]], ["Sales Staff", [1, 1, 1, 1], [1, 0, 1, 1], [0, 0, 0, 0]], ["Accountant", [1, 1, 1, 1], [0, 0, 0, 1], [0, 0, 0, 0]]] as const;
  return (
    <Window title="builder / sales_app / users & roles">
      <div className="p-3 text-[10px] space-y-2.5 bg-slate-50/60">
        <div className="flex items-center justify-between"><span className="font-bold text-[11px]">Designations &amp; permissions</span><span className="flex gap-1"><Tag tone="bg-emerald-50 text-emerald-700">Published v3</Tag><Tag tone="bg-blue-600 text-white">Share link</Tag></span></div>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[1.1fr_repeat(4,1fr)] text-[8.5px] font-bold text-slate-500 bg-slate-50 border-b border-slate-200"><span className="px-2 py-1.5">Role / Form</span>{forms.map((f) => <span key={f} className="px-1 py-1.5 text-center">{f}</span>)}</div>
          {roles.map(([r, v, e, d]) => (
            <div key={r} className="grid grid-cols-[1.1fr_repeat(4,1fr)] border-b border-slate-100 items-center"><span className="px-2 py-1.5 font-semibold">{r}</span>{forms.map((f, i) => <span key={f} className="px-1 py-1.5 flex justify-center gap-0.5">{[["V", v[i]], ["E", e[i]], ["D", d[i]]].map(([l, on]) => <span key={l as string} className={`w-4 h-4 rounded text-[7.5px] font-bold flex items-center justify-center ${on ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-300"}`}>{l}</span>)}</span>)}</div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[8.5px] text-slate-500 mb-1">Sales Staff · Sales Invoice</div>{[["Scope", "Own records only"], ["Print / Export", "Yes / No"], ["Purchase Rate", "hidden"], ["Discount %", "read-only"]].map(([k, v]) => <div key={k} className="flex justify-between text-[8.5px] py-0.5"><span className="text-slate-500">{k}</span><span className="font-medium flex items-center gap-0.5">{v === "hidden" && <Eye className="w-2.5 h-2.5" />}{v === "read-only" && <Lock className="w-2.5 h-2.5" />}{v}</span></div>)}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[8.5px] text-slate-500 mb-1">Members</div>{[["ravi@shop.in", "Sales Staff"], ["meena@shop.in", "Accountant"], ["+ invite by email", ""]].map(([m, r]) => <div key={m} className="flex justify-between text-[8.5px] py-0.5"><span className={r ? "" : "text-blue-700 font-semibold"}>{m}</span><span className="text-slate-500">{r}</span></div>)}<div className="text-[8.5px] text-slate-400 mt-1">Versions: v3 (live) · v2 · v1 — rollback any time</div></div>
        </div>
      </div>
    </Window>
  );
};

// ── AI assistant ─────────────────────────────────────────────────────────────

export const AiMock: React.FC = () => (
  <Window title="builder / sales_app / ai assistant" className="text-slate-900">
    <div className="p-3 text-[10px] space-y-2.5 bg-slate-50/60">
      <div className="flex gap-1 flex-wrap">{["Generate app", "New form", "New report", "New workflow", "Formula", "Ask data", "Sample data"].map((t, i) => <Tag key={t} tone={i === 0 ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}>{t}</Tag>)}</div>
      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="text-[8.5px] text-slate-500 mb-1">Describe your business</div>
        <div className="text-[9.5px] text-slate-800 leading-relaxed">Sales invoicing for a textile wholesaler: customers with credit limit, products with GST %, invoices with line items, payment receipts, stock status and receivables aging. Staff can only see their own invoices.</div>
        <div className="flex justify-end mt-1.5"><Tag tone="bg-indigo-600 text-white"><Sparkles className="w-2.5 h-2.5 inline mr-0.5" />Generate</Tag></div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 space-y-1.5">
        <div className="text-[9.5px] font-bold text-emerald-900 flex items-center gap-1"><Check className="w-3 h-3" />Proposed — review and apply</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[["6 forms", ["Customer", "Product", "Sales Invoice", "Payment Receipt", "State", "City"]], ["8 reports", ["Invoices (table)", "Sales by month (chart)", "Payment kanban", "Receivables aging", "Stock status (ledger)"]], ["4 workflows", ["Auto-fill rate & GST", "Block qty > stock", "Paid/Partial status", "Notify > ₹50k"]]].map(([t, list]) => (
            <div key={t as string} className="rounded-md bg-white border border-slate-200 p-1.5"><div className="text-[9px] font-bold mb-0.5">{t as string}</div>{(list as string[]).map((x) => <div key={x} className="text-[8.5px] text-slate-600 truncate">· {x}</div>)}</div>
          ))}
        </div>
        <div className="text-[8.5px] text-slate-500">+ roles: Admin, Sales Staff (own records), Accountant · + Dashboard with 4 KPIs and 2 charts</div>
      </div>
      <div className="flex items-center justify-between text-[8.5px] text-slate-500"><span>Provider: Gemini 2.5 Flash (free) · key scope: global</span><span className="text-indigo-700 font-semibold">Edit with AI · Fix with AI · Sample data</span></div>
    </div>
  </Window>
);
