"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DatePreset, FormDefinition, LedgerConfig, LedgerTile, RecordDefinition, ReportDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { recordMatchesFilters, toNumber, toCsv, downloadText, DATE_PRESETS, presetRange } from "@/lib/engine/reportEngine";
import { DEFAULT_FILTER_PRESETS } from "@/lib/engine/pageEngine";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Modal";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { Search, TrendingUp, TrendingDown, PackageCheck, AlertTriangle, ChevronRight, Download, Printer, X, ArrowRight, Layers, Sigma, CalendarDays, Filter, Info } from "lucide-react";

export const DEFAULT_LEDGER_TILES: LedgerTile[] = ["items", "inflow", "outflow", "low"];

/** Parse a stored date (date-only strings are local midnight). */
const parseDate = (v: string): Date | null => { if (!v) return null; const d = new Date(v.length === 10 ? `${v}T00:00:00` : v); return isNaN(d.getTime()) ? null : d; };
const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

interface LedgerEntry {
  id: string;
  sourceId: string;
  sourceLabel: string;
  direction: "in" | "out";
  qty: number;
  date: string;
  ref: string;
  record: RecordDefinition;
  form: FormDefinition;
}

interface LedgerRow {
  record: RecordDefinition;
  opening: number; // opening balance field + all movements before the selected period
  totals: Record<string, number>; // sourceId -> qty within the period
  inflow: number; // within the period
  outflow: number; // within the period
  balance: number; // closing balance at the end of the period (all-time when no period)
  minLevel?: number;
  entries: LedgerEntry[]; // within the period
  beforeCount: number; // movements before the period folded into `opening`
}

/**
 * Generic Stock / Balance ledger: opening + Σ inflow sources − Σ outflow sources per primary record.
 * Sources may point at top-level lookups or at subform lookup columns (PO line items etc.).
 */
export const LedgerReport: React.FC<{ report: ReportDefinition; form: FormDefinition }> = ({ report, form }) => {
  const { app, recordsMap, getDisplayValue, permissions } = useLiveApp();
  const router = useRouter();
  const cfg: LedgerConfig | undefined = report.ledger;
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [preset, setPreset] = useState<DatePreset | "">(cfg?.defaultPreset || "");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });

  // the selected period: preset, or custom from/to; null bounds mean open-ended
  const [from, to] = useMemo<[Date | null, Date | null]>(() => {
    if (preset) return presetRange(preset);
    const f = custom.from ? new Date(`${custom.from}T00:00:00`) : null;
    const t = custom.to ? new Date(`${custom.to}T23:59:59.999`) : null;
    return [f, t];
  }, [preset, custom]);
  const periodActive = Boolean(from || to);
  const periodLabel = !periodActive ? "" : `${DATE_PRESETS.find((p) => p.id === preset)?.label || "Custom"} · ${from ? fmtDay(from) : "…"} → ${to ? fmtDay(to) : "…"}`;

  const rows = useMemo<LedgerRow[]>(() => {
    if (!app || !cfg) return [];
    const primary = (recordsMap[form.id] || []).filter((r) => permissions.canSeeRecord(form.id, r));
    const entriesByRecord = new Map<string, LedgerEntry[]>();

    for (const src of cfg.sources) {
      const srcForm = app.forms.find((f) => f.id === src.formId);
      if (!srcForm) continue;
      const recs = (recordsMap[src.formId] || []).filter((r) => !src.filters?.length || recordMatchesFilters(r, src.filters, srcForm));
      const [mTop, mCol] = src.matchFieldId.split(".");
      const [qTop, qCol] = src.qtyFieldId.split(".");
      const dateOf = (r: RecordDefinition) => (src.dateFieldId ? String(r.data?.[src.dateFieldId] ?? "") : r.createdAt);
      const refOf = (r: RecordDefinition) => (src.refFieldId ? getDisplayValue(srcForm, r, src.refFieldId) : r.id);
      for (const r of recs) {
        if (mCol) {
          const lines: any[] = Array.isArray(r.data?.[mTop]) ? r.data[mTop] : [];
          lines.forEach((row, i) => {
            const targets = Array.isArray(row[mCol]) ? row[mCol] : [row[mCol]];
            const qty = toNumber(qCol && qTop === mTop ? row[qCol] : r.data?.[qTop]);
            for (const t of targets) {
              if (!t) continue;
              (entriesByRecord.get(t) || entriesByRecord.set(t, []).get(t)!).push({ id: `${r.id}_${i}`, sourceId: src.id, sourceLabel: src.label, direction: src.direction, qty, date: dateOf(r), ref: refOf(r), record: r, form: srcForm });
            }
          });
        } else {
          const targets = Array.isArray(r.data?.[mTop]) ? r.data[mTop] : [r.data?.[mTop]];
          const qty = qCol ? (Array.isArray(r.data?.[qTop]) ? r.data[qTop].reduce((s: number, row: any) => s + toNumber(row[qCol]), 0) : 0) : toNumber(r.data?.[qTop]);
          for (const t of targets) {
            if (!t) continue;
            (entriesByRecord.get(t) || entriesByRecord.set(t, []).get(t)!).push({ id: r.id, sourceId: src.id, sourceLabel: src.label, direction: src.direction, qty, date: dateOf(r), ref: refOf(r), record: r, form: srcForm });
          }
        }
      }
    }

    return primary.map((rec) => {
      const all = (entriesByRecord.get(rec.id) || []).sort((a, b) => a.date.localeCompare(b.date));
      // movements before the period roll into the opening; movements after it are ignored (closing "as of" the period end)
      let opening = cfg.openingBalanceFieldId ? toNumber(rec.data?.[cfg.openingBalanceFieldId]) : 0;
      let beforeCount = 0;
      const entries: LedgerEntry[] = [];
      for (const e of all) {
        const d = parseDate(e.date);
        if (from && d && d < from) { opening += e.direction === "in" ? e.qty : -e.qty; beforeCount++; continue; }
        if (to && d && d > to) continue;
        entries.push(e);
      }
      const totals: Record<string, number> = {};
      let inflow = 0, outflow = 0;
      for (const e of entries) {
        totals[e.sourceId] = (totals[e.sourceId] || 0) + e.qty;
        if (e.direction === "in") inflow += e.qty; else outflow += e.qty;
      }
      const minLevel = cfg.minLevelFieldId ? toNumber(rec.data?.[cfg.minLevelFieldId]) : undefined;
      return { record: rec, opening, totals, inflow, outflow, balance: opening + inflow - outflow, minLevel, entries, beforeCount };
    });
  }, [app, cfg, recordsMap, form.id, permissions, getDisplayValue, from, to]);

  if (!cfg || !app) return <div className="p-10 text-center text-xs text-slate-400">Configure the ledger (primary form, inflow/outflow sources) in the report builder.</div>;

  const displayFields = (cfg.displayFieldIds?.length ? cfg.displayFieldIds : [form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id || ""]).map((id) => form.fields.find((f) => f.id === id)).filter(Boolean);
  const unitLabel = (r: RecordDefinition) => (cfg.unitFieldId ? getDisplayValue(form, r, cfg.unitFieldId) : "");

  const filtered = rows.filter((r) => {
    if (onlyLow && !(r.minLevel !== undefined && r.balance <= r.minLevel)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return displayFields.some((f) => getDisplayValue(form, r.record, f!.id).toLowerCase().includes(q));
  });

  const totalIn = rows.reduce((s, r) => s + r.inflow, 0);
  const totalOut = rows.reduce((s, r) => s + r.outflow, 0);
  const totalClosing = rows.reduce((s, r) => s + r.balance, 0);
  const lowCount = rows.filter((r) => r.minLevel !== undefined && r.balance <= r.minLevel).length;
  const negCount = rows.filter((r) => r.balance < 0).length;
  const hasIn = cfg.sources.some((s) => s.direction === "in");
  const hasOut = cfg.sources.some((s) => s.direction === "out");
  const num = (n: number) => n.toLocaleString("en-IN");
  const periodSuffix = periodActive ? " (period)" : "";
  // tiles chosen in the builder; each explains itself when it can only be zero
  const tiles = (cfg.tiles?.length ? cfg.tiles : DEFAULT_LEDGER_TILES).map((t): { key: string; label: string; value: string; icon: React.ReactNode; tone: string; hint?: string; onClick?: () => void } | null => {
    if (t === "items") return { key: t, label: "Items tracked", value: num(rows.length), icon: <Layers className="w-4 h-4" />, tone: "text-slate-700 bg-slate-100" };
    if (t === "inflow") return { key: t, label: `Total inflow${periodSuffix}`, value: num(totalIn), icon: <TrendingUp className="w-4 h-4" />, tone: "text-emerald-700 bg-emerald-50", hint: hasIn ? undefined : "No inflow source (e.g. Purchase) is mapped in this ledger" };
    if (t === "outflow") return { key: t, label: `Total outflow${periodSuffix}`, value: num(totalOut), icon: <TrendingDown className="w-4 h-4" />, tone: "text-rose-700 bg-rose-50", hint: hasOut ? undefined : "No outflow source (e.g. Sales) is mapped in this ledger" };
    if (t === "closing") return { key: t, label: periodActive ? "Closing balance" : "Total balance", value: num(totalClosing), icon: <Sigma className="w-4 h-4" />, tone: "text-indigo-700 bg-indigo-50" };
    if (t === "low") return { key: t, label: "Low stock", value: cfg.minLevelFieldId ? num(lowCount) : "—", icon: <AlertTriangle className="w-4 h-4" />, tone: "text-amber-700 bg-amber-50", hint: cfg.minLevelFieldId ? undefined : "Set a Minimum level field in the ledger settings", onClick: cfg.minLevelFieldId ? () => setOnlyLow((v) => !v) : undefined };
    if (t === "negative") return { key: t, label: "Negative balance", value: num(negCount), icon: <AlertTriangle className="w-4 h-4" />, tone: "text-rose-700 bg-rose-50" };
    if (t.startsWith("source:")) { const s = cfg.sources.find((x) => x.id === t.slice(7)); if (!s) return null; const v = rows.reduce((sum, r) => sum + (r.totals[s.id] || 0), 0); return { key: t, label: `${s.label}${periodSuffix}`, value: `${s.direction === "in" ? "+" : "−"}${num(v)}`, icon: s.direction === "in" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />, tone: s.direction === "in" ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50" }; }
    return null;
  }).filter(Boolean) as Array<{ key: string; label: string; value: string; icon: React.ReactNode; tone: string; hint?: string; onClick?: () => void }>;
  const presetChips = DATE_PRESETS.filter((p) => DEFAULT_FILTER_PRESETS.includes(p.id));

  const exportCsv = () => {
    const headers = [...displayFields.map((f) => f!.label), "Opening", ...cfg.sources.map((s) => s.label), "Total In", "Total Out", "Balance"];
    const data = filtered.map((r) => [...displayFields.map((f) => getDisplayValue(form, r.record, f!.id)), String(r.opening), ...cfg.sources.map((s) => String(r.totals[s.id] || 0)), String(r.inflow), String(r.outflow), String(r.balance)]);
    downloadText(`${report.linkName}.csv`, toCsv(headers, data));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {cfg.showPeriodFilter !== false && (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-3xs space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-600 flex items-center gap-1.5 mr-1"><Filter className="w-3.5 h-3.5 text-blue-600" />Period</span>
            <div className="inline-flex flex-wrap gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button type="button" onClick={() => { setPreset(""); setCustom({ from: "", to: "" }); }} className={`px-2.5 py-1 rounded-md font-medium ${!periodActive ? "bg-white shadow-3xs text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>All time</button>
              {presetChips.map((p) => <button key={p.id} type="button" onClick={() => { setPreset(p.id); setCustom({ from: "", to: "" }); }} className={`px-2.5 py-1 rounded-md font-medium ${preset === p.id ? "bg-white shadow-3xs text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>{p.label}</button>)}
            </div>
            <span className={`inline-flex items-center gap-1.5 ${custom.from || custom.to ? "text-blue-700" : "text-slate-500"}`}>
              <CalendarDays className="w-3.5 h-3.5" />
              <input type="date" value={custom.from} onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); setPreset(""); }} className="border border-slate-300 rounded-lg px-2 py-1 bg-white" />
              <span className="text-slate-400">to</span>
              <input type="date" value={custom.to} onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); setPreset(""); }} className="border border-slate-300 rounded-lg px-2 py-1 bg-white" />
            </span>
            {periodActive && <button type="button" onClick={() => { setPreset(""); setCustom({ from: "", to: "" }); }} className="text-rose-600 font-semibold inline-flex items-center gap-0.5 ml-auto"><X className="w-3 h-3" />Clear</button>}
          </div>
          {periodActive && <div className="text-[11px] text-slate-500"><span className="font-semibold text-slate-800">{periodLabel}</span> — Opening = balance at the start of the period, movements inside the period, Closing = balance at its end.</div>}
        </div>
      )}

      {tiles.length > 0 && (
        <div className={`grid grid-cols-2 gap-4 ${tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : ""}`}>
          {tiles.map((k) => (
            <div key={k.key} onClick={k.onClick} title={k.hint} className={`bg-white rounded-xl border p-4 shadow-3xs flex items-center gap-3 ${k.onClick ? "cursor-pointer hover:border-blue-300" : ""} ${k.key === "low" && onlyLow ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}>{k.icon}</div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 truncate">{k.label}</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">{k.value}</div>
                {k.hint && <div className="text-[10px] text-amber-700 flex items-center gap-1 leading-tight"><Info className="w-3 h-3 shrink-0" />{k.hint}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2"><PackageCheck className="w-5 h-5 text-indigo-600" />{report.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{report.description || `Opening + ${cfg.sources.filter((s) => s.direction === "in").map((s) => s.label).join(" + ") || "inflow"} − ${cfg.sources.filter((s) => s.direction === "out").map((s) => s.label).join(" − ") || "outflow"} per ${form.name}.`}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${form.name}…`} className="w-56 text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/25" /></div>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="rounded" />Low stock only</label>
            {permissions.report(report.id).export && <Button variant="outline" size="sm" onClick={exportCsv} icon={<Download className="w-3.5 h-3.5" />}>CSV</Button>}
            {permissions.report(report.id).print && <Button variant="outline" size="sm" onClick={() => window.print()} icon={<Printer className="w-3.5 h-3.5" />}>Print</Button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600 border-b border-slate-200">
              <tr>
                {displayFields.map((f) => <th key={f!.id} className="px-4 py-2.5 text-left">{f!.label}</th>)}
                {(cfg.openingBalanceFieldId || periodActive) && <th className="px-4 py-2.5 text-right">Opening</th>}
                {cfg.sources.map((s) => <th key={s.id} className={`px-4 py-2.5 text-right ${s.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>{s.label}</th>)}
                <th className="px-4 py-2.5 text-right bg-slate-100">{periodActive ? "Closing" : "Balance"}</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && <tr><td colSpan={99} className="px-4 py-12 text-center text-slate-400">No items.</td></tr>}
              {filtered.map((r) => {
                const low = r.minLevel !== undefined && r.balance <= r.minLevel;
                const neg = r.balance < 0;
                return (
                  <tr key={r.record.id} onClick={() => setSelected(r)} className={`cursor-pointer hover:bg-blue-50/50 ${neg ? "bg-rose-50/50" : low ? "bg-amber-50/50" : ""}`}>
                    {displayFields.map((f, i) => <td key={f!.id} className={`px-4 py-2.5 ${i === 0 ? "font-semibold text-slate-900" : "text-slate-700"}`}>{getDisplayValue(form, r.record, f!.id)}</td>)}
                    {(cfg.openingBalanceFieldId || periodActive) && <td className="px-4 py-2.5 text-right tabular-nums text-slate-600" title={r.beforeCount ? `includes ${r.beforeCount} movement(s) before the period` : undefined}>{r.opening.toLocaleString("en-IN")}</td>}
                    {cfg.sources.map((s) => <td key={s.id} className={`px-4 py-2.5 text-right tabular-nums ${r.totals[s.id] ? (s.direction === "in" ? "text-emerald-700" : "text-rose-700") : "text-slate-300"}`}>{r.totals[s.id] ? `${s.direction === "in" ? "+" : "−"}${r.totals[s.id].toLocaleString("en-IN")}` : "—"}</td>)}
                    <td className={`px-4 py-2.5 text-right tabular-nums font-bold bg-slate-50/70 ${neg ? "text-rose-700" : "text-slate-900"}`}>{r.balance.toLocaleString("en-IN")} <span className="text-[10px] font-normal text-slate-400">{unitLabel(r.record)}</span></td>
                    <td className="px-4 py-2.5 text-center">
                      {neg ? <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">NEGATIVE</span> : low ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">LOW</span> : <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">OK</span>}
                    </td>
                    <td className="text-slate-300"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Drawer isOpen onClose={() => setSelected(null)} width="max-w-2xl" header={
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ledger</div>
              <h2 className="text-base font-bold text-slate-900">{displayFields.map((f) => getDisplayValue(form, selected.record, f!.id)).join(" · ")}</h2>
              <div className="text-xs text-slate-500 mt-1">Opening {selected.opening} + In {selected.inflow} − Out {selected.outflow} = <strong className="text-slate-900">{selected.balance}</strong> {unitLabel(selected.record)}</div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => router.push(getLiveAppUrl(app.linkName, { form: form.linkName, recordId: selected.record.id }))} icon={<ArrowRight className="w-3.5 h-3.5" />}>Open {form.name}</Button>
              <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
          </div>
        }>
          <div className="p-6">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase text-slate-500 border-b border-slate-200"><tr><th className="text-left py-2">Date</th><th className="text-left py-2">Source</th><th className="text-left py-2">Reference</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Running</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(() => { let run = selected.opening; return selected.entries.map((e) => { run += e.direction === "in" ? e.qty : -e.qty; return (
                  <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => router.push(getLiveAppUrl(app.linkName, { form: e.form.linkName, recordId: e.record.id }))}>
                    <td className="py-2 text-slate-600">{e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
                    <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${e.direction === "in" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{e.sourceLabel}</span></td>
                    <td className="py-2 text-blue-600 font-medium">{e.ref}</td>
                    <td className={`py-2 text-right tabular-nums font-semibold ${e.direction === "in" ? "text-emerald-700" : "text-rose-700"}`}>{e.direction === "in" ? "+" : "−"}{e.qty}</td>
                    <td className="py-2 text-right tabular-nums text-slate-900 font-bold">{run}</td>
                  </tr>); }); })()}
                {selected.entries.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No transactions.</td></tr>}
              </tbody>
            </table>
          </div>
        </Drawer>
      )}
    </div>
  );
};
