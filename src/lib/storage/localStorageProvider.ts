import { AppDefinition, RecordDefinition } from "@/types/schema";
import { DataProvider } from "./dataProvider";
import { createSeedApp, createSeedRecords } from "./seedData";

const SCHEMA_VERSION = 5;
const VERSION_KEY = "creator_schema_version";
const APPS_KEY = "creator_apps";
const RECORDS_PREFIX = "creator_records_";

export class LocalStorageDataProvider implements DataProvider {
  private isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  }

  private ensureInitialized(): void {
    if (!this.isBrowser()) return;

    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      const storedApps = localStorage.getItem(APPS_KEY);

      if (!storedVersion || Number(storedVersion) < SCHEMA_VERSION || !storedApps) {
        // Initialize with seed data
        const seedApp = createSeedApp();
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));

        let appsToSave = [seedApp];
        if (storedApps) {
          try {
            const parsed = JSON.parse(storedApps) as AppDefinition[];
            const otherApps = parsed.filter(
              (a) => a.id !== seedApp.id && a.linkName !== seedApp.linkName
            );
            appsToSave = [seedApp, ...otherApps];
          } catch (_) {}
        }
        localStorage.setItem(APPS_KEY, JSON.stringify(appsToSave));

        const seedRecords = createSeedRecords(seedApp.id);
        for (const [key, records] of Object.entries(seedRecords)) {
          localStorage.setItem(`${RECORDS_PREFIX}${key}`, JSON.stringify(records));
        }
      }
    } catch (err) {
      console.error("Failed to initialize LocalStorage:", err);
    }
  }

  public async getApps(): Promise<AppDefinition[]> {
    if (!this.isBrowser()) return [createSeedApp()];
    this.ensureInitialized();

    try {
      const raw = localStorage.getItem(APPS_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.error("Error reading apps from LocalStorage:", err);
      return [];
    }
  }

  public async getApp(idOrLinkName: string): Promise<AppDefinition | null> {
    const apps = await this.getApps();
    const clean = idOrLinkName.trim().toLowerCase();
    const found = apps.find(
      (a) => a.id === idOrLinkName || a.linkName.toLowerCase() === clean
    );
    return found || null;
  }

  public async saveApp(app: AppDefinition): Promise<void> {
    if (!this.isBrowser()) return;
    this.ensureInitialized();

    try {
      const apps = await this.getApps();
      const index = apps.findIndex((a) => a.id === app.id);
      const updatedApp = {
        ...app,
        updatedAt: new Date().toISOString(),
      };

      if (index >= 0) {
        apps[index] = updatedApp;
      } else {
        apps.push(updatedApp);
      }

      localStorage.setItem(APPS_KEY, JSON.stringify(apps));
    } catch (err) {
      console.error("Error saving app to LocalStorage:", err);
      throw err;
    }
  }

  public async deleteApp(id: string): Promise<void> {
    if (!this.isBrowser()) return;
    this.ensureInitialized();

    try {
      const apps = await this.getApps();
      const filtered = apps.filter((a) => a.id !== id);
      localStorage.setItem(APPS_KEY, JSON.stringify(filtered));

      // Also remove records associated with this app
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${RECORDS_PREFIX}${id}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      console.error("Error deleting app from LocalStorage:", err);
      throw err;
    }
  }

  public async getRecords(appId: string, formId: string): Promise<RecordDefinition[]> {
    if (!this.isBrowser()) {
      const seedRecords = createSeedRecords(appId);
      return seedRecords[`${appId}_${formId}`] || [];
    }
    this.ensureInitialized();

    try {
      const key = `${RECORDS_PREFIX}${appId}_${formId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Error reading records for ${appId}/${formId}:`, err);
      return [];
    }
  }

  public async getRecord(
    appId: string,
    formId: string,
    recordId: string
  ): Promise<RecordDefinition | null> {
    const records = await this.getRecords(appId, formId);
    return records.find((r) => r.id === recordId) || null;
  }

  public async saveRecord(
    appId: string,
    formId: string,
    record: RecordDefinition
  ): Promise<void> {
    if (!this.isBrowser()) return;
    this.ensureInitialized();

    try {
      const records = await this.getRecords(appId, formId);
      const index = records.findIndex((r) => r.id === record.id);
      const updatedRecord = {
        ...record,
        updatedAt: new Date().toISOString(),
      };

      if (index >= 0) {
        records[index] = updatedRecord;
      } else {
        records.unshift(updatedRecord);
      }

      const key = `${RECORDS_PREFIX}${appId}_${formId}`;
      localStorage.setItem(key, JSON.stringify(records));
    } catch (err) {
      console.error("Error saving record to LocalStorage:", err);
      throw err;
    }
  }

  public async deleteRecord(
    appId: string,
    formId: string,
    recordId: string
  ): Promise<void> {
    if (!this.isBrowser()) return;
    this.ensureInitialized();

    try {
      const records = await this.getRecords(appId, formId);
      const filtered = records.filter((r) => r.id !== recordId);
      const key = `${RECORDS_PREFIX}${appId}_${formId}`;
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (err) {
      console.error("Error deleting record from LocalStorage:", err);
      throw err;
    }
  }

  public async resetToSeedData(): Promise<AppDefinition> {
    if (!this.isBrowser()) return createSeedApp();

    try {
      // Clear creator data
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("creator_") || key.startsWith("builder_"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Re-seed
      const seedApp = createSeedApp();
      localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
      localStorage.setItem(APPS_KEY, JSON.stringify([seedApp]));

      const seedRecords = createSeedRecords(seedApp.id);
      for (const [key, records] of Object.entries(seedRecords)) {
        localStorage.setItem(`${RECORDS_PREFIX}${key}`, JSON.stringify(records));
      }

      return seedApp;
    } catch (err) {
      console.error("Error resetting seed data:", err);
      return createSeedApp();
    }
  }

  public async clearAllData(): Promise<void> {
    if (!this.isBrowser()) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("creator_") || key.startsWith("builder_"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

// Export singleton instance
export const storageService = new LocalStorageDataProvider();
