"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { storageService } from "@/lib/storage/firestoreProvider";
import { NavItem, NotificationEntry } from "@/types/schema";
import { getLiveAppUrl, getBuilderUrl } from "@/lib/utils/routes";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { FullScreenLoader } from "@/components/auth/AuthGate";
import { Dropdown } from "@/components/ui/Dropdown";
import { AppIcon } from "@/components/ui/AppIcon";
import { Icon, REPORT_TYPE_ICON } from "@/components/ui/IconPicker";
import { buildAutoNavigation } from "@/lib/utils/menu";
import {
  Edit, Menu, X, Layers, Search, Bell, LogOut, Star, Clock, ChevronDown, ChevronRight,
  Eye, EyeOff, Home, Grid2X2, Shield, Command,
} from "lucide-react";

export const LiveAppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { app, loading, notFound, permissions, isDraftPreview, setDraftPreview, recentRecords, favorites, toggleFavorite } = useLiveApp();
  const { user, signOut, isOwner } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    const unsub = storageService.subscribeNotifications(user.email, setNotifications);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // theme accent → CSS var
  useEffect(() => {
    if (!app) return;
    document.documentElement.style.setProperty("--accent", app.settings?.accentColor || "#2563eb");
    const dark = app.settings?.theme === "dark" || (app.settings?.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [app]);

  const currentReport = searchParams.get("report");
  const currentForm = searchParams.get("form");
  const currentPage = searchParams.get("page");

  // Navigation model: custom (settings.navigation) or auto
  const navItems = useMemo<NavItem[]>(() => {
    if (!app) return [];
    if (app.settings?.navigation?.length) return app.settings.navigation;
    return buildAutoNavigation(app);
  }, [app]);

  // remember open/closed sections per app
  useEffect(() => {
    if (!app) return;
    try { const saved = JSON.parse(localStorage.getItem(`yb_navopen_${app.id}`) || "{}"); setOpenSections(saved); } catch { /* ignore */ }
  }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSection = (id: string, open: boolean) => setOpenSections((s) => { const next = { ...s, [id]: open }; try { if (app) localStorage.setItem(`yb_navopen_${app.id}`, JSON.stringify(next)); } catch { /* ignore */ } return next; });

  if (loading) return <FullScreenLoader text="Loading application…" />;

  if (!app) {
    if (!user) return <LoginScreen title="Sign in to open this app" subtitle="This application is private. Sign in with an email that has been given access." />;
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#f8fafc] p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4"><Layers className="w-7 h-7" /></div>
        <h1 className="text-lg font-bold text-slate-800">{notFound ? "Application not found or no access" : "Application unavailable"}</h1>
        <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">Either this app does not exist, or <span className="font-semibold">{user.email}</span> has not been added as a member. Ask the owner to share it with you.</p>
        <Link href="/app" className="mt-5 text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700">Go to my apps</Link>
      </div>
    );
  }

  const resolveNav = (item: NavItem): NavEntry | null => {
    if (item.hidden) return null;
    if (item.type === "page") {
      const p = app.pages.find((x) => x.id === item.refId);
      if (!p || !permissions.page(p.id)) return null;
      return { label: item.label || p.name, href: getLiveAppUrl(app.linkName, { page: p.linkName }), icon: <Icon name={item.icon || p.icon} fallback="dashboard" />, active: currentPage === p.linkName, key: `page:${p.id}` };
    }
    if (item.type === "form") {
      const f = app.forms.find((x) => x.id === item.refId);
      if (!f || !permissions.form(f.id).view) return null;
      const rep = app.reports.find((r) => r.sourceFormId === f.id && r.reportType !== "ledger");
      const href = rep ? getLiveAppUrl(app.linkName, { report: rep.linkName }) : getLiveAppUrl(app.linkName, { form: f.linkName });
      const active = rep ? currentReport === rep.linkName : currentForm === f.linkName && !currentReport;
      return { label: item.label || f.name, href, icon: <Icon name={item.icon || f.icon} fallback="file" />, active: active || (currentForm === f.linkName && !currentReport), key: `form:${f.id}` };
    }
    if (item.type === "report") {
      const r = app.reports.find((x) => x.id === item.refId);
      if (!r || !permissions.report(r.id).view) return null;
      return { label: item.label || r.name, href: getLiveAppUrl(app.linkName, { report: r.linkName }), icon: <Icon name={item.icon || r.icon} fallback={REPORT_TYPE_ICON[r.reportType || "table"] || "table"} />, active: currentReport === r.linkName, key: `report:${r.id}` };
    }
    if (item.type === "link" && item.url) return { label: item.label || item.url, href: item.url, icon: <Icon name={item.icon} fallback="link" />, active: false, key: `link:${item.id}` };
    return null;
  };

  const unread = notifications.filter((n) => !n.read).length;
  const accent = app.settings?.accentColor || "#2563eb";
  const favItems = favorites.map((k) => { const [t, id] = k.split(":"); return resolveNav({ id: k, type: t as any, refId: id }); }).filter(Boolean);

  return (
    <div className="h-screen max-h-screen overflow-hidden flex flex-col bg-[#f8fafc]" style={{ ["--accent" as any]: accent }}>
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200/90 px-4 md:px-5 flex items-center justify-between shrink-0 z-30 shadow-2xs gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100">{mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="hidden md:inline-flex p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100" title="Toggle sidebar"><Menu className="w-4 h-4" /></button>
          <Link href={getLiveAppUrl(app.linkName)} className="flex items-center gap-2.5 min-w-0">
            {app.settings?.logo ? <img src={app.settings.logo} alt="" className="w-7 h-7 rounded-md object-cover" /> : <div className="w-7 h-7 rounded-md flex items-center justify-center text-white shadow-2xs" style={{ background: accent }}><AppIcon icon={app.settings?.icon} name={app.name} size={15} /></div>}
            <h1 className="text-sm font-bold text-slate-900 leading-tight truncate">{app.name}</h1>
          </Link>
          {isOwner && (
            <button type="button" onClick={() => setDraftPreview(!isDraftPreview)} className={`hidden lg:flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDraftPreview ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} title="Toggle draft / published preview">
              {isDraftPreview ? <><EyeOff className="w-3 h-3" /> Draft preview</> : <><Eye className="w-3 h-3" /> Published v{app.publishedVersion || 0}</>}
            </button>
          )}
          {!isOwner && permissions.roleName && <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"><Shield className="w-3 h-3" />{permissions.roleName}</span>}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {app.settings?.showGlobalSearch !== false && (
            <button type="button" onClick={() => setSearchOpen(true)} className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg w-52">
              <Search className="w-3.5 h-3.5" /><span className="flex-1 text-left">Search records…</span><kbd className="text-[10px] font-mono bg-white border border-slate-200 rounded px-1">Ctrl K</kbd>
            </button>
          )}
          {user && (
            <Dropdown
              align="right"
              width="w-80"
              trigger={<button type="button" className="relative p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"><Bell className="w-4 h-4" />{unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button>}
              items={notifications.length === 0 ? [{ id: "none", label: "No notifications", disabled: true }] : notifications.slice(0, 12).map((n) => ({ id: n.id, label: n.title, description: `${n.body.slice(0, 80)} · ${new Date(n.createdAt).toLocaleString()}`, icon: <Bell className={`w-3.5 h-3.5 ${n.read ? "" : "text-blue-600"}`} />, onClick: () => { storageService.markNotificationRead(n.id); if (n.link) router.push(n.link); } }))}
            />
          )}
          {permissions.canEditBuilder && (
            <Link href={getBuilderUrl(app.linkName)} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-3xs hover:border-slate-400">
              <Edit className="w-3.5 h-3.5 text-blue-600" /><span>Edit in Builder</span>
            </Link>
          )}
          {user ? (
            <Dropdown
              align="right"
              trigger={<button type="button" className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100">{user.photoURL ? <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center">{user.name.charAt(0).toUpperCase()}</div>}<ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" /></button>}
              items={[
                { id: "who", label: user.name, description: `${user.email}${permissions.roleName ? ` · ${permissions.roleName}` : isOwner ? " · Owner" : ""}`, disabled: true },
                { id: "d", label: "", divider: true },
                { id: "apps", label: "My apps", icon: <Grid2X2 className="w-3.5 h-3.5" />, onClick: () => router.push("/app") },
                ...(isOwner ? [{ id: "builder", label: "Open builder", icon: <Edit className="w-3.5 h-3.5" />, onClick: () => router.push(getBuilderUrl(app.linkName)) }] : []),
                { id: "d2", label: "", divider: true },
                { id: "out", label: "Sign out", icon: <LogOut className="w-3.5 h-3.5" />, danger: true, onClick: async () => { await signOut(); router.push("/login"); } },
              ]}
            />
          ) : (
            <Link href="/login" className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ background: accent }}>Sign in</Link>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Sidebar */}
        <aside className={`fixed md:static inset-y-14 md:inset-y-0 left-0 z-20 bg-white border-r border-slate-200/90 h-full flex flex-col justify-between shrink-0 min-h-0 transition-all duration-200 ease-in-out md:translate-x-0 shadow-xs md:shadow-none ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-16" : "w-64"}`}>
          <div className="p-2.5 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
            <NavLink collapsed={collapsed} favorites={favorites} toggleFavorite={toggleFavorite} onNavigate={() => setMobileMenuOpen(false)} item={{ label: "Home", href: getLiveAppUrl(app.linkName), icon: <Home className="w-4 h-4" />, active: !currentForm && !currentReport && !currentPage, key: "home" }} />
            {favItems.length > 0 && (
              <div>
                {!collapsed && <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1"><Star className="w-3 h-3" /> Favourites</div>}
                <nav className="space-y-0.5">{favItems.map((it) => <NavLink key={`fav-${it!.key}`} collapsed={collapsed} favorites={favorites} toggleFavorite={toggleFavorite} onNavigate={() => setMobileMenuOpen(false)} item={it!} />)}</nav>
              </div>
            )}
            {navItems.map((section) => {
              if (section.type !== "section") { const it = resolveNav(section); return it ? <NavLink key={section.id} collapsed={collapsed} favorites={favorites} toggleFavorite={toggleFavorite} onNavigate={() => setMobileMenuOpen(false)} item={it} /> : null; }
              const children = (section.children || []).map(resolveNav).filter(Boolean);
              if (children.length === 0) return null;
              const isOpen = openSections[section.id] !== false;
              return (
                <div key={section.id}>
                  {!collapsed && (
                    <button type="button" onClick={() => toggleSection(section.id, !isOpen)} className="w-full flex items-center justify-between px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      <span className="flex items-center gap-1.5">{section.icon && <Icon name={section.icon} className="w-3 h-3" />}{section.label}</span><ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                  )}
                  {(isOpen || collapsed) && <nav className="space-y-0.5">{children.map((it) => <NavLink key={it!.key} collapsed={collapsed} favorites={favorites} toggleFavorite={toggleFavorite} onNavigate={() => setMobileMenuOpen(false)} item={it!} />)}</nav>}
                </div>
              );
            })}
            {!collapsed && app.settings?.showRecentInSidebar === true && recentRecords.length > 0 && (
              <div>
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Recent</div>
                <nav className="space-y-0.5">
                  {recentRecords.slice(0, 5).map((r) => { const f = app.forms.find((x) => x.id === r.formId); if (!f) return null; return <Link key={r.recordId} href={getLiveAppUrl(app.linkName, { form: f.linkName, recordId: r.recordId })} className="block px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg break-words leading-snug"><span className="text-slate-400">{f.name} · </span>{r.title}</Link>; })}
                </nav>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50/50 shrink-0 flex items-center justify-between">
              <span>YourBuilder</span>
              {app.publishedVersion && <span className="font-mono">v{app.publishedVersion}</span>}
            </div>
          )}
        </aside>

        <main className={`flex-1 h-full overflow-y-auto min-h-0 min-w-0 bg-[#f8fafc] ${app.settings?.compactMode ? "p-3 md:p-4" : "p-4 md:p-6"}`}>{children}</main>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
};

interface NavEntry { label: string; href: string; icon: React.ReactNode; active: boolean; key: string }

const NavLink: React.FC<{ item: NavEntry; collapsed: boolean; favorites: string[]; toggleFavorite: (k: string) => void; onNavigate: () => void; depth?: number }> = ({ item, collapsed, favorites, toggleFavorite, onNavigate, depth = 0 }) => (
  <div className="group flex items-center min-w-0">
    <Link href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined} className={`flex-1 min-w-0 flex items-center gap-2.5 rounded-lg text-xs font-medium transition-all ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"} ${item.active ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`} style={{ paddingLeft: collapsed ? undefined : 12 + depth * 12 }}>
      <span className={`shrink-0 ${item.active ? "text-[var(--accent)]" : "text-slate-400 group-hover:text-slate-600"}`}>{item.icon}</span>
      {!collapsed && <span className="min-w-0 break-words leading-snug">{item.label}</span>}
    </Link>
    {!collapsed && item.key !== "home" && <button type="button" onClick={() => toggleFavorite(item.key)} className={`p-1 rounded opacity-0 group-hover:opacity-100 ${favorites.includes(item.key) ? "text-amber-500 opacity-100" : "text-slate-300 hover:text-amber-500"}`}><Star className={`w-3 h-3 ${favorites.includes(item.key) ? "fill-amber-400" : ""}`} /></button>}
  </div>
);

/** Ctrl+K search across all visible forms. */
const GlobalSearch: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { app, recordsMap, getDisplayValue, permissions } = useLiveApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!app || q.trim().length < 2) return [];
    const needle = q.toLowerCase();
    const out: Array<{ formName: string; formLink: string; recordId: string; title: string; match: string }> = [];
    for (const form of app.forms) {
      if (!permissions.form(form.id).view) continue;
      const titleId = form.titleFieldId || form.fields.find((f) => f.type !== "section")?.id;
      const fields = form.fields.filter((f) => ["text", "email", "phone", "autonumber", "dropdown", "lookup", "barcode", "textarea", "number", "currency"].includes(f.type)).slice(0, 8);
      for (const rec of recordsMap[form.id] || []) {
        if (!permissions.canSeeRecord(form.id, rec)) continue;
        for (const f of fields) {
          const v = getDisplayValue(form, rec, f.id);
          if (v && v.toLowerCase().includes(needle)) { out.push({ formName: form.name, formLink: form.linkName, recordId: rec.id, title: titleId ? getDisplayValue(form, rec, titleId) || rec.id : rec.id, match: `${f.label}: ${v}` }); break; }
        }
        if (out.length >= 30) break;
      }
    }
    return out;
  }, [q, app, recordsMap, getDisplayValue, permissions]);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-[12vh] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100"><Command className="w-4 h-4 text-slate-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search across all records…" className="flex-1 text-sm focus:outline-none" onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && results[0] && app) { router.push(getLiveAppUrl(app.linkName, { form: results[0].formLink, recordId: results[0].recordId })); onClose(); } }} /><kbd className="text-[10px] text-slate-400 border rounded px-1">Esc</kbd></div>
        <div className="max-h-80 overflow-y-auto">
          {q.trim().length < 2 ? <div className="p-6 text-center text-xs text-slate-400">Type at least 2 characters.</div> : results.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">No matches.</div> : results.map((r) => (
            <button key={r.recordId} type="button" onClick={() => { if (app) router.push(getLiveAppUrl(app.linkName, { form: r.formLink, recordId: r.recordId })); onClose(); }} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-slate-50 flex items-center justify-between gap-3">
              <span className="min-w-0"><span className="block text-xs font-semibold text-slate-900 truncate">{r.title}</span><span className="block text-[11px] text-slate-500 truncate">{r.match}</span></span>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{r.formName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
