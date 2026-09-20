"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AppDefinition, FormDefinition, RecordDefinition, ReportColumnConfig } from "@/types/schema";
import { storageService } from "@/lib/storage/localStorageProvider";
import { generateId } from "@/lib/utils/idGenerator";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { generateNextAutoNumber } from "@/lib/engine/autoNumberEngine";
import { useToast } from "./ToastContext";

interface LiveAppContextValue {
  app: AppDefinition | null;
  loading: boolean;
  recordsMap: Record<string, RecordDefinition[]>; // formId -> records
  loadApp: (linkName: string) => Promise<boolean>;
  loadFormRecords: (formId: string) => Promise<RecordDefinition[]>;
  createRecord: (formId: string, data: Record<string, any>) => Promise<RecordDefinition | null>;
  updateRecord: (formId: string, recordId: string, data: Record<string, any>) => Promise<boolean>;
  deleteRecord: (formId: string, recordId: string) => Promise<boolean>;
  getDisplayForLookup: (targetFormId: string, displayFieldId: string, recordId: string) => string;
  updateReportColumns: (reportId: string, columns: ReportColumnConfig[]) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const LiveAppContext = createContext<LiveAppContextValue | null>(null);

export const useLiveApp = () => {
  const ctx = useContext(LiveAppContext);
  if (!ctx) {
    throw new Error("useLiveApp must be used within a LiveAppProvider");
  }
  return ctx;
};

export const LiveAppProvider: React.FC<{
  appLinkName: string;
  children: React.ReactNode;
}> = ({ appLinkName, children }) => {
  const [app, setApp] = useState<AppDefinition | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recordsMap, setRecordsMap] = useState<Record<string, RecordDefinition[]>>({});
  const { showToast } = useToast();

  const loadApp = useCallback(
    async (linkName: string): Promise<boolean> => {
      setLoading(true);
      try {
        const loadedApp = await storageService.getApp(linkName);
        if (loadedApp) {
          setApp(loadedApp);
          // Load records for all forms in this app
          const initialMap: Record<string, RecordDefinition[]> = {};
          for (const form of loadedApp.forms) {
            const recs = await storageService.getRecords(loadedApp.id, form.id);
            initialMap[form.id] = recs;
          }
          setRecordsMap(initialMap);
          return true;
        }
        return false;
      } catch (err) {
        console.error("Failed to load live app:", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (appLinkName) {
      loadApp(appLinkName);
    }
  }, [appLinkName, loadApp]);

  const loadFormRecords = useCallback(
    async (formId: string): Promise<RecordDefinition[]> => {
      if (!app) return [];
      const recs = await storageService.getRecords(app.id, formId);
      setRecordsMap((prev) => ({ ...prev, [formId]: recs }));
      return recs;
    },
    [app]
  );

  const createRecord = useCallback(
    async (formId: string, data: Record<string, any>): Promise<RecordDefinition | null> => {
      if (!app) return null;
      const targetForm = app.forms.find((f) => f.id === formId);
      if (!targetForm) return null;

      const existingRecords = recordsMap[formId] || [];

      // Auto-populate Auto Number fields if not set
      const populatedData = { ...data };
      for (const field of targetForm.fields) {
        if (field.type === "autonumber" && field.autonumber && !populatedData[field.id]) {
          populatedData[field.id] = generateNextAutoNumber(
            field.autonumber,
            existingRecords,
            field.id
          );
        }
      }

      const newRecord: RecordDefinition = {
        id: generateId("rec"),
        appId: app.id,
        formId,
        data: populatedData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await storageService.saveRecord(app.id, formId, newRecord);
        setRecordsMap((prev) => ({
          ...prev,
          [formId]: [newRecord, ...(prev[formId] || [])],
        }));
        showToast("Record created successfully", "success");
        return newRecord;
      } catch (err) {
        console.error("Failed to create record:", err);
        showToast("Failed to create record", "error");
        return null;
      }
    },
    [app, recordsMap, showToast]
  );

  const updateRecord = useCallback(
    async (formId: string, recordId: string, data: Record<string, any>): Promise<boolean> => {
      if (!app) return false;
      const current = recordsMap[formId]?.find((r) => r.id === recordId);
      if (!current) return false;

      const updatedRecord: RecordDefinition = {
        ...current,
        data: { ...current.data, ...data },
        updatedAt: new Date().toISOString(),
      };

      try {
        await storageService.saveRecord(app.id, formId, updatedRecord);
        setRecordsMap((prev) => ({
          ...prev,
          [formId]: (prev[formId] || []).map((r) => (r.id === recordId ? updatedRecord : r)),
        }));
        showToast("Record updated successfully", "success");
        return true;
      } catch (err) {
        console.error("Failed to update record:", err);
        showToast("Failed to update record", "error");
        return false;
      }
    },
    [app, recordsMap, showToast]
  );

  const deleteRecord = useCallback(
    async (formId: string, recordId: string): Promise<boolean> => {
      if (!app) return false;
      try {
        await storageService.deleteRecord(app.id, formId, recordId);
        setRecordsMap((prev) => ({
          ...prev,
          [formId]: (prev[formId] || []).filter((r) => r.id !== recordId),
        }));
        showToast("Record deleted", "info");
        return true;
      } catch (err) {
        console.error("Failed to delete record:", err);
        showToast("Failed to delete record", "error");
        return false;
      }
    },
    [app, showToast]
  );

  const getDisplayForLookup = useCallback(
    (targetFormId: string, displayFieldId: string, recordId: string): string => {
      const records = recordsMap[targetFormId] || [];
      return resolveLookupDisplay(recordId, records, displayFieldId);
    },
    [recordsMap]
  );

  const updateReportColumns = useCallback(
    async (reportId: string, columns: ReportColumnConfig[]) => {
      if (!app) return;
      try {
        const updatedReports = app.reports.map((r) =>
          r.id === reportId ? { ...r, columns } : r
        );
        const updatedApp = { ...app, reports: updatedReports, updatedAt: new Date().toISOString() };
        setApp(updatedApp);
        await storageService.saveApp(updatedApp);
      } catch (err) {
        console.error("Failed to update report columns:", err);
      }
    },
    [app]
  );

  const handleRefreshAll = useCallback(async () => {
    if (appLinkName) {
      await loadApp(appLinkName);
    }
  }, [appLinkName, loadApp]);

  return (
    <LiveAppContext.Provider
      value={{
        app,
        loading,
        recordsMap,
        loadApp,
        loadFormRecords,
        createRecord,
        updateRecord,
        deleteRecord,
        getDisplayForLookup,
        updateReportColumns,
        refreshAll: handleRefreshAll,
      }}
    >
      {children}
    </LiveAppContext.Provider>
  );
};
