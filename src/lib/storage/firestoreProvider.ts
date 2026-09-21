import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  AppDefinition,
  AppVersion,
  AuditLogEntry,
  CommentEntry,
  NotificationEntry,
  PlatformUser,
  RecordDefinition,
  WorkflowLogEntry,
  CURRENT_APP_SCHEMA_VERSION,
} from "@/types/schema";
import { DataProvider, RecordQueryOptions, Unsubscribe } from "./dataProvider";
import { getDb, getFirebaseStorage, sanitizeForFirestore, isBrowser } from "@/lib/firebase/client";
import { generateId } from "@/lib/utils/idGenerator";
import { migrateApp } from "./migrations";

const APPS = "apps";

function nowIso() {
  return new Date().toISOString();
}

/** Ensure legacy / partial app docs always have the arrays the UI expects. */
export function normalizeApp(raw: any): AppDefinition {
  const app: AppDefinition = {
    id: raw.id,
    name: raw.name || "Untitled App",
    linkName: raw.linkName || raw.id,
    description: raw.description || "",
    settings: raw.settings || { theme: "light", accentColor: "#2563eb" },
    ownerEmail: raw.ownerEmail,
    roles: raw.roles || [],
    members: raw.members || [],
    memberEmails: raw.memberEmails || [],
    sharing: raw.sharing || { mode: "private" },
    forms: raw.forms || [],
    reports: raw.reports || [],
    pages: raw.pages || [],
    workflows: raw.workflows || [],
    relationships: raw.relationships || [],
    schemaVersion: raw.schemaVersion || 1,
    publishedVersion: raw.publishedVersion,
    publishedAt: raw.publishedAt,
    isTemplate: raw.isTemplate,
    templateCategory: raw.templateCategory,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  };
  return migrateApp(app);
}

export class FirestoreDataProvider implements DataProvider {
  // ── Apps ───────────────────────────────────────────────────────────────────

  async getApps(forEmail?: string | null, isOwner?: boolean): Promise<AppDefinition[]> {
    if (!isBrowser()) return [];
    const db = getDb();
    let snap;
    if (isOwner) {
      snap = await getDocs(collection(db, APPS));
    } else if (forEmail) {
      snap = await getDocs(
        query(collection(db, APPS), where("memberEmails", "array-contains", forEmail.toLowerCase()))
      );
    } else {
      return [];
    }
    return snap.docs
      .map((d) => normalizeApp({ id: d.id, ...d.data() }))
      .filter((a) => !a.isTemplate)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async getApp(
    idOrLinkName: string,
    ctx?: { email?: string | null; isOwner?: boolean }
  ): Promise<AppDefinition | null> {
    if (!isBrowser() || !idOrLinkName) return null;
    const db = getDb();
    const clean = idOrLinkName.trim();

    // 1. Direct document id
    if (clean.startsWith("app_")) {
      try {
        const d = await getDoc(doc(db, APPS, clean));
        if (d.exists()) return normalizeApp({ id: d.id, ...d.data() });
      } catch {
        /* fall through to query */
      }
    }

    const link = clean.toLowerCase();

    // 2. Owner → query by linkName
    if (ctx?.isOwner) {
      const snap = await getDocs(query(collection(db, APPS), where("linkName", "==", link)));
      if (!snap.empty) {
        const d = snap.docs[0];
        return normalizeApp({ id: d.id, ...d.data() });
      }
      return null;
    }

    // 3. Member → their apps, filter client side (keeps security rules simple)
    if (ctx?.email) {
      const snap = await getDocs(
        query(collection(db, APPS), where("memberEmails", "array-contains", ctx.email.toLowerCase()))
      );
      const found = snap.docs.find((d) => (d.data().linkName || "").toLowerCase() === link);
      if (found) return normalizeApp({ id: found.id, ...found.data() });
    }

    // 4. Public link
    try {
      const snap = await getDocs(
        query(
          collection(db, APPS),
          where("linkName", "==", link),
          where("sharing.mode", "==", "public_view")
        )
      );
      if (!snap.empty) {
        const d = snap.docs[0];
        return normalizeApp({ id: d.id, ...d.data() });
      }
    } catch {
      /* permission denied → not public */
    }
    return null;
  }

  subscribeApp(appId: string, cb: (app: AppDefinition | null) => void): Unsubscribe {
    if (!isBrowser()) return () => {};
    return onSnapshot(
      doc(getDb(), APPS, appId),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // ignore local echo
        cb(snap.exists() ? normalizeApp({ id: snap.id, ...snap.data() }) : null);
      },
      (err) => console.error("subscribeApp error:", err)
    );
  }

  async saveApp(app: AppDefinition): Promise<void> {
    if (!isBrowser()) return;
    const payload = sanitizeForFirestore({
      ...app,
      memberEmails: Array.from(
        new Set((app.members || []).filter((m) => m.status !== "disabled").map((m) => m.email.toLowerCase()))
      ),
      schemaVersion: CURRENT_APP_SCHEMA_VERSION,
      updatedAt: nowIso(),
    });
    await setDoc(doc(getDb(), APPS, app.id), payload);
  }

  async deleteApp(id: string): Promise<void> {
    if (!isBrowser()) return;
    const db = getDb();
    // Best-effort cleanup of sub-collections (client SDK has no recursive delete)
    for (const sub of ["records", "versions", "audit", "workflowLogs", "comments"]) {
      try {
        const snap = await getDocs(collection(db, APPS, id, sub));
        const chunks = chunk(snap.docs, 400);
        for (const c of chunks) {
          const batch = writeBatch(db);
          c.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (err) {
        console.warn(`Cleanup of ${sub} failed`, err);
      }
    }
    await deleteDoc(doc(db, APPS, id));
  }

  // ── Records ────────────────────────────────────────────────────────────────

  private recordsCol(appId: string) {
    return collection(getDb(), APPS, appId, "records");
  }

  private applyDeletedFilter(records: RecordDefinition[], opts?: RecordQueryOptions) {
    if (opts?.onlyDeleted) return records.filter((r) => r.deleted);
    if (opts?.includeDeleted) return records;
    return records.filter((r) => !r.deleted);
  }

  async getRecords(appId: string, formId: string, opts?: RecordQueryOptions): Promise<RecordDefinition[]> {
    if (!isBrowser()) return [];
    const snap = await getDocs(query(this.recordsCol(appId), where("formId", "==", formId)));
    const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecordDefinition);
    return this.applyDeletedFilter(recs, opts).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  subscribeRecords(
    appId: string,
    formId: string,
    cb: (records: RecordDefinition[]) => void,
    opts?: RecordQueryOptions
  ): Unsubscribe {
    if (!isBrowser()) return () => {};
    return onSnapshot(
      query(this.recordsCol(appId), where("formId", "==", formId)),
      (snap) => {
        const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecordDefinition);
        cb(
          this.applyDeletedFilter(recs, opts).sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
          )
        );
      },
      (err) => console.error("subscribeRecords error:", err)
    );
  }

  async getRecord(appId: string, formId: string, recordId: string): Promise<RecordDefinition | null> {
    if (!isBrowser()) return null;
    const d = await getDoc(doc(this.recordsCol(appId), recordId));
    if (!d.exists()) return null;
    const rec = { id: d.id, ...d.data() } as RecordDefinition;
    return rec.formId === formId ? rec : null;
  }

  async saveRecord(appId: string, formId: string, record: RecordDefinition): Promise<void> {
    if (!isBrowser()) return;
    const payload = sanitizeForFirestore({ ...record, appId, formId, updatedAt: nowIso() });
    await setDoc(doc(this.recordsCol(appId), record.id), payload);
  }

  async saveRecords(appId: string, records: RecordDefinition[]): Promise<void> {
    if (!isBrowser()) return;
    const db = getDb();
    for (const c of chunk(records, 400)) {
      const batch = writeBatch(db);
      c.forEach((r) => batch.set(doc(this.recordsCol(appId), r.id), sanitizeForFirestore({ ...r, appId, updatedAt: nowIso() })));
      await batch.commit();
    }
  }

  async deleteRecord(appId: string, formId: string, recordId: string, opts?: { hard?: boolean; by?: string }): Promise<void> {
    if (!isBrowser()) return;
    const ref = doc(this.recordsCol(appId), recordId);
    if (opts?.hard) {
      await deleteDoc(ref);
    } else {
      await updateDoc(ref, { deleted: true, deletedAt: nowIso(), deletedBy: opts?.by || "", updatedAt: nowIso() });
    }
  }

  async deleteRecords(appId: string, formId: string, recordIds: string[], opts?: { hard?: boolean; by?: string }): Promise<void> {
    if (!isBrowser()) return;
    const db = getDb();
    for (const c of chunk(recordIds, 400)) {
      const batch = writeBatch(db);
      c.forEach((id) => {
        const ref = doc(this.recordsCol(appId), id);
        if (opts?.hard) batch.delete(ref);
        else batch.update(ref, { deleted: true, deletedAt: nowIso(), deletedBy: opts?.by || "", updatedAt: nowIso() });
      });
      await batch.commit();
    }
  }

  async restoreRecord(appId: string, formId: string, recordId: string): Promise<void> {
    if (!isBrowser()) return;
    await updateDoc(doc(this.recordsCol(appId), recordId), { deleted: false, deletedAt: null, deletedBy: null, updatedAt: nowIso() });
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  async createVersion(app: AppDefinition, label: string, by: string): Promise<AppVersion> {
    const versions = await this.listVersions(app.id);
    const nextNum = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
    const version: AppVersion = {
      id: `v_${nextNum}_${Date.now().toString(36)}`,
      version: nextNum,
      label,
      createdAt: nowIso(),
      createdBy: by,
      snapshot: {
        forms: app.forms,
        reports: app.reports,
        pages: app.pages,
        workflows: app.workflows,
        relationships: app.relationships,
        settings: app.settings,
        roles: app.roles,
      },
    };
    await setDoc(doc(getDb(), APPS, app.id, "versions", version.id), sanitizeForFirestore(version));
    return version;
  }

  async listVersions(appId: string): Promise<AppVersion[]> {
    if (!isBrowser()) return [];
    const snap = await getDocs(collection(getDb(), APPS, appId, "versions"));
    return snap.docs.map((d) => d.data() as AppVersion).sort((a, b) => b.version - a.version);
  }

  async getVersion(appId: string, versionId: string): Promise<AppVersion | null> {
    if (!isBrowser()) return null;
    const d = await getDoc(doc(getDb(), APPS, appId, "versions", versionId));
    return d.exists() ? (d.data() as AppVersion) : null;
  }

  async getPublishedVersion(appId: string, versionNumber: number): Promise<AppVersion | null> {
    if (!isBrowser()) return null;
    const snap = await getDocs(
      query(collection(getDb(), APPS, appId, "versions"), where("version", "==", versionNumber))
    );
    return snap.empty ? null : (snap.docs[0].data() as AppVersion);
  }

  // ── Audit / logs ───────────────────────────────────────────────────────────

  async addAudit(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void> {
    if (!isBrowser()) return;
    const id = generateId("aud");
    try {
      await setDoc(doc(getDb(), APPS, entry.appId, "audit", id), sanitizeForFirestore({ ...entry, id, createdAt: nowIso() }));
    } catch (err) {
      console.warn("audit write failed", err);
    }
  }

  async listAudit(appId: string, limit = 200): Promise<AuditLogEntry[]> {
    if (!isBrowser()) return [];
    const snap = await getDocs(query(collection(getDb(), APPS, appId, "audit"), orderBy("createdAt", "desc"), fsLimit(limit)));
    return snap.docs.map((d) => d.data() as AuditLogEntry);
  }

  async addWorkflowLog(appId: string, entry: Omit<WorkflowLogEntry, "id" | "createdAt">): Promise<void> {
    if (!isBrowser()) return;
    const id = generateId("wfl");
    try {
      await setDoc(doc(getDb(), APPS, appId, "workflowLogs", id), sanitizeForFirestore({ ...entry, id, createdAt: nowIso() }));
    } catch (err) {
      console.warn("workflow log write failed", err);
    }
  }

  async listWorkflowLogs(appId: string, limit = 200): Promise<WorkflowLogEntry[]> {
    if (!isBrowser()) return [];
    const snap = await getDocs(query(collection(getDb(), APPS, appId, "workflowLogs"), orderBy("createdAt", "desc"), fsLimit(limit)));
    return snap.docs.map((d) => d.data() as WorkflowLogEntry);
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async addComment(entry: Omit<CommentEntry, "id" | "createdAt">): Promise<void> {
    if (!isBrowser()) return;
    const id = generateId("cmt");
    await setDoc(doc(getDb(), APPS, entry.appId, "comments", id), sanitizeForFirestore({ ...entry, id, createdAt: nowIso() }));
  }

  subscribeComments(appId: string, formId: string, recordId: string, cb: (c: CommentEntry[]) => void): Unsubscribe {
    if (!isBrowser()) return () => {};
    return onSnapshot(
      query(collection(getDb(), APPS, appId, "comments"), where("recordId", "==", recordId)),
      (snap) => cb(snap.docs.map((d) => d.data() as CommentEntry).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
      (err) => console.error("subscribeComments error:", err)
    );
  }

  // ── Users / notifications / templates / mail ──────────────────────────────

  async upsertUser(user: PlatformUser): Promise<void> {
    if (!isBrowser()) return;
    try {
      await setDoc(doc(getDb(), "users", user.email.toLowerCase()), sanitizeForFirestore(user), { merge: true });
    } catch (err) {
      console.warn("upsertUser failed", err);
    }
  }

  async getUser(email: string): Promise<PlatformUser | null> {
    if (!isBrowser()) return null;
    const d = await getDoc(doc(getDb(), "users", email.toLowerCase()));
    return d.exists() ? (d.data() as PlatformUser) : null;
  }

  async addNotification(entry: Omit<NotificationEntry, "id" | "createdAt" | "read">): Promise<void> {
    if (!isBrowser()) return;
    const id = generateId("ntf");
    await setDoc(doc(getDb(), "notifications", id), sanitizeForFirestore({ ...entry, id, read: false, createdAt: nowIso() }));
  }

  subscribeNotifications(email: string, cb: (n: NotificationEntry[]) => void): Unsubscribe {
    if (!isBrowser()) return () => {};
    return onSnapshot(
      query(collection(getDb(), "notifications"), where("toEmail", "==", email.toLowerCase())),
      (snap) => cb(snap.docs.map((d) => d.data() as NotificationEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      (err) => console.warn("notifications error", err)
    );
  }

  async markNotificationRead(id: string): Promise<void> {
    if (!isBrowser()) return;
    await updateDoc(doc(getDb(), "notifications", id), { read: true });
  }

  async saveTemplate(app: AppDefinition, category?: string): Promise<void> {
    if (!isBrowser()) return;
    const tpl: AppDefinition = {
      ...app,
      id: generateId("tpl"),
      isTemplate: true,
      templateCategory: category || "General",
      members: [],
      memberEmails: [],
      sharing: { mode: "private" },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await setDoc(doc(getDb(), "templates", tpl.id), sanitizeForFirestore(tpl));
  }

  async listTemplates(): Promise<AppDefinition[]> {
    if (!isBrowser()) return [];
    const snap = await getDocs(collection(getDb(), "templates"));
    return snap.docs.map((d) => normalizeApp({ id: d.id, ...d.data() }));
  }

  async deleteTemplate(id: string): Promise<void> {
    if (!isBrowser()) return;
    await deleteDoc(doc(getDb(), "templates", id));
  }

  /** Compatible with the Firebase "Trigger Email" extension (collection: mail). */
  async queueEmail(mail: { to: string[]; cc?: string[]; subject: string; html: string; appId?: string }): Promise<void> {
    if (!isBrowser()) return;
    const id = generateId("mail");
    await setDoc(
      doc(getDb(), "mail", id),
      sanitizeForFirestore({
        to: mail.to,
        cc: mail.cc || [],
        message: { subject: mail.subject, html: mail.html },
        appId: mail.appId || null,
        createdAt: nowIso(),
      })
    );
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  async uploadFile(appId: string, file: File, onProgress?: (pct: number) => void) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `apps/${appId}/uploads/${Date.now().toString(36)}_${safeName}`;
    const ref = storageRef(getFirebaseStorage(), path);
    const task = uploadBytesResumable(ref, file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
        reject,
        () => resolve()
      );
    });
    const url = await getDownloadURL(ref);
    return { url, name: file.name, size: file.size, type: file.type, path };
  }

  // ── Platform settings ──────────────────────────────────────────────────────

  async getPlatformSettings(): Promise<Record<string, any>> {
    if (!isBrowser()) return {};
    try {
      const d = await getDoc(doc(getDb(), "platform", "settings"));
      return d.exists() ? d.data() : {};
    } catch {
      return {};
    }
  }

  async savePlatformSettings(settings: Record<string, any>): Promise<void> {
    if (!isBrowser()) return;
    await setDoc(doc(getDb(), "platform", "settings"), sanitizeForFirestore(settings), { merge: true });
  }

  async getPlatformDoc(docId: string): Promise<Record<string, any>> {
    if (!isBrowser()) return {};
    try {
      const d = await getDoc(doc(getDb(), "platform", docId));
      return d.exists() ? d.data() : {};
    } catch {
      return {};
    }
  }

  async savePlatformDoc(docId: string, data: Record<string, any>): Promise<void> {
    if (!isBrowser()) return;
    await setDoc(doc(getDb(), "platform", docId), sanitizeForFirestore(data), { merge: true });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const storageService: DataProvider = new FirestoreDataProvider();
