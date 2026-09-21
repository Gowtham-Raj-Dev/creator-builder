import { FormDefinition, ReportDefinition, ReportType } from "@/types/schema";

export interface ReportTypeMeta {
  id: ReportType;
  label: string;
  icon: string; // key in ui/IconPicker ICONS
  desc: string;
  category: "list" | "board" | "time" | "analytics" | "finance";
  /** Business scenarios this view is made for (shown in the builder and given to the AI). */
  useCases: string[];
  /** Config keys the view needs; the health check reports missing ones. */
  needs?: string[];
}

export const REPORT_TYPES: ReportTypeMeta[] = [
  { id: "table", label: "Table", icon: "table", desc: "Sortable list with grouping, totals & inline edit", category: "list", useCases: ["Any register / list", "Invoices, orders, employees", "Bulk select, export, import"] },
  { id: "grid", label: "Grid (cards)", icon: "grid", desc: "Card gallery, image-first", category: "list", useCases: ["Product catalogue", "Property / vehicle listings", "Staff directory with photos"] },
  { id: "list", label: "List (mobile)", icon: "rows", desc: "Compact rows: title, subtitle, badge", category: "list", useCases: ["Field-staff visits", "Complaints / tickets", "Contacts on phone"] },
  { id: "tree", label: "Hierarchy", icon: "tree", desc: "Parent–child tree from a self lookup", category: "list", useCases: ["Product categories / BOM", "Org chart, departments", "Account groups (chart of accounts)"], needs: ["tree.parentFieldId"] },
  { id: "checklist", label: "Checklist", icon: "checklist", desc: "Tick tasks inline, overdue highlighting", category: "board", useCases: ["Daily tasks / follow-ups", "Audit & inspection points", "Onboarding steps"], needs: ["checklist.doneFieldId"] },
  { id: "kanban", label: "Kanban", icon: "kanban", desc: "Drag cards across status lanes", category: "board", useCases: ["Sales pipeline", "Order fulfilment stages", "Service job status"], needs: ["kanban.statusFieldId"] },
  { id: "funnel", label: "Funnel", icon: "funnel", desc: "Stage-wise counts with conversion %", category: "analytics", useCases: ["Lead → Quote → Won", "Recruitment stages", "Applications processing"], needs: ["funnel.stageFieldId"] },
  { id: "calendar", label: "Calendar", icon: "calendar", desc: "Records placed on a month calendar", category: "time", useCases: ["Appointments / bookings", "Deliveries, due dates", "Leave & holidays"], needs: ["calendar.dateFieldId"] },
  { id: "scheduler", label: "Scheduler", icon: "calendarrange", desc: "Resources × days (rooms, staff, machines)", category: "time", useCases: ["Hotel rooms / clinic doctors", "Machine & vehicle allocation", "Staff roster / shifts"], needs: ["scheduler.resourceFieldId", "scheduler.dateFieldId"] },
  { id: "gantt", label: "Gantt", icon: "gantt", desc: "Bars from start to end date, with progress", category: "time", useCases: ["Projects & milestones", "Production planning", "Rentals / contracts validity"], needs: ["gantt.startFieldId"] },
  { id: "timeline", label: "Timeline", icon: "clock", desc: "Chronological activity feed", category: "time", useCases: ["Customer interaction history", "Asset service history", "Audit trail"] },
  { id: "summary", label: "Summary", icon: "list", desc: "Group-by with totals per group", category: "analytics", useCases: ["Sales by salesman / region", "Expenses by category", "Attendance by department"] },
  { id: "pivot", label: "Pivot", icon: "pivot", desc: "Rows × columns matrix with totals", category: "analytics", useCases: ["Product × month sales", "Branch × expense head", "Employee × leave type"], needs: ["pivot.rowFieldId"] },
  { id: "chart", label: "Chart", icon: "chart", desc: "Column, bar, line, pie, stacked", category: "analytics", useCases: ["Monthly sales trend", "Category share", "Stacked status by month"], needs: ["chart.groupFieldId"] },
  { id: "ranking", label: "Ranking", icon: "trophy", desc: "Top-N leaderboard with targets", category: "analytics", useCases: ["Top customers / products", "Salesman vs target", "Fastest moving items"], needs: ["ranking.groupFieldId"] },
  { id: "aging", label: "Aging", icon: "hourglass", desc: "Outstanding by days overdue (0–30, 31–60…)", category: "finance", useCases: ["Receivables aging", "Payables aging", "Pending tickets by age"], needs: ["aging.dateFieldId", "aging.amountFieldId"] },
  { id: "ledger", label: "Stock / Balance ledger", icon: "layers", desc: "Opening + inflows − outflows per item", category: "finance", useCases: ["Stock status per product", "Customer / vendor balances", "Cash & bank book"], needs: ["ledger.sources"] },
];

export const REPORT_TYPE_META: Record<string, ReportTypeMeta> = Object.fromEntries(REPORT_TYPES.map((t) => [t.id, t]));

export const REPORT_TYPE_IDS = REPORT_TYPES.map((t) => t.id);

/** Views that can be switched to at runtime without extra configuration (others need their config). */
export const AUTO_CONFIG_VIEWS: ReportType[] = ["table", "grid", "list", "kanban", "calendar", "timeline", "summary", "pivot", "chart", "ranking", "funnel"];

const by = (form: FormDefinition, types: string[], nameHint?: RegExp) =>
  (nameHint && form.fields.find((f) => types.includes(f.type) && nameHint.test(f.label))) || form.fields.find((f) => types.includes(f.type));
const numeric = (f: { type: string; formula?: { resultType?: string } }) => ["number", "currency", "decimal", "percentage", "rollup"].includes(f.type) || (f.type === "formula" && f.formula?.resultType === "number");

/**
 * Best-guess configuration for a view type from the form's fields, used when the
 * builder switches type, when the AI creates a report, and by the health auto-fix.
 * Never overwrites config that already exists.
 */
export function defaultConfigFor(type: ReportType, report: Partial<ReportDefinition>, form: FormDefinition): Partial<ReportDefinition> {
  const dates = form.fields.filter((f) => f.type === "date" || f.type === "datetime");
  const choice = by(form, ["dropdown", "radio"], /status|stage|state|type|category/i);
  const amount = form.fields.find((f) => f.type === "currency" && /total|amount|balance|outstanding|due|net/i.test(f.label)) || form.fields.find((f) => f.type === "currency") || form.fields.find(numeric);
  switch (type) {
    case "ledger": return report.ledger ? {} : { ledger: { primaryFormId: report.sourceFormId || form.id, displayFieldIds: form.fields.filter((f) => ["text", "autonumber", "dropdown"].includes(f.type)).slice(0, 3).map((f) => f.id), openingBalanceFieldId: form.fields.find((f) => numeric(f) && /opening/i.test(f.label))?.id, minLevelFieldId: form.fields.find((f) => numeric(f) && /min|reorder/i.test(f.label))?.id, unitFieldId: form.fields.find((f) => ["text", "dropdown", "lookup"].includes(f.type) && /unit|uom/i.test(f.label))?.id, sources: [] } };
    case "kanban": return report.kanban?.statusFieldId ? {} : { kanban: { ...(report.kanban || {}), statusFieldId: choice?.id || "" } };
    case "calendar": case "timeline": return report.calendar?.dateFieldId ? {} : { calendar: { ...(report.calendar || {}), dateFieldId: dates[0]?.id || "" } };
    case "pivot": return report.pivot?.rowFieldId ? {} : { pivot: { rowFieldId: by(form, ["lookup", "dropdown", "radio"])?.id || "", columnFieldId: choice?.id, valueFieldId: amount?.id, aggregate: amount ? "sum" : "count" } };
    case "chart": return report.chart?.groupFieldId ? {} : { chart: { chartType: dates.length ? "column" : "pie", groupFieldId: by(form, ["lookup", "dropdown", "radio"])?.id || dates[0]?.id || "createdAt", valueFieldId: amount?.id, aggregate: amount ? "sum" : "count", dateBucket: "month", limit: 12 } };
    case "ranking": return report.ranking?.groupFieldId ? {} : { ranking: { groupFieldId: by(form, ["lookup", "dropdown", "users", "text"])?.id || "", valueFieldId: amount?.id, aggregate: amount ? "sum" : "count", top: 10, order: "desc" } };
    case "funnel": return report.funnel?.stageFieldId ? {} : { funnel: { stageFieldId: choice?.id || "", valueFieldId: undefined } };
    case "aging": return report.aging?.dateFieldId ? {} : { aging: { dateFieldId: (dates.find((f) => /due/i.test(f.label)) || dates[0])?.id || "", amountFieldId: amount?.id || "", paidFieldId: form.fields.find((f) => numeric(f) && /paid|received/i.test(f.label))?.id, partyFieldId: by(form, ["lookup"], /customer|vendor|supplier|party|client/i)?.id, buckets: [30, 60, 90] } };
    case "tree": return report.tree?.parentFieldId ? {} : { tree: { parentFieldId: form.fields.find((f) => f.type === "lookup" && f.lookup?.targetFormId === form.id)?.id || "" } };
    case "list": return report.list ? {} : { list: { badgeFieldId: choice?.id, metaFieldIds: form.fields.filter((f) => ["currency", "date", "datetime"].includes(f.type)).slice(0, 2).map((f) => f.id) } };
    case "checklist": return report.checklist?.doneFieldId ? {} : { checklist: { doneFieldId: (form.fields.find((f) => f.type === "checkbox" && /done|complete|closed|resolved/i.test(f.label)) || form.fields.find((f) => f.type === "checkbox"))?.id || "", dueFieldId: (dates.find((f) => /due|deadline|target/i.test(f.label)) || dates[0])?.id, assigneeFieldId: form.fields.find((f) => f.type === "users")?.id } };
    case "scheduler": return report.scheduler?.resourceFieldId ? {} : { scheduler: { resourceFieldId: by(form, ["lookup", "dropdown", "users"], /room|staff|doctor|machine|vehicle|resource|employee|table/i)?.id || "", dateFieldId: (dates.find((f) => /start|from|check.?in|date/i.test(f.label)) || dates[0])?.id || "", endDateFieldId: dates.find((f) => /end|to|check.?out/i.test(f.label))?.id, mode: "week" } };
    case "gantt": return report.gantt?.startFieldId ? {} : { gantt: { startFieldId: (dates.find((f) => /start|from/i.test(f.label)) || dates[0])?.id || "", endFieldId: (dates.find((f) => /end|to|due|finish/i.test(f.label)) || dates[1])?.id, progressFieldId: form.fields.find((f) => (f.type === "percentage" || f.type === "number") && /progress|complete|%/i.test(f.label))?.id, colorFieldId: choice?.id } };
    default: return {};
  }
}

/** Human summary used in AI prompts. */
export const REPORT_TYPES_PROMPT = REPORT_TYPES.map((t) => `${t.id}: ${t.desc} (e.g. ${t.useCases.join("; ")})`).join("\n");
