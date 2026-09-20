import { AutoNumberConfig, RecordDefinition } from "@/types/schema";

export function generateNextAutoNumber(
  config: AutoNumberConfig,
  existingRecords: RecordDefinition[],
  fieldId: string
): string {
  const prefix = config.prefix || "";
  const startNumber = config.startNumber || 1;
  const digits = config.digits || 5;

  let maxNum = startNumber - 1;

  for (const rec of existingRecords) {
    const val = rec.data?.[fieldId];
    if (typeof val === "string" && val.startsWith(prefix)) {
      const numPart = val.substring(prefix.length);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(digits, "0")}`;
}
