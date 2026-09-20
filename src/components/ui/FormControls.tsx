import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixIcon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  prefixIcon,
  suffix,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-700">
          {label}
          {props.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {prefixIcon && (
          <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
            {prefixIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full bg-white border ${
            error ? "border-rose-400 focus:ring-rose-300" : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
          } text-slate-900 text-sm rounded-lg px-3 py-2 transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-opacity-20 shadow-2xs ${
            prefixIcon ? "pl-9" : ""
          } ${suffix ? "pr-10" : ""} disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        {suffix && <div className="absolute right-3 text-slate-400 flex items-center">{suffix}</div>}
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: Array<{ label: string; value: string | number }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options = [],
  children,
  className = "",
  id,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-700">
          {label}
          {props.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full bg-white border ${
          error ? "border-rose-400 focus:ring-rose-300" : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
        } text-slate-900 text-sm rounded-lg px-3 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-opacity-20 shadow-2xs disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {children}
      </select>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "purple";
  size?: "sm" | "md";
}> = ({ children, variant = "default", size = "sm" }) => {
  let color = "bg-slate-100 text-slate-700 border-slate-200";
  if (variant === "primary") color = "bg-blue-50 text-blue-700 border-blue-200";
  if (variant === "success") color = "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (variant === "warning") color = "bg-amber-50 text-amber-700 border-amber-200";
  if (variant === "danger") color = "bg-rose-50 text-rose-700 border-rose-200";
  if (variant === "purple") color = "bg-purple-50 text-purple-700 border-purple-200";

  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-3xs ${sizeClass} ${color}`}
    >
      {children}
    </span>
  );
};
