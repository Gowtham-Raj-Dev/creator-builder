import { WorkflowDefinition } from "@/types/schema";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "Calculation" | "Validation" | "Stock" | "Notification" | "Automation";
  mode: "visual" | "code";
  trigger: WorkflowDefinition["trigger"];
  codeScript?: string;
  actionsHint?: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl_total", name: "Calculate line total", description: "amount = quantity × rate on every change", category: "Calculation", mode: "code", trigger: { type: "onUserInput" },
    codeScript: `// Runs whenever any field changes\ninput.amount = (Number(input.quantity) || 0) * (Number(input.rate) || 0);`,
  },
  {
    id: "tpl_subtotal", name: "Subform totals → parent", description: "Sum subform amounts, apply tax, set grand total", category: "Calculation", mode: "code", trigger: { type: "onUserInput" },
    codeScript: `const subtotal = sum(input.items, "amount");\ninput.subtotal = round(subtotal, 2);\ninput.total = round(subtotal * (1 + (Number(input.tax) || 0) / 100), 2);`,
  },
  {
    id: "tpl_stock_check", name: "Warn when stock is low", description: "Confirm before saving if usage exceeds available stock", category: "Validation", mode: "code", trigger: { type: "onSubmit" },
    codeScript: `const item = get("item", input.item);\nif (item && Number(input.quantity) > Number(item.stock || 0)) {\n  confirm(\`Only \${item.stock} available for \${item.name}. Continue anyway?\`);\n}`,
  },
  {
    id: "tpl_stock_update", name: "Update stock after save", description: "Decrease Item.stock by the quantity used (per line item)", category: "Stock", mode: "code", trigger: { type: "onSuccess" },
    codeScript: `// Runs after the record is saved. Data changes are applied to Firestore.\nfor (const row of input.items) {\n  if (row.item && row.quantity) increment("item", row.item, "stock", -Number(row.quantity));\n}`,
  },
  {
    id: "tpl_date_validate", name: "End date after start date", description: "Block submit when dates are inverted", category: "Validation", mode: "code", trigger: { type: "onValidate" },
    codeScript: `if (input.end_date && input.start_date && input.end_date < input.start_date) {\n  setError("end_date", "End date must be after start date");\n}`,
  },
  {
    id: "tpl_email", name: "Email on approval", description: "Send an email when status becomes Approved", category: "Notification", mode: "code", trigger: { type: "onSuccess" },
    codeScript: `if (input.status === "Approved") {\n  sendEmail({ to: input.requester_email, subject: \`\${form.name} approved\`, body: \`Hi, your request \${record?.id} was approved by \${user.name}.\` });\n}`,
  },
  {
    id: "tpl_autofill", name: "Auto-fill from lookup", description: "Copy rate & unit from the selected Item", category: "Automation", mode: "code", trigger: { type: "onUserInput", fieldId: "item" },
    codeScript: `const item = get("item", input.item);\nif (item) {\n  input.rate = item.rate;\n  input.unit = item.unit;\n}`,
  },
  {
    id: "tpl_hide", name: "Show field conditionally", description: "Show cheque number only for cheque payments", category: "Automation", mode: "code", trigger: { type: "onUserInput" },
    codeScript: `if (input.payment_mode === "Cheque") showField("cheque_number"); else hideField("cheque_number");`,
  },
  {
    id: "tpl_log", name: "Create audit record in another form", description: "Insert a Stock Log row after saving a purchase", category: "Automation", mode: "code", trigger: { type: "onSuccess" },
    codeScript: `insert("stock_log", { item: input.item, qty: input.quantity, type: "IN", reference: record?.id, by: user.email });`,
  },
];
