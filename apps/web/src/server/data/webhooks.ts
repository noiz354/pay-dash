import "server-only";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { getLedgerRows } from "./transactions";
import { KNOWN_WEBHOOK_EVENTS } from "@/lib/webhook-status";
import type { WebhookStatus, WebhookSource } from "@/lib/webhook-status";

// Webhook callback log — the store the prototype page pretended to have
// (ADR-0014).
//
// The page shipped four invented "deliveries to api.merchant.com/webhooks/
// stripe" rows, but INTEGRATION.md §7 is explicit about the direction: this
// app RECEIVES callbacks at /api/webhooks/xendit ("you receive webhooks (§7);
// no log-fetch API", :307 "surface these received events + their delivery
// status"). The log therefore records what the app did with each inbound
// callback — RECEIVED (verified, stored, queued), DUPLICATED (the provider
// retried an event id we already held — the idempotency no-op) or REJECTED
// (refused at the endpoint, with the reason).
//
// Status is a fact of receive-time, not a mutable entity state: a log row is
// never re-derived, which is why these rows store their status (unlike the
// link/balance stores, whose states are derived from the ledger).

export type WebhookEvent = {
  /**
   * Wave 7G: the tenant this callback belongs to. `null` means the door could
   * not attribute it (see `UNATTRIBUTED_ORGANIZATION_ID`) — a row that belongs
   * to nobody is still a row, it is simply not any tenant's to read.
   */
  organizationId: string | null;
  /** Row id — unique per delivery attempt (replays create new rows). */
  id: string;
  /** Provider event id — the dedupe key (INTEGRATION.md:303, idempotency). */
  eventId: string;
  /**
   * Provider-scoped dedupe key (e.g. `stripe:<event_id>`). Defaults to
   * `eventId` when omitted, so a single-provider event id dedupes on itself
   * while multi-provider ids never collide. Stored so a later same-key
   * delivery is classified as DUPLICATED regardless of source.
   */
  dedupeKey?: string;
  /** Event type as sent by the provider; may be outside the known set. */
  type: string;
  receivedAt: string;
  source: WebhookSource;
  status: WebhookStatus;
  /** Rejection reason, or the duplicate reference. Null for RECEIVED. */
  reason: string | null;
  /** True when the handler has no branch for this type. */
  unhandled: boolean;
  /** Parsed payload for accepted callbacks; the raw body for rejections. */
  payload: unknown;
};

export type WebhookFilters = {
  q?: string;
  status?: WebhookStatus | "all";
  type?: string;
  page?: number;
  pageSize?: number;
};

export type PaginatedWebhooks = {
  rows: WebhookEvent[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * The partition for callbacks whose tenant could not be determined at the door.
 *
 * Named debt, not a silent pass (Wave 7G spec P-1/P-10, D-30): there is one
 * shared `/api/webhooks/xendit` and one shared `/api/webhooks/stripe` URL for
 * every tenant, and the connection→organization mapping that does exist
 * (`PaymentProviderConnection.organizationId`, `RuntimeConnection.organizationId`)
 * is keyed by `connectionId`, which a provider callback does not carry. Until
 * ingress can attribute — per-tenant endpoints/secrets, or a payload-derived
 * resource→organization lookup — an unattributable event lands here, visible to
 * **no** tenant. It must never degrade into the demo organization's log: that
 * would hand the demo tenant another merchant's raw provider payload and hand a
 * caller a writable partition.
 */
export const UNATTRIBUTED_ORGANIZATION_ID = "unresolved";

type Partition = { events: WebhookEvent[] };
type Store = { tenants: Map<string, Partition> };
const g = globalThis as unknown as { __kineticWebhooksStore?: Store };
function store(): Store {
  if (!g.__kineticWebhooksStore) g.__kineticWebhooksStore = { tenants: new Map() };
  return g.__kineticWebhooksStore;
}

/** A read for a tenant with no partition answers empty; it never materialises one. */
const EMPTY_PARTITION: Partition = { events: [] };

function scopeOf(ctx: OrganizationContext): string {
  return parseOrganizationContext(ctx).organizationId;
}

/**
 * The partition a context may read. The demo tenant seeds lazily (its seven
 * prototype callbacks are *its* history, not every tenant's); no other tenant
 * inherits them — a fresh merchant starts with an empty log, which is the honest
 * answer, and the same shape 7F's `freshState()` established for settings.
 */
function readPartition(ctx: OrganizationContext): Partition {
  const organizationId = scopeOf(ctx);
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  if (organizationId === DEFAULT_DEMO_ORG) {
    const seeded = { events: seed(parseOrganizationContext({ organizationId })) };
    tenants.set(organizationId, seeded);
    return seeded;
  }
  return EMPTY_PARTITION;
}

/** The partition a write lands in — created on first write only. */
function writePartition(organizationId: string): Partition {
  const tenants = store().tenants;
  const existing = tenants.get(organizationId);
  if (existing) return existing;
  const created: Partition = organizationId === DEFAULT_DEMO_ORG ? { events: seed(parseOrganizationContext({ organizationId })) } : { events: [] };
  tenants.set(organizationId, created);
  return created;
}

/**
 * How many tenants hold callbacks. Row-free tenancy probe: it answers a question
 * about the store, never returns an event — which is why it, and not a repository
 * read, is what the quarantine gate and the seam's demo refusal gate on. The
 * unattributed partition is deliberately **not** a tenant: counting it would let
 * inbound provider traffic flip the whole app into multi-tenant refusal.
 */
export function countWebhookTenants(): number {
  let count = 0;
  for (const [organizationId, partition] of store().tenants) {
    if (organizationId === UNATTRIBUTED_ORGANIZATION_ID) continue;
    if (partition.events.length > 0) count += 1;
  }
  return count;
}

/** The single tenant holding callbacks, or `null` when there is none or more than one. */
export function soleWebhookOrganizationId(): string | null {
  let sole: string | null = null;
  for (const [organizationId, partition] of store().tenants) {
    if (organizationId === UNATTRIBUTED_ORGANIZATION_ID) continue;
    if (partition.events.length === 0) continue;
    if (sole !== null) return null;
    sole = organizationId;
  }
  return sole;
}

const daysAgo = (n: number, hours = 0) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();

// Seven seeded events inside the ledger window. The two money events
// reference real seeded ledger rows (ARCHITECTURE.md:42 — every payment is
// traceable through its webhook_event_id), the duplicate is a provider retry
// of the first, and the two rejections are the endpoint's refusal paths.
function seed(ctx: OrganizationContext): WebhookEvent[] {
  // Wave 7G: the seed reads the *demo tenant's* ledger through the scoped 7A
  // read, which is what retired the `webhooks` entry in LEGACY_LEDGER_SURFACES.
  const { organizationId } = ctx;
  const ledger = getLedgerRows(ctx);
  const succeeded = ledger.find((t) => t.status === "SUCCEEDED");
  const refunded = ledger.find((t) => t.status === "REFUNDED");

  const firstAt = daysAgo(0, 2);
  const rows: Omit<WebhookEvent, "organizationId">[] = [
    {
      id: "whk_seed_1",
      eventId: "evt_a1b2c3d4",
      type: "payment.succeeded",
      receivedAt: firstAt,
      source: "xendit",
      status: "RECEIVED",
      reason: null,
      unhandled: false,
      payload: {
        id: "evt_a1b2c3d4",
        event: "payment.succeeded",
        created: firstAt,
        data: {
          id: succeeded?.referenceId ?? "txn_seed_unknown",
          status: "settle",
          amount: succeeded?.amount ?? 0,
          currency: succeeded?.currency ?? "IDR",
        },
      },
    },
    {
      id: "whk_seed_2",
      eventId: "evt_a1b2c3d4",
      type: "payment.succeeded",
      receivedAt: new Date(new Date(firstAt).getTime() + 60_000).toISOString(),
      source: "xendit",
      status: "DUPLICATED",
      reason: `Duplicate — first received ${firstAt}`,
      unhandled: false,
      payload: {
        id: "evt_a1b2c3d4",
        event: "payment.succeeded",
        created: firstAt,
        data: {
          id: succeeded?.referenceId ?? "txn_seed_unknown",
          status: "settle",
          amount: succeeded?.amount ?? 0,
          currency: succeeded?.currency ?? "IDR",
        },
      },
    },
    {
      id: "whk_seed_3",
      eventId: "evt_e5f6g7h8",
      type: "refund.succeeded",
      receivedAt: daysAgo(1, 3),
      source: "xendit",
      status: "RECEIVED",
      reason: null,
      unhandled: false,
      payload: {
        id: "evt_e5f6g7h8",
        event: "refund.succeeded",
        created: daysAgo(1, 3),
        data: {
          id: refunded?.referenceId ?? "txn_seed_unknown",
          amount: refunded?.amount ?? 0,
          currency: refunded?.currency ?? "IDR",
          reason: "Requested by customer",
        },
      },
    },
    {
      id: "whk_seed_4",
      eventId: "rej_i9j0k1l2",
      type: "unknown",
      receivedAt: daysAgo(1, 7),
      source: "xendit",
      status: "REJECTED",
      reason: "Invalid x-callback-token",
      unhandled: false,
      payload: `{"id":"evt_blocked_1","event":"payment.succeeded","data":{"id":"txn_blocked_1"}}`,
    },
    {
      id: "whk_seed_5",
      eventId: "evt_m3n4o5p6",
      type: "invoice.issued",
      receivedAt: daysAgo(2, 4),
      source: "xendit",
      status: "RECEIVED",
      reason: null,
      unhandled: true,
      payload: {
        id: "evt_m3n4o5p6",
        event: "invoice.issued",
        created: daysAgo(2, 4),
        data: { id: "inv_seed_1", amount: 1_250_000, currency: "IDR" },
      },
    },
    {
      id: "whk_seed_6",
      eventId: "rej_q7r8s9t0",
      type: "unknown",
      receivedAt: daysAgo(3, 1),
      source: "xendit",
      status: "REJECTED",
      reason: "Invalid JSON",
      unhandled: false,
      payload: "not-json{{",
    },
    {
      id: "whk_seed_7",
      eventId: "evt_u1v2w3x4",
      type: "payment.succeeded",
      receivedAt: daysAgo(4, 2),
      source: "xendit",
      status: "RECEIVED",
      reason: null,
      unhandled: false,
      payload: {
        id: "evt_u1v2w3x4",
        event: "payment.succeeded",
        created: daysAgo(4, 2),
        data: { id: "txn_seed_older", status: "settle", amount: 8_400_000, currency: "IDR" },
      },
    },
  ];
  return rows.map((row) => ({ ...row, organizationId }));
}

export function listWebhooks(ctx: OrganizationContext, filters: WebhookFilters = {}): PaginatedWebhooks {
  const { q = "", status = "all", type = "all", page = 1, pageSize = 10 } = filters;
  const needle = q.trim().toLowerCase();

  // The partition IS the predicate (7B M1 lesson): filters narrow inside it and
  // can never widen across tenants.
  const all = [...readPartition(ctx).events].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const filtered = all.filter((e) => {
    if (status !== "all" && e.status !== status) return false;
    if (type !== "all") {
      if (type === "unknown") {
        if ((KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(e.type)) return false;
      } else if (e.type !== type) {
        return false;
      }
    }
    if (needle) {
      const hay = `${e.eventId} ${e.type} ${e.id} ${JSON.stringify(e.payload ?? "")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const safePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))));
  return {
    // Rows are copies: mutating the answer cannot reach the store.
    rows: filtered
      .slice((safePage - 1) * pageSize, safePage * pageSize)
      .map((e) => ({ ...e, payload: structuredClone(e.payload) })),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

export function getWebhookEvent(ctx: OrganizationContext, id: string): WebhookEvent | null {
  // "Not yours" and "does not exist" are the same null — no enumeration oracle.
  // The answer is a copy: mutating it cannot reach the store (7C/7F precedent).
  const event = readPartition(ctx).events.find((e) => e.id === id.trim());
  return event ? { ...event, payload: structuredClone(event.payload) } : null;
}

export type SystemWebhookSummary = {
  /** Inbound callbacks in the last 24 hours, by outcome. */
  last24h: { total: number; received: number; duplicated: number; rejected: number };
  /** The five most recent callbacks (any age), newest first. */
  recent: WebhookEvent[];
  /** When the newest callback arrived — the "last callback" chip. */
  lastReceivedAt: string | null;
};

// The /system status page states only what the app measures (ADR-0017):
// inbound webhook flow. The seeds are now-relative offsets, so the 24h
// window membership is deterministic — whk_seed_1 (2h) and whk_seed_2
// (1h59m) are inside; everything else (27h+) is outside.
export function getSystemWebhookSummary(ctx: OrganizationContext): SystemWebhookSummary {
  const all = [...readPartition(ctx).events].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const inWindow = all.filter((e) => new Date(e.receivedAt).getTime() >= cutoff);

  const count = (status: WebhookStatus) => inWindow.filter((e) => e.status === status).length;
  return {
    last24h: {
      total: inWindow.length,
      received: count("RECEIVED"),
      duplicated: count("DUPLICATED"),
      rejected: count("REJECTED"),
    },
    recent: all.slice(0, 5),
    lastReceivedAt: all[0]?.receivedAt ?? null,
  };
}

export type RecordInboundInput = {
  eventId: string;
  type: string;
  payload: unknown;
  source: WebhookSource;
  receivedAt?: string;
  /** Optional provider-scoped dedupe key; defaults to `eventId`. */
  dedupeKey?: string;
};

function rowId(): string {
  return `whk_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Persist an inbound callback. Shared by the route and the TEST MODE
 * simulator/replay, so every path runs the same dedupe + unhandled logic —
 * the dedupe key is the provider event id (QUEUES.md: "replay webhook twice
 * → second is deduped").
 */
export type RecordInboundResult = { event: WebhookEvent; deduped: boolean };

export function recordInbound(ctx: OrganizationContext, input: RecordInboundInput): RecordInboundResult {
  // A session-driven callback (the TEST MODE simulator, a replay) IS
  // attributable: the actor's tenant is known, so the row belongs to it.
  return recordInto(scopeOf(ctx), input);
}

/**
 * Persist a callback whose tenant could not be determined at the door — the
 * provider ingress path. Takes no context **by design** and may only ever write
 * to `UNATTRIBUTED_ORGANIZATION_ID`; GS-1/GS-2 pin that this allowance is
 * exactly two functions wide and that neither can reach a tenant partition.
 */
export function recordUnattributedInbound(input: RecordInboundInput): RecordInboundResult {
  return recordInto(UNATTRIBUTED_ORGANIZATION_ID, input);
}

function recordInto(organizationId: string, input: RecordInboundInput): { event: WebhookEvent; deduped: boolean } {
  const partition = writePartition(organizationId);
  const dedupeKey = input.dedupeKey ?? input.eventId;
  // Dedupe is per partition: a provider retry of the same event id must dedupe,
  // but the same event id delivered for two different tenants is two rows.
  const first = partition.events.find((e) => (e.dedupeKey ?? e.eventId) === dedupeKey);
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const event: WebhookEvent = {
    organizationId,
    id: rowId(),
    eventId: input.eventId,
    dedupeKey: input.dedupeKey,
    type: input.type,
    receivedAt,
    source: input.source,
    status: first ? "DUPLICATED" : "RECEIVED",
    reason: first ? `Duplicate — first received ${first.receivedAt}` : null,
    unhandled: !(KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(input.type),
    payload: input.payload,
  };
  partition.events.unshift(event);
  return { event, deduped: !!first };
}

/**
 * Persist a callback the endpoint refused, with the refusal reason. A rejection
 * happens *before* anything about the sender is trusted — signature, payload and
 * tenant alike — so it takes no context and lands in
 * `UNATTRIBUTED_ORGANIZATION_ID` with the accepted-but-unattributable rows.
 */
export function rejectInbound(input: {
  reason: string;
  raw?: string;
  eventId?: string;
  type?: string;
  source?: WebhookSource;
  receivedAt?: string;
}): WebhookEvent {
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const event: WebhookEvent = {
    organizationId: UNATTRIBUTED_ORGANIZATION_ID,
    id: rowId(),
    eventId: input.eventId ?? `rej_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    type: input.type ?? "unknown",
    receivedAt,
    source: input.source ?? "xendit",
    status: "REJECTED",
    reason: input.reason,
    unhandled: false,
    payload: input.raw ?? null,
  };
  writePartition(UNATTRIBUTED_ORGANIZATION_ID).events.unshift(event);
  return event;
}
