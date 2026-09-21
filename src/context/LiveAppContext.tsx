"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppDefinition, FormDefinition, FieldDefinition, RecordDefinition, ReportColumnConfig, ReportDefinition } from "@/types/schema";
import { storageService } from "@/lib/storage/firestoreProvider";
import { generateId } from "@/lib/utils/idGenerator";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { generateNextAutoNumber } from "@/lib/engine/autoNumberEngine";
import { computeRollup } from "@/lib/engine/rollupEngine";
import { isLinkedSubform, planChildSync, CHILD_ID_KEY } from "@/lib/engine/subformLink";
import { buildFormulaContext, evaluateFormula, coerceFormulaResult } from "@/lib/engine/formulaEngine";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { DataOperation, WorkflowResult } from "@/lib/engine/workflowEngine";
import { computePermissions, EffectivePermissions } from "@/lib/auth/permissions";
import { useToast } from "./ToastContext";
import { useAuth } from "./AuthContext";

interface LiveAppContextValue {
  app: AppDefinition | null;
  loading: boolean;
  notFound: boolean;
  recordsMap: Record<string, RecordDefinition[]>;
  trashMap: Record<string, RecordDefinition[]>;
  permissions: EffectivePermissions;
  isDraftPreview: boolean;
  setDraftPreview: (v: boolean) => void;
  loadApp: (linkName: string) => Promise<boolean>;
  loadFormRecords: (formId: string) => Promise<RecordDefinition[]>;
  createRecord: (formId: string, data: Record<string, any>, opts?: { silent?: boolean }) => Promise<RecordDefinition | null>;
  updateRecord: (formId: string, recordId: string, data: Record<string, any>, opts?: { silent?: boolean }) => Promise<boolean>;
  deleteRecord: (formId: string, recordId: string) => Promise<boolean>;
  deleteRecords: (formId: string, recordIds: string[]) => Promise<boolean>;
  restoreRecord: (formId: string, recordId: string) => Promise<boolean>;
  purgeRecord: (formId: string, recordId: string) => Promise<boolean>;
  duplicateRecord: (formId: string, recordId: string) => Promise<RecordDefinition | null>;
  importRecords: (formId: string, rows: Record<string, any>[]) => Promise<number>;
  applyWorkflowSideEffects: (result: WorkflowResult, formId: string, recordId?: string) => Promise<void>;
  getDisplayForLookup: (targetFormId: string, displayFieldId: string, recordId: string | string[]) => string;
  getDisplayValue: (form: FormDefinition, rec: RecordDefinition, fieldId: string) => string;
  computeRecordValues: (form: FormDefinition, rec: RecordDefinition) => Record<string, any>;
  updateReportColumns: (reportId: string, columns: ReportColumnConfig[]) => Promise<void>;
  /** Persist report view/columns: owner → app definition (draft), member → this browser only. */
  updateReportSettings: (reportId: string, patch: Partial<Pick<ReportDefinition, "reportType" | "columns">>) => Promise<void>;
  refreshAll: () => Promise<void>;
  recentRecords: Array<{ formId: string; recordId: string; title: string; at: string }>;
  noteRecent: (formId: string, recordId: string, title: string) => void;
  favorites: string[]; // "form:<id>" | "report:<id>" | "page:<id>"
  toggleFavorite: (key: string) => void;
}

const LiveAppContext = createContext<LiveAppContextValue | null>(null);

export const useLiveApp = () => {
  const ctx = useContext(LiveAppContext);
  if (!ctx) throw new Error("useLiveApp must be used within a LiveAppProvider");
  return ctx;
};

const now = () => new Date().toISOString();

/** Per-browser report preferences for users who can't edit the app definition (members). */
type LocalReportPrefs = Partial<Pick<ReportDefinition, "reportType" | "columns">>;
const localPrefsKey = (reportId: string) => `yb_report_${reportId}`;
function readLocalReportPrefs(reportId: string): LocalReportPrefs {
  try { const raw = localStorage.getItem(localPrefsKey(reportId)); return raw ? (JSON.parse(raw) as LocalReportPrefs) : {}; } catch { return {}; }
}
function writeLocalReportPrefs(reportId: string, patch: LocalReportPrefs) {
  try {
    const next = { ...readLocalReportPrefs(reportId), ...patch };
    if (Object.keys(next).length) localStorage.setItem(localPrefsKey(reportId), JSON.stringify(next));
    else localStorage.removeItem(localPrefsKey(reportId));
  } catch { /* ignore */ }
}

/** Merge locally written records into a form's list without ever holding the same id twice (Firestore's local snapshot may already contain them). */
function mergeRecords(prev: RecordDefinition[] | undefined, upserts: RecordDefinition[], deleteIds: string[] = []): RecordDefinition[] {
  const byId = new Map<string, RecordDefinition>();
  for (const r of upserts) byId.set(r.id, r);
  const rest = (prev || []).filter((r) => !byId.has(r.id) && !deleteIds.includes(r.id));
  return [...upserts, ...rest];
}

function diffRecords(before: Record<string, any>, after: Record<string, any>) {
  const changes: Record<string, { from: any; to: any }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const a = before?.[k]; const b = after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

export const LiveAppProvider: React.FC<{ appLinkName: string; children: React.ReactNode }> = ({ appLinkName, children }) => {
  const [app, setApp] = useState<AppDefinition | null>(null);
  const [draftApp, setDraftApp] = useState<AppDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [recordsMap, setRecordsMap] = useState<Record<string, RecordDefinition[]>>({});
  const [isDraftPreview, setDraftPreview] = useState(true);
  const [recentRecords, setRecentRecords] = useState<LiveAppContextValue["recentRecords"]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const { showToast } = useToast();
  const { user, isOwner, loading: authLoading } = useAuth();
  const subsRef = useRef<Array<() => void>>([]);

  const permissions = useMemo(() => computePermissions(draftApp || app, user?.email), [draftApp, app, user?.email]);
  // owners AND builder collaborators see the draft (unpublished) app by default and may persist report settings
  const canBuildApp = useCallback((a: AppDefinition) => computePermissions(a, user?.email).canEditBuilder, [user?.email]);

  const resolveEffectiveApp = useCallback(
    async (draft: AppDefinition, owner: boolean, preview: boolean): Promise<AppDefinition> => {
      if (owner && preview) return draft;
      let base = draft;
      if (draft.publishedVersion) {
        const v = await storageService.getPublishedVersion(draft.id, draft.publishedVersion);
        if (v) base = { ...draft, ...v.snapshot, roles: v.snapshot.roles || draft.roles };
      }
      // Members can't change the app definition — re-apply their locally remembered report preferences (view, columns).
      return { ...base, reports: base.reports.map((r) => ({ ...r, ...readLocalReportPrefs(r.id) })) };
    },
    []
  );

  const loadApp = useCallback(
    async (linkName: string): Promise<boolean> => {
      setLoading(true);
      setNotFound(false);
      try {
        const loaded = await storageService.getApp(linkName, { email: user?.email, isOwner });
        if (!loaded) { setApp(null); setDraftApp(null); setNotFound(true); return false; }
        setDraftApp(loaded);
        const effective = await resolveEffectiveApp(loaded, canBuildApp(loaded), isDraftPreview);
        setApp(effective);
        return true;
      } catch (err) {
        console.error("Failed to load live app:", err);
        setNotFound(true);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.email, isOwner, isDraftPreview, resolveEffectiveApp, canBuildApp]
  );

  useEffect(() => {
    if (authLoading) return;
    if (appLinkName) loadApp(appLinkName);
    else setLoading(false);
  }, [appLinkName, loadApp, authLoading]);

  // Realtime: app schema + records of every form
  useEffect(() => {
    subsRef.current.forEach((u) => u());
    subsRef.current = [];
    if (!app) return;
    const appSub = storageService.subscribeApp(app.id, async (remote) => {
      if (!remote) return;
      setDraftApp(remote);
      const eff = await resolveEffectiveApp(remote, canBuildApp(remote), isDraftPreview);
      setApp(eff);
    });
    subsRef.current.push(appSub);
    for (const form of app.forms) {
      const sub = storageService.subscribeRecords(app.id, form.id, (recs) => setRecordsMap((prev) => ({ ...prev, [form.id]: recs })), { includeDeleted: true });
      subsRef.current.push(sub);
    }
    return () => { subsRef.current.forEach((u) => u()); subsRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.forms.map((f) => f.id).join("|"), isDraftPreview]);

  // per-user local conveniences
  useEffect(() => {
    if (!app) return;
    try {
      setRecentRecords(JSON.parse(localStorage.getItem(`yb_recent_${app.id}`) || "[]"));
      setFavorites(JSON.parse(localStorage.getItem(`yb_fav_${app.id}`) || "[]"));
    } catch { /* ignore */ }
  }, [app?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const noteRecent = useCallback((formId: string, recordId: string, title: string) => {
    if (!app) return;
    setRecentRecords((prev) => {
      const next = [{ formId, recordId, title, at: now() }, ...prev.filter((r) => r.recordId !== recordId)].slice(0, 12);
      try { localStorage.setItem(`yb_recent_${app.id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [app]);

  const toggleFavorite = useCallback((key: string) => {
    if (!app) return;
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(`yb_fav_${app.id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [app]);

  const liveRecordsMap = useMemo(() => {
    const out: Record<string, RecordDefinition[]> = {};
    for (const [k, v] of Object.entries(recordsMap)) out[k] = v.filter((r) => !r.deleted);
    return out;
  }, [recordsMap]);

  const trashMap = useMemo(() => {
    const out: Record<string, RecordDefinition[]> = {};
    for (const [k, v] of Object.entries(recordsMap)) out[k] = v.filter((r) => r.deleted);
    return out;
  }, [recordsMap]);

  const loadFormRecords = useCallback(
    async (formId: string) => {
      if (!app) return [];
      const recs = await storageService.getRecords(app.id, formId, { includeDeleted: true });
      setRecordsMap((prev) => ({ ...prev, [formId]: recs }));
      return recs.filter((r) => !r.deleted);
    },
    [app]
  );

  const auditRecord = useCallback(
    (action: string, form: FormDefinition, rec: RecordDefinition, changes?: Record<string, { from: any; to: any }>) => {
      if (!app || app.settings?.enableAudit === false) return;
      storageService.addAudit({ appId: app.id, type: "record", action, entityType: "record", entityId: rec.id, entityName: form.name, formId: form.id, recordId: rec.id, user: user?.email || "anonymous", userName: user?.name, changes });
    },
    [app, user]
  );

  const stripComputed = (form: FormDefinition, data: Record<string, any>) => {
    const out = { ...data };
    for (const f of form.fields) if (f.type === "rollup" || f.type === "section") delete out[f.id];
    return out;
  };

  /**
   * Subforms backed by an existing form: mirror the parent's rows into real child records
   * (create / update / delete) and stamp the child ids back onto the rows. Returns the rows with ids.
   */
  const syncLinkedSubforms = useCallback(
    async (form: FormDefinition, parentId: string, data: Record<string, any>, opts: { deleteAll?: boolean } = {}): Promise<Record<string, any>> => {
      if (!app) return data;
      const out = { ...data };
      for (const field of form.fields) {
        if (field.type !== "subform" || !isLinkedSubform(field.subform)) continue;
        const cfg = field.subform;
        const target = app.forms.find((f) => f.id === cfg.targetFormId);
        if (!target) continue;
        const children = recordsMap[cfg.targetFormId] || [];
        const rows: any[] = opts.deleteAll ? [] : Array.isArray(out[field.id]) ? out[field.id] : [];
        const plan = planChildSync(cfg, parentId, rows, children);
        const nextRows = rows.map((r) => ({ ...r }));
        const created: RecordDefinition[] = [];
        const updated: RecordDefinition[] = [];
        for (const c of plan.creates) {
          const rec: RecordDefinition = { id: generateId("rec"), appId: app.id, formId: target.id, data: c.data, createdAt: now(), updatedAt: now(), createdBy: user?.email, createdByName: user?.name, updatedBy: user?.email };
          for (const f of target.fields) if (f.type === "autonumber" && f.autonumber && !rec.data[f.id]) rec.data[f.id] = generateNextAutoNumber(f.autonumber, [...children, ...created], f.id);
          await storageService.saveRecord(app.id, target.id, rec);
          created.push(rec);
          nextRows[c.rowIndex][CHILD_ID_KEY] = rec.id;
        }
        for (const u of plan.updates) {
          const cur = children.find((r) => r.id === u.id);
          if (!cur) continue;
          const rec: RecordDefinition = { ...cur, data: { ...cur.data, ...u.data }, updatedAt: now(), updatedBy: user?.email };
          await storageService.saveRecord(app.id, target.id, rec);
          updated.push(rec);
          nextRows[u.rowIndex][CHILD_ID_KEY] = u.id;
        }
        for (const id of plan.deletes) await storageService.deleteRecord(app.id, target.id, id, { hard: true, by: user?.email });
        setRecordsMap((prev) => ({ ...prev, [target.id]: mergeRecords(prev[target.id], [...created, ...updated], plan.deletes) }));
        out[field.id] = nextRows;
      }
      return out;
    },
    [app, recordsMap, user]
  );

  const createRecord = useCallback(
    async (formId: string, data: Record<string, any>, opts?: { silent?: boolean }) => {
      if (!app) return null;
      const form = app.forms.find((f) => f.id === formId);
      if (!form) return null;
      if (!permissions.form(formId).create) { showToast("You don't have permission to create records here", "error"); return null; }
      const existing = recordsMap[formId] || [];
      const populated = stripComputed(form, data);
      for (const field of form.fields) {
        if (field.type === "autonumber" && field.autonumber && !populated[field.id]) populated[field.id] = generateNextAutoNumber(field.autonumber, existing, field.id);
      }
      const rec: RecordDefinition = { id: generateId("rec"), appId: app.id, formId, data: populated, createdAt: now(), updatedAt: now(), createdBy: user?.email, createdByName: user?.name, updatedBy: user?.email };
      try {
        rec.data = await syncLinkedSubforms(form, rec.id, rec.data); // child records first, so rows carry their ids
        await storageService.saveRecord(app.id, formId, rec);
        setRecordsMap((prev) => ({ ...prev, [formId]: mergeRecords(prev[formId], [rec]) }));
        auditRecord("created", form, rec);
        if (!opts?.silent) showToast(form.successMessage || "Record created successfully", "success");
        return rec;
      } catch (err) {
        console.error("Failed to create record:", err);
        showToast("Failed to create record", "error");
        return null;
      }
    },
    [app, recordsMap, showToast, user, permissions, auditRecord, syncLinkedSubforms]
  );

  const updateRecord = useCallback(
    async (formId: string, recordId: string, data: Record<string, any>, opts?: { silent?: boolean }) => {
      if (!app) return false;
      const form = app.forms.find((f) => f.id === formId);
      const current = recordsMap[formId]?.find((r) => r.id === recordId);
      if (!form || !current) return false;
      if (!permissions.form(formId).edit) { showToast("You don't have permission to edit this record", "error"); return false; }
      const nextData = await syncLinkedSubforms(form, recordId, stripComputed(form, { ...current.data, ...data }));
      const changes = diffRecords(current.data, nextData);
      const history = [...(current.history || []).slice(-19), { at: now(), by: user?.email || "", changes }];
      const updated: RecordDefinition = { ...current, data: nextData, updatedAt: now(), updatedBy: user?.email, history };
      try {
        await storageService.saveRecord(app.id, formId, updated);
        setRecordsMap((prev) => ({ ...prev, [formId]: (prev[formId] || []).map((r) => (r.id === recordId ? updated : r)) }));
        auditRecord("updated", form, updated, changes);
        if (!opts?.silent) showToast("Record updated successfully", "success");
        return true;
      } catch (err) {
        console.error("Failed to update record:", err);
        showToast("Failed to update record", "error");
        return false;
      }
    },
    [app, recordsMap, showToast, user, permissions, auditRecord, syncLinkedSubforms]
  );

  const deleteRecord = useCallback(
    async (formId: string, recordId: string) => {
      if (!app) return false;
      const form = app.forms.find((f) => f.id === formId);
      if (!form || !permissions.form(formId).delete) { showToast("You don't have permission to delete", "error"); return false; }
      const soft = app.settings?.enableTrash !== false;
      try {
        if (!soft) await syncLinkedSubforms(form, recordId, {}, { deleteAll: true }); // linked child rows go with the parent
        await storageService.deleteRecord(app.id, formId, recordId, { hard: !soft, by: user?.email });
        setRecordsMap((prev) => ({ ...prev, [formId]: soft ? (prev[formId] || []).map((r) => (r.id === recordId ? { ...r, deleted: true, deletedAt: now(), deletedBy: user?.email } : r)) : (prev[formId] || []).filter((r) => r.id !== recordId) }));
        const rec = recordsMap[formId]?.find((r) => r.id === recordId);
        if (rec) auditRecord("deleted", form, rec);
        showToast(soft ? "Record moved to trash" : "Record deleted", "info");
        return true;
      } catch (err) {
        console.error("Failed to delete record:", err);
        showToast("Failed to delete record", "error");
        return false;
      }
    },
    [app, showToast, permissions, user, recordsMap, auditRecord, syncLinkedSubforms]
  );

  const deleteRecords = useCallback(
    async (formId: string, ids: string[]) => {
      if (!app || !permissions.form(formId).delete) return false;
      const soft = app.settings?.enableTrash !== false;
      try {
        await storageService.deleteRecords(app.id, formId, ids, { hard: !soft, by: user?.email });
        setRecordsMap((prev) => ({ ...prev, [formId]: soft ? (prev[formId] || []).map((r) => (ids.includes(r.id) ? { ...r, deleted: true, deletedAt: now(), deletedBy: user?.email } : r)) : (prev[formId] || []).filter((r) => !ids.includes(r.id)) }));
        showToast(`${ids.length} record(s) ${soft ? "moved to trash" : "deleted"}`, "info");
        return true;
      } catch { showToast("Bulk delete failed", "error"); return false; }
    },
    [app, permissions, user, showToast]
  );

  const restoreRecord = useCallback(
    async (formId: string, recordId: string) => {
      if (!app) return false;
      try {
        await storageService.restoreRecord(app.id, formId, recordId);
        setRecordsMap((prev) => ({ ...prev, [formId]: (prev[formId] || []).map((r) => (r.id === recordId ? { ...r, deleted: false, deletedAt: undefined } : r)) }));
        showToast("Record restored", "success");
        return true;
      } catch { showToast("Restore failed", "error"); return false; }
    },
    [app, showToast]
  );

  const purgeRecord = useCallback(
    async (formId: string, recordId: string) => {
      if (!app) return false;
      try {
        await storageService.deleteRecord(app.id, formId, recordId, { hard: true });
        setRecordsMap((prev) => ({ ...prev, [formId]: (prev[formId] || []).filter((r) => r.id !== recordId) }));
        showToast("Record permanently deleted", "info");
        return true;
      } catch { return false; }
    },
    [app, showToast]
  );

  const duplicateRecord = useCallback(
    async (formId: string, recordId: string) => {
      const rec = recordsMap[formId]?.find((r) => r.id === recordId);
      const form = app?.forms.find((f) => f.id === formId);
      if (!rec || !form) return null;
      const data = { ...rec.data };
      for (const f of form.fields) if (f.type === "autonumber" || f.unique) delete data[f.id];
      return createRecord(formId, data);
    },
    [recordsMap, app, createRecord]
  );

  const importRecords = useCallback(
    async (formId: string, rows: Record<string, any>[]) => {
      if (!app) return 0;
      const form = app.forms.find((f) => f.id === formId);
      if (!form || !permissions.form(formId).import) { showToast("Import not permitted", "error"); return 0; }
      const existing = [...(recordsMap[formId] || [])];
      const recs: RecordDefinition[] = rows.map((data) => {
        const populated = { ...data };
        for (const field of form.fields) {
          if (field.type === "autonumber" && field.autonumber && !populated[field.id]) {
            populated[field.id] = generateNextAutoNumber(field.autonumber, existing, field.id);
          }
        }
        const rec: RecordDefinition = { id: generateId("rec"), appId: app.id, formId, data: populated, createdAt: now(), updatedAt: now(), createdBy: user?.email, createdByName: user?.name };
        existing.unshift(rec);
        return rec;
      });
      await storageService.saveRecords(app.id, recs);
      setRecordsMap((prev) => ({ ...prev, [formId]: [...recs, ...(prev[formId] || [])] }));
      showToast(`${recs.length} record(s) imported`, "success");
      return recs.length;
    },
    [app, permissions, recordsMap, showToast, user]
  );

  /** Execute queued data operations + integrations produced by workflows. */
  const applyWorkflowSideEffects = useCallback(
    async (result: WorkflowResult, formId: string, recordId?: string) => {
      if (!app) return;
      const ops: DataOperation[] = result.dataOps || [];
      for (const op of ops) {
        const form = app.forms.find((f) => f.id === op.formId);
        if (!form) continue;
        try {
          if (op.type === "insert") {
            const rec: RecordDefinition = { id: generateId("rec"), appId: app.id, formId: op.formId, data: op.data || {}, createdAt: now(), updatedAt: now(), createdBy: user?.email, updatedBy: user?.email };
            for (const field of form.fields) if (field.type === "autonumber" && field.autonumber && !rec.data[field.id]) rec.data[field.id] = generateNextAutoNumber(field.autonumber, recordsMap[op.formId] || [], field.id);
            await storageService.saveRecord(app.id, op.formId, rec);
            setRecordsMap((prev) => ({ ...prev, [op.formId]: mergeRecords(prev[op.formId], [rec]) }));
          } else if (op.type === "update" || op.type === "increment") {
            const current = (recordsMap[op.formId] || []).find((r) => r.id === op.recordId) || (await storageService.getRecord(app.id, op.formId, op.recordId!));
            if (!current) continue;
            const data = { ...current.data };
            if (op.type === "increment" && op.fieldId) data[op.fieldId] = (Number(data[op.fieldId]) || 0) + (op.amount || 0);
            else Object.assign(data, op.data || {});
            const updated = { ...current, data, updatedAt: now(), updatedBy: user?.email };
            await storageService.saveRecord(app.id, op.formId, updated);
            setRecordsMap((prev) => ({ ...prev, [op.formId]: (prev[op.formId] || []).map((r) => (r.id === updated.id ? updated : r)) }));
          } else if (op.type === "delete" && op.recordId) {
            await storageService.deleteRecord(app.id, op.formId, op.recordId, { by: user?.email });
            setRecordsMap((prev) => ({ ...prev, [op.formId]: (prev[op.formId] || []).map((r) => (r.id === op.recordId ? { ...r, deleted: true } : r)) }));
          }
        } catch (err) {
          console.error("Workflow data operation failed:", op, err);
          showToast(`Workflow update on ${form.name} failed`, "error");
        }
      }
      for (const mail of result.emails || []) {
        try { await storageService.queueEmail({ ...mail, appId: app.id }); } catch (e) { console.warn("email queue failed", e); }
      }
      for (const n of result.notifications || []) {
        for (const to of n.toUsers) {
          try { await storageService.addNotification({ appId: app.id, toEmail: to, title: n.title, body: n.body, link: recordId ? `/app?app=${app.linkName}&form=${app.forms.find((f) => f.id === formId)?.linkName}&record=${recordId}` : undefined }); } catch { /* ignore */ }
        }
      }
      for (const wh of result.webhooks || []) {
        try {
          await fetch(wh.url, { method: wh.method || "POST", headers: { "Content-Type": "application/json", ...(wh.headers || {}) }, body: wh.method === "GET" ? undefined : JSON.stringify(wh.body ?? {}) });
        } catch (err) { console.warn("Webhook call failed", err); }
      }
      if (result.logs?.length && app.settings?.enableAudit !== false) {
        for (const log of result.logs) {
          storageService.addWorkflowLog(app.id, { workflowId: log.workflowId, workflowName: log.workflowName, formId, trigger: "", status: log.status, messages: log.messages, durationMs: log.durationMs, user: user?.email, recordId });
        }
      }
    },
    [app, recordsMap, user, showToast]
  );

  const getDisplayForLookup = useCallback(
    (targetFormId: string, displayFieldId: string, recordId: string | string[]) => resolveLookupDisplay(recordId, liveRecordsMap[targetFormId] || recordsMap[targetFormId] || [], displayFieldId),
    [liveRecordsMap, recordsMap]
  );

  /** Record data + computed formula & rollup values. */
  const computeRecordValues = useCallback(
    (form: FormDefinition, rec: RecordDefinition): Record<string, any> => {
      if (!app) return rec.data || {};
      const values: Record<string, any> = { ...(rec.data || {}) };
      for (const f of form.fields) if (f.type === "rollup" && f.rollup?.sourceFormId) values[f.id] = computeRollup(f.rollup, rec.id, app, liveRecordsMap);
      const formulaFields = form.fields.filter((f) => f.type === "formula" && f.formula?.expression);
      if (formulaFields.length) {
        // two passes so formulas can depend on other formulas
        for (let pass = 0; pass < 2; pass++) {
          const ctx = buildFormulaContext(form, values, { forms: app.forms, recordsMap: liveRecordsMap, user, record: rec });
          for (const f of formulaFields) values[f.id] = coerceFormulaResult(evaluateFormula(f.formula!.expression, ctx), f.formula!.resultType, f.formula!.decimalPlaces);
        }
      }
      return values;
    },
    [app, liveRecordsMap, user]
  );

  const formatField = useCallback(
    (field: FieldDefinition, val: any): string => {
      if (val === undefined || val === null || val === "") return "";
      switch (field.type) {
        case "lookup": return field.lookup ? resolveLookupDisplay(val, liveRecordsMap[field.lookup.targetFormId] || recordsMap[field.lookup.targetFormId] || [], field.lookup.displayFieldId) : String(val);
        case "currency": return formatCurrency(val, field.currencySymbol || app?.settings?.currencySymbol || "₹", field.decimalPlaces ?? 2);
        case "percentage": return `${val}%`;
        case "date": return formatDate(val);
        case "datetime": return formatDate(val, true);
        case "checkbox": return val ? "Yes" : "No";
        case "subform": return `${Array.isArray(val) ? val.length : 0} line item(s)`;
        case "multiselect": return Array.isArray(val) ? val.join(", ") : String(val);
        case "file": case "image": return Array.isArray(val) ? `${val.length} file(s)` : val?.name || (typeof val === "string" ? "1 file" : "");
        case "rating": return `${val} / ${field.ratingMax || 5}`;
        case "geolocation": return val?.lat !== undefined ? `${Number(val.lat).toFixed(5)}, ${Number(val.lng).toFixed(5)}` : String(val);
        case "address": return [val?.line1, val?.line2, val?.city, val?.state, val?.pincode, val?.country].filter(Boolean).join(", ");
        case "signature": return val ? "Signed" : "";
        case "users": return Array.isArray(val) ? val.join(", ") : String(val);
        case "formula": return field.formula?.resultType === "number" ? Number(val).toLocaleString("en-IN", { maximumFractionDigits: field.formula.decimalPlaces ?? 2 }) : String(val);
        case "rollup": case "number": case "decimal": return typeof val === "number" ? val.toLocaleString("en-IN", { maximumFractionDigits: field.decimalPlaces ?? 2 }) : String(val);
        case "richtext": return String(val).replace(/<[^>]+>/g, "").slice(0, 200);
        default: return String(val);
      }
    },
    [liveRecordsMap, recordsMap, app]
  );

  const getDisplayValue = useCallback(
    (form: FormDefinition, rec: RecordDefinition, fieldId: string): string => {
      if (fieldId === "createdAt" || fieldId === "updatedAt") return formatDate((rec as any)[fieldId], true);
      if (fieldId === "createdBy") return rec.createdByName || rec.createdBy || "";
      if (fieldId === "updatedBy") return rec.updatedBy || "";
      const field = form.fields.find((f) => f.id === fieldId);
      if (!field) return "";
      if (field.type === "formula" || field.type === "rollup") {
        const values = computeRecordValues(form, rec);
        return formatField(field, values[field.id]);
      }
      return formatField(field, rec.data?.[field.id]);
    },
    [computeRecordValues, formatField]
  );

  const updateReportSettings = useCallback(
    async (reportId: string, patch: Partial<Pick<ReportDefinition, "reportType" | "columns">>) => {
      const apply = (prev: AppDefinition | null) => (prev ? { ...prev, reports: prev.reports.map((r) => (r.id === reportId ? { ...r, ...patch } : r)) } : prev);
      if (!draftApp || !permissions.canEditBuilder) {
        // members can't change the app definition: remember the preference in this browser only
        writeLocalReportPrefs(reportId, patch);
        setApp(apply);
        return;
      }
      const updated = { ...(apply(draftApp) as AppDefinition), updatedAt: now() };
      setDraftApp(updated);
      setApp(apply);
      await storageService.saveApp(updated);
    },
    [draftApp, permissions.canEditBuilder]
  );
  const updateReportColumns = useCallback(
    (reportId: string, columns: ReportColumnConfig[]) => updateReportSettings(reportId, { columns }),
    [updateReportSettings]
  );

  const handleRefreshAll = useCallback(async () => { if (appLinkName) await loadApp(appLinkName); }, [appLinkName, loadApp]);

  const value = useMemo<LiveAppContextValue>(
    () => ({
      app, loading: loading || authLoading, notFound, recordsMap: liveRecordsMap, trashMap, permissions, isDraftPreview, setDraftPreview,
      loadApp, loadFormRecords, createRecord, updateRecord, deleteRecord, deleteRecords, restoreRecord, purgeRecord, duplicateRecord, importRecords,
      applyWorkflowSideEffects, getDisplayForLookup, getDisplayValue, computeRecordValues, updateReportColumns, updateReportSettings, refreshAll: handleRefreshAll,
      recentRecords, noteRecent, favorites, toggleFavorite,
    }),
    [app, loading, authLoading, notFound, liveRecordsMap, trashMap, permissions, isDraftPreview, loadApp, loadFormRecords, createRecord, updateRecord, deleteRecord, deleteRecords, restoreRecord, purgeRecord, duplicateRecord, importRecords, applyWorkflowSideEffects, getDisplayForLookup, getDisplayValue, computeRecordValues, updateReportColumns, updateReportSettings, handleRefreshAll, recentRecords, noteRecent, favorites, toggleFavorite]
  );

  return <LiveAppContext.Provider value={value}>{children}</LiveAppContext.Provider>;
};
