import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}) => {
  let base =
    "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 select-none disabled:opacity-50 disabled:cursor-not-allowed";

  let sizeStyles = "px-3.5 py-2 text-sm gap-2";
  if (size === "sm") sizeStyles = "px-2.5 py-1.5 text-xs gap-1.5";
  if (size === "lg") sizeStyles = "px-5 py-2.5 text-base gap-2.5";

  let variantStyles = "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-xs";
  if (variant === "secondary") {
    variantStyles =
      "bg-slate-100 text-slate-800 hover:bg-slate-200 focus:ring-slate-400 border border-slate-200";
  } else if (variant === "outline") {
    variantStyles =
      "bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-300 border border-slate-300 shadow-2xs";
  } else if (variant === "ghost") {
    variantStyles =
      "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-300";
  } else if (variant === "danger") {
    variantStyles =
      "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 shadow-xs";
  }

  return (
    <button
      className={`${base} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
