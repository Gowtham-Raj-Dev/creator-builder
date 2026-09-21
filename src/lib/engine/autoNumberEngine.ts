import { AutoNumberConfig, RecordDefinition } from "@/types/schema";

/**
 * Auto-number generation.
 *  - Simple mode: prefix + zero-padded sequence          → INV-00042
 *  - Pattern mode: "{PREFIX}{YYYY}/{MM}/{0000}"           → INV2025/09/0042
 *    Tokens: {YYYY} {YY} {MM} {DD} {0000…} (sequence width) {PREFIX}
 *  - resetEvery: "yearly" | "monthly" restarts the sequence within each period.
 * Sequence = max existing sequence in the same period + 1 (gap-free after deletes is
 * not guaranteed by design; deleted numbers are not reused unless they were the last).
 */

function pad(n: number, w: number) {
  return String(n).padStart(w, "0");
}

export function buildAutoNumberPreview(config: AutoNumberConfig, seq?: number, date = new Date()): string {
  const n = seq ?? config.startNumber ?? 1;
  if (config.pattern && config.pattern.includes("{")) {
    return renderPattern(config.pattern, n, date, config.prefix);
  }
  return `${config.prefix || ""}${pad(n, config.digits || 5)}`;
}

function renderPattern(pattern: string, seq: number, date: Date, prefix?: string): string {
  return pattern.replace(/\{([^}]+)\}/g, (_m, tok: string) => {
    if (tok === "YYYY") return String(date.getFullYear());
    if (tok === "YY") return String(date.getFullYear()).slice(-2);
    if (tok === "MM") return pad(date.getMonth() + 1, 2);
    if (tok === "DD") return pad(date.getDate(), 2);
    if (tok === "PREFIX") return prefix || "";
    if (/^0+$/.test(tok)) return pad(seq, tok.length);
    if (tok === "N") return String(seq);
    return "";
  });
}

/** Regex that extracts the sequence number from a rendered value for the current period. */
function periodRegex(config: AutoNumberConfig, date: Date): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  if (config.pattern && config.pattern.includes("{")) {
    let re = "";
    const parts = config.pattern.split(/(\{[^}]+\})/g);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith("{")) {
        const tok = p.slice(1, -1);
        if (tok === "YYYY") re += config.resetEvery === "never" ? "\\d{4}" : String(date.getFullYear());
        else if (tok === "YY") re += config.resetEvery === "never" ? "\\d{2}" : String(date.getFullYear()).slice(-2);
        else if (tok === "MM") re += config.resetEvery === "monthly" ? pad(date.getMonth() + 1, 2) : "\\d{2}";
        else if (tok === "DD") re += "\\d{2}";
        else if (tok === "PREFIX") re += escape(config.prefix || "");
        else if (/^0+$/.test(tok) || tok === "N") re += "(\\d+)";
      } else re += escape(p);
    }
    return new RegExp(`^${re}$`);
  }
  return new RegExp(`^${escape(config.prefix || "")}(\\d+)$`);
}

export function generateNextAutoNumber(
  config: AutoNumberConfig,
  existingRecords: RecordDefinition[],
  fieldId: string,
  date = new Date()
): string {
  const startNumber = config.startNumber || 1;
  const re = periodRegex(config, date);
  let maxNum = startNumber - 1;
  for (const rec of existingRecords) {
    const val = rec.data?.[fieldId];
    if (typeof val !== "string") continue;
    const m = val.match(re);
    if (m && m[1]) {
      const parsed = parseInt(m[1], 10);
      if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
    }
  }
  return buildAutoNumberPreview(config, maxNum + 1, date);
}
