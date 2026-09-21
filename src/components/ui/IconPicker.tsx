"use client";

import React, { useState } from "react";
import {
  Table, LayoutGrid, Kanban, Calendar, Clock, ListTree, Grid3X3, Layers, FileText, LayoutDashboard, Home, Package, Boxes, Warehouse, ShoppingCart, Receipt, Wallet,
  Users, User, Building2, MapPin, Map, Ruler, Tag, Tags, Truck, Factory, ClipboardList, ClipboardCheck, BarChart3, PieChart, TrendingUp, Calculator, Banknote, CreditCard,
  Landmark, Store, Briefcase, Folder, FolderOpen, Star, Heart, Bell, Settings, Wrench, ShieldCheck, Lock, Key, Mail, Phone, Globe, Link as LinkIcon, Image as ImageIcon,
  Camera, Printer, Download, Upload, Database, Server, Cpu, Zap, Flame, Leaf, Sun, Moon, Droplets, Stethoscope, HeartPulse, Pill, GraduationCap, BookOpen, Bookmark,
  Utensils, Coffee, Candy, Car, Bike, Plane, Ship, Bus, Hammer, Paintbrush, Scissors, Shirt, Gem, Gift, Trophy, Flag, Target, Compass, Navigation, Timer, Hourglass,
  CheckCircle2, AlertTriangle, Info, HelpCircle, MessageSquare, Send, Inbox, Archive, Trash2, RotateCcw, RefreshCw, Filter, Search, Eye, Sigma, Percent, Hash, Circle, Square,
  ChartGantt, Funnel, Network, ListChecks, CalendarRange, Rows3, Sparkles,
  type LucideIcon,
} from "lucide-react";

/** Name → Lucide component. Keys are stored on forms/reports/pages/menu sections. */
export const ICONS: Record<string, LucideIcon> = {
  table: Table, grid: LayoutGrid, kanban: Kanban, calendar: Calendar, clock: Clock, list: ListTree, pivot: Grid3X3, layers: Layers, file: FileText, dashboard: LayoutDashboard, home: Home,
  package: Package, boxes: Boxes, warehouse: Warehouse, cart: ShoppingCart, receipt: Receipt, wallet: Wallet, users: Users, user: User, building: Building2, pin: MapPin, map: Map, ruler: Ruler,
  tag: Tag, tags: Tags, truck: Truck, factory: Factory, clipboard: ClipboardList, checklist: ClipboardCheck, chart: BarChart3, pie: PieChart, trend: TrendingUp, calculator: Calculator,
  banknote: Banknote, card: CreditCard, bank: Landmark, store: Store, briefcase: Briefcase, folder: Folder, folderopen: FolderOpen, star: Star, heart: Heart, bell: Bell, settings: Settings,
  wrench: Wrench, shield: ShieldCheck, lock: Lock, key: Key, mail: Mail, phone: Phone, globe: Globe, link: LinkIcon, image: ImageIcon, camera: Camera, printer: Printer, download: Download,
  upload: Upload, database: Database, server: Server, cpu: Cpu, zap: Zap, flame: Flame, leaf: Leaf, sun: Sun, moon: Moon, droplets: Droplets, stethoscope: Stethoscope, health: HeartPulse,
  pill: Pill, education: GraduationCap, book: BookOpen, bookmark: Bookmark, food: Utensils, coffee: Coffee, candy: Candy, car: Car, bike: Bike, plane: Plane, ship: Ship, bus: Bus,
  hammer: Hammer, paint: Paintbrush, scissors: Scissors, shirt: Shirt, gem: Gem, gift: Gift, trophy: Trophy, flag: Flag, target: Target, compass: Compass, navigation: Navigation,
  timer: Timer, hourglass: Hourglass, check: CheckCircle2, warning: AlertTriangle, info: Info, help: HelpCircle, message: MessageSquare, send: Send, inbox: Inbox, archive: Archive,
  trash: Trash2, undo: RotateCcw, refresh: RefreshCw, filter: Filter, search: Search, eye: Eye, sigma: Sigma, percent: Percent, hash: Hash, circle: Circle, square: Square,
  gantt: ChartGantt, funnel: Funnel, tree: Network, tasks: ListChecks, calendarrange: CalendarRange, rows: Rows3, sparkles: Sparkles,
};

export const ICON_KEYS = Object.keys(ICONS);

/** Default icon key per report type. */
export const REPORT_TYPE_ICON: Record<string, string> = {
  table: "table", grid: "grid", list: "rows", tree: "tree", checklist: "checklist", kanban: "kanban", funnel: "funnel", calendar: "calendar", scheduler: "calendarrange",
  gantt: "gantt", timeline: "clock", summary: "list", pivot: "pivot", chart: "chart", ranking: "trophy", aging: "hourglass", ledger: "layers",
};

export const Icon: React.FC<{ name?: string; fallback?: string; className?: string }> = ({ name, fallback = "circle", className = "w-4 h-4" }) => {
  const C = (name && ICONS[name]) || ICONS[fallback] || Circle;
  return <C className={className} />;
};

export const IconPicker: React.FC<{ value?: string; onChange: (key: string | undefined) => void; label?: string; accent?: string; compact?: boolean }> = ({ value, onChange, label, accent = "#2563eb", compact }) => {
  const [q, setQ] = useState("");
  const keys = ICON_KEYS.filter((k) => k.includes(q.toLowerCase()));
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-slate-700">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: accent }}><Icon name={value} fallback="file" /></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons…" className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white" />
        {value && <button type="button" onClick={() => onChange(undefined)} className="text-[11px] text-slate-500 hover:text-rose-600">Default</button>}
      </div>
      <div className={`grid gap-1 ${compact ? "grid-cols-8 max-h-28" : "grid-cols-10 max-h-40"} overflow-y-auto p-1 rounded-lg border border-slate-200 bg-slate-50`}>
        {keys.map((k) => { const C = ICONS[k]; const on = value === k; return <button key={k} type="button" title={k} onClick={() => onChange(k)} className={`h-8 rounded-md flex items-center justify-center border transition-all ${on ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-800"}`} style={on ? { background: accent } : undefined}><C className="w-4 h-4" /></button>; })}
        {keys.length === 0 && <div className="col-span-full text-[11px] text-slate-400 text-center py-3">No icons match</div>}
      </div>
    </div>
  );
};
