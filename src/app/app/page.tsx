"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LiveAppProvider, useLiveApp } from "@/context/LiveAppContext";
import { useAuth } from "@/context/AuthContext";
import { LiveAppLayout } from "@/components/runtime/LiveAppLayout";
import { LiveAppRootView } from "@/components/runtime/LiveAppRootView";
import { FormModuleView, NewRecordView, EditRecordView, LiveReportView, LiveCustomPageWrapper } from "@/components/runtime/FormModuleView";
import { AuthGate, FullScreenLoader } from "@/components/auth/AuthGate";
import { storageService } from "@/lib/storage/firestoreProvider";
import { AppDefinition } from "@/types/schema";
import { getLiveAppUrl } from "@/lib/utils/routes";
import { AppIcon } from "@/components/ui/AppIcon";
import { Layers, ArrowRight, LogOut, Edit, Grid2X2 } from "lucide-react";

function LiveAppContent() {
  const searchParams = useSearchParams();
  const { app } = useLiveApp();
  const formParam = searchParams.get("form");
  const reportParam = searchParams.get("report");
  const pageParam = searchParams.get("page");
  const actionParam = searchParams.get("action");
  const recordParam = searchParams.get("record");
  const view = searchParams.get("view") || undefined;

  if (!app) return null;
  if (reportParam) return <LiveReportView reportLinkName={reportParam} view={view} />;
  if (pageParam) return <LiveCustomPageWrapper pageLinkName={pageParam} />;
  if (formParam) {
    if (actionParam === "new") return <NewRecordView formLinkName={formParam} />;
    if (recordParam) return <EditRecordView formLinkName={formParam} recordId={recordParam} />;
    return <FormModuleView formLinkName={formParam} view={actionParam === "trash" ? "trash" : view} />;
  }
  return <LiveAppRootView />;
}

/** "My apps" list for signed-in users when no app is selected. */
function MyApps() {
  const { user, isOwner, memberApps, signOut, loading } = useAuth();
  const router = useRouter();
  const [apps, setApps] = useState<AppDefinition[]>(memberApps);
  const [busy, setBusy] = useState(isOwner);

  useEffect(() => {
    if (!user) return;
    if (isOwner) { storageService.getApps(user.email, true).then((a) => { setApps(a); setBusy(false); }); }
    else setApps(memberApps);
  }, [user, isOwner, memberApps]);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Layers className="w-4.5 h-4.5" /></div><span className="text-sm font-bold text-slate-900">YourBuilder</span></div>
        <div className="flex items-center gap-3 text-xs">
          {isOwner && <Link href="/builder" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-medium text-slate-700"><Edit className="w-3.5 h-3.5 text-blue-600" /> Builder</Link>}
          <span className="text-slate-500 hidden sm:inline">{user?.email}</span>
          <button onClick={async () => { await signOut(); router.push("/login"); }} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Grid2X2 className="w-6 h-6 text-blue-600" /> My applications</h1>
          <p className="text-xs text-slate-500 mt-1">Applications shared with <span className="font-semibold">{user?.email}</span>.</p>
        </div>
        {busy ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading…</div>
        ) : apps.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border-2 border-dashed border-slate-300 text-center space-y-2">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <h2 className="text-sm font-semibold text-slate-800">No applications yet</h2>
            <p className="text-xs text-slate-500">{isOwner ? "Create your first app in the builder." : "Ask the owner to add you to an application."}</p>
            {isOwner && <Link href="/builder" className="inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg mt-2">Open builder <ArrowRight className="w-3.5 h-3.5" /></Link>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((a) => {
              const member = a.members.find((m) => m.email === user?.email);
              const role = member ? a.roles.find((r) => r.id === member.roleId) : undefined;
              return (
                <Link key={a.id} href={getLiveAppUrl(a.linkName)} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl text-white flex items-center justify-center text-lg font-bold shadow-2xs" style={{ background: a.settings?.accentColor || "#2563eb" }}><AppIcon icon={a.settings?.icon} name={a.name} size={20} /></div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 mt-3">{a.name}</h2>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 min-h-[32px]">{a.description || "Business application"}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100">
                    <span>{a.forms.length} modules</span>
                    <span className="font-semibold text-slate-600">{isOwner ? "Owner" : role?.name || "Member"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {isOwner && apps.length > 0 && <div className="text-center"><Link href="/builder" className="text-xs text-blue-600 font-semibold hover:underline">Manage apps in the builder →</Link></div>}
      </main>
    </div>
  );
}

function Inner() {
  const searchParams = useSearchParams();
  const appLinkName = searchParams.get("app") || "";
  if (!appLinkName) return <AuthGate><MyApps /></AuthGate>;
  return (
    <LiveAppProvider appLinkName={appLinkName}>
      <LiveAppLayout>
        <LiveAppContent />
      </LiveAppLayout>
    </LiveAppProvider>
  );
}

export default function UniversalLiveAppPage() {
  return (
    <Suspense fallback={<FullScreenLoader text="Loading application…" />}>
      <Inner />
    </Suspense>
  );
}
