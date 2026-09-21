import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "full";
  icon?: React.ReactNode;
  bodyClassName?: string;
}

const widths: Record<string, string> = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl", full: "max-w-[96vw]",
};

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, footer, maxWidth = "md", icon, bodyClassName = "" }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${widths[maxWidth]} bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[92vh] animate-in zoom-in-95 duration-150`}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60 gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {icon && <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900 leading-tight">{title}</h3>
              {description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className={`p-6 overflow-y-auto flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">{footer}</div>}
      </div>
    </div>
  );
};

/** Right-side slide-over drawer. */
export const Drawer: React.FC<{ isOpen: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; width?: string; header?: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, children, width = "max-w-2xl", header, footer }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${width} bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200`}>
        {header || (
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
};
