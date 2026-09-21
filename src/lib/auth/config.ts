/**
 * Platform owner configuration.
 * Only these emails can sign in as builder/owner. Any other email is allowed in
 * only if an owner has added it as a member of at least one app.
 */
const envOwners = (process.env.NEXT_PUBLIC_OWNER_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const PLATFORM_OWNER_EMAILS: string[] =
  envOwners.length > 0 ? envOwners : ["gowthamraje1221@gmail.com"];

export function isPlatformOwner(email?: string | null): boolean {
  if (!email) return false;
  return PLATFORM_OWNER_EMAILS.includes(email.trim().toLowerCase());
}

export const NOT_CONFIGURED_MESSAGE =
  "This email is not configured. Please contact the administrator to get access.";
