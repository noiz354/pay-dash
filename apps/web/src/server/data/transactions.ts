import "server-only";

import type { ProviderReadResult, ProviderTransaction } from "@/domain/payments/provider-read";

// ---------------------------------------------------------------------------
// Transactions data source
// ---------------------------------------------------------------------------
// The dashboard journey (list -> detail -> refund) needs a source of truth that
// survives mutations so the UI flows can actually be exercised. Postgres/Prisma
// is the production target (`src/server/dal/ledger.ts`), but the app must stay
// usable when DATABASE_URL is not reachable (local/dev/preview). This module is
// the single seam: it seeds a deterministic in-memory ledger, and every read /
// write goes through it, so swapping in Prisma later only touches this file.
// ---------------------------------------------------------------------------

export const TRANSACTION_STATUSES = [
  "SUCCEEDED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "REFUNDED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const CHANNELS = ["CARD", "ACH", "VA", "QRIS", "EWALLET"] as const;
export type Channel = (typeof CHANNELS)[number];

export type TransactionEvent = {
  id: string;
  at: string;
  label: string;
  detail: string;
  kind: "info" | "success" | "warning" | "error";
};

// --- Wave 4: two-phase refund (JRN-003 dual control) -----------------------
//
// The prototype executed a refund in one step and asked the *requesting* actor
// to name an approver in the same form. That is not dual control — it is a text
// field. Wave 4 gives the refund a real intermediate state so the journey can
// change hands: Role A requests, the transaction moves to AWAITING_APPROVAL, a
// handoff notifies Role B, and only a *different* actor holding `refund.execute`
// can move it on. `refundState` is derived-on-write and persisted on the row, so
// the ledger badge, the Command Center lane and Role B's queue all read the same
// field and cannot disagree.
export const REFUND_STATES = ["NONE", "AWAITING_APPROVAL", "APPROVED", "REJECTED"] as const;
export type RefundState = (typeof REFUND_STATES)[number];

export type RefundRequest = {
  id: string;
  amount: number;
  reason: string;
  /** Actor id of Role A — the initiator, who may not also approve. */
  requestedBy: string;
  requestedAt: string;
  /** Actor id of Role B once decided; null while awaiting. */
  decidedBy: string | null;
  decidedAt: string | null;
};

export type Transaction = {
  id: string;
  referenceId: string;
  createdAt: string;
  updatedAt: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  status: TransactionStatus;
  channel: Channel;
  methodLabel: string;
  customerName: string;
  customerEmail: string;
  description: string;
  riskScore: number;
  refundedAmount: number;
  /** Wave 4 — dual-control refund lifecycle state (JRN-003). */
  refundState: RefundState;
  /** The pending/decided refund request, when `refundState !== "NONE"`. */
  refundRequest: RefundRequest | null;
  events: TransactionEvent[];
};

export type TransactionFilters = {
  status?: TransactionStatus | "ALL";
  channel?: Channel | "ALL";
  range?: "7d" | "30d" | "90d" | "all";
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: "date" | "amount" | "status";
  direction?: "asc" | "desc";
  /** Wave 4 — filter the ledger by dual-control refund state (JRN-003 queue). */
  refundState?: RefundState | "ALL";
  /** Wave 4 — SLA band filter, applied to the row's SLA anchor. */
  sla?: "ALL" | "APPROACHING" | "OVERDUE" | "CRITICAL";
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

// --- deterministic seed ----------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  ["Sarah Chen", "sarah.chen@example.com"],
  ["Acme Corp", "billing@acme-corp.com"],
  ["Budi Santoso", "budi.santoso@mail.co.id"],
  ["Nadia Rahman", "nadia@rahmanstudio.id"],
  ["Globex Retail", "ap@globex-retail.com"],
  ["Kevin Tan", "kevin.tan@domain.net"],
  ["Warung Kopi Nusantara", "owner@kopinusantara.id"],
  ["Initech BV", "finance@initech.eu"],
] as const;

const METHODS: Record<Channel, string[]> = {
  CARD: ["Visa •••• 4242", "Mastercard •••• 5555", "Amex •••• 1005"],
  ACH: ["ACH •••• 9012", "ACH •••• 3381"],
  VA: ["BCA Virtual Account", "Mandiri Virtual Account", "BNI Virtual Account"],
  QRIS: ["QRIS — GoPay", "QRIS — Dana"],
  EWALLET: ["OVO Wallet", "ShopeePay", "LinkAja"],
};

const DESCRIPTIONS = [
  "Subscription renewal — Growth plan",
  "Invoice INV-2041 settlement",
  "Marketplace payout collection",
  "One-off checkout order",
  "Annual licence upgrade",
  "Top-up wallet balance",
];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function eventsFor(tx: Omit<Transaction, "events">): TransactionEvent[] {
  const created = new Date(tx.createdAt).getTime();
  const step = (m: number) => new Date(created + m * 60_000).toISOString();
  const base: TransactionEvent[] = [
    {
      id: `${tx.id}_evt_created`,
      at: step(0),
      label: "Payment created",
      detail: `Reference ${tx.referenceId} created via ${tx.methodLabel}.`,
      kind: "info",
    },
    {
      id: `${tx.id}_evt_authorized`,
      at: step(1),
      label: "Authorization requested",
      detail: "Sent to acquiring processor for authorization.",
      kind: "info",
    },
  ];
  if (tx.status === "SUCCEEDED" || tx.status === "REFUNDED") {
    base.push({
      id: `${tx.id}_evt_captured`,
      at: step(2),
      label: "Payment captured",
      detail: "Funds captured and queued for settlement.",
      kind: "success",
    });
  }
  if (tx.status === "REFUNDED") {
    base.push({
      id: `${tx.id}_evt_refunded`,
      at: step(180),
      label: "Refund issued",
      detail: "Full refund returned to the original payment method.",
      kind: "warning",
    });
  }
  if (tx.status === "FAILED") {
    base.push({
      id: `${tx.id}_evt_failed`,
      at: step(2),
      label: "Authorization declined",
      detail: "Issuer responded 51 — insufficient funds.",
      kind: "error",
    });
  }
  if (tx.status === "PROCESSING" || tx.status === "PENDING") {
    base.push({
      id: `${tx.id}_evt_pending`,
      at: step(2),
      label: "Awaiting confirmation",
      detail: "Waiting for the payment channel callback.",
      kind: "warning",
    });
  }
  return base.sort((a, b) => a.at.localeCompare(b.at));
}

function seed(count = 46): Transaction[] {
  const rng = mulberry32(20260901);
  // Anchor to midnight UTC so SSR and client renders agree.
  const anchor = new Date();
  anchor.setUTCHours(9, 0, 0, 0);
  const out: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const channel = pick(rng, CHANNELS);
    const [customerName, customerEmail] = pick(rng, CUSTOMERS);
    const statusRoll = rng();
    const status: TransactionStatus =
      statusRoll > 0.82
        ? "PROCESSING"
        : statusRoll > 0.74
          ? "FAILED"
          : statusRoll > 0.68
            ? "REFUNDED"
            : statusRoll > 0.62
              ? "PENDING"
              : "SUCCEEDED";
    const amount = Math.round((250_000 + rng() * 48_000_000) / 5_000) * 5_000;
    const fee = Math.round(amount * 0.029 + 2_000);
    const createdAt = new Date(anchor.getTime() - i * (3.4 * 60 * 60 * 1000) - Math.floor(rng() * 90) * 60_000);
    const id = `txn_${Math.floor(mulberry32(i + 7)() * 1e12).toString(36).padStart(8, "0").slice(0, 10)}`;
    const partial: Omit<Transaction, "events"> = {
      id,
      referenceId: id,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      amount,
      currency: "IDR",
      fee,
      net: amount - fee,
      status,
      channel,
      methodLabel: pick(rng, METHODS[channel]),
      customerName,
      customerEmail,
      description: pick(rng, DESCRIPTIONS),
      riskScore: Math.round(rng() * 78),
      refundedAmount: status === "REFUNDED" ? amount : 0,
      refundState: "NONE",
      refundRequest: null,
      events: [],
    } as Omit<Transaction, "events">;
    out.push({ ...partial, events: eventsFor(partial) });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type Store = { rows: Transaction[] };
const globalStore = globalThis as unknown as { __kineticTxStore?: Store };
function store(): Store {
  if (!globalStore.__kineticTxStore) globalStore.__kineticTxStore = { rows: seed() };
  return globalStore.__kineticTxStore;
}

// --- reads -----------------------------------------------------------------

/** Map a provider transaction to the UI `Transaction` DTO (live data source).
 *  UI-only enrichment fields get safe defaults; provider fields are authoritative. */
function providerTransactionToRow(p: ProviderTransaction): Transaction {
  const channel = (CHANNELS as readonly string[]).includes(p.channel) ? (p.channel as Channel) : "CARD";
  return {
    id: p.id,
    referenceId: p.referenceId,
    createdAt: p.at,
    updatedAt: p.at,
    amount: p.amount,
    currency: p.currency,
    fee: p.fee ?? 0,
    net: p.net ?? p.amount,
    status: p.status,
    channel,
    methodLabel: p.methodLabel,
    customerName: p.customerName ?? "Live provider",
    customerEmail: p.customerEmail ?? "",
    description: p.description ?? "",
    riskScore: 0,
    refundedAmount: p.status === "REFUNDED" ? p.amount : 0,
    // Provider rows carry no local dual-control state; the refund lifecycle is
    // owned by this ledger, so a provider-sourced row starts clean.
    refundState: "NONE",
    refundRequest: null,
    events: [{ id: `evt-${p.id}`, at: p.at, label: "Provider transaction", detail: p.status, kind: "info" }],
  };
}

function withinRange(iso: string, range: TransactionFilters["range"]): boolean {
  if (range === "all" || !range) return true;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

/** Lazily attempt a provider transaction read. The provider read module pulls
 *  the SDK/client boundary which reads server env; in a non-server (jsdom test)
 *  context that import fails and we fall back to `{ connected: false }`. In the
 *  real server the SDK loads and the read reaches the provider. */
async function tryProviderTransactions(): Promise<ProviderReadResult<ProviderTransaction[]>> {
  try {
    const { getProviderReadService } = await import("@/server/repositories/provider-read");
    const service = await getProviderReadService();
    return await service.readTransactions();
  } catch {
    return { connected: false };
  }
}

export async function listTransactions(filters: TransactionFilters = {}): Promise<Paginated<Transaction>> {
  const { status = "ALL", channel = "ALL", range = "all", q = "", sort = "date", direction = "desc", refundState = "ALL" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();
  const sortKey = ["date", "amount", "status"].includes(sort) ? sort : "date";
  const dir = direction === "asc" ? 1 : -1;

  // Live provider read (rekomendasi #4). When a configured TEST connection +
  // secret resolves for the org, provider transactions are authoritative. A
  // configured-but-failing provider propagates (never mocked); with no
  // connection the in-memory dev/demo ledger is the fallback.
  const providerResult = await tryProviderTransactions();
  if (providerResult.connected) {
    const filtered = providerResult.data
      .map(providerTransactionToRow)
      .filter((t) => {
        if (status !== "ALL" && t.status !== status) return false;
        if (channel !== "ALL" && t.channel !== channel) return false;
        if (refundState !== "ALL" && t.refundState !== refundState) return false;
        if (!withinRange(t.createdAt, range)) return false;
        if (needle) {
          const hay = `${t.referenceId} ${t.customerName} ${t.customerEmail} ${t.methodLabel} ${t.description}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "date") return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      if (sortKey === "amount") return dir * (a.amount - b.amount);
      return dir * a.status.localeCompare(b.status);
    });
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, pageCount);
    return {
      rows: sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
      total: sorted.length,
      page: safePage,
      pageSize,
      pageCount,
      isFiltered: status !== "ALL" || channel !== "ALL" || range !== "all" || refundState !== "ALL" || needle.length > 0 || sortKey !== "date" || dir !== -1,
    };
  }

  const filtered = store().rows.filter((t) => {
    if (status !== "ALL" && t.status !== status) return false;
    if (channel !== "ALL" && t.channel !== channel) return false;
    if (refundState !== "ALL" && t.refundState !== refundState) return false;
    if (!withinRange(t.createdAt, range)) return false;
    if (needle) {
      const hay = `${t.referenceId} ${t.customerName} ${t.customerEmail} ${t.methodLabel} ${t.description}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "date") return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sortKey === "amount") return dir * (a.amount - b.amount);
    return dir * a.status.localeCompare(b.status);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: sorted.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: status !== "ALL" || channel !== "ALL" || range !== "all" || refundState !== "ALL" || needle.length > 0 || sortKey !== "date" || dir !== -1,
  };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  return store().rows.find((t) => t.id === id || t.referenceId === id) ?? null;
}

/**
 * Read-only view of the whole ledger for derived data sources (the balance
 * module, ADR-0011). Rows are copies; callers must not mutate them.
 */
export function getLedgerRows(): Transaction[] {
  return store().rows.map((t) => ({ ...t }));
}

export type LedgerMetrics = {
  totalVolume: number;
  volumeDelta: number;
  succeededCount: number;
  succeededDelta: number;
  failedRate: number;
  failedRateDelta: number;
  failedCount: number;
  processingCount: number;
  currency: string;
  total: number;
};

export async function getLedgerMetrics(): Promise<LedgerMetrics> {
  const rows = store().rows;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const current = rows.filter((t) => now - new Date(t.createdAt).getTime() <= 7 * day);
  const previous = rows.filter((t) => {
    const age = now - new Date(t.createdAt).getTime();
    return age > 7 * day && age <= 14 * day;
  });
  const sum = (list: Transaction[]) => list.reduce((acc, t) => acc + t.amount, 0);
  const currentVolume = sum(current);
  const previousVolume = sum(previous);
  const failed = current.filter((t) => t.status === "FAILED").length;
  const prevFailed = previous.filter((t) => t.status === "FAILED").length;
  const failedRate = current.length ? (failed / current.length) * 100 : 0;
  const prevFailedRate = previous.length ? (prevFailed / previous.length) * 100 : 0;
  const succeeded = current.filter((t) => t.status === "SUCCEEDED").length;
  const prevSucceeded = previous.filter((t) => t.status === "SUCCEEDED").length;

  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100);

  return {
    totalVolume: currentVolume,
    volumeDelta: pct(currentVolume, previousVolume),
    succeededCount: succeeded,
    succeededDelta: pct(succeeded, prevSucceeded),
    failedRate,
    failedRateDelta: failedRate - prevFailedRate,
    failedCount: failed,
    processingCount: current.filter((t) => t.status === "PROCESSING" || t.status === "PENDING").length,
    currency: "IDR",
    total: rows.length,
  };
}

export type AnalyticsPoint = { date: string; total: number; succeeded: number; failed: number };

export async function getAnalyticsSeries(days = 7): Promise<AnalyticsPoint[]> {
  const rows = store().rows;
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
  const buckets: AnalyticsPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const inDay = rows.filter((t) => {
      const at = new Date(t.createdAt).getTime();
      return at >= start.getTime() && at < end.getTime();
    });
    buckets.push({
      date: fmt.format(start),
      total: inDay.reduce((a, t) => a + t.amount, 0),
      succeeded: inDay.filter((t) => t.status === "SUCCEEDED").reduce((a, t) => a + t.amount, 0),
      failed: inDay.filter((t) => t.status === "FAILED").reduce((a, t) => a + t.amount, 0),
    });
  }
  return buckets;
}

// --- writes ----------------------------------------------------------------

export type CreateTransactionInput = {
  amount: number;
  currency: string;
  channel: Channel;
  customerName: string;
  customerEmail: string;
  description?: string;
  referenceId?: string;
};

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const now = new Date();
  const id = input.referenceId?.trim() || `txn_${now.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const fee = Math.round(input.amount * 0.029 + 2_000);
  const partial: Omit<Transaction, "events"> = {
    id,
    referenceId: id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    amount: input.amount,
    currency: input.currency,
    fee,
    net: input.amount - fee,
    status: "PENDING",
    channel: input.channel,
    methodLabel: METHODS[input.channel][0],
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    description: input.description?.trim() || "Manual transaction (dashboard)",
    riskScore: 8,
    refundedAmount: 0,
    refundState: "NONE",
    refundRequest: null,
    events: [],
  } as Omit<Transaction, "events">;
  const tx: Transaction = { ...partial, events: eventsFor(partial) };
  store().rows.unshift(tx);
  return tx;
}

export async function refundTransaction(id: string, amount: number, reason: string): Promise<Transaction | null> {
  const tx = store().rows.find((t) => t.id === id || t.referenceId === id);
  if (!tx) return null;
  const refunded = Math.min(tx.amount, tx.refundedAmount + amount);
  tx.refundedAmount = refunded;
  tx.status = refunded >= tx.amount ? "REFUNDED" : tx.status;
  tx.updatedAt = new Date().toISOString();
  tx.events = [
    ...tx.events,
    {
      id: `${tx.id}_evt_refund_${tx.events.length}`,
      at: tx.updatedAt,
      label: refunded >= tx.amount ? "Refund issued" : "Partial refund issued",
      detail: reason ? `Reason: ${reason}` : "Refund issued from the dashboard.",
      kind: "warning",
    },
  ];
  return tx;
}

// ---------------------------------------------------------------------------
// Wave 4 — two-phase refund lifecycle (JRN-003, spec §9 Refund dual-control)
// ---------------------------------------------------------------------------
//
// `refundTransaction` above is the legacy single-step execution and is kept for
// the non-dual path (small refunds where `refund.prepare` alone is sufficient).
// The functions below implement the journey that actually changes hands:
//
//   Role A (refund.prepare)  requestRefund  -> refundState AWAITING_APPROVAL
//                            + handoff opened + Role B notified
//   Role B (refund.execute)  approveRefund  -> money moves, state APPROVED,
//                            handoff COMPLETED  (rejected if same actor)
//                            rejectRefund  -> no money moves, state REJECTED
//
// Dual control is enforced here *and* in the server action: the data layer
// refuses a same-actor approval so no future caller can bypass it by forgetting
// the action-level check.

export const REFUND_FAILURE_CODES = [
  "NOT_FOUND",
  "NOT_REFUNDABLE",
  "EXCEEDS_REMAINING",
  "NOT_AWAITING",
  "SAME_ACTOR",
] as const;
export type RefundFailureCode = (typeof REFUND_FAILURE_CODES)[number];

export type RefundRequestResult =
  | { ok: true; transaction: Transaction; created: boolean }
  | { ok: false; code: RefundFailureCode; message: string };

export type RefundDecisionResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; code: RefundFailureCode; message: string };

function appendEvent(tx: Transaction, label: string, detail: string, kind: TransactionEvent["kind"], at: string): void {
  tx.events = [
    ...tx.events,
    { id: `${tx.id}_evt_${tx.events.length}_${label.toLowerCase().replace(/[^a-z]+/g, "_")}`, at, label, detail, kind },
  ];
}

/**
 * Role A requests a refund. No money moves. The transaction enters
 * AWAITING_APPROVAL and a handoff notifies every role that can execute it.
 *
 * Re-requesting while already awaiting returns the existing request
 * (`created: false`) rather than stacking a second queue item — a double submit
 * must not produce two approvals.
 */
export async function requestRefund(input: {
  transactionId: string;
  amount: number;
  reason: string;
  requestedBy: string;
  now?: Date;
}): Promise<RefundRequestResult> {
  const tx = store().rows.find((t) => t.id === input.transactionId || t.referenceId === input.transactionId);
  if (!tx) return { ok: false, code: "NOT_FOUND", message: "Transaction not found." };
  if (tx.status === "FAILED") {
    return { ok: false, code: "NOT_REFUNDABLE", message: "Failed payments cannot be refunded — retry it instead." };
  }
  if (tx.refundState === "AWAITING_APPROVAL" && tx.refundRequest) {
    return { ok: true, transaction: tx, created: false };
  }
  const remaining = tx.amount - tx.refundedAmount;
  if (input.amount <= 0 || input.amount > remaining) {
    return { ok: false, code: "EXCEEDS_REMAINING", message: "Refund exceeds the remaining refundable amount." };
  }

  const now = input.now ?? new Date();
  const at = now.toISOString();
  tx.refundState = "AWAITING_APPROVAL";
  tx.refundRequest = {
    id: `${tx.id}_refund_${tx.events.length}`,
    amount: input.amount,
    reason: input.reason.trim(),
    requestedBy: input.requestedBy,
    requestedAt: at,
    decidedBy: null,
    decidedAt: null,
  };
  tx.updatedAt = at;
  // Distinct label from "Refund issued" — the request and the execution are two
  // logical events and the canonical timeline must show each exactly once.
  // The audit log (ADR-0026) is derived from these events, so the actor is
  // recorded here rather than in a second store: spec §9 requires the audit
  // trail to show both sides of the dual control.
  appendEvent(
    tx,
    "Refund requested",
    `Amount ${input.amount} ${tx.currency} · requested by ${input.requestedBy} · awaiting a second approver.`,
    "warning",
    at,
  );

  // System transition -> notification -> Role B queue (Wave 4 §4).
  const { openHandoff, rolesWithPermission } = await import("./handoff-store");
  openHandoff(
    {
      journey: "refund_approval",
      entityType: "refund",
      entityId: tx.id,
      // Non-PII label: the reference id, never the customer name or email.
      entityLabel: tx.referenceId,
      fromActor: input.requestedBy,
      fromRole: null,
      toRoles: rolesWithPermission("refund.execute"),
      requiredPermission: "refund.execute",
      createdAt: at,
      slaEntityType: "refund",
      amount: input.amount,
      currency: tx.currency,
      queueHref: "/transactions?refundState=AWAITING_APPROVAL",
      actionHref: `/transactions/${tx.id}`,
      message: "Refund awaiting a second approval",
      reason: tx.refundRequest.reason || null,
    },
    now,
  );

  return { ok: true, transaction: tx, created: true };
}

/**
 * Role B approves the pending refund. Money moves only here, and only for an
 * actor distinct from the requester.
 */
export async function approveRefund(input: {
  transactionId: string;
  approvedBy: string;
  now?: Date;
}): Promise<RefundDecisionResult> {
  const tx = store().rows.find((t) => t.id === input.transactionId || t.referenceId === input.transactionId);
  if (!tx) return { ok: false, code: "NOT_FOUND", message: "Transaction not found." };
  if (tx.refundState !== "AWAITING_APPROVAL" || !tx.refundRequest) {
    return { ok: false, code: "NOT_AWAITING", message: "This transaction has no refund awaiting approval." };
  }
  // Dual control — the initiator may not approve their own request (BE-002).
  if (tx.refundRequest.requestedBy === input.approvedBy) {
    return { ok: false, code: "SAME_ACTOR", message: "Requester cannot be the approver — a different user must approve this refund." };
  }

  const now = input.now ?? new Date();
  const at = now.toISOString();
  const request = tx.refundRequest;
  const refunded = Math.min(tx.amount, tx.refundedAmount + request.amount);
  tx.refundedAmount = refunded;
  tx.status = refunded >= tx.amount ? "REFUNDED" : tx.status;
  tx.refundState = "APPROVED";
  tx.refundRequest = { ...request, decidedBy: input.approvedBy, decidedAt: at };
  tx.updatedAt = at;
  appendEvent(
    tx,
    "Refund issued",
    `Amount ${refunded} ${tx.currency} · requested by ${request.requestedBy} · approved by ${input.approvedBy} · dual control satisfied.`,
    "success",
    at,
  );

  const { completeHandoff, handoffIdentity, listStoredHandoffs } = await import("./handoff-store");
  const identity = handoffIdentity("refund_approval", "refund", tx.id);
  const existing = listStoredHandoffs().find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
  if (existing) {
    completeHandoff(existing.id, { actor: input.approvedBy, outcome: "approved", enforceDistinctActor: true, now });
  }

  return { ok: true, transaction: tx };
}

/** Role B rejects the pending refund. No money moves. */
export async function rejectRefund(input: {
  transactionId: string;
  rejectedBy: string;
  reason?: string;
  now?: Date;
}): Promise<RefundDecisionResult> {
  const tx = store().rows.find((t) => t.id === input.transactionId || t.referenceId === input.transactionId);
  if (!tx) return { ok: false, code: "NOT_FOUND", message: "Transaction not found." };
  if (tx.refundState !== "AWAITING_APPROVAL" || !tx.refundRequest) {
    return { ok: false, code: "NOT_AWAITING", message: "This transaction has no refund awaiting approval." };
  }
  const now = input.now ?? new Date();
  const at = now.toISOString();
  tx.refundState = "REJECTED";
  tx.refundRequest = { ...tx.refundRequest, decidedBy: input.rejectedBy, decidedAt: at };
  tx.updatedAt = at;
  appendEvent(
    tx,
    "Refund rejected",
    `Requested by ${tx.refundRequest.requestedBy} · rejected by ${input.rejectedBy}${input.reason?.trim() ? ` · reason: ${input.reason.trim()}` : ""}.`,
    "error",
    at,
  );

  const { completeHandoff, handoffIdentity, listStoredHandoffs } = await import("./handoff-store");
  const identity = handoffIdentity("refund_approval", "refund", tx.id);
  const existing = listStoredHandoffs().find((h) => handoffIdentity(h.journey, h.entityType, h.entityId) === identity);
  if (existing) completeHandoff(existing.id, { actor: input.rejectedBy, outcome: "rejected", now });

  return { ok: true, transaction: tx };
}

/** Role B's queue: every transaction with a refund awaiting a second approval. */
export function listRefundsAwaiting(): Transaction[] {
  return store()
    .rows.filter((t) => t.refundState === "AWAITING_APPROVAL")
    .sort((a, b) => (a.refundRequest?.requestedAt ?? "").localeCompare(b.refundRequest?.requestedAt ?? ""));
}

export async function retryTransaction(id: string): Promise<Transaction | null> {
  const tx = store().rows.find((t) => t.id === id || t.referenceId === id);
  if (!tx) return null;
  tx.status = "PROCESSING";
  tx.updatedAt = new Date().toISOString();
  tx.events = [
    ...tx.events,
    {
      id: `${tx.id}_evt_retry_${tx.events.length}`,
      at: tx.updatedAt,
      label: "Payment retried",
      detail: "Re-submitted to the acquiring processor.",
      kind: "info",
    },
  ];
  return tx;
}

export function toCsv(rows: Transaction[]) {
  const header = [
    "reference_id",
    "created_at",
    "status",
    "channel",
    "method",
    "customer_name",
    "customer_email",
    "amount",
    "fee",
    "net",
    "currency",
  ];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((t) =>
    [
      t.referenceId,
      t.createdAt,
      t.status,
      t.channel,
      t.methodLabel,
      t.customerName,
      t.customerEmail,
      t.amount,
      t.fee,
      t.net,
      t.currency,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}
