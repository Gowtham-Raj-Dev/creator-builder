import React from "react";

/** The YourBuilder mark (same artwork as public/logo.svg and the favicon), inlined so it works under any basePath. */
export const BrandLogo: React.FC<{ size?: number; className?: string; title?: string }> = ({ size = 36, className = "", title = "YourBuilder" }) => (
  <svg viewBox="0 0 128 128" width={size} height={size} className={`shrink-0 ${className}`} role="img" aria-label={title}>
    <defs>
      <linearGradient id="yb-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
      <linearGradient id="yb-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dbeafe" /></linearGradient>
    </defs>
    <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#yb-bg)" />
    <rect x="4" y="4" width="120" height="60" rx="30" fill="#ffffff" opacity="0.08" />
    <path d="M64 30 L98 46 L64 62 L30 46 Z" fill="url(#yb-top)" />
    <path d="M30 62 L64 78 L98 62" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    <path d="M30 78 L64 94 L98 78" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    <path d="M100 18 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 Z" fill="#a7f3d0" />
  </svg>
);
