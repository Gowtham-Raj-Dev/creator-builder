"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RecordDefinition } from "@/types/schema";
import { MoreVertical, Eye, Edit, Copy, Printer, Link2, Trash2 } from "lucide-react";
import type { RowActions } from "./views";

export interface RowActionsMenuProps {
  rec: RecordDefinition;
  actions: RowActions;
  perms: { edit: boolean; delete: boolean; print: boolean; create: boolean };
  /** xs = compact trigger for chips / dense rows */
  size?: "xs" | "sm";
  className?: string;
  /** always visible (default) or only on hover of the nearest `group` */
  hover?: boolean;
}

interface Item { id: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; divider?: boolean }

/**
 * The ⋮ menu shown on every record in every report view: View · Edit · Duplicate · Print · Copy link · Delete.
 * Rendered through a portal with fixed positioning so it is never clipped by scrolling tables / lanes.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ rec, actions, perms, size = "sm", className = "", hover = false }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean; toLeft: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    { id: "open", label: "View details", icon: <Eye className="w-3.5 h-3.5" />, onClick: () => actions.onOpen(rec) },
    ...(perms.edit && actions.onEdit ? [{ id: "edit", label: "Edit", icon: <Edit className="w-3.5 h-3.5" />, onClick: () => actions.onEdit!(rec) }] : []),
    ...(perms.create && actions.onDuplicate ? [{ id: "dup", label: "Duplicate", icon: <Copy className="w-3.5 h-3.5" />, onClick: () => actions.onDuplicate!(rec) }] : []),
    ...(perms.print && actions.onPrint ? [{ id: "print", label: "Print", icon: <Printer className="w-3.5 h-3.5" />, onClick: () => actions.onPrint!(rec) }] : []),
    ...(actions.onCopyLink ? [{ id: "link", label: "Copy link", icon: <Link2 className="w-3.5 h-3.5" />, onClick: () => actions.onCopyLink!(rec) }] : []),
    ...(perms.delete && actions.onDelete ? [{ id: "del", label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => actions.onDelete!(rec), danger: true, divider: true }] : []),
  ];

  const menuH = 8 + items.length * 34 + (items.some((i) => i.divider) ? 9 : 0);
  const MENU_W = 192; // w-48
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const up = r.bottom + menuH > window.innerHeight - 8; // flip upwards near the bottom of the screen
    const toLeft = r.left + MENU_W > window.innerWidth - 8; // open to the right of the button unless that runs off-screen
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: toLeft ? Math.max(8, r.right) : r.left, up, toLeft });
  }, [open, menuH]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); };
  }, [open]);

  const dim = size === "xs" ? "w-5 h-5" : "w-7 h-7";
  const icon = size === "xs" ? "w-3 h-3" : "w-4 h-4";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Record actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${dim} inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors shrink-0 ${open ? "bg-slate-200/70 text-slate-700" : ""} ${hover ? "opacity-0 group-hover:opacity-100 focus:opacity-100" : ""} ${className}`}
      >
        <MoreVertical className={icon} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: `translate(${pos.toLeft ? "-100%" : "0"}, ${pos.up ? "-100%" : "0"})` }}
          className="w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-[1000] p-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          {items.map((item) => (
            <React.Fragment key={item.id}>
              {item.divider && <div className="h-px bg-slate-100 my-1" />}
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left text-xs rounded-lg transition-colors ${item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <span className={`shrink-0 ${item.danger ? "text-rose-500" : "text-slate-400"}`}>{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};
