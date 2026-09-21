"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  updateProfile,
  User,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider, isBrowser, initAnalytics } from "@/lib/firebase/client";
import { isPlatformOwner, NOT_CONFIGURED_MESSAGE } from "@/lib/auth/config";
import { storageService } from "@/lib/storage/firestoreProvider";
import { AppDefinition } from "@/types/schema";

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // initial auth resolution
  isOwner: boolean;
  memberApps: AppDefinition[]; // apps the (non-owner) user belongs to
  authError: string | null;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshMemberApps: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    email: (u.email || "").toLowerCase(),
    name: u.displayName || (u.email || "").split("@")[0],
    photoURL: u.photoURL,
  };
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
      return "Sign-in window was closed before completing.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/email-already-in-use":
      return "An account already exists for this email. Please sign in.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/unauthorized-domain":
      return "This domain is not authorised in Firebase Auth. Add it under Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled in the Firebase console.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberApps, setMemberApps] = useState<AppDefinition[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);

  const isOwner = useMemo(() => isPlatformOwner(user?.email), [user?.email]);

  /**
   * Gate: owner always allowed; otherwise the email must be a member of ≥1 app.
   * Returns the member apps (empty for owner).
   */
  const verifyAccess = useCallback(async (u: AuthUser): Promise<{ ok: boolean; apps: AppDefinition[] }> => {
    if (isPlatformOwner(u.email)) return { ok: true, apps: [] };
    try {
      const apps = await storageService.getApps(u.email, false);
      return { ok: apps.length > 0, apps };
    } catch (err) {
      console.error("Membership check failed:", err);
      return { ok: false, apps: [] };
    }
  }, []);

  const finalizeSignIn = useCallback(
    async (fbUser: User): Promise<boolean> => {
      const u = toAuthUser(fbUser);
      const { ok, apps } = await verifyAccess(u);
      if (!ok) {
        await fbSignOut(getFirebaseAuth());
        setUser(null);
        setMemberApps([]);
        setAuthError(NOT_CONFIGURED_MESSAGE);
        return false;
      }
      setUser(u);
      setMemberApps(apps);
      setAuthError(null);
      storageService.upsertUser({
        email: u.email,
        name: u.name,
        photoURL: u.photoURL || undefined,
        lastLoginAt: new Date().toISOString(),
        appIds: apps.map((a) => a.id),
      });
      return true;
    },
    [verifyAccess]
  );

  useEffect(() => {
    if (!isBrowser()) {
      setLoading(false);
      return;
    }
    initAnalytics();
    const unsub = onAuthStateChanged(getFirebaseAuth(), async (fbUser) => {
      if (fbUser) {
        await finalizeSignIn(fbUser);
      } else {
        setUser(null);
        setMemberApps([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [finalizeSignIn]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(getFirebaseAuth(), googleProvider);
      return await finalizeSignIn(cred.user);
    } catch (err: any) {
      setAuthError(friendlyAuthError(err?.code || ""));
      return false;
    }
  }, [finalizeSignIn]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
        return await finalizeSignIn(cred.user);
      } catch (err: any) {
        setAuthError(friendlyAuthError(err?.code || ""));
        return false;
      }
    },
    [finalizeSignIn]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      setAuthError(null);
      const lower = email.trim().toLowerCase();
      // Pre-check membership before creating an account so unknown emails never get accounts.
      if (!isPlatformOwner(lower)) {
        try {
          const apps = await storageService.getApps(lower, false);
          if (apps.length === 0) {
            setAuthError(NOT_CONFIGURED_MESSAGE);
            return false;
          }
        } catch {
          setAuthError(NOT_CONFIGURED_MESSAGE);
          return false;
        }
      }
      try {
        const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), lower, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        return await finalizeSignIn(cred.user);
      } catch (err: any) {
        setAuthError(friendlyAuthError(err?.code || ""));
        return false;
      }
    },
    [finalizeSignIn]
  );

  const resetPassword = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      return true;
    } catch (err: any) {
      setAuthError(friendlyAuthError(err?.code || ""));
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
    setUser(null);
    setMemberApps([]);
  }, []);

  const refreshMemberApps = useCallback(async () => {
    if (!user || isPlatformOwner(user.email)) return;
    const apps = await storageService.getApps(user.email, false);
    setMemberApps(apps);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isOwner,
        memberApps,
        authError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        signOut,
        refreshMemberApps,
        clearError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
