import { WorkflowDefinition, WorkflowAction, FormDefinition } from "@/types/schema";
import { evaluateSafeExpression, executeSafeScript } from "./evaluator";

export interface WorkflowResult {
  updatedValues: Record<string, any>;
  fieldVisibility: Record<string, boolean>; // fieldId -> isHidden
  fieldReadonly: Record<string, boolean>; // fieldId -> isReadonly
  validationErrors: Record<string, string>; // fieldId -> error message
  messages: Array<{ type: "info" | "warning" | "error"; text: string }>;
  shouldBlockSubmit?: boolean;
  popupAlert?: { title?: string; message: string; type?: "warning" | "error" | "info" };
}

export function executeWorkflows(
  workflows: WorkflowDefinition[],
  triggerType: "onLoad" | "onUserInput" | "onValidate" | "onSubmit" | "onSuccess" | "onDelete",
  triggerFieldId: string | undefined,
  currentValues: Record<string, any>,
  form: FormDefinition,
  allForms?: FormDefinition[]
): WorkflowResult {
  const result: WorkflowResult = {
    updatedValues: { ...currentValues },
    fieldVisibility: {},
    fieldReadonly: {},
    validationErrors: {},
    messages: [],
    shouldBlockSubmit: false,
  };

  // Build evaluation context with both field IDs and linkNames
  const buildContext = () => {
    const ctx: Record<string, any> = { ...result.updatedValues };
    for (const field of form.fields) {
      const val = result.updatedValues[field.id] ?? result.updatedValues[field.linkName];
      ctx[field.id] = val;
      ctx[field.linkName] = val;
      ctx[field.linkName.toLowerCase()] = val;
      ctx[field.label] = val;
      ctx[field.label.toLowerCase()] = val;
      ctx[field.label.toLowerCase().replace(/\s+/g, "_")] = val;
    }
    return ctx;
  };

  const relevantWorkflows = workflows.filter((wf) => {
    if (!wf.active) return false;
    if (wf.trigger.type !== triggerType) return false;
    if (triggerType === "onUserInput") {
      // If workflow specifies a fieldId, trigger must match either field ID or field linkName
      if (wf.trigger.fieldId && wf.trigger.fieldId !== triggerFieldId) {
        const field = form.fields.find((f) => f.id === wf.trigger.fieldId || f.linkName === wf.trigger.fieldId);
        if (!field || (field.id !== triggerFieldId && field.linkName !== triggerFieldId)) {
          return false;
        }
      }
    }
    return true;
  });

  for (const wf of relevantWorkflows) {
    // If Code Mode with custom script
    if (wf.mode === "code" && wf.codeScript) {
      const context = buildContext();
      const scriptRes = executeSafeScript(wf.codeScript, context, {
        currentForm: form,
        allForms: allForms || [form],
      });

      // Merge updated values back (only for fields actually modified by the script)
      if (scriptRes.changedFields && Object.keys(scriptRes.changedFields).length > 0) {
        for (const key of Object.keys(scriptRes.changedFields)) {
          const val = scriptRes.updatedValues[key];
          const matchedField = form.fields.find(
            (f) =>
              f.id === key ||
              f.linkName.toLowerCase() === key.toLowerCase() ||
              f.label.toLowerCase() === key.toLowerCase() ||
              f.label.toLowerCase().replace(/\s+/g, "_") === key.toLowerCase()
          );
          if (matchedField) {
            result.updatedValues[matchedField.id] = val;
            result.updatedValues[matchedField.linkName] = val;
          } else {
            result.updatedValues[key] = val;
          }
        }
      } else {
        // Fallback for visual or non-tracked scripts
        for (const [key, val] of Object.entries(scriptRes.updatedValues)) {
          const matchedField = form.fields.find(
            (f) => f.id === key || f.linkName === key
          );
          if (matchedField) {
            result.updatedValues[matchedField.id] = val;
            result.updatedValues[matchedField.linkName] = val;
          }
        }
      }

      if (scriptRes.popupAlert) {
        result.popupAlert = scriptRes.popupAlert;
      }
      if (scriptRes.shouldBlockSubmit) {
        result.shouldBlockSubmit = true;
      }
      if (scriptRes.messages.length > 0) {
        result.messages.push(...scriptRes.messages);
      }
      for (const [fName, isHidden] of Object.entries(scriptRes.hiddenFields)) {
        const f = form.fields.find(
          (field) =>
            field.id === fName ||
            field.linkName.toLowerCase() === fName.toLowerCase() ||
            field.label.toLowerCase() === fName.toLowerCase()
        );
        if (f) result.fieldVisibility[f.id] = isHidden;
      }
      for (const [fName, isReadonly] of Object.entries(scriptRes.readonlyFields)) {
        const f = form.fields.find(
          (field) =>
            field.id === fName ||
            field.linkName.toLowerCase() === fName.toLowerCase() ||
            field.label.toLowerCase() === fName.toLowerCase()
        );
        if (f) result.fieldReadonly[f.id] = isReadonly;
      }
      continue;
    }

// Helper to evaluate visual structured conditions without any code
function evaluateVisualConditions(
  action: WorkflowAction,
  context: Record<string, any>,
  form: FormDefinition
): boolean {
  if (action.visualConditions && action.visualConditions.length > 0) {
    const results = action.visualConditions.map((cond) => {
      const field = form.fields.find(
        (f) => f.id === cond.fieldId || f.linkName === cond.fieldId
      );
      const leftVal = field
        ? (context[field.id] ?? context[field.linkName])
        : context[cond.fieldId];

      let rightVal = cond.value;
      if (cond.compareType === "field" && cond.compareFieldId) {
        const compareField = form.fields.find(
          (f) => f.id === cond.compareFieldId || f.linkName === cond.compareFieldId
        );
        rightVal = compareField
          ? (context[compareField.id] ?? context[compareField.linkName])
          : context[cond.compareFieldId];
      }

      switch (cond.operator) {
        case "equals":
          return String(leftVal ?? "").trim().toLowerCase() === String(rightVal ?? "").trim().toLowerCase();
        case "not_equals":
          return String(leftVal ?? "").trim().toLowerCase() !== String(rightVal ?? "").trim().toLowerCase();
        case "greater_than":
          return (Number(leftVal) || 0) > (Number(rightVal) || 0);
        case "less_than":
          return (Number(leftVal) || 0) < (Number(rightVal) || 0);
        case "contains":
          return String(leftVal ?? "").toLowerCase().includes(String(rightVal ?? "").toLowerCase());
        case "is_empty":
          return (
            leftVal === undefined ||
            leftVal === null ||
            String(leftVal).trim() === "" ||
            (Array.isArray(leftVal) && leftVal.length === 0)
          );
        case "is_not_empty":
          return (
            leftVal !== undefined &&
            leftVal !== null &&
            String(leftVal).trim() !== "" &&
            (!Array.isArray(leftVal) || leftVal.length > 0)
          );
        default:
          return true;
      }
    });

    return action.conditionLogic === "OR"
      ? results.some(Boolean)
      : results.every(Boolean);
  }

  // Fallback to legacy string condition
  if (action.condition) {
    return Boolean(evaluateSafeExpression(action.condition, context));
  }

  return true;
}

    // Visual Mode with actions list
    for (const action of wf.actions) {
      const context = buildContext();

      // Check condition if present (visual or string)
      const condPassed = evaluateVisualConditions(action, context, form);
      if (!condPassed) {
        continue; // Skip action if condition is false
      }

      // Find target field if any
      const targetField = action.targetFieldId
        ? form.fields.find(
            (f) =>
              f.id === action.targetFieldId ||
              f.linkName.toLowerCase() === action.targetFieldId?.toLowerCase() ||
              f.label.toLowerCase() === action.targetFieldId?.toLowerCase()
          )
        : undefined;
      const targetFieldId = targetField ? targetField.id : action.targetFieldId;

      switch (action.type) {
        case "setValue": {
          if (targetFieldId) {
            result.updatedValues[targetFieldId] = action.value ?? "";
            if (targetField) {
              result.updatedValues[targetField.linkName] = action.value ?? "";
            }
          }
          break;
        }

        case "copyField": {
          if (targetFieldId && action.copySourceFieldId) {
            const srcField = form.fields.find(
              (f) => f.id === action.copySourceFieldId || f.linkName === action.copySourceFieldId
            );
            const sourceVal = srcField
              ? (result.updatedValues[srcField.id] ?? result.updatedValues[srcField.linkName])
              : result.updatedValues[action.copySourceFieldId];

            result.updatedValues[targetFieldId] = sourceVal ?? "";
            if (targetField) {
              result.updatedValues[targetField.linkName] = sourceVal ?? "";
            }
            result.messages.push({
              type: "info",
              text: `Copied value from ${srcField?.label || action.copySourceFieldId} to ${targetField?.label || targetFieldId}.`,
            });
          }
          break;
        }

        case "calculateValue": {
          if (targetFieldId) {
            let newVal: any = action.value;

            // Zero-code structured visual calculation: operand1 [ + | - | * | / ] operand2
            if (action.visualCalculation) {
              const calc = action.visualCalculation;
              const op1Field = form.fields.find(
                (f) => f.id === calc.operand1FieldId || f.linkName === calc.operand1FieldId
              );
              const op1 = Number(
                op1Field
                  ? (result.updatedValues[op1Field.id] ?? result.updatedValues[op1Field.linkName])
                  : (result.updatedValues[calc.operand1FieldId] ?? 0)
              ) || 0;

              let op2 = 0;
              if (calc.operand2Type === "field" && calc.operand2FieldId) {
                const op2Field = form.fields.find(
                  (f) => f.id === calc.operand2FieldId || f.linkName === calc.operand2FieldId
                );
                op2 = Number(
                  op2Field
                    ? (result.updatedValues[op2Field.id] ?? result.updatedValues[op2Field.linkName])
                    : (result.updatedValues[calc.operand2FieldId] ?? 0)
                ) || 0;
              } else {
                op2 = Number(calc.operand2Literal ?? 0);
              }

              switch (calc.operation) {
                case "+":
                  newVal = op1 + op2;
                  break;
                case "-":
                  newVal = op1 - op2;
                  break;
                case "*":
                  newVal = Math.round(op1 * op2 * 100) / 100;
                  break;
                case "/":
                  newVal = op2 !== 0 ? Math.round((op1 / op2) * 100) / 100 : 0;
                  break;
              }
            } else if (action.expression) {
              const expr = action.expression.trim();
              const quoted = expr.match(/^["'](.*)["']$/);
              if (quoted) {
                newVal = quoted[1];
              } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) {
                // Check if expr is another field in the form
                const src = form.fields.find(
                  (f) =>
                    f.id === expr ||
                    f.linkName.toLowerCase() === expr.toLowerCase() ||
                    f.label.toLowerCase() === expr.toLowerCase()
                );
                if (src) {
                  newVal = result.updatedValues[src.id] ?? "";
                } else {
                  // Unquoted string literal
                  newVal = expr;
                }
              } else {
                newVal = evaluateSafeExpression(action.expression, context);
              }
            }

            result.updatedValues[targetFieldId] = newVal;
            if (targetField) {
              result.updatedValues[targetField.linkName] = newVal;
            }
          }
          break;
        }

        case "clearField": {
          if (targetFieldId) {
            result.updatedValues[targetFieldId] = "";
            if (targetField) {
              result.updatedValues[targetField.linkName] = "";
            }
          }
          break;
        }

        case "setHidden": {
          if (targetFieldId) {
            result.fieldVisibility[targetFieldId] = true; // hidden
          }
          break;
        }

        case "setReadonly": {
          if (targetFieldId) {
            result.fieldReadonly[targetFieldId] = true;
          }
          break;
        }

        case "showMessage": {
          if (action.message) {
            result.messages.push({
              type: "info",
              text: action.message,
            });
          }
          break;
        }

        case "validate": {
          if (targetFieldId) {
            const isInvalid = action.visualConditions
              ? evaluateVisualConditions(action, context, form)
              : action.condition
              ? evaluateSafeExpression(action.condition, context)
              : false;

            if (isInvalid) {
              const msg = action.message || "Invalid value";
              result.validationErrors[targetFieldId] = msg;
              result.messages.push({ type: "error", text: msg });
              result.shouldBlockSubmit = true;
            }
          }
          break;
        }

        case "showPopup": {
          if (action.message) {
            result.popupAlert = {
              title: "Workflow Validation Alert",
              message: action.message,
              type: action.popupType || "warning",
            };
            if (action.blockSubmitOnPopup !== false) {
              result.shouldBlockSubmit = true;
            }
          }
          break;
        }

        case "blockSubmit": {
          result.shouldBlockSubmit = true;
          break;
        }

        case "updateOtherForm": {
          if (action.crossFormUpdate) {
            const { targetFormId, operation, sourceFieldId, updateFieldId } = action.crossFormUpdate;
            const targetForm = (allForms || []).find((f) => f.id === targetFormId);
            result.messages.push({
              type: "info",
              text: `Cross-form transaction configured: ${operation} on ${targetForm?.name || targetFormId} using ${sourceFieldId}.`,
            });
          }
          break;
        }
      }
    }
  }

  return result;
}
