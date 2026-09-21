/**
 * Everything the builder can do, in one place — powers the public Home page.
 * Keep this in sync when a field type, report type, trigger or action is added.
 */
import { REPORT_TYPES } from "@/lib/engine/reportTypes";
import { SCRIPT_API_DOCS } from "@/lib/engine/workflowEngine";
import { FUNCTION_DOCS } from "@/lib/engine/formulaEngine";

export interface DocItem { name: string; desc: string; example?: string; icon?: string }
export interface DocGroup { title: string; items: DocItem[] }

// ── Fields ───────────────────────────────────────────────────────────────────

export const FIELD_GROUPS: DocGroup[] = [
  { title: "Text & contact", items: [
    { name: "Text", desc: "Single line with min/max length, unique check, placeholder.", example: "Customer Name, GSTIN, Vehicle No", icon: "file" },
    { name: "Textarea / Rich text", desc: "Multi-line notes; rich text with bold, lists, links.", example: "Remarks, Terms & conditions", icon: "file" },
    { name: "Email / Phone / URL", desc: "Format-validated; click-to-mail / call / open.", example: "customer@shop.in, +91 98…", icon: "mail" },
    { name: "Address", desc: "Street, city, state, pincode in one field.", example: "Billing / shipping address", icon: "pin" },
    { name: "Geolocation", desc: "Latitude/longitude, capture from device.", example: "Site visit location, delivery point", icon: "map" },
  ] },
  { title: "Numbers & money", items: [
    { name: "Number / Decimal", desc: "Integers or decimals with min/max and step.", example: "Quantity, Weight (kg)", icon: "hash" },
    { name: "Currency", desc: "Symbol, decimals, Indian grouping (1,23,456.00).", example: "Rate, Grand Total", icon: "banknote" },
    { name: "Percentage", desc: "0–100 with % suffix.", example: "Discount %, GST %", icon: "percent" },
    { name: "Rating", desc: "Star rating 1–5 (configurable max).", example: "Vendor rating, Service feedback", icon: "star" },
    { name: "Formula", desc: "Live calculation with 40+ functions, subform sums, lookups (vendor.city).", example: "amount = quantity * rate · total = sum(items.amount)", icon: "calculator" },
    { name: "Rollup", desc: "Aggregate child records: sum / count / avg / min / max with filters.", example: "Customer → Total purchases, Outstanding", icon: "sigma" },
    { name: "Auto number", desc: "Patterns like INV/{YYYY}/{0000}, yearly or monthly reset.", example: "INV/2026/0042, PO-000118", icon: "hash" },
  ] },
  { title: "Choice", items: [
    { name: "Dropdown / Radio", desc: "Options with colours; drives kanban lanes, funnels, badges.", example: "Status: Draft · Approved · Paid", icon: "list" },
    { name: "Multi-select", desc: "Pick many options as chips.", example: "Skills, Product tags", icon: "tags" },
    { name: "Checkbox", desc: "Yes/No; used for Active flags and checklists.", example: "Active, Done, GST applicable", icon: "check" },
    { name: "Colour", desc: "Colour picker.", example: "Category colour, Brand colour", icon: "paint" },
  ] },
  { title: "Date & time", items: [
    { name: "Date / Date-time / Time", desc: "Pickers with dynamic defaults (today, now), date validations.", example: "Invoice Date, Appointment at, Shift start", icon: "calendar" },
  ] },
  { title: "Relationships", items: [
    { name: "Lookup", desc: "Pick a record from another form: searchable, multi-select, filtered (Active = Yes only), cascading (State → City), auto-fill (Product → Rate, GST%), add-new inline, multi-column display.", example: "Customer, Product, State › City", icon: "link" },
    { name: "Subform (line items)", desc: "Rows inside a record with per-row formulas, totals, min/max rows, bulk add, reorder, import rows from another record (PO → Invoice).", example: "Invoice Items: Product · Qty · Rate · Amount", icon: "table" },
    { name: "Users", desc: "Pick app members.", example: "Assigned to, Approver", icon: "users" },
  ] },
  { title: "Files & capture", items: [
    { name: "File / Image", desc: "Upload to Firebase Storage; images preview in reports & cards.", example: "Product photo, Signed PO PDF", icon: "image" },
    { name: "Signature", desc: "Draw a signature on screen.", example: "Delivery acknowledgement", icon: "paint" },
    { name: "Barcode / QR", desc: "Scan with the camera or type.", example: "Item barcode, Asset tag", icon: "search" },
  ] },
  { title: "Layout", items: [
    { name: "Section", desc: "Collapsible group with its own column count.", example: "Basic details · Tax details · Attachments", icon: "folder" },
    { name: "Width & columns", desc: "1–3 column forms; each field full / half / third width.", example: "Compact address block", icon: "grid" },
  ] },
];

export const FORM_FEATURES: DocItem[] = [
  { name: "Validation", desc: "Required, required-if (Cheque No when mode = Cheque), unique, min/max, regex, cross-field rules with custom messages.", example: "End date must be ≥ start date" },
  { name: "Visibility rules", desc: "Show a field only when a condition is true.", example: "Show 'Transporter' only when Delivery = Yes" },
  { name: "Dynamic defaults", desc: "today(), now(), current user, last used value.", example: "Invoice Date = today" },
  { name: "Save & New / duplicate / print", desc: "Fast data entry, record duplication, print templates.", example: "Print invoice with items & totals" },
  { name: "Record history & comments", desc: "Who changed what and when; discussion per record.", example: "Rate changed 120 → 110 by Ravi" },
  { name: "Import / export", desc: "CSV import with column mapping; CSV/Excel export.", example: "Upload 500 products from Excel" },
];

// ── Reports ──────────────────────────────────────────────────────────────────

export const REPORT_DOCS = REPORT_TYPES.map((t) => ({ name: t.label, desc: t.desc, example: t.useCases.join(" · "), icon: t.icon, category: t.category }));

export const REPORT_FEATURES: DocItem[] = [
  { name: "Filters & saved views", desc: "AND/OR groups, date presets (this month, last 7 days), quick-filter chips, saved filters shared with the team." },
  { name: "Grouping & totals", desc: "Group rows by any field with sum/avg/count per group, footer totals, running total column." },
  { name: "Conditional formatting", desc: "Colour cells or rows when a rule matches.", example: "Balance < Minimum level → red row" },
  { name: "Inline edit & bulk actions", desc: "Double-click a cell to edit; select many rows to export or delete." },
  { name: "Related records drawer", desc: "Open a record with its child records (invoices of a customer) without leaving the report." },
  { name: "Trash & restore", desc: "Deleted records go to a trash bin; restore or delete forever." },
  { name: "Runtime view switch", desc: "Users can flip the same report to Kanban, Chart, Calendar… and save their preferred view." },
];

// ── Workflows ────────────────────────────────────────────────────────────────

export const WORKFLOW_TRIGGERS: DocItem[] = [
  { name: "On load (new)", desc: "When a blank form opens.", example: "Set defaults, hide internal fields" },
  { name: "On load (edit)", desc: "When an existing record opens.", example: "Lock fields once Approved" },
  { name: "On field change", desc: "While the user types / picks a value — for the whole form or one field (even a subform column).", example: "Product picked → fill rate & GST" },
  { name: "On validate", desc: "Before save; can block with field errors.", example: "Qty > stock → error" },
  { name: "On submit", desc: "Last step before saving; can ask 'Continue anyway?'.", example: "Credit limit exceeded → confirm" },
  { name: "After save", desc: "After the record is stored; update other forms, notify.", example: "Reduce product stock" },
  { name: "On delete", desc: "When a record is deleted.", example: "Add stock back, block deleting paid invoices" },
  { name: "Approval / Scheduled / Webhook", desc: "Approval requests in-app; scheduled & webhook triggers run with Cloud Functions.", example: "Daily reminder for overdue invoices" },
];

export const WORKFLOW_ACTIONS: DocItem[] = [
  { name: "Set / copy / calculate / clear value", desc: "No-code field updates.", example: "Amount = Qty × Rate" },
  { name: "Show / hide, read-only / editable", desc: "Control the form dynamically.", example: "Hide Cheque No unless mode = Cheque" },
  { name: "Message / popup (info · warning · confirm · error)", desc: "Inform, warn, ask to continue, or block.", example: "'Low stock — continue anyway?'" },
  { name: "Validate / block submit", desc: "Stop the save with a reason." },
  { name: "Update other form / create / delete record", desc: "Cross-form data changes after save.", example: "Purchase saved → increase stock, write Stock Log" },
  { name: "Email / notification / webhook", desc: "Queue an email, notify users in-app, call any HTTP endpoint.", example: "Invoice > ₹50,000 → notify owner" },
  { name: "Request approval / assign task", desc: "Route records to an approver.", example: "PO > ₹1 lakh → manager approval" },
];

export const SCRIPT_GROUPS = ["Form", "Data", "UI", "Integrations", "Helpers"].map((g) => ({ title: g, items: SCRIPT_API_DOCS.filter((d) => d.group === g).map((d) => ({ name: d.name, desc: d.desc, example: d.sig })) }));

export const SAMPLE_SCRIPT = `// After save: reduce stock for every invoice line
for (const row of input.items) {
  if (!row.product) continue;
  increment("product", row.product, "current_stock", -Number(row.quantity || 0));
}

// On submit: warn when credit limit is exceeded
const cust = get("customer", input.customer);
if (cust && cust.outstanding + input.grand_total > cust.credit_limit) {
  confirm("Credit limit exceeded. Continue anyway?");
}`;

export const FORMULA_FUNCTION_COUNT = FUNCTION_DOCS.length;

// ── Dashboards ───────────────────────────────────────────────────────────────

export const DASHBOARD_WIDGETS: DocItem[] = [
  { name: "KPI cards", desc: "Count / sum / avg with filters, trend vs last month, previous period when a date range is chosen.", example: "Sales this month · +12%" },
  { name: "Charts", desc: "Column, bar, stacked, line, area, pie, donut, funnel, gauge; split by series; click to drill down.", example: "Sales by month, Category share" },
  { name: "Date filter", desc: "Today · Yesterday · Last 7 days · This month… or custom range applied to every widget.", example: "Last 7 days sales across all cards" },
  { name: "Report & form widgets", desc: "Embed any report (any view) or a data-entry form on the page." },
  { name: "Quick links, buttons, markdown, images, iframes", desc: "Navigation and content blocks; live numbers with {{form.sum(field)}}." },
];

// ── Governance ───────────────────────────────────────────────────────────────

export const GOVERNANCE: DocItem[] = [
  { name: "Roles & designations", desc: "Per form: view / create / edit / delete / print / export / import; own-records-only scope; hide or lock individual fields; per report & page visibility.", example: "Sales Staff: create invoices, see own only, no delete" },
  { name: "Members & sharing", desc: "Invite by email, assign a role, share link per app; public read-only mode.", example: "Share the price list publicly" },
  { name: "Publish & versions", desc: "Edit in draft, publish when ready, roll back to any version; members always see the published app." },
  { name: "Audit log", desc: "Every create/update/delete/publish with before/after values." },
  { name: "Health check", desc: "Finds broken lookups, invalid formulas/scripts, unmapped ledgers, missing view settings — with one-click auto-fix." },
  { name: "Export / import / duplicate / templates", desc: "Move an app between environments, clone it, or save it as a template." },
  { name: "Menu & navigation", desc: "Custom sections with icons, order forms/reports/pages per section, per-role menus." },
];

// ── AI ───────────────────────────────────────────────────────────────────────

export const AI_FEATURES: DocItem[] = [
  { name: "Generate an app from a description", desc: "Forms, lookups, subforms, reports (chart, aging, ledger…), workflows, roles and a dashboard in one go.", example: "'Sales invoicing for a textile shop with GST, stock and receivables'" },
  { name: "New form / report / workflow from a prompt", desc: "Add one thing at a time to an existing app; field ids resolved automatically.", example: "'Receivables aging by customer, 30/60/90 buckets'" },
  { name: "Edit with AI", desc: "Change an existing form or report by describing it.", example: "'Add Discount % after Rate and update Amount'" },
  { name: "Fix with AI", desc: "Repairs broken workflow scripts (Deluge → JavaScript, wrong field names)." },
  { name: "Formula writer & Ask your data", desc: "Describe a calculation to get a formula; ask questions in plain language and get filtered results." },
  { name: "Sample data", desc: "Realistic demo records for every form, lookups linked correctly, marked as sample so you can wipe them later." },
  { name: "Bring your own key", desc: "Gemini (free tier), Groq (free tier) or Anthropic Claude; one key for all apps or per app." },
];

// ── Business examples ────────────────────────────────────────────────────────

export interface BusinessExample { name: string; icon: string; tagline: string; forms: string[]; reports: string[]; workflows: string[] }

export const BUSINESS_EXAMPLES: BusinessExample[] = [
  { name: "Sales & Invoicing", icon: "receipt", tagline: "Quotation → Invoice → Payment with GST and receivables", forms: ["Customer", "Product", "Quotation", "Sales Invoice (items subform)", "Payment Receipt"], reports: ["Invoice register (table)", "Sales by month (chart)", "Invoice kanban by payment status", "Receivables aging", "Customer ledger"], workflows: ["Auto-fill rate & GST from product", "Block save when qty > stock", "Payment status Paid/Partial automatically", "Notify owner for invoices above ₹50,000"] },
  { name: "Inventory & Purchase", icon: "warehouse", tagline: "Purchases, stock levels, reorder alerts", forms: ["Item / Product", "Vendor", "Purchase Order", "GRN / Purchase", "Stock Adjustment"], reports: ["Stock status (ledger)", "Low stock (filter)", "Purchases by vendor (summary)", "Item × month (pivot)"], workflows: ["Purchase saved → stock +", "Sale saved → stock −", "Below minimum level → notify store"] },
  { name: "CRM & Leads", icon: "target", tagline: "Pipeline from enquiry to won", forms: ["Lead", "Contact", "Follow-up", "Deal"], reports: ["Pipeline kanban", "Lead funnel with conversion %", "Follow-ups calendar", "Top salesmen (ranking)"], workflows: ["Stage = Won → create Customer", "No follow-up in 7 days → task", "Assign leads round-robin"] },
  { name: "HR & Attendance", icon: "users", tagline: "Employees, leave, attendance, payroll inputs", forms: ["Employee", "Leave Request", "Attendance", "Advance / Expense"], reports: ["Leave calendar", "Attendance pivot (employee × day)", "Leave approvals kanban", "Department summary"], workflows: ["Leave > 3 days → manager approval", "Leave balance check", "Birthday notification"] },
  { name: "Projects & Tasks", icon: "clipboard", tagline: "Milestones, tasks and timelines", forms: ["Project", "Task", "Timesheet", "Issue"], reports: ["Project Gantt", "Task checklist", "Task kanban", "Hours by project (summary)"], workflows: ["Task done → progress % recalculated", "Overdue task → notify assignee"] },
  { name: "Service / AMC", icon: "wrench", tagline: "Complaints, technicians and contracts", forms: ["Customer", "Asset", "Service Ticket", "AMC Contract"], reports: ["Ticket list (mobile)", "Technician scheduler", "Open tickets aging", "Contract expiry calendar"], workflows: ["Ticket created → assign technician & notify", "Contract expiring in 30 days → reminder"] },
  { name: "Clinic / Appointments", icon: "stethoscope", tagline: "Patients, doctors and bookings", forms: ["Patient", "Doctor", "Appointment", "Prescription", "Bill"], reports: ["Doctor scheduler (doctor × day)", "Appointments calendar", "Revenue by doctor (chart)"], workflows: ["Double-booking check", "Bill saved → SMS/webhook"] },
  { name: "School / Training", icon: "education", tagline: "Students, batches, fees", forms: ["Student", "Batch", "Fee Payment", "Attendance", "Exam Result"], reports: ["Fee dues aging", "Batch attendance pivot", "Results ranking", "Students by batch (tree)"], workflows: ["Fee overdue → notify parent", "Marks → grade formula"] },
  { name: "Manufacturing / BOM", icon: "factory", tagline: "Materials, production, finished goods", forms: ["Raw Material", "Finished Product", "BOM", "Production Entry"], reports: ["Raw material ledger", "Production plan Gantt", "BOM hierarchy (tree)", "Output by product (chart)"], workflows: ["Production saved → consume BOM materials, add finished stock", "Shortage → block with popup"] },
];
