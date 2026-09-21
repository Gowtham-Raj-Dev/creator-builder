"use client";

import React, { useEffect, useRef, useState } from "react";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  description?: string;
}

/** Click-triggered popover menu (closes on outside click / Escape). */
export const Dropdown: React.FC<{
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  width?: string;
  className?: string;
}> = ({ trigger, items, align = "right", width = "w-56", className = "" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className={`relative inline-flex ${className}`} ref={ref}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="inline-flex">{trigger}</div>
      {open && (
        <div className={`absolute top-full mt-1.5 ${align === "right" ? "right-0" : "left-0"} ${width} bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-1.5 animate-in fade-in zoom-in-95 duration-100`}>
          {items.map((item) =>
            item.divider ? (
              <div key={item.id} className="h-px bg-slate-100 my-1" />
            ) : (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick?.(); }}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 text-left text-xs rounded-lg transition-colors disabled:opacity-40 ${item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {item.icon && <span className={`mt-px shrink-0 ${item.danger ? "text-rose-500" : "text-slate-400"}`}>{item.icon}</span>}
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  {item.description && <span className="block text-[10px] text-slate-400 leading-snug">{item.description}</span>}
                </span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
