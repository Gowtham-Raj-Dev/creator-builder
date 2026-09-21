import {
  AiChat,
  AppDefinition,
  AppVersion,
  AuditLogEntry,
  CommentEntry,
  NotificationEntry,
  PlatformUser,
  RecordDefinition,
  WorkflowLogEntry,
} from "@/types/schema";

export type Unsubscribe = () => void;

export interface RecordQueryOptions {
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
}

export interface DataProvider {
  // App schema
  getApps(forEmail?: string | null, isOwner?: boolean): Promise<AppDefinition[]>;
  getApp(idOrLinkName: string, ctx?: { email?: string | null; isOwner?: boolean }): Promise<AppDefinition | null>;
  subscribeApp(appId: string, cb: (app: AppDefinition | null) => void): Unsubscribe;
  saveApp(app: AppDefinition): Promise<void>;
  deleteApp(id: string): Promise<void>;

  // Records
  getRecords(appId: string, formId: string, opts?: RecordQueryOptions): Promise<RecordDefinition[]>;
  subscribeRecords(appId: string, formId: string, cb: (records: RecordDefinition[]) => void, opts?: RecordQueryOptions): Unsubscribe;
  getRecord(appId: string, formId: string, recordId: string): Promise<RecordDefinition | null>;
  saveRecord(appId: string, formId: string, record: RecordDefinition): Promise<void>;
  saveRecords(appId: string, records: RecordDefinition[]): Promise<void>;
  deleteRecord(appId: string, formId: string, recordId: string, opts?: { hard?: boolean; by?: string }): Promise<void>;
  deleteRecords(appId: string, formId: string, recordIds: string[], opts?: { hard?: boolean; by?: string }): Promise<void>;
  restoreRecord(appId: string, formId: string, recordId: string): Promise<void>;

  // Versions (publish / rollback)
  createVersion(app: AppDefinition, label: string, by: string): Promise<AppVersion>;
  listVersions(appId: string): Promise<AppVersion[]>;
  getVersion(appId: string, versionId: string): Promise<AppVersion | null>;
  getPublishedVersion(appId: string, versionNumber: number): Promise<AppVersion | null>;

  // Audit & logs
  addAudit(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void>;
  listAudit(appId: string, limit?: number): Promise<AuditLogEntry[]>;
  addWorkflowLog(appId: string, entry: Omit<WorkflowLogEntry, "id" | "createdAt">): Promise<void>;
  listWorkflowLogs(appId: string, limit?: number): Promise<WorkflowLogEntry[]>;

  // Comments
  addComment(entry: Omit<CommentEntry, "id" | "createdAt">): Promise<void>;
  subscribeComments(appId: string, formId: string, recordId: string, cb: (c: CommentEntry[]) => void): Unsubscribe;

  // AI assistant chat history
  listAiChats(appId: string): Promise<AiChat[]>;
  saveAiChat(chat: AiChat): Promise<void>;
  deleteAiChat(appId: string, chatId: string): Promise<void>;

  // Users / notifications / templates
  upsertUser(user: PlatformUser): Promise<void>;
  getUser(email: string): Promise<PlatformUser | null>;
  addNotification(entry: Omit<NotificationEntry, "id" | "createdAt" | "read">): Promise<void>;
  subscribeNotifications(email: string, cb: (n: NotificationEntry[]) => void): Unsubscribe;
  markNotificationRead(id: string): Promise<void>;
  saveTemplate(app: AppDefinition, category?: string): Promise<void>;
  listTemplates(): Promise<AppDefinition[]>;
  deleteTemplate(id: string): Promise<void>;
  queueEmail(mail: { to: string[]; cc?: string[]; subject: string; html: string; appId?: string }): Promise<void>;

  // Files
  uploadFile(appId: string, file: File, onProgress?: (pct: number) => void): Promise<{ url: string; name: string; size: number; type: string; path: string }>;

  // Platform settings (owner only)
  getPlatformSettings(): Promise<Record<string, any>>;
  savePlatformSettings(settings: Record<string, any>): Promise<void>;
  /** Owner-only documents under platform/{docId} (e.g. per-app AI keys). */
  getPlatformDoc(docId: string): Promise<Record<string, any>>;
  savePlatformDoc(docId: string, data: Record<string, any>): Promise<void>;
}
