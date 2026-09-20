"use client";

import React, { useState } from "react";
import { FieldDefinition, FormDefinition, AppDefinition, SubformColumn, FieldType } from "@/types/schema";
import { Input, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { toLinkName } from "@/lib/utils/linkName";
import { suggestDefaultDisplayField } from "@/lib/engine/lookupEngine";
import { generateId } from "@/lib/utils/idGenerator";
import {
  X,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Table,
  Search,
  Sliders,
  CheckSquare,
} from "lucide-react";

interface FieldPropertiesPanelProps {
  field: FieldDefinition | null;
  form: FormDefinition;
  app: AppDefinition;
  onUpdateField: (fieldId: string, updates: Partial<FieldDefinition>) => void;
  onClose: () => void;
}

export const FieldPropertiesPanel: React.FC<FieldPropertiesPanelProps> = ({
  field,
  form,
  app,
  onUpdateField,
  onClose,
}) => {
  const [linkNameLocked, setLinkNameLocked] = useState(true);

  // Target forms for lookup relationships
  const otherForms = app.forms.filter((f) => f.id !== form.id);
  const targetForm = field?.lookup?.targetFormId
    ? app.forms.find((f) => f.id === field.lookup?.targetFormId)
    : undefined;

  if (!field) {
    return (
      <div className="w-80 border-l border-slate-200 bg-white h-full p-6 flex flex-col items-center justify-center text-center select-none text-slate-400">
        <Sliders className="w-10 h-10 mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No Field Selected</p>
        <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
          Click any field in the canvas to inspect and customize its properties.
        </p>
      </div>
    );
  }

  const handleLabelChange = (newLabel: string) => {
    const updates: Partial<FieldDefinition> = { label: newLabel };
    if (linkNameLocked) {
      updates.linkName = toLinkName(newLabel);
    }
    onUpdateField(field.id, updates);
  };

  const handleFieldTypeChange = (newType: FieldType) => {
    if (newType === field.type) return;

    const updates: Partial<FieldDefinition> = {
      type: newType,
    };

    // If switching to choices fields (dropdown, radio, multiselect)
    if (["dropdown", "radio", "multiselect"].includes(newType) && (!field.options || field.options.length === 0)) {
      updates.options = ["Option 1", "Option 2", "Option 3"];
    }

    // If switching to currency
    if (newType === "currency") {
      if (!field.currencySymbol) updates.currencySymbol = "₹";
      if (field.decimalPlaces === undefined) updates.decimalPlaces = 2;
    }

    // If switching to percentage
    if (newType === "percentage") {
      if (field.decimalPlaces === undefined) updates.decimalPlaces = 1;
    }

    // If switching to autonumber
    if (newType === "autonumber" && !field.autonumber) {
      const pfx = (field.linkName.slice(0, 3) || "REC").toUpperCase() + "-";
      updates.autonumber = {
        prefix: pfx,
        startNumber: 1,
        digits: 5,
      };
    }

    // If switching to lookup
    if (newType === "lookup" && !field.lookup) {
      const firstOther = otherForms[0];
      if (firstOther) {
        updates.lookup = {
          targetFormId: firstOther.id,
          displayFieldId: firstOther.fields[0]?.id || "",
          valueFieldId: "id",
          relationshipType: "lookup",
        };
      }
    }

    // If switching to subform
    if (newType === "subform" && !field.subform) {
      updates.subform = {
        sourceType: "inline",
        columns: [
          {
            id: generateId("col"),
            label: "Item Name",
            linkName: "item_name",
            type: "text",
            required: true,
          },
          {
            id: generateId("col"),
            label: "Quantity",
            linkName: "quantity",
            type: "number",
            defaultValue: 1,
          },
          {
            id: generateId("col"),
            label: "Rate",
            linkName: "rate",
            type: "currency",
            currencySymbol: "₹",
            decimalPlaces: 2,
          },
          {
            id: generateId("col"),
            label: "Amount",
            linkName: "amount",
            type: "currency",
            currencySymbol: "₹",
            decimalPlaces: 2,
          },
        ],
      };
    }

    onUpdateField(field.id, updates);
  };

  // Options handling for dropdown/radio/multiselect
  const handleAddOption = () => {
    const current = field.options || [];
    const newOptions = [...current, `Option ${current.length + 1}`];
    onUpdateField(field.id, { options: newOptions });
  };

  const handleUpdateOption = (index: number, val: string) => {
    const current = [...(field.options || [])];
    current[index] = val;
    onUpdateField(field.id, { options: current });
  };

  const handleDeleteOption = (index: number) => {
    const current = (field.options || []).filter((_, i) => i !== index);
    onUpdateField(field.id, { options: current });
  };

  // Subform column handling
  const handleAddSubformColumn = () => {
    const cols = field.subform?.columns || [];
    const newCol: SubformColumn = {
      id: generateId("col"),
      label: `Column ${cols.length + 1}`,
      linkName: `col_${cols.length + 1}`,
      type: "text",
      required: false,
    };
    onUpdateField(field.id, {
      subform: {
        sourceType: field.subform?.sourceType || "inline",
        columns: [...cols, newCol],
      },
    });
  };

  const handleUpdateSubformColumn = (colId: string, updates: Partial<SubformColumn>) => {
    const cols = (field.subform?.columns || []).map((col) =>
      col.id === colId ? { ...col, ...updates } : col
    );
    onUpdateField(field.id, {
      subform: {
        sourceType: field.subform?.sourceType || "inline",
        columns: cols,
      },
    });
  };

  const handleDeleteSubformColumn = (colId: string) => {
    const cols = (field.subform?.columns || []).filter((col) => col.id !== colId);
    onUpdateField(field.id, {
      subform: {
        sourceType: field.subform?.sourceType || "inline",
        columns: cols,
      },
    });
  };

  return (
    <div className="w-84 border-l border-slate-200 bg-white h-full flex flex-col shrink-0 select-none shadow-xs min-h-0">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Field Properties
          </h3>
          <span className="text-[11px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
            {field.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4 text-xs">
        {/* Field Type Selector (Requirement: change text field to other field types) */}
        <div className="space-y-1.5 p-3 bg-blue-50/70 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <Sliders className="w-3 h-3 text-blue-600" />
              Field Type
            </label>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-200/80 text-blue-900 font-semibold uppercase">
              {field.type}
            </span>
          </div>
          <select
            value={field.type}
            onChange={(e) => handleFieldTypeChange(e.target.value as FieldType)}
            className="w-full text-xs font-medium rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
          >
            <optgroup label="Text & Inputs">
              <option value="text">Single Line Text</option>
              <option value="textarea">Multi-line Text (Textarea)</option>
              <option value="url">Website URL</option>
            </optgroup>
            <optgroup label="Numbers & Finance">
              <option value="number">Number (Integer)</option>
              <option value="decimal">Decimal</option>
              <option value="currency">Currency (₹, $, etc.)</option>
              <option value="percentage">Percentage (%)</option>
            </optgroup>
            <optgroup label="Contact Info">
              <option value="email">Email Address</option>
              <option value="phone">Phone Number</option>
            </optgroup>
            <optgroup label="Date & Time">
              <option value="date">Date</option>
              <option value="datetime">Date & Time</option>
              <option value="time">Time</option>
            </optgroup>
            <optgroup label="Choices & Options">
              <option value="dropdown">Dropdown</option>
              <option value="radio">Radio Buttons</option>
              <option value="checkbox">Checkbox (Boolean)</option>
              <option value="multiselect">Multi-Select</option>
            </optgroup>
            <optgroup label="Relationships & Complex">
              <option value="lookup">Lookup (Relational Form)</option>
              <option value="subform">Subform (Line Items Grid)</option>
              <option value="autonumber">Auto-Number</option>
            </optgroup>
          </select>
          <p className="text-[10px] text-blue-700/80">
            Change this field to any type at any time. Config &amp; data are saved automatically.
          </p>
        </div>

        {/* Basic Properties */}
        <div className="space-y-3">
          <Input
            label="Field Label"
            value={field.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Customer Name"
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">Link Name</label>
              <button
                onClick={() => setLinkNameLocked(!linkNameLocked)}
                className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1"
                title={linkNameLocked ? "Click to unlock manual edit" : "Click to lock auto-generation"}
              >
                {linkNameLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 text-amber-500" />}
                {linkNameLocked ? "Locked" : "Custom"}
              </button>
            </div>
            <input
              type="text"
              value={field.linkName}
              disabled={linkNameLocked}
              onChange={(e) => onUpdateField(field.id, { linkName: toLinkName(e.target.value) })}
              className="w-full bg-slate-50 disabled:bg-slate-100 border border-slate-300 text-slate-800 font-mono text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <Input
            label="Placeholder Text"
            value={field.placeholder || ""}
            onChange={(e) => onUpdateField(field.id, { placeholder: e.target.value })}
            placeholder="e.g. Enter full name..."
          />

          <Input
            label="Help Description"
            value={field.description || ""}
            onChange={(e) => onUpdateField(field.id, { description: e.target.value })}
            placeholder="Visible help text beneath field"
          />
        </div>

        <div className="h-[1px] bg-slate-100" />

        {/* Validation & Flag Toggles */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Rules & Behaviors
          </span>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.required || false}
                onChange={(e) => onUpdateField(field.id, { required: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span className="font-medium">Mandatory / Required</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.unique || false}
                onChange={(e) => onUpdateField(field.id, { unique: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>Unique (no duplicate values)</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.readonly || false}
                onChange={(e) => onUpdateField(field.id, { readonly: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>Read Only (computed/locked)</span>
            </label>

            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={field.hidden || false}
                onChange={(e) => onUpdateField(field.id, { hidden: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <span>Hidden by default</span>
            </label>
          </div>
        </div>

        <div className="h-[1px] bg-slate-100" />

        {/* Numeric / Currency / Percentage Specifics */}
        {["number", "currency", "percentage", "decimal"].includes(field.type) && (
          <div className="space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Numeric Settings
            </span>

            {field.type === "currency" && (
              <Input
                label="Currency Symbol"
                value={field.currencySymbol || "₹"}
                onChange={(e) => onUpdateField(field.id, { currencySymbol: e.target.value })}
                placeholder="₹ or $ or €"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Decimal Places"
                type="number"
                min="0"
                max="5"
                value={field.decimalPlaces ?? 2}
                onChange={(e) =>
                  onUpdateField(field.id, { decimalPlaces: parseInt(e.target.value, 10) || 0 })
                }
              />
              <Input
                label="Default Value"
                type="number"
                value={field.defaultValue !== undefined ? field.defaultValue : ""}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    defaultValue: e.target.value === "" ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Minimum"
                type="number"
                value={field.min !== undefined ? field.min : ""}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    min: e.target.value === "" ? undefined : parseFloat(e.target.value),
                  })
                }
              />
              <Input
                label="Maximum"
                type="number"
                value={field.max !== undefined ? field.max : ""}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    max: e.target.value === "" ? undefined : parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Text Specifics */}
        {["text", "textarea"].includes(field.type) && (
          <div className="space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Text Limits
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Min Length"
                type="number"
                min="0"
                value={field.minLength ?? ""}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    minLength: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                  })
                }
              />
              <Input
                label="Max Length"
                type="number"
                min="1"
                value={field.maxLength ?? ""}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    maxLength: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Choice Options */}
        {["dropdown", "radio", "multiselect"].includes(field.type) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Options
              </span>
              <button
                onClick={handleAddOption}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Option
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {(field.options || []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleUpdateOption(idx, e.target.value)}
                    className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleDeleteOption(idx)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                    title="Delete Option"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto Number Config */}
        {field.type === "autonumber" && (
          <div className="space-y-3 p-3 bg-amber-50/50 rounded-lg border border-amber-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Auto Number Format
            </span>
            <Input
              label="Prefix"
              value={field.autonumber?.prefix || "CUS-"}
              onChange={(e) =>
                onUpdateField(field.id, {
                  autonumber: {
                    prefix: e.target.value,
                    startNumber: field.autonumber?.startNumber || 1,
                    digits: field.autonumber?.digits || 5,
                  },
                })
              }
              placeholder="e.g. CUS- or ORD-"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Start Number"
                type="number"
                value={field.autonumber?.startNumber || 1}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    autonumber: {
                      prefix: field.autonumber?.prefix || "CUS-",
                      startNumber: parseInt(e.target.value, 10) || 1,
                      digits: field.autonumber?.digits || 5,
                    },
                  })
                }
              />
              <Input
                label="Digits Padding"
                type="number"
                min="1"
                max="10"
                value={field.autonumber?.digits || 5}
                onChange={(e) =>
                  onUpdateField(field.id, {
                    autonumber: {
                      prefix: field.autonumber?.prefix || "CUS-",
                      startNumber: field.autonumber?.startNumber || 1,
                      digits: parseInt(e.target.value, 10) || 5,
                    },
                  })
                }
              />
            </div>
            <div className="text-[11px] text-amber-800 bg-amber-100/60 p-2 rounded">
              Example generated:{" "}
              <span className="font-mono font-bold">
                {field.autonumber?.prefix || "CUS-"}
                {String(field.autonumber?.startNumber || 1).padStart(
                  field.autonumber?.digits || 5,
                  "0"
                )}
              </span>
            </div>
          </div>
        )}

        {/* Lookup Configuration (Requirement 17-19) */}
        {field.type === "lookup" && (
          <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-1.5 text-blue-900 font-bold uppercase tracking-wider text-[11px]">
              <Search className="w-3.5 h-3.5 text-blue-600" />
              Lookup Relationship
            </div>

            <Select
              label="Related Form"
              value={field.lookup?.targetFormId || ""}
              onChange={(e) => {
                const targetFormId = e.target.value;
                const chosenTarget = app.forms.find((f) => f.id === targetFormId);
                const suggestedDisplay = chosenTarget
                  ? suggestDefaultDisplayField(chosenTarget)
                  : "";

                onUpdateField(field.id, {
                  lookup: {
                    targetFormId,
                    displayFieldId: suggestedDisplay,
                    valueFieldId: "id",
                    relationshipType: "lookup",
                  },
                });
              }}
            >
              <option value="">Select target form...</option>
              {otherForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.fields.length} fields)
                </option>
              ))}
            </Select>

            {targetForm && (
              <Select
                label="Display Field"
                value={field.lookup?.displayFieldId || ""}
                onChange={(e) => {
                  if (field.lookup) {
                    onUpdateField(field.id, {
                      lookup: {
                        ...field.lookup,
                        displayFieldId: e.target.value,
                      },
                    });
                  }
                }}
              >
                <option value="">Select display field...</option>
                {targetForm.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({f.type})
                  </option>
                ))}
              </Select>
            )}

            <div className="text-[11px] text-blue-800 bg-blue-100/60 p-2 rounded">
              Stores referenced record ID (e.g.{" "}
              <span className="font-mono">rec_123</span>) while dynamically rendering the display
              field.
            </div>
          </div>
        )}

        {/* Subform Configuration (Requirement 21-23) */}
        {field.type === "subform" && (
          <div className="space-y-3 p-3 bg-purple-50/50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-900 font-bold uppercase tracking-wider text-[11px]">
                <Table className="w-3.5 h-3.5 text-purple-600" />
                Subform Grid Columns
              </div>
              <button
                onClick={handleAddSubformColumn}
                className="text-[11px] font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Column
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(field.subform?.columns || []).map((col, idx) => (
                <div
                  key={col.id}
                  className="p-2 bg-white rounded border border-purple-100 space-y-2 shadow-3xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) =>
                        handleUpdateSubformColumn(col.id, {
                          label: e.target.value,
                          linkName: toLinkName(e.target.value),
                        })
                      }
                      className="text-xs font-medium text-slate-800 flex-1 border border-slate-200 rounded px-1.5 py-0.5"
                    />
                    <select
                      value={col.type}
                      onChange={(e) =>
                        handleUpdateSubformColumn(col.id, {
                          type: e.target.value as any,
                        })
                      }
                      className="text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-slate-50"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency</option>
                      <option value="lookup">Lookup</option>
                      <option value="date">Date</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                    <button
                      onClick={() => handleDeleteSubformColumn(col.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* If subform column is a lookup */}
                  {col.type === "lookup" && (
                    <div className="pt-1 border-t border-slate-100 space-y-1">
                      <select
                        value={col.lookup?.targetFormId || ""}
                        onChange={(e) => {
                          const targetFormId = e.target.value;
                          const tgt = app.forms.find((f) => f.id === targetFormId);
                          handleUpdateSubformColumn(col.id, {
                            lookup: {
                              targetFormId,
                              displayFieldId: tgt ? suggestDefaultDisplayField(tgt) : "",
                              relationshipType: "lookup",
                            },
                          });
                        }}
                        className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-1"
                      >
                        <option value="">Select target lookup form...</option>
                        {otherForms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
