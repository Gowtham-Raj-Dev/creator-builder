// ─────────────────────────────────────────────────────────────────────────────
// Core schema types for the low-code platform.
// Everything an app is (forms, reports, pages, workflows, roles, members …) is
// described by these types and stored as a single Firestore document.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "percentage"
  | "decimal"
  | "date"
  | "datetime"
  | "time"
  | "checkbox"
  | "dropdown"
  | "radio"
  | "multiselect"
  | "lookup"
  | "subform"
  | "file"
  | "image"
  | "url"
  | "autonumber"
  | "formula"
  | "rollup"
  | "rating"
  | "color"
  | "signature"
  | "geolocation"
  | "barcode"
  | "users"
  | "address"
  | "section";

export type FieldWidth = "full" | "half" | "third" | "two_thirds";

export type ReportOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "between"
  | "in"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false"
  | "date_preset";

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "last_year"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days";

export interface ReportFilter {
  id?: string;
  fieldId: string; // field id, linkName, or "createdBy" / "createdAt" / "updatedAt"
  operator: ReportOperator;
  value?: any;
  value2?: any; // for between
  preset?: DatePreset; // for date_preset
}

export interface FilterGroup {
  id: string;
  logic: "AND" | "OR";
  filters: ReportFilter[];
}

// ── Lookup ───────────────────────────────────────────────────────────────────

export interface LookupAutoFill {
  sourceFieldId: string; // field in target form
  targetFieldId: string; // field in this form (or subform column id)
}

export interface LookupConfig {
  targetFormId: string;
  displayFieldId: string;
  valueFieldId?: string; // defaults to 'id'
  relationshipType: "lookup" | "parent"; // parent: auto-managed back-reference from a child form used as a subform
  secondaryDisplayFieldIds?: string[]; // extra columns shown in picker / display
  displayStyle?: "dropdown" | "modal" | "radio";
  multiple?: boolean; // stores string[] instead of string
  allowAddNew?: boolean; // "+ Add new" inline
  filters?: ReportFilter[]; // filtered lookup (e.g. active vendors only)
  cascade?: {
    parentFieldId: string; // field in this form (e.g. Category)
    targetMatchFieldId: string; // field in target form that should equal parent value (e.g. Item.category)
  };
  autoFill?: LookupAutoFill[];
  sortFieldId?: string;
  sortOrder?: "asc" | "desc";
}

// ── Formula / Rollup ─────────────────────────────────────────────────────────

export interface FormulaConfig {
  expression: string; // e.g. qty * rate, if(total > 1000, "Big", "Small"), sum(items.amount)
  resultType: "number" | "text" | "date" | "boolean";
  decimalPlaces?: number;
}

export type AggregateType = "sum" | "count" | "avg" | "min" | "max";

export interface RollupConfig {
  sourceFormId: string; // form whose records are aggregated (e.g. Purchase)
  matchFieldId: string; // lookup field (or "subformFieldId.columnId") in source form that points to THIS form
  aggregate: AggregateType;
  valueFieldId?: string; // field (or "subformFieldId.columnId") to aggregate; not needed for count
  filters?: ReportFilter[];
  decimalPlaces?: number;
}

// ── Subform ──────────────────────────────────────────────────────────────────

export interface SubformColumn {
  id: string;
  label: string;
  linkName: string;
  type: FieldType;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  options?: string[];
  currencySymbol?: string;
  decimalPlaces?: number;
  lookup?: LookupConfig;
  formula?: FormulaConfig; // row-level formula: quantity * rate
  defaultValue?: any;
  width?: number; // px
  placeholder?: string;
}

export interface SubformConfig {
  /** inline: rows live only inside the parent record. existing_form: each row is also a real record of `targetFormId`. */
  sourceType: "inline" | "existing_form";
  targetFormId?: string; // if existing_form
  /** existing_form: lookup field in the target form that points back to the parent form (auto-created). Child rows get it set to the parent record id. */
  parentLinkFieldId?: string;
  /** existing_form: which target-form fields are shown as columns (column ids = target field ids). */
  linkedFieldIds?: string[];
  columns: SubformColumn[];
  showTotals?: boolean;
  totalColumnIds?: string[]; // columns to total in footer
  minRows?: number;
  maxRows?: number;
  allowBulkAdd?: boolean;
  allowReorder?: boolean;
  allowDuplicateRow?: boolean;
  importFrom?: {
    formId: string; // e.g. Purchase Order
    subformFieldId: string; // PO.items
    viaLookupFieldId?: string; // lookup field in THIS form pointing to PO
    columnMap: Record<string, string>; // sourceColumnId -> thisColumnId
  };
}

// ── Autonumber ───────────────────────────────────────────────────────────────

export interface AutoNumberConfig {
  prefix: string;
  startNumber: number;
  digits: number;
  currentNumber?: number;
  pattern?: string; // e.g. "INV/{YYYY}/{MM}/{0000}" — overrides prefix/digits
  resetEvery?: "never" | "yearly" | "monthly";
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationRule {
  id: string;
  expression: string; // must evaluate true, e.g. end_date >= start_date
  message: string;
}

export interface ValidationConfig {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  customMessage?: string;
  requiredIf?: string; // expression → conditional required
  rules?: ValidationRule[]; // cross-field rules
  allowedFileTypes?: string[];
  maxFileSizeMb?: number;
}

// ── Field ────────────────────────────────────────────────────────────────────

export interface FieldDefinition {
  id: string;
  label: string;
  linkName: string;
  type: FieldType;
  description?: string;
  tooltip?: string;
  placeholder?: string;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  defaultValue?: any; // literal, or dynamic: "today()", "now()", "currentUser", "currentUserName", "lastRecord"
  width?: FieldWidth;
  showInReport?: boolean;
  visibilityRule?: string; // expression → show when true

  // Type-specific configs
  options?: string[]; // for dropdown, radio, multiselect
  optionColors?: Record<string, string>; // option -> color (kanban / badges)
  currencySymbol?: string;
  decimalPlaces?: number;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  ratingMax?: number;
  multipleFiles?: boolean;

  lookup?: LookupConfig;
  subform?: SubformConfig;
  autonumber?: AutoNumberConfig;
  formula?: FormulaConfig;
  rollup?: RollupConfig;
  validation?: ValidationConfig;

  // section type
  section?: {
    collapsible?: boolean;
    collapsedByDefault?: boolean;
    columns?: 1 | 2 | 3;
    description?: string;
  };
}

export interface FormDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  icon?: string; // lucide icon key (see IconPicker)
  menuSectionId?: string; // which live-app menu section this form appears in
  columns: 1 | 2 | 3;
  fields: FieldDefinition[];
  titleFieldId?: string; // field used as record title
  successMessage?: string;
  redirectAfterSubmit?: "report" | "form" | "record";
  allowDuplicateRecord?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface ReportColumnConfig {
  fieldId: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  frozen?: boolean;
  aggregate?: AggregateType; // footer total
}

export type ReportType =
  | "table"
  | "grid"
  | "list"
  | "kanban"
  | "calendar"
  | "scheduler"
  | "gantt"
  | "summary"
  | "pivot"
  | "chart"
  | "ranking"
  | "funnel"
  | "aging"
  | "tree"
  | "checklist"
  | "timeline"
  | "ledger";

/** Chart report: one measure grouped by a field (optionally split into series). */
export interface ChartReportConfig {
  chartType: "column" | "bar" | "line" | "area" | "pie" | "donut" | "stacked";
  groupFieldId: string; // x-axis / slices ("createdAt" allowed)
  seriesFieldId?: string; // split into multiple series (stacked / multi-line)
  valueFieldId?: string; // numeric field; omit for count
  aggregate: AggregateType;
  dateBucket?: "day" | "week" | "month" | "year";
  limit?: number; // top-N, rest folded into "Other"
  showTable?: boolean;
}

/** Gantt: one bar per record between start and end dates. */
export interface GanttReportConfig {
  startFieldId: string;
  endFieldId?: string; // defaults to start (milestone)
  titleFieldId?: string;
  groupFieldId?: string; // swimlanes (project, assignee…)
  progressFieldId?: string; // 0–100 number/percentage
  colorFieldId?: string; // dropdown with option colours
}

/** Receivables / payables aging: outstanding amount bucketed by days overdue. */
export interface AgingReportConfig {
  dateFieldId: string; // invoice / due date
  amountFieldId: string; // outstanding (or total) amount
  paidFieldId?: string; // subtracted from amount when present
  partyFieldId?: string; // customer / vendor lookup for rows
  buckets?: number[]; // upper edges in days, default [30, 60, 90]
  dueDays?: number; // grace days added to date before counting overdue
}

/** Funnel: records per stage in the order of the dropdown options. */
export interface FunnelReportConfig {
  stageFieldId: string;
  valueFieldId?: string; // sum instead of count
  wonStages?: string[]; // used for conversion %
}

/** Hierarchy from a self-referencing lookup (parent). */
export interface TreeReportConfig {
  parentFieldId: string; // lookup pointing to the same form
  titleFieldId?: string;
  detailFieldIds?: string[];
}

/** Compact mobile-style list rows. */
export interface ListReportConfig {
  titleFieldId?: string;
  subtitleFieldId?: string;
  metaFieldIds?: string[]; // right-hand small values
  badgeFieldId?: string; // dropdown shown as coloured badge
  avatarFieldId?: string; // image field
}

/** Task-style checklist: tick a boolean field inline. */
export interface ChecklistReportConfig {
  doneFieldId: string; // checkbox field
  titleFieldId?: string;
  dueFieldId?: string; // date; overdue highlighting
  assigneeFieldId?: string;
  hideDone?: boolean;
}

/** Scheduler: resources (rooms, staff, machines) × days. */
export interface SchedulerReportConfig {
  resourceFieldId: string; // lookup / dropdown / users
  dateFieldId: string;
  endDateFieldId?: string;
  titleFieldId?: string;
  mode?: "week" | "month";
}

/** Ranking / leaderboard: top N groups by an aggregate. */
export interface RankingReportConfig {
  groupFieldId: string;
  valueFieldId?: string; // omit for count
  aggregate: AggregateType;
  top?: number;
  order?: "desc" | "asc";
  targetValue?: number; // shows progress vs target
}

export interface ConditionalFormat {
  id: string;
  fieldId: string; // field to test
  operator: ReportOperator;
  value?: any;
  value2?: any;
  color: string; // bg color token: "rose" | "amber" | "emerald" | "blue" | "purple"
  applyTo: "cell" | "row";
}

export interface SavedFilter {
  id: string;
  name: string;
  groups: FilterGroup[];
  isDefault?: boolean;
}

export interface LedgerSource {
  id: string;
  label: string; // e.g. "Purchases"
  formId: string;
  matchFieldId: string; // lookup (or subform.col) in source pointing to primary record
  qtyFieldId: string; // number (or subform.col) aggregated
  direction: "in" | "out";
  dateFieldId?: string;
  refFieldId?: string;
  filters?: ReportFilter[];
}

/** Summary tiles above a ledger; "source:<sourceId>" shows one source's total. */
export type LedgerTile = "items" | "inflow" | "outflow" | "closing" | "low" | "negative" | `source:${string}`;

export interface LedgerConfig {
  primaryFormId: string;
  displayFieldIds: string[]; // columns from primary form to show
  openingBalanceFieldId?: string; // number field in primary form
  minLevelFieldId?: string; // low-stock threshold
  unitFieldId?: string;
  sources: LedgerSource[];
  tiles?: LedgerTile[]; // default: items, inflow, outflow, low
  showPeriodFilter?: boolean; // Today / Last 7 days / … on the ledger (default true)
  defaultPreset?: DatePreset; // period selected when the ledger opens (default all time)
}

export interface ReportDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  icon?: string;
  menuSectionId?: string;
  sourceFormId: string;
  reportType?: ReportType;
  columns: ReportColumnConfig[];
  defaultSortField?: string;
  defaultSortOrder?: "asc" | "desc";
  filters?: ReportFilter[]; // legacy simple filters (AND)
  filterGroups?: FilterGroup[];
  savedFilters?: SavedFilter[];
  quickFilterFieldIds?: string[];
  groupByFieldId?: string;
  groupAggregates?: Array<{ fieldId: string; aggregate: AggregateType }>;
  showRunningTotal?: boolean;
  runningTotalFieldId?: string;
  conditionalFormats?: ConditionalFormat[];
  kanban?: { statusFieldId: string; titleFieldId?: string; cardFieldIds?: string[] };
  calendar?: { dateFieldId: string; endDateFieldId?: string; titleFieldId?: string };
  pivot?: { rowFieldId: string; columnFieldId?: string; valueFieldId?: string; aggregate: AggregateType };
  grid?: { titleFieldId?: string; subtitleFieldId?: string; imageFieldId?: string; cardFieldIds?: string[] };
  ledger?: LedgerConfig;
  chart?: ChartReportConfig;
  gantt?: GanttReportConfig;
  aging?: AgingReportConfig;
  funnel?: FunnelReportConfig;
  tree?: TreeReportConfig;
  list?: ListReportConfig;
  checklist?: ChecklistReportConfig;
  scheduler?: SchedulerReportConfig;
  ranking?: RankingReportConfig;
  allowInlineEdit?: boolean;
  allowBulkActions?: boolean;
  allowExport?: boolean;
  allowImport?: boolean;
  allowPrint?: boolean;
  showInMenu?: boolean;
  pageSize?: number;
  // legacy (kept for backward compat, migrated to ledger)
  reconciliationConfig?: {
    primaryFormId: string;
    inflowFormId: string;
    inflowMatchFieldId: string;
    inflowQtyFieldId: string;
    outflowFormId: string;
    outflowMatchFieldId: string;
    outflowQtyFieldId: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ── Pages / Dashboards ───────────────────────────────────────────────────────

export type PageComponentType =
  | "heading"
  | "text"
  | "markdown"
  | "button"
  | "image"
  | "chart"
  | "form_embed"
  | "report_embed"
  | "stat_card"
  | "divider"
  | "container"
  | "filter_panel"
  | "iframe"
  | "quick_links";

export interface PageComponent {
  id: string;
  type: PageComponentType;
  props: Record<string, any>;
  width?: number; // 1..12 grid columns (default 12)
  children?: PageComponent[];
}

export interface PageDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  icon?: string;
  menuSectionId?: string;
  components: PageComponent[];
  isHome?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Workflows ────────────────────────────────────────────────────────────────

export type WorkflowTriggerType =
  | "onLoad"
  | "onEdit"
  | "onUserInput"
  | "onValidate"
  | "onSubmit"
  | "onSuccess"
  | "onDelete"
  | "scheduled"
  | "webhook"
  | "approval";

export type WorkflowActionType =
  | "setValue"
  | "copyField"
  | "calculateValue"
  | "showMessage"
  | "showPopup"
  | "blockSubmit"
  | "validate"
  | "setHidden"
  | "setVisible"
  | "setReadonly"
  | "setEditable"
  | "clearField"
  | "updateOtherForm"
  | "createRecord"
  | "deleteRecord"
  | "sendEmail"
  | "callWebhook"
  | "notify"
  | "assignTask"
  | "requestApproval";

export interface VisualCondition {
  id: string;
  fieldId: string;
  operator: ReportOperator;
  compareType: "literal" | "field";
  value: any;
  compareFieldId?: string;
}

export interface VisualCalculation {
  operand1FieldId: string;
  operation: "+" | "-" | "*" | "/";
  operand2Type: "field" | "literal";
  operand2FieldId?: string;
  operand2Literal?: number;
}

export interface CrossFormUpdateConfig {
  targetFormId: string;
  matchLookupFieldId: string; // lookup in current form linking to target record (may be "subform.col")
  updateFieldId: string; // field in target form to adjust
  operation: "increment" | "decrement" | "set";
  sourceFieldId: string; // field in current form providing amount (may be "subform.col")
}

export interface CreateRecordConfig {
  targetFormId: string;
  fieldMap: Array<{ targetFieldId: string; sourceType: "field" | "literal" | "expression"; source: string }>;
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  targetFieldId?: string;
  expression?: string;
  value?: any;
  copySourceFieldId?: string;
  visualCalculation?: VisualCalculation;
  crossFormUpdate?: CrossFormUpdateConfig;
  createRecord?: CreateRecordConfig;
  message?: string;
  title?: string;
  popupType?: "warning" | "error" | "info" | "confirm";
  blockSubmitOnPopup?: boolean;
  condition?: string;
  visualConditions?: VisualCondition[];
  conditionLogic?: "AND" | "OR";
  email?: { to: string; subject: string; body: string; cc?: string };
  webhook?: { url: string; method: "POST" | "GET" | "PUT"; headers?: Record<string, string>; bodyTemplate?: string };
  notification?: { toUsers: string[]; title: string; body: string };
  approval?: { approverEmails: string[]; statusFieldId?: string };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  formId: string;
  mode?: "visual" | "code";
  codeScript?: string;
  trigger: {
    type: WorkflowTriggerType;
    fieldId?: string; // for onUserInput (may be "subformFieldId.columnId")
    cron?: string; // for scheduled
    webhookKey?: string; // for webhook
  };
  actions: WorkflowAction[];
  active: boolean;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowLogEntry {
  id: string;
  workflowId: string;
  workflowName: string;
  formId: string;
  trigger: string;
  status: "success" | "error" | "blocked";
  messages: string[];
  durationMs: number;
  user?: string;
  recordId?: string;
  createdAt: string;
}

// ── Relationships ────────────────────────────────────────────────────────────

export interface RelationshipDefinition {
  id: string;
  sourceFormId: string;
  sourceFieldId: string;
  targetFormId: string;
  targetFieldId: string;
  type: "lookup" | "subform" | "rollup";
}

// ── Roles, members, sharing ──────────────────────────────────────────────────

export interface FormPermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  print: boolean;
  export: boolean;
  import: boolean;
  recordScope: "all" | "own"; // own = only records created by the user
  fieldRules?: Record<string, "hidden" | "readonly">; // fieldId -> restriction
}

export interface ReportPermission {
  view: boolean;
  print: boolean;
  export: boolean;
}

export interface AppRole {
  id: string;
  name: string; // designation, e.g. "Store Manager"
  description?: string;
  color?: string;
  isAdmin?: boolean; // full access to app data (not builder)
  defaultForm?: FormPermission; // fallback for forms not explicitly configured
  forms: Record<string, FormPermission>;
  reports: Record<string, ReportPermission>;
  pages: Record<string, { view: boolean }>;
  createdAt: string;
}

export interface AppMember {
  email: string; // lowercase
  name?: string;
  roleId: string;
  status: "active" | "disabled";
  addedAt: string;
  addedBy?: string;
  lastLoginAt?: string;
}

/** A person who may open this app in the builder (edit forms, reports, workflows, publish). Not a platform owner. */
export interface AppCollaborator {
  email: string; // lowercase
  name?: string;
  addedAt: string;
  addedBy?: string;
}

export interface SharingConfig {
  mode: "private" | "public_view"; // public_view = anyone with link can view (read-only)
  shareToken?: string;
  allowSelfSignup?: boolean; // anyone with link can request access
  defaultRoleId?: string; // role for public/self-signup users
}

// ── Navigation / theme ───────────────────────────────────────────────────────

export interface NavItem {
  id: string;
  type: "page" | "form" | "report" | "section" | "link";
  refId?: string; // page/form/report id
  label?: string; // override
  icon?: string;
  url?: string; // for link
  hidden?: boolean;
  children?: NavItem[];
}

export interface MenuSection {
  id: string; // built-ins: "pages" | "forms" | "reports"; custom: generated
  label: string;
  icon?: string;
  collapsedByDefault?: boolean;
}

export interface AppSettings {
  logo?: string;
  icon?: string; // emoji or lucide icon name
  theme: "light" | "dark" | "system";
  accentColor?: string;
  currencySymbol?: string;
  dateFormat?: string;
  timezone?: string;
  locale?: string;
  homePageId?: string;
  navigation?: NavItem[]; // custom menu; empty = auto
  menuSections?: MenuSection[]; // sections used by the automatic menu (renameable / extendable)
  showRecentInSidebar?: boolean; // "Recent" records list under the menu (off by default)
  allowMembersAi?: boolean; // members may open "Discuss with AI" in the live app (needs app-specific AI keys; off by default)
  showGlobalSearch?: boolean;
  enableComments?: boolean;
  enableAttachments?: boolean;
  enableTrash?: boolean;
  enableAudit?: boolean;
  compactMode?: boolean;
}

// ── App ──────────────────────────────────────────────────────────────────────

export interface AppVersion {
  id: string;
  version: number;
  label?: string;
  createdAt: string;
  createdBy: string;
  snapshot: Pick<AppDefinition, "forms" | "reports" | "pages" | "workflows" | "relationships" | "settings" | "roles"> & Partial<Pick<AppDefinition, "printTemplates">>;
}

/** Saved print / document design for a form (invoice, receipt, challan…). Placeholders: {{field_link}}, {{#items}}…{{/items}}, {{app.name}}, {{today}}. */
export interface PrintTemplate {
  id: string;
  name: string;
  formId: string;
  html: string;
  css?: string;
  paper?: "A4" | "A5" | "Letter" | "thermal80";
  orientation?: "portrait" | "landscape";
  isDefault?: boolean; // used by the Print button for this form
  /** Visual designer model; when present `html` is generated from it. Absent = hand-written / AI code. */
  design?: PrintDesign;
  createdAt: string;
  updatedAt: string;
}

// ── Visual print designer ────────────────────────────────────────────────────

export type PrintBlock =
  | { id: string; type: "header"; title: string; showLogo?: boolean; showAppName?: boolean; metaFieldIds?: string[]; align?: "left" | "right" }
  | { id: string; type: "fields"; title?: string; fieldIds: string[]; columns?: 1 | 2 | 3; style?: "boxed" | "plain" | "table" }
  | { id: string; type: "twoColumns"; left: { title?: string; fieldIds: string[] }; right: { title?: string; fieldIds: string[] } }
  | { id: string; type: "items"; subformFieldId: string; columnIds?: string[]; showIndex?: boolean; totalColumnIds?: string[] }
  | { id: string; type: "totals"; rows: Array<{ label: string; fieldId: string }>; wordsFieldId?: string }
  | { id: string; type: "text"; html: string }
  | { id: string; type: "notes"; title?: string; fieldId?: string; text?: string }
  | { id: string; type: "signature"; labels: string[] }
  | { id: string; type: "footer"; text?: string; showPrintedBy?: boolean; showPageInfo?: boolean }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height?: number };

export interface PrintDesign {
  blocks: PrintBlock[];
  theme: { accent?: string; font?: "sans" | "serif" | "mono"; fontSize?: number; table?: "striped" | "lines" | "grid"; boxed?: boolean };
}

export interface AppDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  settings?: AppSettings;

  ownerEmail?: string;
  roles: AppRole[];
  members: AppMember[];
  memberEmails: string[]; // denormalised for queries & security rules
  builders?: AppCollaborator[]; // per-app builder access (managed by the app owner only)
  builderEmails?: string[]; // denormalised for queries & security rules
  sharing?: SharingConfig;

  forms: FormDefinition[];
  reports: ReportDefinition[];
  pages: PageDefinition[];
  workflows: WorkflowDefinition[];
  printTemplates?: PrintTemplate[];
  relationships: RelationshipDefinition[];

  schemaVersion: number; // per-app schema version for migrations
  publishedVersion?: number; // last published version number
  publishedAt?: string;
  isTemplate?: boolean;
  templateCategory?: string;

  createdAt: string;
  updatedAt: string;
}

export interface RecordDefinition {
  id: string;
  formId: string;
  appId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  isSample?: boolean; // generated by the AI sample-data tool; removable in bulk
  history?: Array<{ at: string; by: string; changes: Record<string, { from: any; to: any }> }>;
}

export interface AuditLogEntry {
  id: string;
  appId: string;
  type: "record" | "schema" | "member" | "role" | "publish" | "auth";
  action: string; // created | updated | deleted | restored | published | rollback | login …
  entityType?: string; // form / report / workflow / record
  entityId?: string;
  entityName?: string;
  formId?: string;
  recordId?: string;
  user: string;
  userName?: string;
  changes?: Record<string, { from: any; to: any }>;
  createdAt: string;
}

export interface CommentEntry {
  id: string;
  appId: string;
  formId: string;
  recordId: string;
  text: string;
  user: string;
  userName?: string;
  mentions?: string[];
  createdAt: string;
}

export interface NotificationEntry {
  id: string;
  appId: string;
  toEmail: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface PlatformUser {
  email: string;
  name?: string;
  photoURL?: string;
  lastLoginAt: string;
  appIds: string[];
}

export interface StorageSchema {
  schemaVersion: number;
  apps: AppDefinition[];
  records: Record<string, RecordDefinition[]>;
}

export const CURRENT_APP_SCHEMA_VERSION = 6;
