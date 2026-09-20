"use client";

import React, { useState, useEffect } from "react";
import {
  WorkflowDefinition,
  FormDefinition,
  WorkflowAction,
  WorkflowTriggerType,
  WorkflowActionType,
  VisualCondition,
  VisualCalculation,
  CrossFormUpdateConfig,
} from "@/types/schema";
import { useAppBuilder } from "@/context/AppBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input, Select, Badge } from "@/components/ui/FormControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { generateId } from "@/lib/utils/idGenerator";
import { evaluateSafeExpression, executeSafeScript } from "@/lib/engine/evaluator";
import { executeWorkflows } from "@/lib/engine/workflowEngine";
import { WORKFLOW_TEMPLATES, WorkflowTemplate } from "@/lib/engine/workflowTemplates";
import {
  Zap,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  Code,
  LayoutGrid,
  Sparkles,
  AlertCircle,
  HelpCircle,
  BookOpen,
  X,
  Copy,
  Info,
  Layers,
  ChevronRight,
  Calculator,
  Sliders,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowRightLeft,
  Filter,
  Check,
} from "lucide-react";

export const WorkflowBuilderView: React.FC = () => {
  const { currentApp, createWorkflow, updateWorkflow, deleteWorkflow } = useAppBuilder();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [filterFormId, setFilterFormId] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Test Simulator state
  const [testContext, setTestContext] = useState<string>(
    '{"quantity": 5, "rate": 100, "discount": 15, "customer_name": ""}'
  );
  const [testResult, setTestResult] = useState<any>(null);
  const activeWorkflow = currentApp?.workflows.find((w) => w.id === selectedWorkflowId) || null;
  const activeForm = activeWorkflow
    ? currentApp?.forms.find((f) => f.id === activeWorkflow.formId)
    : null;

  useEffect(() => {
    if (activeForm) {
      const defaultCtx: Record<string, any> = {};
      activeForm.fields.forEach((f) => {
        defaultCtx[f.linkName] = f.defaultValue ?? "";
      });
      setTestContext(JSON.stringify(defaultCtx, null, 2));
      setTestResult(null);
    }
  }, [activeWorkflow?.id, activeForm?.id]);

  if (!currentApp) return null;

  const workflows = currentApp.workflows.filter((w) =>
    filterFormId === "all" ? true : w.formId === filterFormId
  );

  const handleCreateNew = () => {
    const defaultForm = currentApp.forms[0];
    const newWf = createWorkflow({
      name: "New Field Calculation",
      description: "Triggered on user input to compute or validate field values",
      formId: defaultForm?.id || "",
      mode: "visual",
      trigger: {
        type: "onUserInput",
        fieldId: defaultForm?.fields[0]?.id || "",
      },
      actions: [
        {
          id: generateId("act"),
          type: "calculateValue",
          targetFieldId: defaultForm?.fields[1]?.id || "",
          expression: "quantity * rate",
        },
      ],
      active: true,
    });
    setSelectedWorkflowId(newWf.id);
  };

  const handleApplyTemplate = (tpl: WorkflowTemplate) => {
    const targetForm = activeForm || currentApp.forms[0];
    if (!targetForm) return;

    if (activeWorkflow) {
      updateWorkflow(activeWorkflow.id, {
        name: tpl.name,
        description: tpl.description,
        mode: tpl.mode,
        codeScript: tpl.codeScript,
        trigger: {
          ...activeWorkflow.trigger,
          type: tpl.triggerType,
        },
      });
    } else {
      const newWf = createWorkflow({
        name: tpl.name,
        description: tpl.description,
        formId: targetForm.id,
        mode: tpl.mode,
        codeScript: tpl.codeScript,
        trigger: {
          type: tpl.triggerType,
          fieldId: targetForm.fields[0]?.id || "",
        },
        actions: [],
        active: true,
      });
      setSelectedWorkflowId(newWf.id);
    }
    setIsTemplateModalOpen(false);
  };

  const handleAddAction = () => {
    if (!activeWorkflow) return;
    const newAction: WorkflowAction = {
      id: generateId("act"),
      type: "calculateValue",
      targetFieldId: activeForm?.fields[0]?.id || "",
      expression: "",
    };
    updateWorkflow(activeWorkflow.id, {
      actions: [...activeWorkflow.actions, newAction],
    });
  };

  const handleUpdateAction = (actionId: string, updates: Partial<WorkflowAction>) => {
    if (!activeWorkflow) return;
    const updated = activeWorkflow.actions.map((act) =>
      act.id === actionId ? { ...act, ...updates } : act
    );
    updateWorkflow(activeWorkflow.id, { actions: updated });
  };

  const handleDeleteAction = (actionId: string) => {
    if (!activeWorkflow) return;
    const filtered = activeWorkflow.actions.filter((act) => act.id !== actionId);
    updateWorkflow(activeWorkflow.id, { actions: filtered });
  };

  const handleRunSimulator = () => {
    if (!activeWorkflow || !activeForm) return;
    let parsedCtx: Record<string, any> = {};
    try {
      parsedCtx = JSON.parse(testContext);
    } catch (jsonErr: any) {
      try {
        // Relaxed parser: auto-quote unquoted formula expressions like quantity * unit_price
        const relaxed = testContext.replace(
          /:\s*([a-zA-Z_][a-zA-Z0-9_\s*+/-]*)([,}\n\r])/g,
          (match, expr, endChar) => {
            const trimmed = expr.trim();
            if (
              trimmed === "true" ||
              trimmed === "false" ||
              trimmed === "null" ||
              (!isNaN(Number(trimmed)) && !trimmed.includes(" "))
            ) {
              return match;
            }
            return `: "${trimmed}"${endChar}`;
          }
        );
        parsedCtx = JSON.parse(relaxed);
      } catch (err2) {
        setTestResult({
          success: false,
          error: `Invalid JSON syntax: ${jsonErr.message}. Please use valid JSON (e.g. "total_cost": 0).`,
        });
        return;
      }
    }

    // Auto-evaluate formula expressions or 2-field multiplication inside parsedCtx
    for (const [key, val] of Object.entries(parsedCtx)) {
      if (typeof val === "string") {
        const lowerVal = val.toLowerCase().trim();
        if (
          lowerVal.includes("*") ||
          lowerVal.includes("multiple") ||
          lowerVal.includes("multiply") ||
          lowerVal.includes("here give")
        ) {
          let exprToEval = lowerVal
            .replace(/\bqunaity\b/g, "quantity")
            .replace(/\bunit\s+price\b/g, "unit_price");

          if (
            lowerVal.includes("multiple") ||
            lowerVal.includes("multiply") ||
            lowerVal.includes("here give")
          ) {
            exprToEval = "quantity * unit_price";
          }

          const evaluated = evaluateSafeExpression(exprToEval, parsedCtx);
          if (evaluated !== undefined && !Number.isNaN(evaluated)) {
            parsedCtx[key] = evaluated;
          }
        }
      }
    }

    try {
      if (activeWorkflow.mode === "code" && activeWorkflow.codeScript) {
        // Execute Code Mode script
        const res = executeSafeScript(activeWorkflow.codeScript, parsedCtx, {
          currentForm: activeForm,
          allForms: currentApp.forms,
        });
        const hasError = res.messages.some((m) => m.type === "error");
        setTestResult({
          mode: "code",
          success: !hasError,
          updatedValues: res.updatedValues,
          popupAlert: res.popupAlert || null,
          blockedSubmit: res.shouldBlockSubmit,
          messages: res.messages,
          hiddenFields: res.hiddenFields,
          readonlyFields: res.readonlyFields,
        });
        return;
      }

      // Visual Mode Actions: execute directly through workflowEngine
      const res = executeWorkflows(
        [activeWorkflow],
        activeWorkflow.trigger.type,
        undefined,
        parsedCtx,
        activeForm,
        currentApp.forms
      );

      setTestResult({
        mode: "visual",
        success: !res.shouldBlockSubmit,
        updatedValues: res.updatedValues,
        popupAlert: res.popupAlert || null,
        blockedSubmit: res.shouldBlockSubmit,
        messages: res.messages,
        hiddenFields: res.fieldVisibility,
        readonlyFields: res.fieldReadonly,
      });
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    }
  };

  const insertSnippet = (snippet: string) => {
    if (!activeWorkflow) return;
    const current = activeWorkflow.codeScript || "";
    const updated = current ? `${current}\n${snippet}` : snippet;
    updateWorkflow(activeWorkflow.id, { codeScript: updated });
  };

  const filteredTemplates =
    selectedCategory === "All"
      ? WORKFLOW_TEMPLATES
      : WORKFLOW_TEMPLATES.filter((t) => t.category === selectedCategory);

  return (
    <div className="flex-1 bg-[#f8fafc] h-full flex overflow-hidden select-none min-h-0 min-w-0">
      {/* Workflows Navigation List (Independent Scroll Pane) */}
      <div className="w-80 border-r border-slate-200 bg-white h-full flex flex-col shrink-0 min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Workflows
            </h2>
            <span className="text-[11px] text-slate-400">
              {workflows.length} active automations
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsTemplateModalOpen(true)}
              title="Browse Pre-built Templates"
              icon={<BookOpen className="w-3.5 h-3.5" />}
            >
              Templates
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNew}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              New
            </Button>
          </div>
        </div>

        {/* Filter by Form */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <select
            value={filterFormId}
            onChange={(e) => setFilterFormId(e.target.value)}
            className="w-full text-xs rounded-md border border-slate-200 bg-white px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Forms ({currentApp.forms.length})</option>
            {currentApp.forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Workflow Cards (Scrollable List) */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
          {workflows.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-400 text-xs">
              <Zap className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-medium text-slate-600">No workflows found</p>
              <p className="mt-1 text-slate-400">Create calculations and field validation rules.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTemplateModalOpen(true)}
                className="mt-3"
                icon={<BookOpen className="w-3.5 h-3.5" />}
              >
                Browse Templates
              </Button>
            </div>
          ) : (
            workflows.map((wf) => {
              const form = currentApp.forms.find((f) => f.id === wf.formId);
              const isSelected = selectedWorkflowId === wf.id;

              return (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-50/70 border-blue-400 shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h4 className="text-xs font-semibold text-slate-900 truncate">
                          {wf.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        Form: <span className="font-medium text-slate-700">{form?.name || "None"}</span>
                      </p>
                    </div>
                    <Badge variant="purple" size="sm">
                      {wf.trigger.type}
                    </Badge>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>
                      {wf.mode === "code" ? "Scripted" : `${wf.actions.length} action(s)`}
                    </span>
                    <span className="capitalize font-semibold text-slate-600">
                      {wf.mode === "code" ? "Code Mode" : "Visual Mode"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workflow Editor Panel (Independent Scroll Pane) */}
      {activeWorkflow ? (
        <div className="flex-1 h-full overflow-y-auto min-h-0 min-w-0 p-6 md:p-8 flex flex-col bg-[#f8fafc]">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {/* Header info */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs flex items-start justify-between">
              <div className="space-y-1.5 flex-1 pr-4">
                <Input
                  label="Workflow Name"
                  value={activeWorkflow.name}
                  onChange={(e) =>
                    updateWorkflow(activeWorkflow.id, { name: e.target.value })
                  }
                  placeholder="e.g. Validate Customer and Show Popup"
                />
                <Input
                  label="Description"
                  value={activeWorkflow.description || ""}
                  onChange={(e) =>
                    updateWorkflow(activeWorkflow.id, { description: e.target.value })
                  }
                  placeholder="What does this workflow automate?"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTemplateModalOpen(true)}
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                >
                  Templates
                </Button>
                <Button
                  variant={activeWorkflow.mode === "code" ? "primary" : "outline"}
                  size="sm"
                  onClick={() =>
                    updateWorkflow(activeWorkflow.id, {
                      mode: activeWorkflow.mode === "code" ? "visual" : "code",
                    })
                  }
                  icon={
                    activeWorkflow.mode === "code" ? (
                      <LayoutGrid className="w-3.5 h-3.5" />
                    ) : (
                      <Code className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {activeWorkflow.mode === "code" ? "Switch to Visual" : "Switch to Code"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteId(activeWorkflow.id)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>

            {/* Target Form & Trigger Config */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Trigger Event (WHEN)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  label="Target Form"
                  value={activeWorkflow.formId}
                  onChange={(e) =>
                    updateWorkflow(activeWorkflow.id, { formId: e.target.value })
                  }
                >
                  {currentApp.forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Event Type"
                  value={activeWorkflow.trigger.type}
                  onChange={(e) =>
                    updateWorkflow(activeWorkflow.id, {
                      trigger: {
                        ...activeWorkflow.trigger,
                        type: e.target.value as WorkflowTriggerType,
                      },
                    })
                  }
                >
                  <option value="onSubmit">On Submit (Check fields & show popup)</option>
                  <option value="onValidate">On Validate (Before save)</option>
                  <option value="onUserInput">On User Input (Field change)</option>
                  <option value="onLoad">On Form Load</option>
                  <option value="onSuccess">On Success</option>
                </Select>

                {activeWorkflow.trigger.type === "onUserInput" && (
                  <Select
                    label="Source Field"
                    value={activeWorkflow.trigger.fieldId || ""}
                    onChange={(e) =>
                      updateWorkflow(activeWorkflow.id, {
                        trigger: {
                          ...activeWorkflow.trigger,
                          fieldId: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Any field change</option>
                    {activeForm?.fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} ({f.linkName})
                      </option>
                    ))}
                    {activeForm?.fields
                      .filter((f) => f.type === "subform" && f.subform)
                      .flatMap((sf) =>
                        (sf.subform?.columns || []).map((col) => (
                          <option key={col.id} value={col.id}>
                            {sf.label} → {col.label} ({col.linkName})
                          </option>
                        ))
                      )}
                  </Select>
                )}
              </div>
            </div>

            {/* Code Mode Editor OR Visual Mode Actions */}
            {activeWorkflow.mode === "code" ? (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Workflow Script Code (Code Mode)
                    </h3>
                  </div>
                  <Badge variant="purple" size="sm">
                    JavaScript / Expression Syntax
                  </Badge>
                </div>

                {/* Quick Helper Chips */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Form Field Link Names (Click to insert):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeForm?.fields.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => insertSnippet(f.linkName)}
                        className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 border border-slate-200 text-blue-700 font-mono text-[11px] transition-colors shadow-3xs"
                        title={`Field: ${f.label}`}
                      >
                        {f.linkName}
                      </button>
                    ))}
                  </div>

                  <div className="text-[11px] font-semibold text-slate-700 pt-1">
                    Available Workflow Functions:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        insertSnippet(
                          'if (!customer_name) {\n  showPopup("Please enter customer name!");\n  blockSubmit();\n}'
                        )
                      }
                      className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-mono text-[10px] transition-colors"
                    >
                      showPopup(&quot;...&quot;) &amp; blockSubmit()
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('amount = quantity * rate;')}
                      className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 font-mono text-[10px] transition-colors"
                    >
                      amount = quantity * rate
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertSnippet(
                          'if (discount > 20) {\n  alert("Discount exceeds normal threshold");\n}'
                        )
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[10px] transition-colors"
                    >
                      if (condition) &#123; ... &#125;
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('hideField("reason");')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[10px] transition-colors"
                    >
                      hideField(&quot;...&quot;)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('setReadonly("total");')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-mono text-[10px] transition-colors"
                    >
                      setReadonly(&quot;...&quot;)
                    </button>
                  </div>
                </div>

                {/* Monospace Code Editor */}
                <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-slate-950">
                  <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Code className="w-3.5 h-3.5 text-blue-400" /> script.js
                    </span>
                    <span>Safe Sandbox Runner</span>
                  </div>
                  <textarea
                    value={activeWorkflow.codeScript || ""}
                    onChange={(e) =>
                      updateWorkflow(activeWorkflow.id, { codeScript: e.target.value })
                    }
                    rows={9}
                    placeholder={`// Enter workflow logic, e.g.\nif (!customer_name) {\n  showPopup("Customer Name cannot be empty");\n  blockSubmit();\n}\namount = quantity * rate;`}
                    className="w-full bg-slate-950 text-slate-100 font-mono text-xs p-3.5 focus:outline-none leading-relaxed resize-y selection:bg-blue-600/40"
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              /* 100% No-Code Visual Actions Studio */
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Visual Actions & Rules (Zero Code)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Configure automated calculations, validations, field copies, and cross-form adjustments visually.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddAction}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Action
                  </Button>
                </div>

                <div className="space-y-4">
                  {activeWorkflow.actions.map((action, idx) => {
                    const hasConditions = (action.visualConditions && action.visualConditions.length > 0) || Boolean(action.condition);

                    return (
                      <div
                        key={action.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-slate-300 transition-all space-y-4 shadow-3xs"
                      >
                        {/* Action Header & Summary Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-700">
                              Action #{idx + 1}
                            </span>
                            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                              {action.type === "calculateValue" && "🧮 "}
                              {action.type === "setValue" && "✍️ "}
                              {action.type === "copyField" && "📋 "}
                              {action.type === "showPopup" && "⚠️ "}
                              {action.type === "setHidden" && "👁️ "}
                              {action.type === "setReadonly" && "🔒 "}
                              {action.type === "clearField" && "🧹 "}
                              {action.type === "updateOtherForm" && "🔄 "}
                              {action.type}
                            </span>
                          </div>

                          <button
                            onClick={() => handleDeleteAction(action.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                            title="Delete action"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Action Type & Target Field Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Select
                            label="Action Type"
                            value={action.type}
                            onChange={(e) =>
                              handleUpdateAction(action.id, {
                                type: e.target.value as WorkflowActionType,
                              })
                            }
                          >
                            <option value="calculateValue">Calculate Field Value (Formula)</option>
                            <option value="setValue">Set Field Literal Value</option>
                            <option value="copyField">Copy Value from Another Field</option>
                            <option value="showPopup">Show Alert Popup Modal (Blocks Submit)</option>
                            <option value="showMessage">Show Alert Notice Banner</option>
                            <option value="setHidden">Hide Field</option>
                            <option value="setReadonly">Lock Field (Make Read-only)</option>
                            <option value="clearField">Clear Field Value</option>
                            <option value="updateOtherForm">Cross-Form Stock / Record Adjustment</option>
                            <option value="blockSubmit">Block Form Submission</option>
                          </Select>

                          {["calculateValue", "setValue", "copyField", "validate", "setHidden", "setReadonly", "clearField"].includes(
                            action.type
                          ) && (
                            <Select
                              label="Target Field"
                              value={action.targetFieldId || ""}
                              onChange={(e) =>
                                handleUpdateAction(action.id, {
                                  targetFieldId: e.target.value,
                                })
                              }
                            >
                              <option value="">Select target field...</option>
                              {activeForm?.fields.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label} ({f.linkName})
                                </option>
                              ))}
                              {activeForm?.fields
                                .filter((f) => f.type === "subform" && f.subform)
                                .flatMap((sf) =>
                                  (sf.subform?.columns || []).map((col) => (
                                    <option key={col.id} value={col.id}>
                                      {sf.label} → {col.label} ({col.linkName})
                                    </option>
                                  ))
                                )}
                            </Select>
                          )}
                        </div>

                        {/* 1. Calculate Value (No-Code Math or Custom Formula) */}
                        {action.type === "calculateValue" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Calculator className="w-3.5 h-3.5 text-blue-600" />
                                Calculation Builder
                              </span>
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateAction(action.id, {
                                      visualCalculation: action.visualCalculation
                                        ? undefined
                                        : {
                                            operand1FieldId: activeForm?.fields[0]?.id || "",
                                            operation: "*",
                                            operand2Type: "field",
                                            operand2FieldId: activeForm?.fields[1]?.id || "",
                                          },
                                    })
                                  }
                                  className="text-[11px] text-blue-600 hover:underline font-medium"
                                >
                                  {action.visualCalculation ? "Switch to Custom Formula" : "Switch to Visual Math Builder"}
                                </button>
                              </div>
                            </div>

                            {action.visualCalculation ? (
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end">
                                <Select
                                  label="Operand 1 (Field)"
                                  value={action.visualCalculation.operand1FieldId || ""}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, {
                                      visualCalculation: {
                                        ...action.visualCalculation!,
                                        operand1FieldId: e.target.value,
                                      },
                                    })
                                  }
                                >
                                  {activeForm?.fields.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.label}
                                    </option>
                                  ))}
                                  {activeForm?.fields
                                    .filter((f) => f.type === "subform" && f.subform)
                                    .flatMap((sf) =>
                                      (sf.subform?.columns || []).map((col) => (
                                        <option key={col.id} value={col.id}>
                                          {sf.label} → {col.label}
                                        </option>
                                      ))
                                    )}
                                </Select>

                                <Select
                                  label="Operator"
                                  value={action.visualCalculation.operation}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, {
                                      visualCalculation: {
                                        ...action.visualCalculation!,
                                        operation: e.target.value as any,
                                      },
                                    })
                                  }
                                >
                                  <option value="*">× Multiply</option>
                                  <option value="+">+ Add</option>
                                  <option value="-">- Subtract</option>
                                  <option value="/">÷ Divide</option>
                                </Select>

                                <Select
                                  label="Operand 2 Type"
                                  value={action.visualCalculation.operand2Type}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, {
                                      visualCalculation: {
                                        ...action.visualCalculation!,
                                        operand2Type: e.target.value as any,
                                      },
                                    })
                                  }
                                >
                                  <option value="field">From Field</option>
                                  <option value="literal">Fixed Number</option>
                                </Select>

                                {action.visualCalculation.operand2Type === "field" ? (
                                  <Select
                                    label="Operand 2 (Field)"
                                    value={action.visualCalculation.operand2FieldId || ""}
                                    onChange={(e) =>
                                      handleUpdateAction(action.id, {
                                        visualCalculation: {
                                          ...action.visualCalculation!,
                                          operand2FieldId: e.target.value,
                                        },
                                      })
                                    }
                                  >
                                    {activeForm?.fields.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.label}
                                      </option>
                                    ))}
                                    {activeForm?.fields
                                      .filter((f) => f.type === "subform" && f.subform)
                                      .flatMap((sf) =>
                                        (sf.subform?.columns || []).map((col) => (
                                          <option key={col.id} value={col.id}>
                                            {sf.label} → {col.label}
                                          </option>
                                        ))
                                      )}
                                  </Select>
                                ) : (
                                  <Input
                                    label="Operand 2 (Number)"
                                    type="number"
                                    value={action.visualCalculation.operand2Literal ?? 0}
                                    onChange={(e) =>
                                      handleUpdateAction(action.id, {
                                        visualCalculation: {
                                          ...action.visualCalculation!,
                                          operand2Literal: parseFloat(e.target.value) || 0,
                                        },
                                      })
                                    }
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  label="Formula Expression"
                                  value={action.expression || ""}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, {
                                      expression: e.target.value,
                                    })
                                  }
                                  placeholder="e.g. quantity * rate or (price * 0.9)"
                                />
                                <p className="text-[11px] text-slate-400">
                                  Use field link names like <span className="font-mono text-slate-600">quantity, rate, discount</span>.
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. Copy Field Value */}
                        {action.type === "copyField" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <Select
                              label="Copy Value From (Source Field)"
                              value={action.copySourceFieldId || ""}
                              onChange={(e) =>
                                handleUpdateAction(action.id, {
                                  copySourceFieldId: e.target.value,
                                })
                              }
                            >
                              <option value="">Select source field to copy from...</option>
                              {activeForm?.fields
                                .filter((f) => f.id !== action.targetFieldId)
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label} ({f.linkName})
                                  </option>
                                ))}
                            </Select>
                          </div>
                        )}

                        {/* 3. Set Literal Value */}
                        {action.type === "setValue" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <Input
                              label="Literal Value to Assign"
                              value={action.value || ""}
                              onChange={(e) =>
                                handleUpdateAction(action.id, { value: e.target.value })
                              }
                              placeholder="e.g. Active, 100, Bengaluru, true"
                            />
                          </div>
                        )}

                        {/* 4. Show Alert Popup Modal */}
                        {action.type === "showPopup" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="md:col-span-2">
                                <Input
                                  label="Alert Message"
                                  value={action.message || ""}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, { message: e.target.value })
                                  }
                                  placeholder="e.g. Required customer is missing! Please select a customer."
                                />
                              </div>
                              <Select
                                label="Alert Type"
                                value={action.popupType || "warning"}
                                onChange={(e) =>
                                  handleUpdateAction(action.id, { popupType: e.target.value as any })
                                }
                              >
                                <option value="warning">Warning (Yellow)</option>
                                <option value="error">Error (Red)</option>
                                <option value="info">Info (Blue)</option>
                              </Select>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                checked={action.blockSubmitOnPopup !== false}
                                onChange={(e) =>
                                  handleUpdateAction(action.id, {
                                    blockSubmitOnPopup: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>Block Form Submission when this alert appears</span>
                            </label>
                          </div>
                        )}

                        {/* 5. Show Message Banner */}
                        {action.type === "showMessage" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <Input
                              label="Notification Banner Message"
                              value={action.message || ""}
                              onChange={(e) =>
                                handleUpdateAction(action.id, { message: e.target.value })
                              }
                              placeholder="Message text to display in form banner"
                            />
                          </div>
                        )}

                        {/* 6. Cross-Form Stock / Counter Adjustment */}
                        {action.type === "updateOtherForm" && (
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Cross-Form Inward / Outward Transaction Sync</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <Select
                                label="Target Form to Update"
                                value={action.crossFormUpdate?.targetFormId || ""}
                                onChange={(e) =>
                                  handleUpdateAction(action.id, {
                                    crossFormUpdate: {
                                      targetFormId: e.target.value,
                                      matchLookupFieldId: action.crossFormUpdate?.matchLookupFieldId || "",
                                      updateFieldId: action.crossFormUpdate?.updateFieldId || "",
                                      operation: action.crossFormUpdate?.operation || "increment",
                                      sourceFieldId: action.crossFormUpdate?.sourceFieldId || "",
                                    },
                                  })
                                }
                              >
                                <option value="">Select form...</option>
                                {currentApp.forms
                                  .filter((f) => f.id !== activeForm?.id)
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                              </Select>

                              <Select
                                label="Operation"
                                value={action.crossFormUpdate?.operation || "increment"}
                                onChange={(e) =>
                                  handleUpdateAction(action.id, {
                                    crossFormUpdate: {
                                      ...action.crossFormUpdate!,
                                      operation: e.target.value as any,
                                    },
                                  })
                                }
                              >
                                <option value="increment">+ Increment (Inward / Purchase)</option>
                                <option value="decrement">- Decrement (Outward / Usage)</option>
                                <option value="set">= Set to Value</option>
                              </Select>

                              <Select
                                label="Quantity Field (This Form)"
                                value={action.crossFormUpdate?.sourceFieldId || ""}
                                onChange={(e) =>
                                  handleUpdateAction(action.id, {
                                    crossFormUpdate: {
                                      ...action.crossFormUpdate!,
                                      sourceFieldId: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">Select amount/qty field...</option>
                                {activeForm?.fields.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        )}

                        {/* Condition Builder (WHEN should this action run?) */}
                        <div className="pt-2 border-t border-slate-200/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5 text-slate-400" />
                              Rule Conditions ({action.visualConditions?.length || 0})
                            </span>
                            <div className="flex items-center gap-2">
                              {action.visualConditions && action.visualConditions.length > 1 && (
                                <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-md text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAction(action.id, { conditionLogic: "AND" })}
                                    className={`px-2 py-0.5 rounded ${action.conditionLogic !== "OR" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                                  >
                                    AND
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAction(action.id, { conditionLogic: "OR" })}
                                    className={`px-2 py-0.5 rounded ${action.conditionLogic === "OR" ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
                                  >
                                    OR
                                  </button>
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const newCond: VisualCondition = {
                                    id: generateId("cond"),
                                    fieldId: activeForm?.fields[0]?.id || "",
                                    operator: "equals",
                                    compareType: "literal",
                                    value: "",
                                  };
                                  handleUpdateAction(action.id, {
                                    visualConditions: [...(action.visualConditions || []), newCond],
                                  });
                                }}
                                icon={<Plus className="w-3 h-3" />}
                              >
                                Add Condition
                              </Button>
                            </div>
                          </div>

                          {/* Render Condition Rows */}
                          {action.visualConditions && action.visualConditions.length > 0 && (
                            <div className="space-y-2 pt-1">
                              {action.visualConditions.map((cond, cIdx) => (
                                <div
                                  key={cond.id || cIdx}
                                  className="grid grid-cols-1 md:grid-cols-12 gap-2 p-2.5 rounded-lg bg-white border border-slate-200 items-center text-xs"
                                >
                                  <div className="md:col-span-4">
                                    <select
                                      value={cond.fieldId}
                                      onChange={(e) => {
                                        const updated = [...(action.visualConditions || [])];
                                        updated[cIdx] = { ...updated[cIdx], fieldId: e.target.value };
                                        handleUpdateAction(action.id, { visualConditions: updated });
                                      }}
                                      className="w-full text-xs p-1.5 rounded border border-slate-300 bg-slate-50 focus:bg-white"
                                    >
                                      {activeForm?.fields.map((f) => (
                                        <option key={f.id} value={f.id}>
                                          {f.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="md:col-span-3">
                                    <select
                                      value={cond.operator}
                                      onChange={(e) => {
                                        const updated = [...(action.visualConditions || [])];
                                        updated[cIdx] = { ...updated[cIdx], operator: e.target.value as any };
                                        handleUpdateAction(action.id, { visualConditions: updated });
                                      }}
                                      className="w-full text-xs p-1.5 rounded border border-slate-300 bg-slate-50 focus:bg-white"
                                    >
                                      <option value="equals">Equals (=)</option>
                                      <option value="not_equals">Does Not Equal (≠)</option>
                                      <option value="greater_than">Greater Than (&gt;)</option>
                                      <option value="less_than">Less Than (&lt;)</option>
                                      <option value="contains">Contains Text</option>
                                      <option value="is_empty">Is Blank / Empty</option>
                                      <option value="is_not_empty">Is Not Empty</option>
                                    </select>
                                  </div>

                                  {!["is_empty", "is_not_empty"].includes(cond.operator) && (
                                    <div className="md:col-span-4">
                                      <input
                                        type="text"
                                        value={cond.value || ""}
                                        onChange={(e) => {
                                          const updated = [...(action.visualConditions || [])];
                                          updated[cIdx] = { ...updated[cIdx], value: e.target.value };
                                          handleUpdateAction(action.id, { visualConditions: updated });
                                        }}
                                        placeholder="Compare value..."
                                        className="w-full text-xs p-1.5 rounded border border-slate-300 bg-slate-50 focus:bg-white"
                                      />
                                    </div>
                                  )}

                                  <div className="md:col-span-1 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (action.visualConditions || []).filter((_, i) => i !== cIdx);
                                        handleUpdateAction(action.id, { visualConditions: updated });
                                      }}
                                      className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                      title="Remove condition"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expression Simulator & Testing Console */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-3xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Interactive Workflow Simulator
                  </h3>
                </div>
                <Button
                  size="sm"
                  onClick={handleRunSimulator}
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  Run Simulation
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">
                  Simulated Record Input Data (JSON)
                </label>
                <textarea
                  value={testContext}
                  onChange={(e) => setTestContext(e.target.value)}
                  rows={2}
                  className="w-full font-mono text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs font-mono space-y-2 ${
                    testResult.success
                      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                      : "bg-rose-50 text-rose-900 border-rose-200"
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      {testResult.success ? "Execution Succeeded:" : "Execution Error:"}
                    </span>
                    {testResult.blockedSubmit && (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-sans font-semibold">
                        SUBMISSION BLOCKED
                      </span>
                    )}
                  </div>

                  {testResult.popupAlert && (
                    <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded text-amber-900 flex items-start gap-2 font-sans">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Popup Triggered: </span>
                        {typeof testResult.popupAlert === "string"
                          ? testResult.popupAlert
                          : testResult.popupAlert.message}
                      </div>
                    </div>
                  )}

                  {testResult.messages && testResult.messages.length > 0 && (
                    <div className="space-y-1.5 font-sans">
                      {testResult.messages.map((m: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                            m.type === "error"
                              ? "bg-rose-100/90 border-rose-300 text-rose-900"
                              : m.type === "warning"
                              ? "bg-amber-100/80 border-amber-300 text-amber-900"
                              : "bg-blue-100/80 border-blue-300 text-blue-900"
                          }`}
                        >
                          <AlertCircle
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              m.type === "error"
                                ? "text-rose-700"
                                : m.type === "warning"
                                ? "text-amber-700"
                                : "text-blue-700"
                            }`}
                          />
                          <div>
                            <span className="font-bold uppercase tracking-wider text-[10px] block">
                              {m.type === "error" ? "Script Error" : m.type === "warning" ? "Warning" : "Info"}
                            </span>
                            <span>{m.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <pre className="whitespace-pre-wrap overflow-x-auto text-[11px] max-h-40 overflow-y-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-slate-400 text-center overflow-y-auto min-h-0 min-w-0 bg-[#f8fafc]">
          <Zap className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Select or Create a Workflow</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Configure calculations like <span className="font-mono text-slate-600">Amount = Quantity * Rate</span> or validation rules with modal alerts.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsTemplateModalOpen(true)}
              icon={<BookOpen className="w-3.5 h-3.5" />}
            >
              Browse Templates
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNew}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Create Workflow
            </Button>
          </div>
        </div>
      )}

      {/* Templates Library Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Workflow Recipes &amp; Idea Library
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pre-configured automations ready to deploy with code explanations
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter */}
            <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0 overflow-x-auto">
              {["All", "Validation", "Calculation", "UI Visibility", "Defaults"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 ${
                    selectedCategory === cat
                      ? "bg-blue-600 text-white shadow-3xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Templates Cards List */}
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">{tpl.name}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {tpl.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{tpl.description}</p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleApplyTemplate(tpl)}
                      icon={<ChevronRight className="w-3.5 h-3.5" />}
                    >
                      Use Template
                    </Button>
                  </div>

                  {/* Explanation Box */}
                  <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-xs text-blue-950 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">How it works: </span>
                      {tpl.explanation}
                    </div>
                  </div>

                  {/* Code snippet preview */}
                  <div className="rounded-lg bg-slate-950 p-3 text-[11px] font-mono text-slate-200 overflow-x-auto">
                    <pre>{tpl.codeScript}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            deleteWorkflow(deleteId);
            if (selectedWorkflowId === deleteId) {
              setSelectedWorkflowId(null);
            }
          }
        }}
        title="Delete Workflow"
        message="Are you sure you want to delete this workflow automation? Any calculations tied to it will stop running."
      />
    </div>
  );
};
