import {
  AppDefinition,
  RecordDefinition,
} from "@/types/schema";

export interface DataProvider {
  // App Schema operations
  getApps(): Promise<AppDefinition[]>;
  getApp(idOrLinkName: string): Promise<AppDefinition | null>;
  saveApp(app: AppDefinition): Promise<void>;
  deleteApp(id: string): Promise<void>;

  // Record operations
  getRecords(appId: string, formId: string): Promise<RecordDefinition[]>;
  getRecord(appId: string, formId: string, recordId: string): Promise<RecordDefinition | null>;
  saveRecord(appId: string, formId: string, record: RecordDefinition): Promise<void>;
  deleteRecord(appId: string, formId: string, recordId: string): Promise<void>;

  // Reset / Seed
  resetToSeedData(): Promise<AppDefinition>;
  clearAllData(): Promise<void>;
}
