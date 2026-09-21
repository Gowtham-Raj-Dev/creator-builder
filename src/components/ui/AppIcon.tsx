"use client";

import React from "react";
import {
  Building2, Package, Receipt, ShoppingCart, Factory, Briefcase, BarChart3, Calculator, Truck, Candy, Stethoscope, GraduationCap, Wrench, ClipboardList, Wallet, Home,
  Users, Boxes, Warehouse, Store, FileText, Layers, ShieldCheck, Landmark, Utensils, Car, Plane, HeartPulse, Leaf, Zap, Calendar, Headphones,
} from "lucide-react";

/** Curated Lucide icon set for apps. Keys are stored in `app.settings.icon`. */
export const APP_ICONS: Record<string, { icon: React.FC<{ className?: string }>; label: string }> = {
  building: { icon: Building2, label: "Company" },
  package: { icon: Package, label: "Inventory" },
  receipt: { icon: Receipt, label: "Billing" },
  cart: { icon: ShoppingCart, label: "Purchase" },
  factory: { icon: Factory, label: "Production" },
  briefcase: { icon: Briefcase, label: "Business" },
  chart: { icon: BarChart3, label: "Analytics" },
  calculator: { icon: Calculator, label: "Accounts" },
  truck: { icon: Truck, label: "Logistics" },
  candy: { icon: Candy, label: "Sweets / FMCG" },
  medical: { icon: Stethoscope, label: "Clinic" },
  education: { icon: GraduationCap, label: "Education" },
  service: { icon: Wrench, label: "Service" },
  checklist: { icon: ClipboardList, label: "Tasks" },
  wallet: { icon: Wallet, label: "Finance" },
  home: { icon: Home, label: "Property" },
  users: { icon: Users, label: "HR / CRM" },
  boxes: { icon: Boxes, label: "Stock" },
  warehouse: { icon: Warehouse, label: "Warehouse" },
  store: { icon: Store, label: "Retail" },
  document: { icon: FileText, label: "Documents" },
  layers: { icon: Layers, label: "General" },
  shield: { icon: ShieldCheck, label: "Compliance" },
  bank: { icon: Landmark, label: "Banking" },
  food: { icon: Utensils, label: "Food" },
  car: { icon: Car, label: "Vehicles" },
  travel: { icon: Plane, label: "Travel" },
  health: { icon: HeartPulse, label: "Health" },
  agri: { icon: Leaf, label: "Agriculture" },
  energy: { icon: Zap, label: "Utilities" },
  events: { icon: Calendar, label: "Events" },
  support: { icon: Headphones, label: "Support" },
};

export const APP_ICON_KEYS = Object.keys(APP_ICONS);

/** Renders an app icon: a known Lucide key, a legacy emoji, or the first letter of the name. */
export const AppIcon: React.FC<{ icon?: string; name?: string; className?: string; size?: number }> = ({ icon, name, className = "", size = 16 }) => {
  const entry = icon ? APP_ICONS[icon] : undefined;
  if (entry) { const I = entry.icon; return <I className={`${className}`} {...({ style: { width: size, height: size } } as any)} />; }
  if (icon && !/^[a-z_]+$/.test(icon)) return <span className={className} style={{ fontSize: size * 0.9, lineHeight: 1 }}>{icon}</span>;
  return <span className={`font-bold ${className}`} style={{ fontSize: size * 0.85, lineHeight: 1 }}>{(name || "A").charAt(0).toUpperCase()}</span>;
};

/** Icon picker grid used by the create-app modal and settings. */
export const AppIconPicker: React.FC<{ value?: string; onChange: (key: string) => void; accent?: string }> = ({ value, onChange, accent = "#2563eb" }) => (
  <div className="grid grid-cols-8 gap-1.5">
    {APP_ICON_KEYS.map((k) => {
      const I = APP_ICONS[k].icon;
      const on = value === k;
      return (
        <button key={k} type="button" title={APP_ICONS[k].label} onClick={() => onChange(k)} className={`h-9 rounded-lg border flex items-center justify-center transition-all ${on ? "text-white border-transparent shadow-sm scale-105" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-800"}`} style={on ? { background: accent } : undefined}>
          <I className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);
