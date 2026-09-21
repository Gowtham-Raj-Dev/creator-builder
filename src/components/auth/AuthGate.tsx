"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LoginScreen } from "./LoginScreen";
import { ShieldOff, Layers } from "lucide-react";

export const FullScreenLoader: React.FC<{ text?: string }> = ({ text = "Loading…" }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
    <div className="flex items-center gap-2.5 text-xs">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <span className="font-medium">{text}</span>
    </div>
  </div>
);

/**
 * Wraps a subtree that needs a signed-in user.
 * `ownerOnly` additionally requires the platform owner (builder access).
 */
export const AuthGate: React.FC<{ children: React.ReactNode; ownerOnly?: boolean }> = ({ children, ownerOnly }) => {
  const { user, loading, isOwner } = useAuth();

  if (loading) return <FullScreenLoader text="Checking your session…" />;
  if (!user) return <LoginScreen />;

  if (ownerOnly && !isOwner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
          <ShieldOff className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Builder access is restricted</h1>
        <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
          Only the platform owner can open the builder. You are signed in as <span className="font-semibold text-slate-700">{user.email}</span>.
          Open one of the apps shared with you instead.
        </p>
        <Link href="/app" className="mt-5 inline-flex items-center gap-2 text-xs bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
          <Layers className="w-3.5 h-3.5" /> Go to my apps
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
