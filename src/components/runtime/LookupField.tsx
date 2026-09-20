"use client";

import React, { useState, useEffect } from "react";
import { LookupConfig, RecordDefinition } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { resolveLookupDisplay } from "@/lib/engine/lookupEngine";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Search, ChevronDown, X, Check } from "lucide-react";

interface LookupFieldProps {
  label: string;
  value: string; // record ID
  onChange: (recordId: string) => void;
  lookupConfig: LookupConfig;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export const LookupField: React.FC<LookupFieldProps> = ({
  label,
  value,
  onChange,
  lookupConfig,
  error,
  disabled,
  required,
}) => {
  const { app, recordsMap, loadFormRecords } = useLiveApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const targetFormId = lookupConfig.targetFormId;
  const displayFieldId = lookupConfig.displayFieldId;
  const targetForm = app?.forms.find((f) => f.id === targetFormId);

  useEffect(() => {
    if (targetFormId && (!recordsMap[targetFormId] || recordsMap[targetFormId].length === 0)) {
      loadFormRecords(targetFormId);
    }
  }, [targetFormId, recordsMap, loadFormRecords]);

  const targetRecords: RecordDefinition[] = (targetFormId && recordsMap[targetFormId]) || [];

  // Resolve display text for current value
  const currentDisplay = resolveLookupDisplay(value, targetRecords, displayFieldId);

  const filteredRecords = targetRecords.filter((rec) => {
    if (!searchQuery.trim()) return true;
    const dispVal = resolveLookupDisplay(rec.id, [rec], displayFieldId);
    return (
      dispVal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="w-full space-y-1.5">
      <label className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </label>

      <div className="relative flex items-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setModalOpen(true)}
          className={`w-full text-left bg-white border ${
            error
              ? "border-rose-400 focus:ring-rose-300"
              : "border-slate-300 focus:ring-blue-500 focus:border-blue-500"
          } text-slate-900 text-sm rounded-lg px-3 py-2 transition-all flex items-center justify-between shadow-2xs hover:bg-slate-50/50 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
        >
          <span className={currentDisplay ? "text-slate-900 font-medium" : "text-slate-400"}>
            {currentDisplay || `Select ${label || "record"}...`}
          </span>

          <div className="flex items-center gap-1.5 text-slate-400">
            {value && !disabled && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="p-0.5 hover:text-slate-700 rounded"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4" />
          </div>
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

      {/* Record Picker Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Select ${targetForm?.name || label}`}
        description="Choose a record to associate with this field."
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${targetForm?.name || "records"}...`}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {filteredRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No matching records found in {targetForm?.name || "form"}.
              </div>
            ) : (
              filteredRecords.map((rec) => {
                const isSelected = rec.id === value;
                const dispVal = resolveLookupDisplay(rec.id, [rec], displayFieldId);

                return (
                  <div
                    key={rec.id}
                    onClick={() => {
                      onChange(rec.id);
                      setModalOpen(false);
                    }}
                    className={`p-3 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected ? "bg-blue-50/80 font-semibold text-blue-900" : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="font-medium text-slate-900">{dispVal}</div>
                      <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                        ID: {rec.id}
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
