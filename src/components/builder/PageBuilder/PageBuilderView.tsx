"use client";

import React, { useState } from "react";
import { PageDefinition, PageComponent, PageComponentType } from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormControls";
import { generateId } from "@/lib/utils/idGenerator";
import {
  LayoutTemplate,
  Plus,
  Trash2,
  ExternalLink,
  Heading,
  Type,
  TrendingUp,
  Minus,
  BarChart3,
  Table,
  Sparkles,
  Info,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";

export const PageBuilderView: React.FC = () => {
  const { currentApp, createPage, updatePage, deletePage } = useAppBuilder();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    currentApp?.pages[0]?.id || null
  );
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  if (!currentApp) return null;

  const activePage = currentApp.pages.find((p) => p.id === selectedPageId) || null;

  const handleCreateNewPage = () => {
    const newPage = createPage("New Analytics Dashboard", "Executive portal and KPI metrics");
    setSelectedPageId(newPage.id);
  };

  const handleAddComponent = (type: PageComponentType) => {
    if (!activePage) return;

    let props: Record<string, any> = {};
    const firstForm = currentApp.forms[0];

    if (type === "heading") {
      props = {
        title: "Executive Business Dashboard",
        subtitle: "Real-time records overview and operational performance metrics",
      };
    } else if (type === "text") {
      props = {
        content: `Live summary: Currently tracking {{${firstForm?.linkName || "form"}.count}} active entries in the system.`,
      };
    } else if (type === "stat_card") {
      props = {
        stats: [
          {
            label: `Total ${firstForm?.name || "Records"}`,
            value: `{{${firstForm?.linkName || "customer"}.count}}`,
            change: "+12% this month",
          },
          {
            label: "Total Sales Invoices",
            value: "{{sales_invoice.count}}",
            change: "+8.4%",
          },
          {
            label: "Total Revenue Generated",
            value: "₹ {{sales_invoice.sum(total_amount)}}",
            change: "+24.8%",
          },
          {
            label: "Average Order Value",
            value: "₹ {{sales_invoice.avg(total_amount)}}",
            change: "Stable",
          },
        ],
      };
    } else if (type === "chart") {
      props = {
        title: `${firstForm?.name || "Module"} Distribution`,
        chartType: "bar",
        formId: firstForm?.id || "",
        groupByFieldId: firstForm?.fields[0]?.id || "",
        metric: "count",
      };
    } else if (type === "report_embed") {
      props = {
        reportId: currentApp.reports[0]?.id || "",
      };
    } else if (type === "divider") {
      props = {};
    }

    const newComp: PageComponent = {
      id: generateId("comp"),
      type,
      props,
    };

    updatePage(activePage.id, {
      components: [...activePage.components, newComp],
    });
  };

  const handleDeleteComponent = (compId: string) => {
    if (!activePage) return;
    updatePage(activePage.id, {
      components: activePage.components.filter((c) => c.id !== compId),
    });
  };

  const handleUpdateComponentProps = (compId: string, updates: Record<string, any>) => {
    if (!activePage) return;
    const updated = activePage.components.map((c) =>
      c.id === compId ? { ...c, props: { ...c.props, ...updates } } : c
    );
    updatePage(activePage.id, { components: updated });
  };

  const copySnippet = (snippet: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(snippet);
    setTimeout(() => setCopiedSnippet(null), 1500);
  };

  return (
    <div className="flex-1 bg-[#f8fafc] h-full flex overflow-hidden select-none min-h-0 min-w-0">
      {/* Pages List */}
      <div className="w-80 border-r border-slate-200 bg-white h-full flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Custom Pages
            </h2>
            <span className="text-[11px] text-slate-400">
              {currentApp.pages.length} visual page(s)
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleCreateNewPage}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            New Page
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
          {currentApp.pages.map((p) => {
            const isSelected = selectedPageId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPageId(p.id)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/70 border-blue-400 shadow-2xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-900 truncate">{p.name}</h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">/{p.linkName}</p>
                  </div>
                  <Link
                    href={`/${currentApp.linkName}/pages/${p.linkName}`}
                    target="_blank"
                    className="text-slate-400 hover:text-blue-600 p-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Page Editor (Independent Scroll Pane) */}
      {activePage ? (
        <div className="flex-1 h-full overflow-y-auto min-h-0 min-w-0 p-6 md:p-8 space-y-6 bg-[#f8fafc]">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 pr-6">
                <Input
                  label="Page Name"
                  value={activePage.name}
                  onChange={(e) => updatePage(activePage.id, { name: e.target.value })}
                />
                <Input
                  label="Page Description"
                  value={activePage.description || ""}
                  onChange={(e) => updatePage(activePage.id, { description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/${currentApp.linkName}/pages/${activePage.linkName}`}
                  target="_blank"
                >
                  <Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                    Open Live
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deletePage(activePage.id)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>

            {/* Dynamic Data Helper Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Live Data Binding Expressions (Click to Copy)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                You can paste these expressions directly into stat cards, headings, and descriptions to show live counts &amp; totals.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {currentApp.forms.map((f) => {
                  const tag = `{{${f.linkName}.count}}`;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => copySnippet(tag)}
                      className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-mono text-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>{tag}</span>
                      {copiedSnippet === tag ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-50" />
                      )}
                    </button>
                  );
                })}
                {/* Also suggest sum for numerical fields */}
                {currentApp.forms.flatMap((f) =>
                  f.fields
                    .filter((field) =>
                      ["number", "currency", "percentage"].includes(field.type)
                    )
                    .map((field) => {
                      const sumTag = `{{${f.linkName}.sum(${field.linkName})}}`;
                      return (
                        <button
                          key={`${f.id}-${field.id}`}
                          type="button"
                          onClick={() => copySnippet(sumTag)}
                          className="px-2.5 py-1 rounded-md bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-mono text-xs transition-colors flex items-center gap-1.5"
                        >
                          <span>{sumTag}</span>
                          {copiedSnippet === sumTag ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 opacity-50" />
                          )}
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            {/* Component Palette */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-2">
                Add Component:
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("heading")}
                icon={<Heading className="w-3.5 h-3.5" />}
              >
                Heading
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("text")}
                icon={<Type className="w-3.5 h-3.5" />}
              >
                Text
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("stat_card")}
                icon={<TrendingUp className="w-3.5 h-3.5" />}
              >
                Stat Cards
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("chart")}
                icon={<BarChart3 className="w-3.5 h-3.5" />}
              >
                Analytics Chart
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("report_embed")}
                icon={<Table className="w-3.5 h-3.5" />}
              >
                Embed Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddComponent("divider")}
                icon={<Minus className="w-3.5 h-3.5" />}
              >
                Divider
              </Button>
            </div>

            {/* Page Canvas Preview */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                Page Canvas ({activePage.components.length} components)
              </div>

              {activePage.components.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Click the buttons above to add headings, charts, stat cards, or embedded reports to this page.
                </div>
              ) : (
                activePage.components.map((comp) => (
                  <div
                    key={comp.id}
                    className="relative group p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 hover:border-blue-300 transition-all"
                  >
                    <button
                      onClick={() => handleDeleteComponent(comp.id)}
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600 rounded bg-white border border-slate-200 shadow-3xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Remove Component"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Heading Config */}
                    {comp.type === "heading" && (
                      <div className="space-y-2">
                        <Input
                          label="Heading Title (supports {{form.count}})"
                          value={comp.props.title || ""}
                          onChange={(e) =>
                            handleUpdateComponentProps(comp.id, { title: e.target.value })
                          }
                        />
                        <Input
                          label="Subtitle / Description"
                          value={comp.props.subtitle || ""}
                          onChange={(e) =>
                            handleUpdateComponentProps(comp.id, { subtitle: e.target.value })
                          }
                        />
                      </div>
                    )}

                    {/* Text Config */}
                    {comp.type === "text" && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-700">Content Text</label>
                        <textarea
                          value={comp.props.content || ""}
                          onChange={(e) =>
                            handleUpdateComponentProps(comp.id, { content: e.target.value })
                          }
                          rows={3}
                          className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                        />
                      </div>
                    )}

                    {/* Stat Cards Config */}
                    {comp.type === "stat_card" && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-slate-700">KPI Stat Cards:</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(comp.props.stats || []).map((s: any, idx: number) => (
                            <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                              <Input
                                label={`Card #${idx + 1} Label`}
                                value={s.label}
                                onChange={(e) => {
                                  const updated = [...comp.props.stats];
                                  updated[idx] = { ...updated[idx], label: e.target.value };
                                  handleUpdateComponentProps(comp.id, { stats: updated });
                                }}
                              />
                              <Input
                                label="Value Expression"
                                value={s.value}
                                onChange={(e) => {
                                  const updated = [...comp.props.stats];
                                  updated[idx] = { ...updated[idx], value: e.target.value };
                                  handleUpdateComponentProps(comp.id, { stats: updated });
                                }}
                                placeholder="e.g. {{customer.count}}"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chart Config */}
                    {comp.type === "chart" && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-blue-600" /> Chart Configuration:
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <Input
                            label="Chart Title"
                            value={comp.props.title || ""}
                            onChange={(e) =>
                              handleUpdateComponentProps(comp.id, { title: e.target.value })
                            }
                          />

                          <Select
                            label="Chart Type"
                            value={comp.props.chartType || "bar"}
                            onChange={(e) =>
                              handleUpdateComponentProps(comp.id, { chartType: e.target.value })
                            }
                          >
                            <option value="bar">Bar Chart</option>
                            <option value="donut">Donut / Pie Chart</option>
                          </Select>

                          <Select
                            label="Data Source Form"
                            value={comp.props.formId || currentApp.forms[0]?.id}
                            onChange={(e) =>
                              handleUpdateComponentProps(comp.id, { formId: e.target.value })
                            }
                          >
                            {currentApp.forms.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Embedded Report Config */}
                    {comp.type === "report_embed" && (
                      <div className="space-y-2">
                        <Select
                          label="Select Report to Embed"
                          value={comp.props.reportId || currentApp.reports[0]?.id}
                          onChange={(e) =>
                            handleUpdateComponentProps(comp.id, { reportId: e.target.value })
                          }
                        >
                          {currentApp.reports.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {comp.type === "divider" && <div className="border-t border-slate-200 my-2" />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
