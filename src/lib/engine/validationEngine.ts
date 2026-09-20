import { FormDefinition, RecordDefinition } from "@/types/schema";

export interface ValidationErrors {
  [fieldId: string]: string;
}

export function validateFormData(
  form: FormDefinition,
  data: Record<string, any>,
  existingRecords: RecordDefinition[] = [],
  currentRecordId?: string
): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const field of form.fields) {
    if (field.hidden) continue;

    const val = data[field.id];
    const isBlank =
      val === undefined ||
      val === null ||
      (typeof val === "string" && val.trim() === "") ||
      (Array.isArray(val) && val.length === 0);

    // 1. Required Check
    if (field.required && isBlank) {
      errors[field.id] = `${field.label} is required`;
      continue;
    }

    // Skip further checks if value is blank and not required
    if (isBlank) continue;

    // 2. Unique Check
    if (field.unique) {
      const isDuplicate = existingRecords.some((rec) => {
        if (currentRecordId && rec.id === currentRecordId) return false;
        return rec.data && rec.data[field.id] === val;
      });
      if (isDuplicate) {
        errors[field.id] = `${field.label} must be unique. "${val}" already exists.`;
        continue;
      }
    }

    // 3. Type-specific validations
    if (field.type === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(val))) {
        errors[field.id] = `Please enter a valid email address`;
        continue;
      }
    }

    if (field.type === "url") {
      try {
        new URL(String(val));
      } catch {
        errors[field.id] = `Please enter a valid URL (e.g. https://example.com)`;
        continue;
      }
    }

    if (field.type === "phone") {
      const digitsOnly = String(val).replace(/[^0-9]/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        errors[field.id] = `Please enter a valid phone number (7-15 digits)`;
        continue;
      }
    }

    // 4. Numeric range checks
    if (["number", "currency", "percentage", "decimal"].includes(field.type)) {
      const num = Number(val);
      if (isNaN(num)) {
        errors[field.id] = `${field.label} must be a number`;
        continue;
      }
      if (field.min !== undefined && num < field.min) {
        errors[field.id] = `${field.label} must be at least ${field.min}`;
        continue;
      }
      if (field.max !== undefined && num > field.max) {
        errors[field.id] = `${field.label} cannot exceed ${field.max}`;
        continue;
      }
    }

    // 5. String length checks
    if (["text", "textarea"].includes(field.type)) {
      const str = String(val);
      if (field.minLength !== undefined && str.length < field.minLength) {
        errors[field.id] = `${field.label} must be at least ${field.minLength} characters`;
        continue;
      }
      if (field.maxLength !== undefined && str.length > field.maxLength) {
        errors[field.id] = `${field.label} cannot exceed ${field.maxLength} characters`;
        continue;
      }
    }

    // 6. Custom pattern check
    if (field.validation?.pattern) {
      try {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(String(val))) {
          errors[field.id] =
            field.validation.patternMessage ||
            `${field.label} does not match required format`;
          continue;
        }
      } catch (err) {
        console.warn("Invalid regex in field validation:", err);
      }
    }
  }

  return errors;
}
