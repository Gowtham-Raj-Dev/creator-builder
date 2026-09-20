export type FieldType =
  | "text"
  | "textarea"
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
  | "autonumber";

export interface LookupConfig {
  targetFormId: string;
  displayFieldId: string;
  valueFieldId?: string; // defaults to 'id'
  relationshipType: "lookup";
}

export interface SubformColumn {
  id: string;
  label: string;
  linkName: string;
  type: FieldType;
  required?: boolean;
  readonly?: boolean;
  options?: string[];
  currencySymbol?: string;
  decimalPlaces?: number;
  lookup?: LookupConfig;
  defaultValue?: any;
}

export interface SubformConfig {
  sourceType: "inline" | "existing_form";
  targetFormId?: string; // if existing_form
  columns: SubformColumn[]; // inline column definitions
}

export interface AutoNumberConfig {
  prefix: string;
  startNumber: number;
  digits: number;
  currentNumber?: number;
}

export interface ValidationConfig {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  customMessage?: string;
}

export interface FieldDefinition {
  id: string;
  label: string;
  linkName: string;
  type: FieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  defaultValue?: any;

  // Type-specific configs
  options?: string[]; // for dropdown, radio, multiselect
  currencySymbol?: string; // for currency (e.g. "₹", "$")
  decimalPlaces?: number; // for number, currency, percentage, decimal
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;

  lookup?: LookupConfig;
  subform?: SubformConfig;
  autonumber?: AutoNumberConfig;
  validation?: ValidationConfig;
}

export interface FormDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  columns: 1 | 2; // 1 column or 2 columns layout
  fields: FieldDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportColumnConfig {
  fieldId: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
}

export interface ReportFilter {
  id?: string;
  fieldId: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "starts_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value: any;
}

export interface ReportDefinition {
  id: string;
  name: string;
  linkName: string;
  sourceFormId: string;
  columns: ReportColumnConfig[];
  defaultSortField?: string;
  defaultSortOrder?: "asc" | "desc";
  filters?: ReportFilter[];
  quickFilterFieldIds?: string[];
  reportType?: "table" | "reconciliation";
  reconciliationConfig?: {
    primaryFormId: string;
    inflowFormId: string; // e.g. Purchase
    inflowMatchFieldId: string; // lookup pointing to primary form
    inflowQtyFieldId: string; // quantity field in purchase
    outflowFormId: string; // e.g. Usage / Consumption
    outflowMatchFieldId: string; // lookup pointing to primary form
    outflowQtyFieldId: string; // quantity used field
  };
  pageSize?: number;
  createdAt: string;
  updatedAt: string;
}

export type PageComponentType =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "chart"
  | "form_embed"
  | "report_embed"
  | "stat_card"
  | "divider"
  | "container";

export interface PageComponent {
  id: string;
  type: PageComponentType;
  props: Record<string, any>;
  children?: PageComponent[];
}

export interface PageDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  components: PageComponent[];
  createdAt: string;
  updatedAt: string;
}

export type WorkflowTriggerType =
  | "onLoad"
  | "onUserInput"
  | "onValidate"
  | "onSubmit"
  | "onSuccess"
  | "onDelete";

export type WorkflowActionType =
  | "setValue"
  | "copyField"
  | "calculateValue"
  | "showMessage"
  | "showPopup"
  | "blockSubmit"
  | "validate"
  | "setHidden"
  | "setReadonly"
  | "clearField"
  | "updateOtherForm";

export interface VisualCondition {
  id: string;
  fieldId: string;
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty"
    | "contains";
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
  matchLookupFieldId: string; // lookup in current form linking to target record
  updateFieldId: string; // field in target form to adjust
  operation: "increment" | "decrement" | "set";
  sourceFieldId: string; // field in current form providing amount
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  targetFieldId?: string; // for setValue, calculateValue, validate, setHidden, setReadonly, clearField, copyField
  expression?: string; // e.g. "Quantity * Rate"
  value?: any; // literal value
  copySourceFieldId?: string; // for copyField
  visualCalculation?: VisualCalculation; // zero-code calculation
  crossFormUpdate?: CrossFormUpdateConfig; // zero-code cross form adjustment
  message?: string; // for showMessage, showPopup, validate
  popupType?: "warning" | "error" | "info";
  blockSubmitOnPopup?: boolean; // block submit when popup is shown
  condition?: string; // text condition for backward compatibility
  visualConditions?: VisualCondition[]; // zero-code structured conditions
  conditionLogic?: "AND" | "OR"; // logic joining visualConditions
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  formId: string;
  mode?: "visual" | "code"; // Visual builder or code formula
  codeScript?: string; // Custom multi-line script code for code mode
  trigger: {
    type: WorkflowTriggerType;
    fieldId?: string; // for onUserInput
  };
  actions: WorkflowAction[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipDefinition {
  id: string;
  sourceFormId: string;
  sourceFieldId: string;
  targetFormId: string;
  targetFieldId: string;
  type: "lookup" | "subform";
}

export interface AppSettings {
  logo?: string;
  theme: "light" | "dark" | "system";
  accentColor?: string;
}

export interface AppDefinition {
  id: string;
  name: string;
  linkName: string;
  description?: string;
  settings?: AppSettings;

  forms: FormDefinition[];
  reports: ReportDefinition[];
  pages: PageDefinition[];
  workflows: WorkflowDefinition[];
  relationships: RelationshipDefinition[];

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
}

export interface StorageSchema {
  schemaVersion: number;
  apps: AppDefinition[];
  records: Record<string, RecordDefinition[]>; // key: `${appId}_${formId}`
}
