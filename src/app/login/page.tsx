"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { FullScreenLoader } from "@/components/auth/AuthGate";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, isOwner } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(isOwner ? "/builder" : "/app");
  }, [loading, user, isOwner, router]);

  if (loading) return <FullScreenLoader text="Checking your session…" />;
  return <LoginScreen />;
}
