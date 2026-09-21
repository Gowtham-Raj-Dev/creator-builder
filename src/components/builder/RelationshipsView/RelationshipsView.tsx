"use client";

import React from "react";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Badge } from "@/components/ui/FormControls";
import { Network, ArrowRight, Layers, ExternalLink } from "lucide-react";
import Link from "next/link";
import { getBuilderUrl } from "@/lib/utils/routes";

export const RelationshipsView: React.FC = () => {
  const { currentApp } = useAppBuilder();

  if (!currentApp) return null;

  const { relationships, forms } = currentApp;

  return (
    <div className="flex-1 bg-slate-100/60 h-full overflow-y-auto p-8 select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-blue-600" />
              <h1 className="text-base font-bold text-slate-900">Data Relationships Architecture</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visual schema graph tracking all Lookup foreign keys and Subform child record relationships in {currentApp.name}.
            </p>
          </div>
          <Badge variant="primary" size="md">
            {relationships.length} active connection(s)
          </Badge>
        </div>

        {/* Relationship Summary List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {relationships.length === 0 ? (
            <div className="col-span-2 bg-white p-12 text-center rounded-xl border border-slate-200">
              <Network className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <h3 className="text-sm font-semibold text-slate-700">No Relationships Defined Yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Add a <span className="font-semibold text-blue-600">Lookup</span> or{" "}
                <span className="font-semibold text-purple-600">Subform</span> field to connect forms
                together dynamically.
              </p>
            </div>
          ) : (
            relationships.map((rel) => {
              const sourceForm = forms.find((f) => f.id === rel.sourceFormId);
              const targetForm = forms.find((f) => f.id === rel.targetFormId);

              // Field details
              const sourceField = sourceForm?.fields.find(
                (f) => f.id === rel.sourceFieldId || f.linkName === rel.sourceFieldId
              );

              return (
                <div
                  key={rel.id}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-3 hover:border-blue-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={rel.type === "lookup" ? "primary" : "purple"}>
                      {rel.type === "lookup" ? "Lookup Reference" : "Subform Relationship"}
                    </Badge>
                    <span className="text-[11px] font-mono text-slate-400">{rel.id}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Source Form</div>
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {sourceForm?.name || rel.sourceFormId}
                      </div>
                      <div className="text-[11px] font-mono text-blue-600 truncate">
                        {sourceField?.label || rel.sourceFieldId}
                      </div>
                    </div>

                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 shrink-0">
                      <ArrowRight className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Target Master Form</div>
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {targetForm?.name || rel.targetFormId}
                      </div>
                      <div className="text-[11px] font-mono text-emerald-600 truncate">
                        Record ID (id)
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {rel.type === "lookup" ? (
                      <>
                        Stores referenced ID and dynamically renders target field values in forms & reports.
                      </>
                    ) : (
                      <>
                        Child rows stored within parent record with embedded lookup references.
                      </>
                    )}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Visual Entity Cards (ERD Layout) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Form Entity Relationship Map
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {forms.map((form) => {
              return (
                <div
                  key={form.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-600" />
                      <span className="text-xs font-bold text-slate-900">{form.name}</span>
                    </div>
                    <Link
                      href={getBuilderUrl(currentApp.linkName, { tab: "forms", form: form.linkName })}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      Edit <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Fields ({form.fields.length})</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {form.fields.map((f) => (
                        <div
                          key={f.id}
                          className={`flex items-center justify-between text-[11px] px-2 py-1 rounded ${
                            f.type === "lookup"
                              ? "bg-blue-50 text-blue-800 font-medium"
                              : f.type === "subform"
                              ? "bg-purple-50 text-purple-800 font-medium"
                              : "text-slate-700 bg-white border border-slate-100"
                          }`}
                        >
                          <span className="truncate">{f.label}</span>
                          <span className="text-[10px] font-mono opacity-75">{f.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
