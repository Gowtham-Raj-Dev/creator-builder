import React from "react";
import { HelpCircle } from "lucide-react";

const inputBase =
  "w-full bg-white border text-slate-900 text-sm rounded-lg px-3 py-2 transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 shadow-2xs disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";
const okBorder = "border-slate-300 focus:ring-blue-500/25 focus:border-blue-500";
const errBorder = "border-rose-400 focus:ring-rose-300/40";

export const FieldLabel: React.FC<{ htmlFor?: string; required?: boolean; tooltip?: string; children: React.ReactNode; className?: string }> = ({ htmlFor, required, tooltip, children, className = "" }) => (
  <label htmlFor={htmlFor} className={`flex items-center gap-1 text-xs font-medium text-slate-700 ${className}`}>
    <span>{children}</span>
    {required && <span className="text-rose-500">*</span>}
    {tooltip && (
      <span className="group relative inline-flex">
        <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-normal w-52 text-[11px] leading-relaxed bg-slate-900 text-white rounded-md px-2.5 py-1.5 shadow-lg z-30">
          {tooltip}
        </span>
      </span>
    )}
  </label>
);

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  tooltip?: string;
  prefixIcon?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: "sm" | "md";
}

export const Input: React.FC<InputProps> = ({ label, error, helperText, tooltip, prefixIcon, suffix, className = "", id, size = "md", ...props }) => {
  const inputId = id || (label ? `in-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <div className="w-full space-y-1.5">
      {label && <FieldLabel htmlFor={inputId} required={props.required} tooltip={tooltip}>{label}</FieldLabel>}
      <div className="relative flex items-center">
        {prefixIcon && <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">{prefixIcon}</div>}
        <input
          id={inputId}
          className={`${inputBase} ${error ? errBorder : okBorder} ${prefixIcon ? "pl-9" : ""} ${suffix ? "pr-10" : ""} ${size === "sm" ? "!py-1.5 !text-xs" : ""} ${className}`}
          {...props}
        />
        {suffix && <div className="absolute right-3 text-slate-400 flex items-center">{suffix}</div>}
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  tooltip?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, helperText, tooltip, className = "", id, ...props }) => {
  const tid = id || (label ? `ta-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <div className="w-full space-y-1.5">
      {label && <FieldLabel htmlFor={tid} required={props.required} tooltip={tooltip}>{label}</FieldLabel>}
      <textarea id={tid} rows={3} className={`${inputBase} ${error ? errBorder : okBorder} ${className}`} {...props} />
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}
    </div>
  );
};

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  tooltip?: string;
  options?: Array<{ label: string; value: string | number }>;
  size?: "sm" | "md";
}

export const Select: React.FC<SelectProps> = ({ label, error, helperText, tooltip, options = [], children, className = "", id, size = "md", ...props }) => {
  const selectId = id || (label ? `sel-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <div className="w-full space-y-1.5">
      {label && <FieldLabel htmlFor={selectId} required={props.required} tooltip={tooltip}>{label}</FieldLabel>}
      <select id={selectId} className={`${inputBase} ${error ? errBorder : okBorder} cursor-pointer ${size === "sm" ? "!py-1.5 !text-xs" : ""} ${className}`} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        {children}
      </select>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}
    </div>
  );
};

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string; description?: string; disabled?: boolean; size?: "sm" | "md" }> = ({ checked, onChange, label, description, disabled, size = "md" }) => (
  <label className={`flex items-start gap-3 cursor-pointer select-none ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors ${size === "sm" ? "w-8 h-4.5 mt-0.5" : "w-10 h-6"} ${checked ? "bg-blue-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform ${size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5"} ${checked ? (size === "sm" ? "translate-x-3.5" : "translate-x-4") : ""}`} />
    </button>
    {(label || description) && (
      <span className="min-w-0">
        {label && <span className="block text-xs font-medium text-slate-800">{label}</span>}
        {description && <span className="block text-[11px] text-slate-500 leading-snug">{description}</span>}
      </span>
    )}
  </label>
);

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean; className?: string }> = ({ checked, onChange, label, disabled, className = "" }) => (
  <label className={`inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none ${disabled ? "opacity-50" : ""} ${className}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
    {label && <span>{label}</span>}
  </label>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "purple" | "indigo" | "dark";
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}> = ({ children, variant = "default", size = "sm", className = "", dot }) => {
  const colors: Record<string, string> = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    primary: "bg-blue-50 text-blue-700 border-blue-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dark: "bg-slate-800 text-white border-slate-700",
  };
  const dotColors: Record<string, string> = { default: "bg-slate-400", primary: "bg-blue-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500", purple: "bg-purple-500", indigo: "bg-indigo-500", dark: "bg-white" };
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border shadow-3xs whitespace-nowrap ${sizeClass} ${colors[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};

export const SectionTitle: React.FC<{ children: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ children, icon, action, className = "" }) => (
  <div className={`flex items-center justify-between ${className}`}>
    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
      {icon}
      {children}
    </span>
    {action}
  </div>
);

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; compact?: boolean }> = ({ icon, title, description, action, compact }) => (
  <div className={`bg-white rounded-xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center ${compact ? "p-6 space-y-2" : "p-12 space-y-3"}`}>
    {icon && <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">{icon}</div>}
    <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
    {description && <p className="text-xs text-slate-500 max-w-sm leading-relaxed">{description}</p>}
    {action}
  </div>
);

export const Tabs: React.FC<{ tabs: Array<{ id: string; label: string; icon?: React.ReactNode; count?: number }>; active: string; onChange: (id: string) => void; className?: string; size?: "sm" | "md" }> = ({ tabs, active, onChange, className = "", size = "md" }) => (
  <div className={`inline-flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 ${className}`}>
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`flex items-center gap-1.5 rounded-md font-medium transition-all ${size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${active === t.id ? "bg-white text-blue-700 shadow-3xs" : "text-slate-500 hover:text-slate-800"}`}
      >
        {t.icon}
        {t.label}
        {t.count !== undefined && <span className={`px-1.5 rounded-full text-[10px] ${active === t.id ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>{t.count}</span>}
      </button>
    ))}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: React.ReactNode; description?: string; action?: React.ReactNode; padded?: boolean }> = ({ children, className = "", title, description, action, padded = true }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-3xs ${className}`}>
    {(title || action) && (
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
    )}
    <div className={padded ? "p-5" : ""}>{children}</div>
  </div>
);
