"use client";

import React, { useMemo } from "react";
import { PageDefinition, PageComponent } from "@/types/schema";
import { useLiveApp } from "@/context/LiveAppContext";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import {
  evaluatePageExpression,
  computeChartData,
  ChartDataPoint,
} from "@/lib/engine/pageEngine";
import {
  LayoutTemplate,
  Plus,
  ArrowRight,
  TrendingUp,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Table,
} from "lucide-react";

export const DynamicPage: React.FC<{ page: PageDefinition }> = ({ page }) => {
  const { app, recordsMap } = useLiveApp();

  if (!app) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {page.components.map((comp) => {
        // 1. Heading Component
        if (comp.type === "heading") {
          const title = evaluatePageExpression(comp.props.title || "", app, recordsMap);
          const subtitle = comp.props.subtitle
            ? evaluatePageExpression(comp.props.subtitle, app, recordsMap)
            : "";

          return (
            <div
              key={comp.id}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs"
            >
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          );
        }

        // 2. Text / Banner Component
        if (comp.type === "text") {
          const content = evaluatePageExpression(comp.props.content || "", app, recordsMap);

          return (
            <div
              key={comp.id}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs text-xs text-slate-700 leading-relaxed whitespace-pre-line"
            >
              {content}
            </div>
          );
        }

        // 3. Stat Cards Component (with dynamic expressions support like {{customer.count}})
        if (comp.type === "stat_card") {
          return (
            <div
              key={comp.id}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {(comp.props.stats || []).map((stat: any, idx: number) => {
                const label = evaluatePageExpression(stat.label || "", app, recordsMap);
                const rawVal = String(stat.value ?? "");
                const val = evaluatePageExpression(rawVal, app, recordsMap);
                const change = stat.change
                  ? evaluatePageExpression(stat.change, app, recordsMap)
                  : null;

                return (
                  <div
                    key={idx}
                    className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-1.5 hover:border-blue-200 transition-all"
                  >
                    <div className="text-xs text-slate-500 font-medium">{label}</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight">{val}</div>
                    {change && (
                      <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {change}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        // 4. Chart Component (Bar / Donut with form aggregation)
        if (comp.type === "chart") {
          const chartType = comp.props.chartType || "bar"; // "bar" | "donut"
          const formId = comp.props.formId || app.forms[0]?.id;
          const targetForm = app.forms.find((f) => f.id === formId);
          const groupByFieldId = comp.props.groupByFieldId || targetForm?.fields[0]?.id || "";
          const metric = comp.props.metric || "count"; // "count" | "sum"
          const measureFieldId = comp.props.measureFieldId;

          const chartData: ChartDataPoint[] = computeChartData(
            formId,
            groupByFieldId,
            metric,
            measureFieldId,
            app,
            recordsMap
          );

          const maxVal = Math.max(...chartData.map((d) => d.value), 1);

          return (
            <div
              key={comp.id}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  {chartType === "donut" ? (
                    <PieChart className="w-4 h-4 text-blue-600" />
                  ) : (
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  )}
                  <h3 className="text-sm font-bold text-slate-900">
                    {comp.props.title || `${targetForm?.name || "Form"} Analytics`}
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {metric === "sum" ? "Sum Aggregation" : "Record Counts"}
                </span>
              </div>

              {chartData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No records available to generate chart. Add records in{" "}
                  <span className="font-semibold text-slate-600">{targetForm?.name}</span>.
                </div>
              ) : chartType === "donut" ? (
                /* Donut Chart with breakdown bars & legend */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* SVG Donut */}
                  <div className="flex justify-center">
                    <svg viewBox="0 0 100 100" className="w-48 h-48 transform -rotate-90">
                      {(() => {
                        let accumulatedPercent = 0;
                        return chartData.map((slice, i) => {
                          const strokeDasharray = `${slice.percentage} ${100 - slice.percentage}`;
                          const strokeDashoffset = -accumulatedPercent;
                          accumulatedPercent += slice.percentage;

                          return (
                            <circle
                              key={i}
                              cx="50"
                              cy="50"
                              r="36"
                              fill="transparent"
                              stroke={slice.color}
                              strokeWidth="18"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                              pathLength="100"
                              className="transition-all hover:opacity-80"
                            />
                          );
                        });
                      })()}
                    </svg>
                  </div>

                  {/* Legend breakdown */}
                  <div className="space-y-2.5">
                    {chartData.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-medium text-slate-800">{item.label}</span>
                          </div>
                          <span className="font-bold text-slate-900">
                            {item.value.toLocaleString()} ({item.percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Bar Chart */
                <div className="space-y-3 pt-2">
                  {chartData.map((item, idx) => {
                    const widthPercent = Math.max(5, Math.round((item.value / maxVal) * 100));

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{item.label}</span>
                          <span className="font-bold text-slate-900">
                            {item.value.toLocaleString()} ({item.percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-lg h-5 overflow-hidden flex p-0.5">
                          <div
                            className="h-full rounded-md transition-all duration-500 flex items-center px-2 text-[10px] text-white font-semibold"
                            style={{
                              width: `${widthPercent}%`,
                              backgroundColor: item.color,
                            }}
                          >
                            {widthPercent > 15 ? item.value.toLocaleString() : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        // 5. Embedded Report Table Component
        if (comp.type === "report_embed") {
          const rep = app.reports.find((r) => r.id === comp.props.reportId) || app.reports[0];
          const repForm = rep ? app.forms.find((f) => f.id === rep.sourceFormId) : null;
          const recs = repForm ? (recordsMap[repForm.id] || []).slice(0, 5) : [];

          if (!rep || !repForm) return null;

          return (
            <div
              key={comp.id}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">{rep.name}</h3>
                </div>
                <Link
                  href={`/${app.linkName}/reports/${rep.linkName}`}
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  View Full Report <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      {rep.columns
                        .filter((c) => c.visible)
                        .slice(0, 5)
                        .map((col) => (
                          <th key={col.fieldId} className="p-3 whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-4 text-center text-slate-400"
                        >
                          No records recorded yet
                        </td>
                      </tr>
                    ) : (
                      recs.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          {rep.columns
                            .filter((c) => c.visible)
                            .slice(0, 5)
                            .map((col) => (
                              <td key={col.fieldId} className="p-3 whitespace-nowrap">
                                {String(r.data?.[col.fieldId] ?? "-")}
                              </td>
                            ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        // 6. Divider Component
        if (comp.type === "divider") {
          return <div key={comp.id} className="border-t border-slate-200 my-4" />;
        }

        return null;
      })}

      {/* Quick Launch Cards for Available Modules */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Available Application Modules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {app.forms.map((form) => {
            const defaultRep = app.reports.find((r) => r.sourceFormId === form.id);
            const count = (recordsMap[form.id] || []).length;
            const href = defaultRep
              ? `/${app.linkName}/reports/${defaultRep.linkName}`
              : `/${app.linkName}/${form.linkName}`;

            return (
              <Link
                key={form.id}
                href={href}
                className="p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex items-center justify-between group"
              >
                <div>
                  <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                    {form.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {count} records &bull; {form.fields.length} fields
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};
