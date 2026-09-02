import "server-only";

// ---------------------------------------------------------------------------
// Fraud blocklist (ADR-0024). INTEGRATION.md:92/:113/:319 documents the
// screen with NO Xendit source — "Fraud rules are Dashboard/console-only" —
// so the blocklist is an app-owned record the app itself manages (the class
// the team, webhooks, links and risk pages use).
//
// The prototype shipped TWO contradictory hard-coded lists (one per route,
// different values, 2023 dates). This store is the single source of truth
// both /fraud and /fraud/blocklist run on: deliberately seeded, coherent,
// date-relative.
// ---------------------------------------------------------------------------

import {
  isBlocklistReason,
  isBlocklistType,
  type BlocklistReason,
  type BlocklistType,
} from "@/lib/blocklist-options";

export type { BlocklistReason, BlocklistType } from "@/lib/blocklist-options";

export type BlocklistEntry = {
  id: string;
  type: BlocklistType;
  value: string;
  reason: BlocklistReason;
  addedAt: string;
};

export type BlocklistFilters = {
  type?: BlocklistType | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
};

export type BlocklistSummary = {
  total: number;
  byType: Record<BlocklistType, number>;
  addedLast30d: number;
};

// --- ids -------------------------------------------------------------------

// djb2 → base36, 8 chars: stable per (type, value), same spirit as the
// team store's member ids.
function entryId(type: BlocklistType, value: string): string {
  const key = `${type}:${value.toLowerCase()}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return `blk_${Math.abs(h).toString(36).padStart(8, "0")}`;
}

// --- seed ------------------------------------------------------------------

// The two prototype lists consolidated into one world (their IP values were
// mutually exclusive; the card/email tabs were prose). Dates are
// date-relative — the prototype's October 2023 stamps are gone. Card values
// are stored masked (first 6 + last 4), the shape the fraud console shows.
const DAY_MS = 24 * 60 * 60 * 1000;

type SeedRow = {
  type: BlocklistType;
  value: string;
  reason: BlocklistReason;
  addedDaysAgo: number;
};

const SEED_ROWS: SeedRow[] = [
  { type: "IP", value: "192.168.1.105", reason: "KNOWN_MALICIOUS", addedDaysAgo: 3 },
  { type: "IP", value: "203.0.113.42", reason: "HIGH_FREQUENCY", addedDaysAgo: 6 },
  { type: "IP", value: "10.0.0.24", reason: "HIGH_FREQUENCY", addedDaysAgo: 9 },
  { type: "IP", value: "45.33.22.110", reason: "KNOWN_MALICIOUS", addedDaysAgo: 14 },
  { type: "IP", value: "172.16.254.1", reason: "MANUAL_ENTRY", addedDaysAgo: 21 },
  { type: "IP", value: "45.22.19.102", reason: "CHARGEBACK_ABUSE", addedDaysAgo: 38 },
  { type: "CARD", value: "453322 •••• 0110", reason: "CHARGEBACK_ABUSE", addedDaysAgo: 5 },
  { type: "CARD", value: "512345 •••• 0921", reason: "KNOWN_MALICIOUS", addedDaysAgo: 33 },
  { type: "EMAIL", value: "mailinator.com", reason: "HIGH_FREQUENCY", addedDaysAgo: 2 },
  { type: "EMAIL", value: "guerrillamail.com", reason: "CHARGEBACK_ABUSE", addedDaysAgo: 27 },
];

function seed(): BlocklistEntry[] {
  const anchor = new Date();
  anchor.setUTCHours(9, 0, 0, 0);
  return SEED_ROWS.map((r) => ({
    id: entryId(r.type, r.value),
    type: r.type,
    value: r.value,
    reason: r.reason,
    addedAt: new Date(anchor.getTime() - r.addedDaysAgo * DAY_MS).toISOString(),
  })).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

type BlocklistStore = { entries: BlocklistEntry[] };
const globalStore = globalThis as unknown as { __kineticBlocklistStore?: BlocklistStore };
function store(): BlocklistStore {
  if (!globalStore.__kineticBlocklistStore) globalStore.__kineticBlocklistStore = { entries: seed() };
  return globalStore.__kineticBlocklistStore;
}

// --- validation --------------------------------------------------------------

export function isValidIp(value: string): boolean {
  if (/^(([0-9]{1,3}\.){3}[0-9]{1,3})$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  // minimal IPv6 shape check: 2–8 colon groups of hex (incl. ::)
  return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(value);
}

/** Cards are stored masked; input is raw digits (12–19), output
 * "first6 •••• last4". */
export function maskCardNumber(digits: string): string | null {
  const clean = digits.replace(/[\s.-]/g, "");
  if (!/^\d{12,19}$/.test(clean)) return null;
  return `${clean.slice(0, 6)} •••• ${clean.slice(-4)}`;
}

export function isValidEmailDomain(value: string): boolean {
  if (value.includes("@")) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(value);
}

// --- reads -----------------------------------------------------------------

export async function listBlocklist(filters: BlocklistFilters = {}) {
  const type = filters.type ?? "ALL";
  const needle = (filters.q ?? "").trim().toLowerCase();
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const page = Math.max(1, filters.page ?? 1);

  const filtered = store().entries.filter((e) => {
    if (type !== "ALL" && e.type !== type) return false;
    if (needle && !`${e.id} ${e.value}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: needle.length > 0 || type !== "ALL",
  };
}

export async function getBlocklistEntry(id: string): Promise<BlocklistEntry | null> {
  return store().entries.find((e) => e.id === id) ?? null;
}

export async function blocklistSummary(): Promise<BlocklistSummary> {
  const entries = store().entries;
  const byType: Record<BlocklistType, number> = { IP: 0, CARD: 0, EMAIL: 0 };
  for (const e of entries) byType[e.type] += 1;
  const since = Date.now() - 30 * DAY_MS;
  return {
    total: entries.length,
    byType,
    addedLast30d: entries.filter((e) => new Date(e.addedAt).getTime() >= since).length,
  };
}

// --- mutations ---------------------------------------------------------------

// Strings, not the union types: the store validates (isBlocklistType /
// isBlocklistReason) — actions pass raw form values.
export type AddBlocklistInput = {
  type: string;
  value: string;
  reason: string;
};

export type AddBlocklistResult =
  | { ok: true; entry: BlocklistEntry }
  | { ok: false; error: string };

export async function addBlocklist(input: AddBlocklistInput): Promise<AddBlocklistResult> {
  const type = isBlocklistType(input.type) ? input.type : null;
  const reason = isBlocklistReason(input.reason) ? input.reason : null;
  if (!type || !reason) return { ok: false, error: "Pick a type and a reason." };

  let value = String(input.value ?? "").trim();
  if (type === "IP") {
    if (!isValidIp(value)) return { ok: false, error: "Enter a valid IPv4 or IPv6 address." };
  } else if (type === "CARD") {
    const masked = maskCardNumber(value);
    if (!masked) return { ok: false, error: "Enter the full card number (12–19 digits)." };
    value = masked;
  } else {
    if (!isValidEmailDomain(value)) {
      return { ok: false, error: "Enter a domain (e.g. example.com), not a full email." };
    }
    value = value.toLowerCase();
  }

  const exists = store().entries.some(
    (e) => e.type === type && e.value.toLowerCase() === value.toLowerCase()
  );
  if (exists) return { ok: false, error: "Already on the blocklist." };

  const entry: BlocklistEntry = {
    id: entryId(type, value),
    type,
    value,
    reason: reason!,
    addedAt: new Date().toISOString(),
  };
  store().entries.unshift(entry);
  return { ok: true, entry };
}

export async function removeBlocklist(id: string): Promise<boolean> {
  const s = store();
  const idx = s.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  s.entries.splice(idx, 1);
  return true;
}

// --- export ------------------------------------------------------------------

export function blocklistToCsv(rows: BlocklistEntry[]): string {
  const header = "type,value,reason,added_at";
  const lines = rows.map((e) =>
    [e.type, e.value, e.reason, e.addedAt].map(csvCell).join(",")
  );
  return [header, ...lines].join("\n");
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
