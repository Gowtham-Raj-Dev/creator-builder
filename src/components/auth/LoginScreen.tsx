"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Layers, Mail, Lock, User, ShieldAlert, ArrowRight, Loader2, Sparkles, Database, Workflow, LayoutDashboard } from "lucide-react";

type Mode = "signin" | "signup" | "reset";

export const LoginScreen: React.FC<{ title?: string; subtitle?: string }> = ({ title, subtitle }) => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, authError, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleGoogle = async () => {
    setBusy(true);
    setInfo(null);
    await signInWithGoogle();
    setBusy(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setInfo(null);
    if (mode === "signin") await signInWithEmail(email, password);
    else if (mode === "signup") await signUpWithEmail(email, password, name);
    else {
      const ok = await resetPassword(email);
      if (ok) setInfo("Password reset email sent. Check your inbox.");
    }
    setBusy(false);
  };

  const isNotConfigured = authError?.toLowerCase().includes("not configured");

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left brand panel */}
      <div className="hidden lg:flex w-[46%] relative overflow-hidden bg-slate-950 text-white flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-60 pointer-events-none" style={{
          background:
            "radial-gradient(60% 50% at 20% 20%, rgba(37,99,235,.45) 0%, transparent 60%), radial-gradient(50% 50% at 90% 80%, rgba(124,58,237,.4) 0%, transparent 60%), radial-gradient(40% 40% at 70% 20%, rgba(16,185,129,.25) 0%, transparent 60%)",
        }} />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 backdrop-blur flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">YourBuilder</div>
            <div className="text-[11px] text-white/60">Low-code application platform</div>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight leading-tight">
              Build business apps<br />without writing a backend.
            </h1>
            <p className="text-white/65 text-sm mt-4 max-w-md leading-relaxed">
              Forms, lookups, subforms, formulas, workflows, reports and dashboards — designed in the builder, stored in Firestore, shared with your team by role.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { icon: <Database className="w-4 h-4" />, t: "Realtime Firestore data" },
              { icon: <Workflow className="w-4 h-4" />, t: "Sandboxed workflow scripts" },
              { icon: <LayoutDashboard className="w-4 h-4" />, t: "Reports, kanban, pivots" },
              { icon: <Sparkles className="w-4 h-4" />, t: "Role-based sharing" },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-2.5 text-xs text-white/80 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                <span className="text-blue-300">{f.icon}</span>
                {f.t}
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[11px] text-white/40">© {new Date().getFullYear()} YourBuilder · Secured by Firebase Authentication</div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Layers className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-slate-900">YourBuilder</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {title || (mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Welcome back")}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {subtitle || (mode === "signup"
                  ? "Only emails configured by the administrator can register."
                  : mode === "reset"
                  ? "We'll email you a link to reset your password."
                  : "Sign in to access your applications.")}
              </p>
            </div>

            {authError && (
              <div className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs ${isNotConfigured ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${isNotConfigured ? "text-amber-600" : "text-rose-600"}`} />
                <div className="space-y-0.5">
                  <div className="font-semibold">{isNotConfigured ? "Email not configured" : "Sign-in error"}</div>
                  <div className="leading-relaxed">{authError}</div>
                </div>
              </div>
            )}
            {info && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{info}</div>}

            {mode !== "reset" && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 transition-all shadow-2xs disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  or with email
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === "signup" && (
                <Field icon={<User className="w-4 h-4" />} type="text" value={name} onChange={setName} placeholder="Full name" />
              )}
              <Field icon={<Mail className="w-4 h-4" />} type="email" value={email} onChange={(v) => { setEmail(v); if (authError) clearError(); }} placeholder="you@company.com" required />
              {mode !== "reset" && (
                <Field icon={<Lock className="w-4 h-4" />} type="password" value={password} onChange={setPassword} placeholder="Password" required minLength={6} />
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all shadow-xs disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
              </button>
            </form>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              {mode === "signin" ? (
                <>
                  <button className="hover:text-blue-600" onClick={() => { setMode("signup"); clearError(); }}>Create account</button>
                  <button className="hover:text-blue-600" onClick={() => { setMode("reset"); clearError(); }}>Forgot password?</button>
                </>
              ) : (
                <button className="hover:text-blue-600" onClick={() => { setMode("signin"); clearError(); }}>← Back to sign in</button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-center mt-6 leading-relaxed">
            Access is restricted. If your email is not configured, ask the app owner to add you as a member with a designation.
          </p>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
  minLength?: number;
}> = ({ icon, type, value, onChange, placeholder, required, minLength }) => (
  <div className="relative">
    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
    <input
      type={type}
      value={value}
      required={required}
      minLength={minLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-slate-400"
    />
  </div>
);
