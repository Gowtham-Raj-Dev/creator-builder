"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { FullScreenLoader } from "@/components/auth/AuthGate";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, canBuild } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(canBuild ? "/builder" : "/app");
  }, [loading, user, canBuild, router]);

  if (loading) return <FullScreenLoader text="Checking your session…" />;
  return <LoginScreen />;
}
