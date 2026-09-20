export function formatCurrency(
  value: number | string | undefined | null,
  symbol: string = "₹",
  decimals: number = 2
): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);

  const formatted = num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${symbol} ${formatted}`;
}

export function formatPercentage(
  value: number | string | undefined | null,
  decimals: number = 2
): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);

  return `${num.toFixed(decimals)}%`;
}

export function formatDate(
  value: string | undefined | null,
  includeTime: boolean = false
): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    if (includeTime) {
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export function formatAutoNumber(
  currentCount: number,
  prefix: string = "REC-",
  startNumber: number = 1,
  digits: number = 5
): string {
  const num = startNumber + currentCount;
  return `${prefix}${String(num).padStart(digits, "0")}`;
}
