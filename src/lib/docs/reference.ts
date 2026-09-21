/**
 * Documentation content: what to do → what happens, with copy-paste examples.
 * Rendered by /docs. Function lists come from the engines so they never drift.
 */
import { FUNCTION_DOCS } from "@/lib/engine/formulaEngine";
import { SCRIPT_API_DOCS } from "@/lib/engine/workflowEngine";
import { REPORT_TYPES } from "@/lib/engine/reportTypes";

export interface DocBlock {
  kind: "p" | "table" | "code" | "steps" | "note" | "list";
  text?: string; // p / note
  title?: string; // code / table caption
  lang?: string; // code
  code?: string; // code
  headers?: string[]; // table
  rows?: string[][]; // table
  items?: string[]; // steps / list
  tone?: "info" | "warn" | "tip"; // note
}
export interface DocTopic { id: string; title: string; blocks: DocBlock[] }
export interface DocChapter { id: string; title: string; icon: string; summary: string; topics: DocTopic[] }

const p = (text: string): DocBlock => ({ kind: "p", text });
const note = (text: string, tone: DocBlock["tone"] = "info"): DocBlock => ({ kind: "note", text, tone });
const code = (code: string, title?: string, lang = "js"): DocBlock => ({ kind: "code", code, title, lang });
const table = (headers: string[], rows: string[][], title?: string): DocBlock => ({ kind: "table", headers, rows, title });
const steps = (items: string[]): DocBlock => ({ kind: "steps", items });
const list = (items: string[]): DocBlock => ({ kind: "list", items });

export const DOCS: DocChapter[] = [
  // ── Getting started ────────────────────────────────────────────────────────
  { id: "start", title: "Getting started", icon: "home", summary: "From sign-in to a live app your team can use.", topics: [
    { id: "start-flow", title: "The 6-step flow", blocks: [
      steps([
        "Sign in as the owner → Owner console → Create Application (name, icon, accent colour, currency, sharing mode).",
        "Forms tab → add master forms first (Customer, Product, State, City), then transactions (Sales Invoice with an Items subform).",
        "Reports tab → every form already has a table report; add Chart, Kanban, Aging, Ledger… or use AI → New report.",
        "Pages tab → build a Dashboard: Date filter + KPI cards + charts + a report widget. Mark it as Home page.",
        "Users tab → create designations (roles), set per-form permissions, invite members by email. Share link per app.",
        "Publish (top-right). Members always see the last published version; you keep editing the draft. Roll back from Versions any time.",
      ]),
      note("Draft vs published: the owner sees the draft (toggle 'Draft preview' in the live app). Members and public links only ever see the published version, so half-finished changes are never visible to users.", "tip"),
    ] },
    { id: "start-naming", title: "Names, link names and ids", blocks: [
      p("Every form and field has a label (what users see) and a link name (snake_case, used in formulas and scripts). 'Grand Total' → grand_total. Subform columns have their own link names: Items › Quantity → input.items[i].quantity."),
      table(["You type", "Link name", "Use in formula / script"], [["Invoice Date", "invoice_date", "dateDiff(invoice_date, today(), \"days\")"], ["Items (subform) › Amount", "items.amount", "sum(items.amount)"], ["Customer (lookup) › City", "customer.city", "customer.city == \"Chennai\""]]),
    ] },
  ] },

  // ── Forms & fields ─────────────────────────────────────────────────────────
  { id: "fields", title: "Forms & fields", icon: "file", summary: "Every field type, its settings, and what happens at runtime.", topics: [
    { id: "fields-types", title: "Field types & settings", blocks: [
      table(["Type", "Key settings", "What happens"], [
        ["Text / Textarea / Rich text", "min/max length, unique, placeholder, tooltip, default", "Unique → save is blocked with 'already exists' when another record has the same value."],
        ["Email / Phone / URL", "required, unique", "Format validated on save; shown as clickable mailto / tel / link in reports."],
        ["Number / Decimal / Currency / Percentage", "decimals, min, max, currency symbol", "Right-aligned, Indian grouping (1,23,456.00); can be summed in reports and rollups."],
        ["Date / Date-time / Time", "default (today(), now()), min/max date", "Date pickers; drives calendar, gantt, scheduler, aging and dashboard date filters."],
        ["Dropdown / Radio", "options, option colours, default", "Colours show as badges in reports and as kanban lane / funnel / gantt colours."],
        ["Multi-select", "options", "Stored as an array; report filter 'in' works on it."],
        ["Checkbox", "default", "Yes/No; use for Active flags, 'Done' in checklists; filter operators is_true / is_false."],
        ["Lookup", "related form, display field(s), filter, cascade, auto-fill, multiple, add-new, sort", "See the Lookups topic."],
        ["Subform", "columns, row formulas, totals, min/max rows, bulk add, reorder, import rows", "See the Subforms topic."],
        ["Formula", "expression, result type, decimals", "Read-only, recalculated live while typing and in reports."],
        ["Rollup", "source form, match field, aggregate, value field, filters", "Read-only aggregate of child records (Customer → sum of invoices)."],
        ["Auto number", "prefix / pattern, start, digits, reset yearly/monthly", "Generated on first save; never edited by users; pattern INV/{YYYY}/{MM}/{0000}."],
        ["Rating", "max stars", "Stars in form and report."],
        ["File / Image", "accept types", "Uploaded to Firebase Storage; image thumbnails in tables and grid cards."],
        ["Signature", "—", "Draw with mouse/finger, stored as image."],
        ["Barcode / QR", "—", "Camera scan button on phone; text fallback."],
        ["Address / Geolocation", "—", "Structured address; lat/long with 'use my location'."],
        ["Users", "multiple", "Pick app members (email); use for Assigned to / Approver."],
        ["Colour", "—", "Colour picker."],
        ["Section", "collapsible, columns", "Visual grouping; fields below it belong to the section until the next one."],
      ]),
      p("Common settings on every field: Required, Required-if (expression), Read-only, Hidden, Width (full / half / third / two-thirds), Show in report, Tooltip, Default value, Visibility rule."),
    ] },
    { id: "fields-lookup", title: "Lookups", blocks: [
      table(["Setting", "Effect", "Example"], [
        ["Related form + display field(s)", "Which records can be picked and how they are shown", "Product → Product Name · Code"],
        ["Filter (Only show records where)", "Hides records from the dropdown", "Active is_true → inactive products can't be picked anywhere"],
        ["Cascade (parent field)", "Options depend on another lookup in the same form", "City filtered by the chosen State"],
        ["Auto-fill", "Copies fields from the picked record into this form", "Customer → Phone, GSTIN, Credit limit"],
        ["Allow multiple", "Stores an array of ids", "Tags, Multiple technicians"],
        ["Add new inline", "'+ New' inside the dropdown opens a quick-create modal", "Add a new customer while billing"],
        ["Searchable / multi-column", "Type to search; extra columns shown in the list", "Search by code or name"],
      ]),
      code(`// Formula / script can read fields of the looked-up record with a dot:
customer.credit_limit
vendor.city == "Madurai"`, "Reading through a lookup", "text"),
      note("'Active = No must not appear in lookups' → AI Assistant → New workflow → it creates a lookup filter (not a script) on every lookup pointing to that form.", "tip"),
    ] },
    { id: "fields-subform", title: "Subforms (line items)", blocks: [
      p("When you add a Subform field the builder asks how rows should be stored:"),
      table(["Mode", "Columns", "Where rows live", "Use when"], [
        ["Blank subform", "You define them (Item, Qty, Rate, Amount…)", "Inside the parent record only", "Simple line items that never need their own reports"],
        ["Use an existing form", "Picked from that form's fields", "Each row is also a real record of the child form, with a read-only lookup pointing at the parent (added automatically)", "You want to report on the rows themselves (Invoice Items report, item-wise sales) or enter them from several parents"],
      ]),
      note("Existing-form mode: open the child form's report to see every row and the parent it was entered from (the auto lookup). Editing the parent updates/creates/deletes the child records to match; a hard delete of the parent removes its child rows.", "tip"),
      table(["Setting", "Effect"], [
        ["Columns", "Any field type per column; lookups with auto-fill (Product → Rate) work per row"],
        ["Row formula", "amount = quantity * rate — recalculated per row while typing"],
        ["Totals", "Footer total for selected numeric columns; header formula sum(items.amount) for the grand total"],
        ["Min / max rows", "Validation: at least 1 row, at most 50"],
        ["Bulk add / duplicate row / reorder", "Faster entry"],
        ["Import rows from", "Pick a record of another form (e.g. a Purchase Order) and copy its lines into this subform (Invoice)"],
      ]),
      code(`// header formula
sum(items.amount)
// conditional sum: only rows where type = "Service"
sumif(items.amount, items.type, "Service")
// count of rows with a product
count(items.product)`, "Subform formulas", "text"),
    ] },
    { id: "fields-formula", title: "Formulas", blocks: [
      p("Formulas use link names, arithmetic (+ − × ÷), comparisons (==, !=, <, >=), logic (and / or / not, or && ||), ternary (cond ? a : b) and these functions:"),
      table(["Function", "Signature", "Description"], FUNCTION_DOCS.map((f) => [f.name, f.sig, f.desc])),
      code(`quantity * rate * (1 - discount / 100)
round(sum(items.amount) * 18 / 100, 2)
if(payment_mode == "Cheque", cheque_no, "")
ifs(amount > 100000, "A", amount > 25000, "B", "C")
dateAdd(invoice_date, customer.credit_days, "days")        // due date
dateDiff(invoice_date, today(), "days") > 30 ? "Overdue" : "OK"
concat(first_name, " ", last_name)
formatDate(invoice_date, "DD MMM YYYY")`, "Examples", "text"),
      note("Formula fields are read-only and always up to date. Use a workflow only when the value must be stored once (e.g. a rate frozen at the time of billing).", "info"),
    ] },
    { id: "fields-validation", title: "Validation & visibility rules", blocks: [
      table(["Where", "Expression", "What happens"], [
        ["Field → Required-if", "payment_mode == \"Cheque\"", "Cheque No becomes mandatory only for cheque payments"],
        ["Field → Validation rules", "end_date >= start_date · message 'End date must be after start'", "Save blocked, message shown under the field"],
        ["Field → Validation rules", "len(gstin) == 15", "GSTIN length check"],
        ["Field → Visibility rule", "delivery == true", "Transporter field shown only when Delivery is ticked"],
        ["Field → Unique", "—", "No two records with the same Phone"],
        ["Subform → min/max rows", "—", "At least one line item"],
      ]),
    ] },
    { id: "fields-autonumber", title: "Auto number patterns", blocks: [
      table(["Pattern", "Result", "Reset"], [["INV/{YYYY}/{0000}", "INV/2026/0042", "yearly"], ["PO-{YY}{MM}-{000}", "PO-2609-018", "monthly"], ["TKT{00000}", "TKT00118", "never"], ["{YYYY}-{MM}-{DD}-{00}", "2026-09-21-03", "daily by pattern"]]),
    ] },
  ] },

  // ── Reports ────────────────────────────────────────────────────────────────
  { id: "reports", title: "Reports", icon: "table", summary: "Every view type: the settings it needs and what it shows.", topics: [
    { id: "reports-types", title: "View types", blocks: [
      table(["View", "Needs (View config)", "Shows", "Typical use"], REPORT_TYPES.map((t) => [t.label, (t.needs || ["nothing extra"]).map((n) => n.split(".")[1] || n).join(", "), t.desc, t.useCases.join("; ")])),
      note("Report type (General tab) is the default view. Users can still switch views on the live report; other views use auto-detected fields. 'Save as default view' (owner) stores the choice; members get 'Save for me'.", "tip"),
    ] },
    { id: "reports-config", title: "Configuring each view", blocks: [
      table(["View", "Settings", "Notes"], [
        ["Table", "Columns tab (order, width, footer totals), Group rows by, group totals, running total, inline edit", "Double-click a cell to edit when inline edit is on"],
        ["Grid / List", "Title, subtitle, image/avatar, card fields, badge", "List is the compact mobile style"],
        ["Kanban", "Status field (dropdown), card title, card fields", "Drag a card to change status (needs edit permission)"],
        ["Funnel", "Stage field, value field (sum) or count, 'won' stages", "Shows % of first stage and step conversion"],
        ["Calendar / Timeline / Scheduler", "Date field, end date, title; scheduler also needs a resource field (room, staff)", "Scheduler: week/month grid of resource × day"],
        ["Gantt", "Start, end, title, swimlane, progress %, colour-by", "Red line = today; late items flagged"],
        ["Summary / Pivot", "Group by + totals; pivot rows, columns, value, aggregate", "Grand totals included"],
        ["Chart", "Chart type, group by (or Created date), split series, value, aggregate, date bucket, Top N", "Users can switch chart type and open the data table"],
        ["Ranking", "Group, value, aggregate, Top N, order, target", "Medals for top 3; target line"],
        ["Aging", "Date, amount, paid amount, party, buckets (30,60,90), credit days", "Outstanding = amount − paid; overdue days from date + credit days"],
        ["Ledger", "Primary form, opening, min level, unit, sources (form, item lookup path, quantity path, direction, date, reference, filters), tiles, period filter", "Item lookup and quantity must be in the same subform"],
      ]),
    ] },
    { id: "reports-features", title: "Filters, formatting, export", blocks: [
      list([
        "Default filter (Filters tab) applies every time; users add their own on top. Groups combine with AND/OR; separate groups are OR.",
        "Date presets in filters: today, yesterday, this/last week, this/last month, this quarter, this/last year, last 7/30/90 days.",
        "Quick filter chips: choose dropdown/checkbox fields in General; a 'My records' chip is always available.",
        "Saved filters: shared (built in the builder) or personal (saved by the user in the filter dialog).",
        "Conditional formatting (Formatting tab): colour a cell or the whole row when a condition matches.",
        "Export CSV / Excel, print, import CSV with column mapping — each can be switched off per report and per role.",
      ]),
    ] },
  ] },

  // ── Dashboards ─────────────────────────────────────────────────────────────
  { id: "pages", title: "Dashboards & pages", icon: "dashboard", summary: "Widgets, the date filter, and live numbers in text.", topics: [
    { id: "pages-widgets", title: "Widgets", blocks: [
      table(["Widget", "Settings", "What happens"], [
        ["Heading", "title, subtitle, action button → form", "Subtitle supports {{form.count}} expressions"],
        ["Date filter", "style (buttons / dropdown), which quick ranges, default range, custom dates, date field per form", "Every KPI, chart and report widget on the page follows it"],
        ["KPI cards", "form, count/sum/avg/min/max, field, filters, compare (last month / last year), date field, prefix/suffix, compact, colour", "With a page date range the comparison is 'vs previous N days'"],
        ["Chart", "type (bar, column, stacked, line, area, pie, donut, funnel, gauge), form, group by, bucket, metric, series, Top N, filters, drill-down", "Click a bar/slice → opens the report filtered by that label"],
        ["Report", "report, view, rows, follow page date filter", "Embedded report with the page's date range applied"],
        ["Form", "form, hide header", "Data entry directly on the page"],
        ["Quick links / Button / Markdown / Text / Image / Iframe / Divider", "—", "Navigation and content"],
      ]),
      code(`Sales today: {{sales_invoice.sum(grand_total)}}
Open tickets: {{ticket.count(status=Open)}}
Average order: {{sales_invoice.avg(grand_total)}}`, "Live numbers in heading / text / markdown", "text"),
    ] },
  ] },

  // ── Workflows ──────────────────────────────────────────────────────────────
  { id: "workflows", title: "Workflows", icon: "zap", summary: "Triggers, no-code actions, and when each thing runs.", topics: [
    { id: "wf-ai", title: "Write with AI", blocks: [
      p("On the Workflows page click AI (or “Write with AI” inside a workflow) and describe the rule in plain words — e.g. “When Purchase Order is chosen, fill Line Items from that PO and copy the vendor”. The AI sees your real forms, fields, subform columns and lookup targets, picks the trigger, and writes the script."),
      table(["Check", "What it means"], [
        ["Syntax", "The script parses in the sandbox."],
        ["Field & form names", "Every input.<field>, row column, get(\"form\") and row key you assign to a subform exists — typos are listed with a suggestion."],
        ["Dry run", "The script ran once on your latest record (or sample values) without crashing; changed fields, popups, blocked saves and queued data operations are shown."],
      ], "Every proposal is verified before you see it"),
      p("If a check fails, the AI repairs the script automatically (up to two rounds) and the card shows “Verified” or “Needs attention”. Use the Refine box for follow-up changes (“also copy the address”, “skip zero-quantity rows”). “Edit with AI” rewrites an existing script the same way; “Explain” describes what a script does in plain language."),
      note("Nothing is saved until you click Create / Apply. The dry run never writes data — insert/update/increment are only listed.", "info"),
    ] },
    { id: "wf-triggers", title: "Triggers", blocks: [
      table(["Trigger", "Runs when", "Can do", "Cannot do"], [
        ["On load (new)", "Blank form opens (new record only)", "set defaults, hide/lock fields, messages", "data changes"],
        ["On load (edit)", "Existing record opens (edit only)", "same as above; `record` available, `isEdit` = true", "data changes"],
        ["On load (new + edit)", "Whenever the form opens", "rules that must apply every time — e.g. disableAll() when status is Approved", "data changes"],
        ["On field change", "A value changes (whole form or one field / subform column)", "calculate, auto-fill, show/hide, warn", "block save"],
        ["On validate", "User clicks Save, before submit", "setError / showError / blockSubmit", "after-save data ops"],
        ["On submit", "After validation, right before saving", "confirm('Continue anyway?'), final adjustments, block", "—"],
        ["After save", "Record stored", "insert / update / increment / remove on any form, email, notify, webhook", "change the current form's fields"],
        ["On delete", "Record deleted", "reverse stock, block with showError", "—"],
        ["Approval", "Approve / reject in-app", "status changes, notifications", "—"],
        ["Scheduled / Webhook", "Cron time / incoming HTTP", "stored in the app; needs Cloud Functions to execute", "run in the browser"],
      ]),
    ] },
    { id: "wf-actions", title: "No-code actions", blocks: [
      table(["Action", "Fields", "Example"], [
        ["Set value / Copy field / Calculate / Clear", "target field, value or operands", "Amount = Quantity × Rate"],
        ["Show / Hide / Read-only / Editable", "target field", "Hide Cheque No unless mode = Cheque"],
        ["Show message", "text, type", "Banner 'Saved with discount'"],
        ["Show popup", "title, message, type info / warning / confirm / error", "error blocks; confirm asks 'Continue anyway?'"],
        ["Validate / Block submit", "condition, message", "Qty > stock → block"],
        ["Update other form", "target form, record (lookup value), field, operation set / add / subtract", "Product.Current Stock − Items.Qty"],
        ["Create record / Delete record", "target form, field mapping", "Stock Log row per invoice"],
        ["Send email / Notify / Call webhook", "to, subject, body / users / url", "Notify owner for big invoices"],
        ["Request approval / Assign task", "approver users, status field", "PO > ₹1 lakh → manager"],
      ]),
      p("Every action can have conditions (field operator value, compare to literal or another field). Messages support {field_link_name} placeholders."),
    ] },
  ] },

  // ── Script reference ───────────────────────────────────────────────────────
  { id: "script", title: "Script reference", icon: "cpu", summary: "The JavaScript sandbox: what is available, every function, and what it does.", topics: [
    { id: "script-lang", title: "Language support", blocks: [
      p("Scripts are plain modern JavaScript, run in a sandbox inside the browser (no network, no DOM, step limit against infinite loops). Supported: const/let/var, if/else, for, for…of, for…in, while, do…while, break/continue, functions and arrow functions, template strings, objects/arrays with spread and destructuring, try/catch/throw, ternary, optional chaining."),
      table(["Available globals", "Notes"], [["Math, JSON, Date, Array, Object, String, Number, Boolean, Map, Set, Error", "safe subsets"], ["parseInt, parseFloat, isNaN, isFinite, encodeURIComponent", ""], ["console.log", "output shown in Test run and Logs"]]),
      note("NOT Deluge. 'for each', 'cancel submit', 'info', 'alert' without parentheses, 'input.field = …;' inside 'if' without braces are syntax errors. Click 'Fix with AI' to convert.", "warn"),
      note("Everything is synchronous: get(), fetch() return data immediately, so await is never needed (async/await is accepted and simply ignored). fetch(url) to the internet is not available — use callWebhook(url, body) to send data out after save; reading a response back needs a Cloud Function.", "warn"),
    ] },
    { id: "script-api", title: "Host API (every function)", blocks: [
      table(["Group", "Name", "Signature", "What it does"], SCRIPT_API_DOCS.map((d) => [d.group, d.name, d.sig, d.desc])),
      table(["Function", "Returns", "When does it act?"], [
        ["input.<link>", "current value; assignment changes the form live", "immediately (on load / field change / validate / submit)"],
        ["input.<subform>", "array of row objects; edit row.qty, push({…}), splice, or assign a whole new array — keys by column link name, formula columns recalculated", "immediately"],
        ["fetch(form, filter)", "array of records (fields by link name, plus .id)", "reads the latest data in the browser"],
        ["get(form, id)", "one record or null", "reads"],
        ["insert / update / increment / remove", "queued; insert returns a temp id", "executed after the record is saved successfully (After save / On submit)"],
        ["showPopup(msg, type)", "—", "info/warning: shown, save continues · confirm: user chooses · error: blocks"],
        ["confirm(msg)", "—", "popup with Cancel / Continue anyway"],
        ["showError / setError / blockSubmit", "—", "save is blocked; setError highlights a field"],
        ["hideField / showField / setReadonly / setEditable", "—", "immediately"],
        ["sendEmail / notify / callWebhook", "queued", "after successful save"],
        ["today(), now(), dateDiff, dateAdd, formatDate, round, sum, isEmpty, formula(expr)", "values", "helpers"],
      ], "Semantics"),
    ] },
    { id: "script-recipes", title: "Recipes (copy & adapt)", blocks: [
      code(`// Trigger: On field change · field: Purchase Order  (GRN form)
const po = get("purchase_order", input.purchase_order);
if (!po) { input.line_items = []; return; }
input.vendor = po.vendor;
// keys = the GRN subform's column link names; values from the PO rows
input.line_items = po.line_items.map((r) => ({
  item: r.item,
  ordered_quantity: r.quantity,
  received_quantity: r.quantity,
  rate: r.rate,
}));
// Amount (formula column) is recalculated automatically`, "0. Fill line items from another record (GRN ← PO, Invoice ← Quotation)"),
      code(`// Trigger: On field change · field: Items › Product
for (const row of input.items) {
  if (!row.product) continue;
  const p = get("product", row.product);
  if (p) { row.rate = p.selling_rate; row.gst_percent = p.gst_percent; }
  row.amount = (row.quantity || 0) * (row.rate || 0);
}`, "1. Auto-fill rate & GST from product (subform)"),
      code(`// Trigger: On validate
for (const row of input.items) {
  const p = get("product", row.product);
  if (p && row.quantity > p.current_stock) {
    setError("items", \`Only \${p.current_stock} \${p.unit} of \${p.product_name} in stock\`);
  }
}`, "2. Block save when quantity exceeds stock"),
      code(`// Trigger: After save (create) — Sales Invoice
for (const row of input.items) {
  if (row.product) increment("product", row.product, "current_stock", -Number(row.quantity || 0));
}
// Trigger: On delete — add it back
for (const row of input.items) {
  if (row.product) increment("product", row.product, "current_stock", Number(row.quantity || 0));
}`, "3. Reduce stock after save, restore on delete"),
      code(`// Trigger: On submit
const c = get("customer", input.customer);
if (c && (c.outstanding || 0) + input.grand_total > (c.credit_limit || 0)) {
  confirm(\`Credit limit ₹\${c.credit_limit} exceeded (outstanding ₹\${c.outstanding}). Continue anyway?\`);
}`, "4. Credit-limit warning with 'Continue anyway'"),
      code(`// Trigger: On field change (whole form) — Payment Receipt / Invoice
const received = Number(input.amount_received || 0), total = Number(input.grand_total || 0);
input.payment_status = received >= total && total > 0 ? "Paid" : received > 0 ? "Partial" : "Unpaid";
input.balance = total - received;`, "5. Payment status automatically"),
      code(`// Trigger: On validate — Customer
const dup = fetch("customer", (r) => r.phone === input.phone && r.id !== (record ? record.id : null));
if (dup.length) setError("phone", \`Phone already used by \${dup[0].customer_name}\`);`, "6. Prevent duplicates"),
      code(`// Trigger: On field change · field: Payment Mode
if (input.payment_mode === "Cheque") { showField("cheque_no"); showField("bank_name"); }
else { hideField("cheque_no"); hideField("bank_name"); input.cheque_no = ""; }`, "7. Show fields conditionally"),
      code(`// Trigger: On validate
if (input.end_date && input.start_date && input.end_date < input.start_date) setError("end_date", "End date must be after start date");
if (dateDiff(input.invoice_date, today(), "days") < 0) setError("invoice_date", "Invoice date cannot be in the future");`, "8. Date validations"),
      code(`// Trigger: On load (new + edit)
if (isEdit && input.status === "Approved") {
  disableAll(["notes"]);            // every field read-only except Notes  (setReadonly("*") also works)
  showMessage("Approved records are locked. Only Notes can be edited.", "info");
}`, "9. Lock a record once approved"),
      code(`// Trigger: On field change · field: Status
if (input.status === "Approved" && !input.approved_by) {
  input.approved_by = user.email;
  input.approved_on = today();
}`, "10. Stamp approver and date"),
      code(`// Trigger: After save
if (input.grand_total > 50000) {
  notify("owner@shop.in", "Big invoice", \`\${input.invoice_no} for ₹\${input.grand_total} by \${user.name}\`);
  sendEmail({ to: "accounts@shop.in", subject: \`Invoice \${input.invoice_no}\`, body: \`Total ₹\${input.grand_total}\` });
}
callWebhook("https://hooks.zapier.com/…", { body: { invoice: input.invoice_no, total: input.grand_total } });`, "11. Notifications & webhook after save"),
      code(`// Trigger: After save — Purchase (GRN)
for (const row of input.items) {
  increment("product", row.product, "current_stock", Number(row.quantity));
  insert("stock_log", { product: row.product, qty: row.quantity, direction: "IN", reference: input.purchase_no, date: today(), user: user.email });
}`, "12. Write a log record per line"),
      code(`// Trigger: On validate — Items subform
const seen = new Set();
for (const row of input.items) {
  if (seen.has(row.product)) { setError("items", "Same product added twice — merge the rows"); break; }
  seen.add(row.product);
}
if (!input.items.length) setError("items", "Add at least one item");`, "13. Subform rules: no duplicate products, at least one row"),
      code(`// Trigger: On load (new)
input.invoice_date = today();
input.salesperson = user.email;
const last = fetch("sales_invoice").sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
if (last) input.customer = last.customer;`, "14. Defaults from the logged-in user and last record"),
      code(`// Trigger: On submit — Purchase Order
if (input.grand_total > 100000 && input.status !== "Pending Approval") {
  input.status = "Pending Approval";
  notify("manager@shop.in", "PO approval needed", \`\${input.po_no}: ₹\${input.grand_total}\`);
  showPopup("Sent for manager approval because the total exceeds ₹1,00,000.", "info");
}`, "15. Approval routing"),
    ] },
    { id: "script-debug", title: "Testing & debugging", blocks: [
      steps(["Open the workflow → Test run → fill sample values → Run. See console.log output, popups, field changes and queued data operations without saving anything.", "Enable the workflow; open the form live; the Logs button shows every execution with errors.", "A red 'Script syntax error' badge → click Fix with AI, or fix the line shown.", "Health check (builder) also lists broken scripts and deleted fields referenced by workflows."]),
    ] },
  ] },

  // ── Users & governance ─────────────────────────────────────────────────────
  { id: "users", title: "Users, sharing & publishing", icon: "shield", summary: "Roles, members, share links, versions, audit, health.", topics: [
    { id: "users-roles", title: "Roles (designations)", blocks: [
      table(["Permission", "Meaning"], [["Form: view / create / edit / delete / print / export / import", "Per form; unchecked = no access (form hidden from the menu)"], ["Record scope: all / own", "Own = only records the user created"], ["Field rules: hidden / read-only", "Per field for that role, in forms and reports"], ["Report: view / print / export", "Per report"], ["Page: view", "Per dashboard page"], ["Admin role", "Everything in the live app, including managing members (builder access is separate — see below)"]]),
      steps(["Users tab → Add designation (presets: full / view-only / none) → tick permissions.", "Add member → email + designation. The member signs in with Google or email; unknown emails see 'This email is not configured'.", "Share → copy the app link. Public mode (Settings → sharing) allows read-only access without sign-in."]),
    ] },
    { id: "users-builder-access", title: "Builder access (collaborators)", blocks: [
      list(["Members use the live app; builder collaborators also open the app in the builder — forms, reports, workflows, pages, members, publish.", "Share → Builder access → email + Give builder access. The person signs in and lands on /builder with only the apps they were given.", "Collaborators cannot delete the app, change its owner, manage the collaborator list, create new apps or save templates — those stay with the owner.", "Remove access any time from the same list; the change applies on their next page load."]),
      note("Builder access is per app. The same email can be a member of one app and a builder of another.", "tip"),
    ] },
    { id: "users-publish", title: "Publish, versions, audit, health", blocks: [
      list(["Publish creates a numbered version snapshot; members switch to it instantly.", "Versions tab → view any version → Roll back (creates a new draft from it).", "Audit tab → who created/updated/deleted what, with before/after values; exportable.", "Health tab → errors/warnings/suggestions with Auto-fix (ledger mapping, missing view settings) and links to the exact form/report.", "Settings → export app JSON, import, duplicate, save as template, menu sections & icons, trash, recent records."]),
    ] },
  ] },

  // ── AI ─────────────────────────────────────────────────────────────────────
  { id: "ai", title: "AI assistant", icon: "sparkles", summary: "How to prompt for apps, forms, reports, workflows and fixes.", topics: [
    { id: "ai-prompts", title: "Prompt patterns that work", blocks: [
      table(["Tab", "Prompt", "Result"], [
        ["Generate app", "Sales invoicing for a textile wholesaler: customers with credit limit, products with GST %, invoices with line items, payment receipts, stock status and receivables aging. Staff see only their own invoices.", "Forms + lookups + subforms, reports (table, chart, kanban, aging, ledger), workflows, roles, dashboard"],
        ["New form", "Purchase form: Purchase No (autonumber PUR/{YYYY}/{0000}), Purchase Date, Vendor (lookup), Items subform with Product (lookup Product), Quantity, Rate, Amount = quantity * rate; Grand Total = sum(items.amount)", "One form + its table report"],
        ["New report", "Receivables aging by customer from Sales Invoice: due date = Invoice Date, amount = Grand Total less Amount Paid, buckets 30/60/90", "Aging report configured"],
        ["New workflow", "After saving a Sales Invoice reduce Product Current Stock by each line quantity; on delete add it back", "Script + trigger, syntax-checked"],
        ["New workflow", "State with Active = No must not show in any lookup", "Lookup filter applied to every State lookup (no script)"],
        ["Edit with AI (report)", "Map the Sales source to Items › Product and Items › Quantity", "Ledger source fixed"],
        ["Edit with AI (form)", "Add Discount % after Rate and make Amount = quantity * rate * (1 - discount / 100)", "Field added, formula updated"],
        ["Formula writer", "Due date 30 days after invoice date unless customer has credit days", "dateAdd(invoice_date, coalesce(customer.credit_days, 30), \"days\")"],
        ["Ask data", "Top 5 customers by sales this month", "Filtered answer + table"],
        ["Sample data", "20 records per form", "Linked demo data flagged as sample"],
      ]),
      note("Name forms and fields exactly as they appear in your app ('Sales Invoice → Items › Quantity'), say which trigger you want, and mention the outcome (block / warn / update). Vague prompts produce vague scripts.", "tip"),
    ] },
  ] },

  // ── FAQ ────────────────────────────────────────────────────────────────────
  { id: "faq", title: "Troubleshooting", icon: "help", summary: "Common questions and their fixes.", topics: [
    { id: "faq-list", title: "FAQ", blocks: [
      table(["Symptom", "Cause", "Fix"], [
        ["Ledger 'Sales' column shows —, Total inflow 0", "Source not mapped to the subform columns / no inflow source", "Health → Auto-fix, or Report → Edit with AI 'map Sales to Items › Product and Items › Quantity'; add a Purchase source for inflow"],
        ["Low stock always 0", "No Minimum level field", "Add a number field to Product and choose it in Ledger settings"],
        ["KPI shows 0 but records exist", "Date filter / compare period or wrong field", "Clear the page date filter; check KPI field and filters"],
        ["Workflow 'Script syntax error'", "Deluge syntax or typo", "Fix with AI"],
        ["Lookup shows inactive records", "No filter on the lookup", "Field → Lookup → Only show where Active is true, or AI → New workflow prompt"],
        ["Member sees 'This email is not configured'", "Not added as a member", "Users → Add member with that email"],
        ["Member doesn't see my change", "Not published", "Click Publish"],
        ["Gemini 429 / quota", "Free-tier rate limit", "Wait a minute; reduce records per form; add a second key per app"],
        ["Firestore 'Failed to obtain primary lease'", "Two tabs with persistence", "Default is memory cache; close duplicate tabs"],
      ]),
    ] },
  ] },
];
