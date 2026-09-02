import "server-only";
import { createTransaction, getLedgerRows } from "./transactions";
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

function seed(): PaymentLink[] {
  return [
    {
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

type Store = { links: PaymentLink[] };
const g = globalThis as unknown as { __kineticLinksStore?: Store };
function store(): Store {
  if (!g.__kineticLinksStore) g.__kineticLinksStore = { links: seed() };
  return g.__kineticLinksStore;
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

function paidReferenceIds(): Set<string> {
  const ids = new Set<string>();
  for (const t of getLedgerRows()) {
    if (t.status === "SUCCEEDED" && t.referenceId) ids.add(t.referenceId);
  }
  return ids;
}

export function listLinks(filters: LinkFilters = {}): PaginatedLinks {
  const { q = "", status = "all", kind = "all", page = 1, pageSize = 10 } = filters;
  const paid = paidReferenceIds();
  const needle = q.trim().toLowerCase();

  const all = store().links
    .map((l) => ({ ...l, status: deriveLinkStatus(l, paid), total: totalOf(l) }))
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

export function getLink(id: string): LinkRow | null {
  const link = store().links.find((l) => l.id === id.trim());
  if (!link) return null;
  return { ...link, status: deriveLinkStatus(link, paidReferenceIds()), total: totalOf(link) };
}

export type CreateLinkInput = {
  kind: LinkKind;
  items: { label: string; amount: number }[];
  payerEmail: string | null;
  expiresAt: string | null;
};

export function createLink(input: CreateLinkInput): PaymentLink {
  const id = `plink_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const link: PaymentLink = {
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
  store().links.unshift(link);
  return { ...link, items: link.items.map((i) => ({ ...i })) };
}

export function expireLink(id: string): PaymentLink {
  const link = store().links.find((l) => l.id === id.trim());
  if (!link) throw new Error("Unknown payment link.");
  const status = deriveLinkStatus(link, paidReferenceIds());
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
export async function recordLinkPayment(id: string): Promise<{ link: PaymentLink; transactionId: string; total: number }> {
  const link = store().links.find((l) => l.id === id.trim());
  if (!link) throw new Error("Unknown payment link.");
  const status = deriveLinkStatus(link, paidReferenceIds());
  if (status !== "OPEN") throw new Error(`Only open links can be paid — this one is ${status.toLowerCase()}.`);

  const total = totalOf(link);
  const tx = await createTransaction({
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
