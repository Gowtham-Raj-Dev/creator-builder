export function toLinkName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function generateUniqueLinkName(name: string, existingLinkNames: string[]): string {
  const base = toLinkName(name) || "item";
  if (!existingLinkNames.includes(base)) {
    return base;
  }

  let counter = 1;
  while (existingLinkNames.includes(`${base}_${counter}`)) {
    counter++;
  }
  return `${base}_${counter}`;
}

export function isValidLinkName(linkName: string): boolean {
  if (!linkName) return false;
  return /^[a-z0-9_]+$/.test(linkName);
}
