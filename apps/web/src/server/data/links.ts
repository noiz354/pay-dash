import "server-only";
import { createTransaction, getLedgerRows } from "./transactions";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";
import { LINK_STATUSES } from "@/lib/link-status";
import type { LinkStatus } from "@/lib/link-status";

// Payment Links — the store the prototype page pretended to have (ADR-0013).
//
// A link is a merchant-authored payment request: one amount (single) or a set
// of line items (multiple), optionally addressed to a payer email, with an
// optional expiry. Its *status is derived, never stored*: cancelled by the
// merchant, paid by the ledger (a SUCCEEDED transaction that references the
// link — see recordLinkPayment), expired by the clock. Everything before the
// seeded ledger window is carried as a historical `paidAt`, exactly like the
// balance store carries pre-window settlements.

export type LinkKind = "single" | "multiple";

export type LinkItem = {
  id: string;
  label: string;
  amount: number;
};

export type PaymentLink = {
  /** Wave 7G: the merchant this link was created for. A link is a money path,
   * so its owner is part of the row, not of the query that found it. */
  organizationId: string;
  id: string;
  kind: LinkKind;
  items: LinkItem[];
  payerEmail: string | null;
  createdAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  /** Set when the ledger records the payment (or, for seeded links, pre-window). */
  paidAt: string | null;
  currency: string;
};

export type LinkFilters = {
  q?: string;
  status?: (typeof LINK_STATUSES)[number] | "all";
  kind?: LinkKind | "all";
  page?: number;
  pageSize?: number;
};

export type LinkRow = PaymentLink & { status: LinkStatus; total: number };

export type PaginatedLinks = {
  rows: LinkRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const CURRENCY = "IDR";

const daysAgo = (n: number, hours = 0) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();
const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

function seed(organizationId: string): PaymentLink[] {
  return [
    {
      organizationId,
      id: "plink_8x9a2b1c",
      kind: "single",
      items: [{ id: "it_1", label: "Website checkout", amount: 4_250_000 }],
      payerEmail: "sarah.jenkins@acmecorp.com",
      createdAt: daysAgo(14),
      expiresAt: null,
      cancelledAt: null,
      paidAt: daysAgo(12),
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_3k4m5n6p",
      kind: "single",
      items: [{ id: "it_1", label: "Invoice INV-2041 — July", amount: 12_000_000 }],
      payerEmail: "finance@globex.io",
      createdAt: daysAgo(8),
      expiresAt: null,
      cancelledAt: null,
      paidAt: daysAgo(5),
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_9q8w7e6r",
      kind: "single",
      items: [{ id: "it_1", label: "Top-up — operating account", amount: 150_000 }],
      payerEmail: "michael.scott@dundermifflin.com",
      createdAt: daysAgo(20),
      expiresAt: daysAgo(3),
      cancelledAt: null,
      paidAt: null,
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_2z3x4c5v",
      kind: "multiple",
      items: [
        { id: "it_1", label: "Consulting — March", amount: 32_000_000 },
        { id: "it_2", label: "Licensing (annual)", amount: 18_500_000 },
        { id: "it_3", label: "Onboarding", amount: 6_000_000 },
        { id: "it_4", label: "Travel settlement", amount: 2_250_000 },
      ],
      payerEmail: "billing@starkindustries.com",
      createdAt: daysAgo(2),
      expiresAt: inDays(10),
      cancelledAt: null,
      paidAt: null,
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_1a2s3d4f",
      kind: "multiple",
      items: [
        { id: "it_1", label: "Hardware refresh", amount: 24_000_000 },
        { id: "it_2", label: "Support plan", amount: 3_500_000 },
      ],
      payerEmail: "olivia.wilde@example.net",
      createdAt: daysAgo(0, 6),
      expiresAt: null,
      cancelledAt: null,
      paidAt: null,
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_7f8g9h0j",
      kind: "single",
      items: [{ id: "it_1", label: "Legacy portal top-up", amount: 95_000_000 }],
      payerEmail: "billing@starkindustries.com",
      createdAt: daysAgo(10),
      expiresAt: null,
      cancelledAt: daysAgo(4),
      paidAt: null,
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_4c5d6e7f",
      kind: "single",
      items: [{ id: "it_1", label: "Website checkout", amount: 2_750_000 }],
      payerEmail: null,
      createdAt: daysAgo(0, 3),
      expiresAt: inDays(30),
      cancelledAt: null,
      paidAt: null,
      currency: CURRENCY,
    },
    {
      organizationId,
      id: "plink_0a1b2c3d",
      kind: "multiple",
      items: [
        { id: "it_1", label: "Q3 data license", amount: 11_000_000 },
        { id: "it_2", label: "Integration sprint", amount: 7_400_000 },
        { id: "it_3", label: "Training seats (4)", amount: 2_800_000 },
      ],
      payerEmail: null,
      createdAt: daysAgo(25),
      expiresAt: daysAgo(5),
      cancelledAt: null,
      paidAt: null,
      currency: CURRENCY,
    },
  ];
}

type Partition = { links: PaymentLink[] };
type Store = { tenants: Map<string, Partition> };
const g = globalThis as unknown as { __kineticLinksStore?: Store };
function store(): Store {
  if (!g.__kineticLinksStore) g.__kineticLinksStore = { tenants: new Map() };
  return g.__kineticLinksStore;
}

/** A read for a tenant with no links answers empty; it never materialises one. */
const EMPTY_PARTITION: Partition = { links: [] };

/**
 * Validate the caller's context at the boundary. `parseOrganizationContext` is
 * the only constructor, so a malformed or missing ctx throws here rather than
 * becoming "the demo tenant" (contract C-1/C-2).
 */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

/**
 * The caller's links. The eight prototype links are the *demo tenant's* — a
 * fresh merchant starts with none, which is the honest answer and the same shape
 * 7F established for settings (`freshState()`).
 */
function readPartition(ctx: OrganizationContext): Partition {
  const { organizationId } = scopeOf(ctx);
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  if (organizationId === DEFAULT_DEMO_ORG) {
    const seeded = { links: seed(organizationId) };
    tenants.set(organizationId, seeded);
    return seeded;
  }
  return EMPTY_PARTITION;
}

/** The caller's links, materialised for a write. */
function writePartition(organizationId: string): Partition {
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  const created: Partition = organizationId === DEFAULT_DEMO_ORG ? { links: seed(organizationId) } : { links: [] };
  tenants.set(organizationId, created);
  return created;
}

/**
 * Which tenant owns this link id, if any other than the caller's. Consulted
 * *after* the caller's own partition has answered nothing, so it can never widen
 * a read — it only lets a refused write be attributed (contract C-4).
 */
function linkOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, partition] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (partition.links.some((l) => l.id === id)) return tenantId;
  }
  return null;
}

/** Internal signal: the id exists in no tenant, so the caller answers not-found. */
class UnknownLinkError extends Error {
  constructor() {
    super("Unknown payment link.");
    this.name = "UnknownLinkError";
  }
}

/**
 * Refuse a write on another tenant's link: audited, then thrown. The wire answer
 * is the caller's uniform not-found string, so "not yours" and "does not exist"
 * stay indistinguishable — while the denial sink keeps the asymmetry for
 * operators (contract C-4/C-5).
 */
/**
 * How many tenants hold payment links. Row-free tenancy probe: answers a
 * question about the store, never returns a link — it is the quarantine gate and
 * the seam's demo-fallback refusal, so it cannot take a ctx (7C/7D/7F precedent).
 */
export function countLinkTenants(): number {
  let count = 0;
  for (const partition of store().tenants.values()) {
    if (partition.links.length > 0) count += 1;
  }
  return count;
}

/** The single tenant holding links, or `null` when there is none or more than one. */
export function soleLinkOrganizationId(): string | null {
  let sole: string | null = null;
  for (const [organizationId, partition] of store().tenants) {
    if (partition.links.length === 0) continue;
    if (sole !== null) return null;
    sole = organizationId;
  }
  return sole;
}

export function totalOf(link: Pick<PaymentLink, "items">): number {
  return link.items.reduce((a, i) => a + i.amount, 0);
}

/**
 * Derive a link's status. Precedence: cancelled (merchant intent wins over
 * everything) → paid (the ledger said so) → expired (the clock) → open.
 * `paidReferenceIds` are the SUCCEEDED ledger rows that reference a link id;
 * they override any missing `paidAt`, which is how a freshly simulated
 * payment flips a link to PAID without a stored status field.
 */
export function deriveLinkStatus(link: PaymentLink, paidReferenceIds: ReadonlySet<string>): LinkStatus {
  if (link.cancelledAt) return "CANCELLED";
  if (link.paidAt || paidReferenceIds.has(link.id)) return "PAID";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return "OPEN";
}

function paidReferenceIds(ctx: OrganizationContext): Set<string> {
  const ids = new Set<string>();
  // Wave 7G: the derivation is scoped BEFORE it derives — a settled payment in
  // one tenant must not flip another tenant's identically-id'd link to PAID.
  // This is also what retired the `links` entry in LEGACY_LEDGER_SURFACES.
  for (const t of getLedgerRows(ctx)) {
    if (t.status === "SUCCEEDED" && t.referenceId) ids.add(t.referenceId);
  }
  return ids;
}

export function listLinks(ctx: OrganizationContext, filters: LinkFilters = {}): PaginatedLinks {
  const { q = "", status = "all", kind = "all", page = 1, pageSize = 10 } = filters;
  const paid = paidReferenceIds(ctx);
  const needle = q.trim().toLowerCase();

  // The partition IS the predicate (7B M1 lesson): q/status/kind/page narrow
  // inside it and can never widen across tenants.
  const all = readPartition(ctx).links
    .map((l) => ({ ...l, items: l.items.map((i) => ({ ...i })), status: deriveLinkStatus(l, paid), total: totalOf(l) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filtered = all.filter((l) => {
    if (status !== "all" && l.status !== status) return false;
    if (kind !== "all" && l.kind !== kind) return false;
    if (needle) {
      const hay = `${l.id} ${l.payerEmail ?? ""} ${l.items.map((i) => i.label).join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const safePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))));
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

export function getLink(ctx: OrganizationContext, id: string): LinkRow | null {
  // "Not yours" and "does not exist" are the same null — no enumeration oracle.
  const link = readPartition(ctx).links.find((l) => l.id === id.trim());
  if (!link) return null;
  // Deep copy: the caller gets data, not a handle into the store. `items` is an
  // array of objects, so a shallow spread would still share the nested rows.
  return {
    ...link,
    items: link.items.map((i) => ({ ...i })),
    status: deriveLinkStatus(link, paidReferenceIds(ctx)),
    total: totalOf(link),
  };
}

export type CreateLinkInput = {
  kind: LinkKind;
  items: { label: string; amount: number }[];
  payerEmail: string | null;
  expiresAt: string | null;
};

export function createLink(ctx: OrganizationContext, input: CreateLinkInput): PaymentLink {
  // The owner comes from the context, never from the input: `CreateLinkInput`
  // carries no tenant field, so a forged organizationId has nowhere to land.
  const { organizationId } = scopeOf(ctx);
  const id = `plink_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const link: PaymentLink = {
    organizationId,
    id,
    kind: input.kind,
    items: input.items.map((i, n) => ({ id: `it_${n + 1}`, label: i.label, amount: i.amount })),
    payerEmail: input.payerEmail,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    cancelledAt: null,
    paidAt: null,
    currency: CURRENCY,
  };
  writePartition(organizationId).links.unshift(link);
  return { ...link, items: link.items.map((i) => ({ ...i })) };
}

export function expireLink(ctx: OrganizationContext, id: string): PaymentLink {
  // Order is the contract (spec G-13): tenant -> row -> status -> write. Closing
  // somebody else's link is a mutation on their money path, so it is attributed
  // and refused loudly rather than answered with a boolean.
  const { organizationId } = scopeOf(ctx);
  const trimmed = id.trim();
  const link = readPartition(ctx).links.find((l) => l.id === trimmed);
  if (!link) {
    const foreignOwner = linkOwnedByAnotherTenant(organizationId, trimmed);
    if (foreignOwner) {
      recordTenantDenial({
        surface: "links.expire",
        actorOrganizationId: organizationId,
        requestedOrganizationId: foreignOwner,
        actorId: null,
        resourceId: trimmed,
      });
      throw new TenantIsolationError(
        "CROSS_TENANT_WRITE",
        { surface: "links.expire", actorOrg: organizationId, requestedOrg: foreignOwner },
        `Refusing a cross-tenant write on links.expire: the payment link belongs to another organization.`,
      );
    }
    throw new UnknownLinkError();
  }
  const status = deriveLinkStatus(link, paidReferenceIds(ctx));
  if (status === "CANCELLED") throw new Error("This link is already closed.");
  if (status === "PAID") throw new Error("A paid link cannot be expired — the money already moved.");
  if (status === "EXPIRED") throw new Error("This link has already expired.");
  link.cancelledAt = new Date().toISOString();
  return { ...link, items: link.items.map((i) => ({ ...i })) };
}

/**
 * TEST MODE: record the payment for an open link. Creates a SUCCEEDED ledger
 * transaction that references the link (id = referenceId = link id — the
 * convention `createTransaction` uses for externally-referenced payments),
 * which is what flips the derived status to PAID. The mutation mirrors how
 * `retryTransaction`/`refundTransaction` update rows in place.
 */
export async function recordLinkPayment(
  ctx: OrganizationContext,
  id: string,
): Promise<{ link: PaymentLink; transactionId: string; total: number }> {
  // Order is the contract (spec G-13): tenant -> link -> ledger write. The
  // caller's partition is consulted first, and only then is a foreign id
  // attributed and refused — so a payment can never be credited into another
  // organization's ledger, and a forged link id never becomes a probe.
  const { organizationId } = scopeOf(ctx);
  const trimmed = id.trim();
  const link = readPartition(ctx).links.find((l) => l.id === trimmed);
  if (!link) {
    const foreignOwner = linkOwnedByAnotherTenant(organizationId, trimmed);
    if (foreignOwner) {
      recordTenantDenial({
        surface: "links.pay",
        actorOrganizationId: organizationId,
        requestedOrganizationId: foreignOwner,
        actorId: null,
        resourceId: trimmed,
      });
      throw new TenantIsolationError(
        "CROSS_TENANT_WRITE",
        { surface: "links.pay", actorOrg: organizationId, requestedOrg: foreignOwner },
        `Refusing a cross-tenant write on links.pay: the payment link belongs to another organization.`,
      );
    }
    throw new UnknownLinkError();
  }
  const status = deriveLinkStatus(link, paidReferenceIds(ctx));
  if (status !== "OPEN") throw new Error(`Only open links can be paid — this one is ${status.toLowerCase()}.`);

  const total = totalOf(link);
  // Wave 7A: paying a link writes into the transaction ledger, so the tenant is
  // a required argument here too — a link store that is not yet scoped must not
  // become a way to credit another organization.
  const tx = await createTransaction(ctx, {
    amount: total,
    currency: CURRENCY,
    channel: "CARD",
    customerName: "Payment link payer",
    customerEmail: link.payerEmail ?? "—",
    description: `Payment link ${link.id}`,
    referenceId: link.id,
  });
  // Capture immediately — seeded rows arrive already SUCCEEDED, and a link
  // payment that sat in PENDING would never settle on its own in TEST MODE.
  tx.status = "SUCCEEDED";
  tx.updatedAt = new Date().toISOString();
  tx.events = [
    ...tx.events,
    {
      id: `${tx.id}_evt_captured`,
      at: tx.updatedAt,
      label: "Payment captured",
      detail: `Paid via payment link ${link.id}.`,
      kind: "success",
    },
  ];
  link.paidAt = tx.createdAt;
  return {
    link: { ...link, items: link.items.map((i) => ({ ...i })) },
    transactionId: tx.id,
    total,
  };
}
