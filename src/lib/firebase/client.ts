import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Firebase web config is public by design; security is enforced by Firestore / Storage rules.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCm5Fa6WQNWkQVmP1UncCHKPs5TZ6zkjzY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "creator-builder-485ad.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "creator-builder-485ad",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "creator-builder-485ad.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "458882844639",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:458882844639:web:6b67b5f1148b98a8bc266a",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-N99D2LDBMK",
};

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: FirebaseStorage | null = null;

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

/**
 * Firestore instance. Uses the default in-memory cache: real-time listeners keep every open tab
 * in sync without the multi-tab "primary lease" elections that the IndexedDB cache needs
 * (those log "Failed to obtain primary lease" warnings whenever builder + live app tabs are open).
 * Set NEXT_PUBLIC_FIRESTORE_PERSISTENCE=1 to opt into offline persistence.
 */
export function getDb(): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  const wantPersistence = process.env.NEXT_PUBLIC_FIRESTORE_PERSISTENCE === "1";
  try {
    _db = isBrowser() && wantPersistence
      ? initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        })
      : getFirestore(app);
  } catch {
    _db = getFirestore(app);
  }
  return _db;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (_storage) return _storage;
  _storage = getStorage(getFirebaseApp());
  return _storage;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/** Firestore rejects `undefined` — strip it (and functions) deeply before writing. */
export function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

// Analytics is optional and browser-only; load lazily so SSR/static export never touches it.
export async function initAnalytics(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(getFirebaseApp());
  } catch {
    /* analytics is best-effort */
  }
}
