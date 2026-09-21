import { FormDefinition, LookupConfig, RecordDefinition } from "@/types/schema";

export function resolveLookupDisplay(
  recordId: string | string[] | undefined | null,
  targetRecords: RecordDefinition[],
  displayFieldId: string
): string {
  if (!recordId || (Array.isArray(recordId) && recordId.length === 0)) return "";
  const ids = Array.isArray(recordId) ? recordId : [recordId];
  return ids
    .map((id) => {
      const record = targetRecords.find((r) => r.id === id);
      if (!record) return "Unknown / Deleted Record";
      const val = record.data?.[displayFieldId];
      if (val === undefined || val === null || val === "") return record.id;
      return String(val);
    })
    .join(", ");
}

/** Secondary display columns for a lookup (e.g. "Vendor Name · Chennai · ₹ 120"). */
export function resolveLookupSecondary(record: RecordDefinition | undefined, config: LookupConfig, targetForm?: FormDefinition): string[] {
  if (!record || !config.secondaryDisplayFieldIds?.length) return [];
  return config.secondaryDisplayFieldIds
    .map((fid) => {
      const f = targetForm?.fields.find((x) => x.id === fid);
      const v = record.data?.[fid];
      if (v === undefined || v === null || v === "") return "";
      if (f?.type === "currency") return `${f.currencySymbol || "₹"} ${v}`;
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
    })
    .filter(Boolean);
}

export function suggestDefaultDisplayField(targetForm: FormDefinition): string {
  if (!targetForm.fields || targetForm.fields.length === 0) return "";
  const usable = targetForm.fields.filter((f) => f.type !== "section" && f.type !== "subform");
  const priorityKeywords = ["name", "title", "label", "code", "sku", "number"];
  for (const kw of priorityKeywords) {
    const match = usable.find((f) => f.linkName.toLowerCase().includes(kw) || f.label.toLowerCase().includes(kw));
    if (match) return match.id;
  }
  const textOrNum = usable.find((f) => ["text", "autonumber", "email"].includes(f.type));
  return textOrNum ? textOrNum.id : usable[0]?.id || "";
}

/** Apply lookup filters + cascading constraint to candidate records. */
export function filterLookupRecords(
  records: RecordDefinition[],
  config: LookupConfig,
  parentValue: any,
  matches: (rec: RecordDefinition) => boolean
): RecordDefinition[] {
  let out = records.filter((r) => !r.deleted);
  if (config.filters?.length) out = out.filter(matches);
  if (config.cascade?.parentFieldId && config.cascade.targetMatchFieldId) {
    if (parentValue === undefined || parentValue === null || parentValue === "") return out;
    out = out.filter((r) => {
      const v = r.data?.[config.cascade!.targetMatchFieldId];
      if (Array.isArray(v)) return v.includes(parentValue);
      return String(v ?? "") === String(parentValue);
    });
  }
  return out;
}
