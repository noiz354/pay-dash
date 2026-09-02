// Client-safe settings vocabulary.
// `server/data/settings.ts` imports "server-only", so anything client
// components need at runtime (option lists, labels, validation helpers) lives
// here and is re-exported by the data module for server callers.

export const DIGEST_OPTIONS = ["instant", "daily", "weekly", "off"] as const;
export type DigestFrequency = (typeof DIGEST_OPTIONS)[number];

export const DIGEST_LABELS: Record<DigestFrequency, string> = {
  instant: "Instant",
  daily: "Daily Digest",
  weekly: "Weekly",
  off: "Off",
};

export const KEY_ENVIRONMENTS = ["LIVE", "TEST"] as const;
export type KeyEnvironment = (typeof KEY_ENVIRONMENTS)[number];

export const KEY_STATUSES = ["ACTIVE", "REVOKED"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const KEY_SCOPES = ["read", "write", "payouts", "webhooks"] as const;
export type KeyScope = (typeof KEY_SCOPES)[number];

export const NOTIFICATION_CHANNELS = ["email", "sms", "dashboard"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * The merchant's display name for greetings. The data model holds the
 * business (dba / legalName) — never a person's name, so the dashboard must
 * not invent one (the prototype's "Sarah" had no source in any store).
 */
export function merchantGreeting(profile: { dba: string; legalName: string }) {
  return profile.dba.trim() || profile.legalName.trim();
}

/** Shared by the client form and the server action so validation cannot drift. */
export function isValidHexColor(value: string) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** IPv4 address or CIDR block — the developer allowlist accepts both. */
export function isValidIpOrCidr(value: string) {
  const v = value.trim();
  const [ip, mask] = v.split("/");
  const octets = ip.split(".");
  if (octets.length !== 4) return false;
  if (!octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255)) return false;
  if (mask === undefined) return true;
  return /^\d{1,2}$/.test(mask) && Number(mask) >= 0 && Number(mask) <= 32;
}
