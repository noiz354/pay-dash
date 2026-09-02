// Client-safe blocklist vocabulary (ADR-0024) — the store lives behind
// `server-only`, so the shared type/reason vocabulary lives here.

export const BLOCKLIST_TYPES = ["IP", "CARD", "EMAIL"] as const;
export type BlocklistType = (typeof BLOCKLIST_TYPES)[number];

export const BLOCKLIST_TYPE_LABELS: Record<BlocklistType, string> = {
  IP: "IP address",
  CARD: "Card number",
  EMAIL: "Email domain",
};

export const BLOCKLIST_REASONS = [
  "KNOWN_MALICIOUS",
  "HIGH_FREQUENCY",
  "CHARGEBACK_ABUSE",
  "MANUAL_ENTRY",
] as const;
export type BlocklistReason = (typeof BLOCKLIST_REASONS)[number];

export const BLOCKLIST_REASON_LABELS: Record<BlocklistReason, string> = {
  KNOWN_MALICIOUS: "Known malicious",
  HIGH_FREQUENCY: "High frequency",
  CHARGEBACK_ABUSE: "Chargeback abuse",
  MANUAL_ENTRY: "Manual entry",
};

export function isBlocklistType(v: string): v is BlocklistType {
  return (BLOCKLIST_TYPES as readonly string[]).includes(v);
}

export function isBlocklistReason(v: string): v is BlocklistReason {
  return (BLOCKLIST_REASONS as readonly string[]).includes(v);
}
