"use client";

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LookupConfig, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { resolveLookupDisplay, resolveLookupSecondary, filterLookupRecords } from "@/lib/engine/lookupEngine";
import { recordMatchesFilters } from "@/lib/engine/reportEngine";
import { FieldLabel } from "@/components/ui/FormControls";
import { Search, ChevronDown, X, Check, Plus, ExternalLink } from "lucide-react";

/** Provided by DynamicForm so lookups can open a quick-create modal without circular imports. */
export const QuickCreateContext = createContext<{
  openQuickCreate: (formId: string, onCreated: (rec: RecordDefinition) => void) => void;
} | null>(null);

interface LookupFieldProps {
  label: string;
  value: string | string[];
  onChange: (recordId: any, record?: RecordDefinition | RecordDefinition[]) => void;
  lookupConfig: LookupConfig;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  parentValue?: any; // for cascading
  compact?: boolean; // inside subform grid
  tooltip?: string;
  description?: string;
}

export const LookupField: React.FC<LookupFieldProps> = ({ label, value, onChange, lookupConfig, error, disabled, required, parentValue, compact, tooltip, description }) => {
  const { app, recordsMap, loadFormRecords, permissions } = useLiveApp();
  const quick = useContext(QuickCreateContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean }>({ top: 0, left: 0, width: 280, up: false });

  // Position the floating list under (or above) the trigger; re-measure on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = wrapRef.current?.querySelector("button");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const listH = Math.min(380, window.innerHeight * 0.6);
      const up = r.bottom + listH > window.innerHeight - 8 && r.top > listH;
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, width: Math.max(r.width, 300), up });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [open]);

  const targetFormId = lookupConfig.targetFormId;
  const displayFieldId = lookupConfig.displayFieldId;
  const targetForm = app?.forms.find((f) => f.id === targetFormId);
  const multiple = Boolean(lookupConfig.multiple);

  useEffect(() => {
    if (targetFormId && !recordsMap[targetFormId]) loadFormRecords(targetFormId);
  }, [targetFormId, recordsMap, loadFormRecords]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (wrapRef.current && !wrapRef.current.contains(t) && popRef.current && !popRef.current.contains(t)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const allRecords: RecordDefinition[] = recordsMap[targetFormId] || [];

  const candidates = useMemo(() => {
    const filtered = filterLookupRecords(allRecords, lookupConfig, parentValue, (rec) => recordMatchesFilters(rec, lookupConfig.filters || [], targetForm, "AND"));
    const sortKey = lookupConfig.sortFieldId || displayFieldId;
    const sorted = [...filtered].sort((a, b) => String(a.data?.[sortKey] ?? "").localeCompare(String(b.data?.[sortKey] ?? ""), undefined, { numeric: true }));
    return lookupConfig.sortOrder === "desc" ? sorted.reverse() : sorted;
  }, [allRecords, lookupConfig, parentValue, targetForm, displayFieldId]);

  const searchable = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((rec) => {
      const primary = String(rec.data?.[displayFieldId] ?? "").toLowerCase();
      if (primary.includes(q)) return true;
      const sec = resolveLookupSecondary(rec, lookupConfig, targetForm).join(" ").toLowerCase();
      return sec.includes(q) || rec.id.toLowerCase().includes(q);
    });
  }, [candidates, query, displayFieldId, lookupConfig, targetForm]);

  const selectedIds: string[] = multiple ? (Array.isArray(value) ? value : value ? [value] : []) : value ? [String(value)] : [];
  const currentDisplay = resolveLookupDisplay(multiple ? selectedIds : selectedIds[0], allRecords, displayFieldId);
  const selectedRecord = !multiple && selectedIds[0] ? allRecords.find((r) => r.id === selectedIds[0]) : undefined;
  const secondary = selectedRecord ? resolveLookupSecondary(selectedRecord, lookupConfig, targetForm) : [];

  const choose = (rec: RecordDefinition) => {
    if (multiple) {
      const next = selectedIds.includes(rec.id) ? selectedIds.filter((id) => id !== rec.id) : [...selectedIds, rec.id];
      onChange(next, next.map((id) => allRecords.find((r) => r.id === id)).filter(Boolean) as RecordDefinition[]);
    } else {
      onChange(rec.id, rec);
      setOpen(false);
      setQuery("");
    }
  };

  const clear = (e?: React.MouseEvent) => { e?.stopPropagation(); onChange(multiple ? [] : "", undefined); };

  const canAddNew = lookupConfig.allowAddNew && quick && targetForm && permissions.form(targetForm.id).create;

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, searchable.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = searchable[highlight]; if (r) choose(r); }
    else if (e.key === "Escape") setOpen(false);
  };

  useEffect(() => { setHighlight(0); }, [query, open]);
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const openList = () => { if (disabled) return; setOpen(true); setTimeout(() => inputRef.current?.focus(), 10); };

  const secondaryFields = (lookupConfig.secondaryDisplayFieldIds || []).map((fid) => targetForm?.fields.find((f) => f.id === fid)).filter(Boolean);

  return (
    <div className={`w-full ${compact ? "" : "space-y-1.5"}`} ref={wrapRef}>
      {!compact && label && <FieldLabel required={required} tooltip={tooltip}>{label}</FieldLabel>}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={openList}
          onKeyDown={handleKey}
          className={`w-full text-left bg-white border ${error ? "border-rose-400" : open ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-300 hover:border-slate-400"} text-slate-900 rounded-lg transition-all flex items-center justify-between gap-2 shadow-2xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
        >
          <span className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
            {multiple && selectedIds.length > 0 ? (
              selectedIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
                  {resolveLookupDisplay(id, allRecords, displayFieldId)}
                  {!disabled && <X className="w-3 h-3 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); const next = selectedIds.filter((x) => x !== id); onChange(next); }} />}
                </span>
              ))
            ) : currentDisplay ? (
              <span className="truncate">
                <span className="font-medium">{currentDisplay}</span>
                {secondary.length > 0 && <span className="text-slate-400 text-xs ml-2">{secondary.join(" · ")}</span>}
              </span>
            ) : (
              <span className="text-slate-400">{`Select ${label || targetForm?.name || "record"}…`}</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-slate-400 shrink-0">
            {selectedIds.length > 0 && !disabled && <X className="w-3.5 h-3.5 hover:text-slate-700" onClick={clear} />}
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>

        {open && typeof document !== "undefined" && createPortal(
          <div ref={popRef} className="fixed z-[90] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ top: pos.top, left: pos.left, width: Math.min(pos.width, window.innerWidth - pos.left - 8), transform: pos.up ? "translateY(-100%)" : undefined }}>
            <div className="p-2 border-b border-slate-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Search ${targetForm?.name || "records"}…`}
                className="flex-1 text-xs focus:outline-none bg-transparent"
              />
              {canAddNew && (
                <button type="button" onClick={() => quick!.openQuickCreate(targetForm!.id, (rec) => { choose(rec); })} className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-50 whitespace-nowrap">
                  <Plus className="w-3 h-3" /> Add new
                </button>
              )}
            </div>

            {secondaryFields.length > 0 && (
              <div className="grid text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-3 py-1.5 border-b border-slate-100" style={{ gridTemplateColumns: `minmax(0,2fr) ${secondaryFields.map(() => "minmax(0,1fr)").join(" ")} 20px` }}>
                <span>{targetForm?.fields.find((f) => f.id === displayFieldId)?.label || "Name"}</span>
                {secondaryFields.map((f) => <span key={f!.id} className="truncate">{f!.label}</span>)}
                <span />
              </div>
            )}

            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {searchable.length === 0 ? (
                <div className="p-5 text-center text-xs text-slate-400">
                  {candidates.length === 0 && lookupConfig.cascade?.parentFieldId && (parentValue === undefined || parentValue === "")
                    ? "Select the parent field first."
                    : `No matching ${targetForm?.name || "records"}.`}
                  {canAddNew && query && (
                    <button type="button" onClick={() => quick!.openQuickCreate(targetForm!.id, (rec) => choose(rec))} className="block mx-auto mt-2 text-blue-600 font-semibold hover:underline">+ Create “{query}”</button>
                  )}
                </div>
              ) : (
                searchable.slice(0, 200).map((rec, idx) => {
                  const isSel = selectedIds.includes(rec.id);
                  const primary = resolveLookupDisplay(rec.id, [rec], displayFieldId);
                  const sec = resolveLookupSecondary(rec, lookupConfig, targetForm);
                  return (
                    <div
                      key={rec.id}
                      onClick={() => choose(rec)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 border-b border-slate-50 last:border-0 ${idx === highlight ? "bg-blue-50" : ""} ${isSel ? "text-blue-900 font-semibold" : "text-slate-800"}`}
                      style={secondaryFields.length > 0 ? { display: "grid", gridTemplateColumns: `minmax(0,2fr) ${secondaryFields.map(() => "minmax(0,1fr)").join(" ")} 20px` } : undefined}
                    >
                      <span className="truncate">{primary}</span>
                      {secondaryFields.length > 0 ? (
                        <>
                          {sec.length ? sec.map((s, i) => <span key={i} className="truncate text-slate-500">{s}</span>) : secondaryFields.map((f) => <span key={f!.id} className="text-slate-300">—</span>)}
                          <span>{isSel && <Check className="w-3.5 h-3.5 text-blue-600" />}</span>
                        </>
                      ) : (
                        isSel && <Check className="w-3.5 h-3.5 text-blue-600 ml-auto shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/70 text-[10px] text-slate-400 flex items-center justify-between">
              <span>{searchable.length} of {candidates.length}{multiple ? ` · ${selectedIds.length} selected` : ""}</span>
              {multiple && <button type="button" className="text-blue-600 font-semibold" onClick={() => setOpen(false)}>Done</button>}
            </div>
          </div>,
          document.body
        )}
      </div>

      {!compact && selectedRecord && app && (
        <a href={`/app?app=${app.linkName}&form=${targetForm?.linkName}&record=${selectedRecord.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600">
          <ExternalLink className="w-3 h-3" /> Open record
        </a>
      )}
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && !compact && description && <p className="text-[11px] text-slate-500">{description}</p>}
    </div>
  );
};
