import { WorkflowDefinition, WorkflowTriggerType } from "@/types/schema";

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: "Validation" | "Calculation" | "UI Visibility" | "Defaults";
  description: string;
  explanation: string;
  triggerType: WorkflowTriggerType;
  mode: "code" | "visual";
  codeScript: string;
  sampleVisualAction?: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl_submit_empty_popup",
    name: "On Submit Empty Field Validation with Popup Alert",
    category: "Validation",
    description: "Blocks submission and displays an alert popup modal if a required field is blank.",
    explanation:
      "Triggers on the 'onSubmit' event. When the user clicks Save/Submit, it verifies if the target field is empty. If empty, it displays an alert popup and halts submission.",
    triggerType: "onSubmit",
    mode: "code",
    codeScript: `// On Submit Validation with Modal Alert
if (!customer_name || customer_name == "") {
  showPopup("Validation Error: Customer Name cannot be empty. Please fill in all required fields.");
  blockSubmit();
}`,
  },
  {
    id: "tpl_calculate_amount",
    name: "Line Item Calculation (Amount = Quantity * Rate)",
    category: "Calculation",
    description: "Calculates total amount whenever Quantity or Rate is changed by the user.",
    explanation:
      "Triggers on 'onUserInput'. It dynamically evaluates quantity multiplied by rate and assigns the computed result directly to the amount field in real time.",
    triggerType: "onUserInput",
    mode: "code",
    codeScript: `// Real-time Line Item Calculation
amount = quantity * rate;`,
  },
  {
    id: "tpl_discount_limit",
    name: "High Discount Manager Approval Alert",
    category: "Validation",
    description: "Displays a warning popup when discount percentage exceeds the 30% limit.",
    explanation:
      "Triggers on 'onUserInput' when editing the Discount field. If the user enters a value greater than 30, a warning alert informs them of manager approval rules.",
    triggerType: "onUserInput",
    mode: "code",
    codeScript: `// Conditional Discount Check
if (discount > 30) {
  showPopup("Approval Warning: Discounts above 30% require manager authorization.");
}`,
  },
  {
    id: "tpl_conditional_visibility",
    name: "Conditional Field Visibility (Show/Hide Field)",
    category: "UI Visibility",
    description: "Shows a secondary field only when a specific dropdown option is selected.",
    explanation:
      "Triggers on 'onUserInput'. If status equals 'Inactive', the 'reason' field is made visible, otherwise it is hidden automatically.",
    triggerType: "onUserInput",
    mode: "code",
    codeScript: `// Dynamic Field Visibility
if (status == "Inactive") {
  showField("inactive_reason");
} else {
  hideField("inactive_reason");
}`,
  },
  {
    id: "tpl_tax_grand_total",
    name: "Calculate Grand Total with Tax Percentage",
    category: "Calculation",
    description: "Computes Grand Total from Subtotal and Tax Rate %.",
    explanation:
      "Calculates the total monetary value by applying the percentage tax to the subtotal amount: total_amount = subtotal + (subtotal * tax_rate / 100).",
    triggerType: "onUserInput",
    mode: "code",
    codeScript: `// Grand Total Calculation
total_amount = subtotal + (subtotal * tax_rate / 100);`,
  },
  {
    id: "tpl_onload_defaults",
    name: "Pre-fill Default Values on Form Load",
    category: "Defaults",
    description: "Initializes fields with default parameters as soon as the form opens.",
    explanation:
      "Triggers on 'onLoad'. Sets the initial tax rate, currency, or status before the user begins typing.",
    triggerType: "onLoad",
    mode: "code",
    codeScript: `// Set Initial Defaults On Form Load
tax_rate = 18;
status = "Active";`,
  },
  {
    id: "tpl_age_check",
    name: "Age Eligibility Check on Submit",
    category: "Validation",
    description: "Verifies minimum age requirement and blocks submission if under 18.",
    explanation:
      "Ensures the applicant meets the legal age requirement before allowing the form to be saved.",
    triggerType: "onSubmit",
    mode: "code",
    codeScript: `// Minimum Age Validation on Submit
if (age < 18) {
  showPopup("Eligibility Alert: Applicant must be at least 18 years old to register.");
  blockSubmit();
}`,
  },
];
