import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "subtle";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading,
  className = "",
  disabled,
  ...props
}) => {
  const base =
    "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 select-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

  let sizeStyles = "px-3.5 py-2 text-sm gap-2";
  if (size === "xs") sizeStyles = "px-2 py-1 text-[11px] gap-1 rounded-md";
  if (size === "sm") sizeStyles = "px-2.5 py-1.5 text-xs gap-1.5";
  if (size === "lg") sizeStyles = "px-5 py-2.5 text-base gap-2.5";

  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 shadow-xs shadow-blue-600/20",
    secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400 border border-slate-200",
    outline: "bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 focus-visible:ring-slate-300 border border-slate-300 shadow-2xs",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
    subtle: "bg-blue-50 text-blue-700 hover:bg-blue-100 focus-visible:ring-blue-300 border border-blue-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 shadow-xs",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 shadow-xs",
  };

  return (
    <button className={`${base} ${sizeStyles} ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : icon && <span className="shrink-0">{icon}</span>}
      {children}
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
};

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "danger" | "primary"; size?: "sm" | "md" }
> = ({ tone = "default", size = "md", className = "", children, ...props }) => {
  const tones = {
    default: "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
    danger: "text-slate-400 hover:text-rose-600 hover:bg-rose-50",
    primary: "text-slate-400 hover:text-blue-600 hover:bg-blue-50",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${size === "sm" ? "p-1" : "p-1.5"} ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
