import "server-only";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";

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
  /** Wave 7G: the merchant whose fraud controls this row guards. The id is a
   * pure hash of (type, value), so two tenants blocking the same IP mint the
   * SAME id — isolation is the composite key (organizationId, id), never id
   * secrecy (spec P-10, same shape as 7C/7F). */
  organizationId: string;
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

function seed(organizationId: string): BlocklistEntry[] {
  const anchor = new Date();
  anchor.setUTCHours(9, 0, 0, 0);
  return SEED_ROWS.map((r) => ({
    organizationId,
    id: entryId(r.type, r.value),
    type: r.type,
    value: r.value,
    reason: r.reason,
    addedAt: new Date(anchor.getTime() - r.addedDaysAgo * DAY_MS).toISOString(),
  })).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

type Partition = { entries: BlocklistEntry[] };
type BlocklistStore = { tenants: Map<string, Partition> };
const globalStore = globalThis as unknown as { __kineticBlocklistStore?: BlocklistStore };
function store(): BlocklistStore {
  if (!globalStore.__kineticBlocklistStore) globalStore.__kineticBlocklistStore = { tenants: new Map() };
  return globalStore.__kineticBlocklistStore;
}

/** A read for a tenant with no entries answers empty; it never materialises one. */
const EMPTY_PARTITION: Partition = { entries: [] };

/**
 * Validate the caller's context at the boundary. `parseOrganizationContext` is
 * the only constructor, so a malformed or missing ctx throws here rather than
 * becoming "the demo tenant" (contract C-1/C-2).
 */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

/**
 * The caller's blocklist. The ten seeded entries are the *demo tenant's* — a
 * fresh merchant starts with none, which is the honest answer (same shape as
 * 7F's `freshState()` and 7G's links/webhooks seeds).
 */
function readPartition(ctx: OrganizationContext): Partition {
  const { organizationId } = scopeOf(ctx);
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  if (organizationId === DEFAULT_DEMO_ORG) {
    const seeded = { entries: seed(organizationId) };
    tenants.set(organizationId, seeded);
    return seeded;
  }
  return EMPTY_PARTITION;
}

/** The caller's blocklist, materialised for a write. */
function writePartition(organizationId: string): Partition {
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  const created: Partition =
    organizationId === DEFAULT_DEMO_ORG ? { entries: seed(organizationId) } : { entries: [] };
  tenants.set(organizationId, created);
  return created;
}

/**
 * Which tenant owns this entry id, if any other than the caller's. Consulted
 * *after* the caller's own partition has answered nothing, so it can never widen
 * a read — it only lets a refused write be attributed (contract C-4).
 */
function entryOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, partition] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (partition.entries.some((e) => e.id === id)) return tenantId;
  }
  return null;
}

/**
 * Refuse a write on another tenant's blocklist entry: audited, then thrown. The
 * wire answer is the caller's uniform not-found string, so "not yours" and
 * "does not exist" stay indistinguishable — while the denial sink keeps the
 * asymmetry for operators (contract C-4/C-5).
 */
/**
 * How many tenants hold blocklist entries. Row-free tenancy probe: answers a
 * question about the store, never returns an entry — it is the quarantine gate
 * and the seam's demo-fallback refusal, so it cannot take a ctx (7C/7D/7F
 * precedent). Empty partitions do not count: a read that materialised nothing
 * has not created a tenant.
 */
export function countBlocklistTenants(): number {
  let count = 0;
  for (const partition of store().tenants.values()) {
    if (partition.entries.length > 0) count += 1;
  }
  return count;
}

/** The single tenant holding entries, or `null` when there is none or more than one. */
export function soleBlocklistOrganizationId(): string | null {
  let sole: string | null = null;
  for (const [organizationId, partition] of store().tenants) {
    if (partition.entries.length === 0) continue;
    if (sole !== null) return null;
    sole = organizationId;
  }
  return sole;
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

export async function listBlocklist(ctx: OrganizationContext, filters: BlocklistFilters = {}) {
  const type = filters.type ?? "ALL";
  const needle = (filters.q ?? "").trim().toLowerCase();
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const page = Math.max(1, filters.page ?? 1);

  // The partition IS the predicate (7B M1 lesson): type/q/page narrow inside it
  // and can never widen across tenants.
  const filtered = readPartition(ctx).entries.filter((e) => {
    if (type !== "ALL" && e.type !== type) return false;
    if (needle && !`${e.id} ${e.value}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize).map((e) => ({ ...e })),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: needle.length > 0 || type !== "ALL",
  };
}

export async function getBlocklistEntry(ctx: OrganizationContext, id: string): Promise<BlocklistEntry | null> {
  // "Not yours" and "does not exist" are the same null — no enumeration oracle
  // over another merchant's fraud signals. The row is a copy: the caller cannot
  // reach the store through the answer.
  const entry = readPartition(ctx).entries.find((e) => e.id === id);
  return entry ? { ...entry } : null;
}

export async function blocklistSummary(ctx: OrganizationContext): Promise<BlocklistSummary> {
  const entries = readPartition(ctx).entries;
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

export async function addBlocklist(ctx: OrganizationContext, input: AddBlocklistInput): Promise<AddBlocklistResult> {
  // Validation runs before tenancy: a bad value is a field error, not an
  // isolation error, and nothing is written anywhere by a rejected attempt.
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

  // The duplicate check is per tenant: "Already on the blocklist." must never
  // disclose that *another* merchant blocked the same IP/card/domain — that was
  // an existence oracle over a fraud signal.
  const { organizationId } = scopeOf(ctx);
  const partition = writePartition(organizationId);
  const exists = partition.entries.some(
    (e) => e.type === type && e.value.toLowerCase() === value.toLowerCase()
  );
  if (exists) return { ok: false, error: "Already on the blocklist." };

  // The owner comes from the context, never from the input: `AddBlocklistInput`
  // carries no tenant field, so a forged organizationId has nowhere to land.
  const entry: BlocklistEntry = {
    organizationId,
    id: entryId(type, value),
    type,
    value,
    reason: reason!,
    addedAt: new Date().toISOString(),
  };
  partition.entries.unshift(entry);
  return { ok: true, entry: { ...entry } };
}

export async function removeBlocklist(ctx: OrganizationContext, id: string): Promise<boolean> {
  // Order is the contract (spec G-13): tenant -> row -> splice. Pruning another
  // merchant's fraud controls is a security downgrade performed on their behalf,
  // so it is attributed and refused loudly rather than answered with `false`.
  // An id nobody owns stays `false` — "nothing to remove", not an error.
  const { organizationId } = scopeOf(ctx);
  const partition = readPartition(ctx);
  const idx = partition.entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    // Materialise for the write (readPartition may have returned EMPTY_PARTITION).
    writePartition(organizationId).entries.splice(idx, 1);
    return true;
  }
  const foreignOwner = entryOwnedByAnotherTenant(organizationId, id);
  if (foreignOwner) {
    recordTenantDenial({
      surface: "blocklist.remove",
      actorOrganizationId: organizationId,
      requestedOrganizationId: foreignOwner,
      actorId: null,
      resourceId: id,
    });
    throw new TenantIsolationError(
      "CROSS_TENANT_WRITE",
      { surface: "blocklist.remove", actorOrg: organizationId, requestedOrg: foreignOwner },
      `Refusing a cross-tenant write on blocklist.remove: the entry belongs to another organization.`,
    );
  }
  return false;
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
