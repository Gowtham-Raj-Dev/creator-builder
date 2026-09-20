import { FormDefinition, RecordDefinition } from "@/types/schema";

export function resolveLookupDisplay(
  recordId: string | undefined | null,
  targetRecords: RecordDefinition[],
  displayFieldId: string
): string {
  if (!recordId) return "";

  const record = targetRecords.find((r) => r.id === recordId);
  if (!record) {
    return "Unknown / Deleted Record";
  }

  const val = record.data?.[displayFieldId];
  if (val === undefined || val === null || val === "") {
    return record.id;
  }

  return String(val);
}

export function suggestDefaultDisplayField(targetForm: FormDefinition): string {
  if (!targetForm.fields || targetForm.fields.length === 0) return "";

  const priorityKeywords = ["name", "title", "label", "code", "sku", "number"];

  for (const kw of priorityKeywords) {
    const match = targetForm.fields.find(
      (f) =>
        f.linkName.toLowerCase().includes(kw) ||
        f.label.toLowerCase().includes(kw)
    );
    if (match) return match.id;
  }

  // Fallback to first text or number field
  const textOrNum = targetForm.fields.find((f) =>
    ["text", "autonumber", "email"].includes(f.type)
  );
  return textOrNum ? textOrNum.id : targetForm.fields[0].id;
}
