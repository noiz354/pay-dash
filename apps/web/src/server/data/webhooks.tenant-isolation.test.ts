// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import {
  UNATTRIBUTED_ORGANIZATION_ID,
  countWebhookTenants,
  getSystemWebhookSummary,
  getWebhookEvent,
  listWebhooks,
  recordInbound,
  recordUnattributedInbound,
  rejectInbound,
  soleWebhookOrganizationId,
} from "./webhooks";

/**
 * Wave 7G Q1 — webhook log tenant isolation, target-API tests (G-1, G-2, G-13a).
 *
 * Invariant: **Org A cannot read, replay or be credited with Org B's inbound
 * provider callbacks** — and an event whose tenant cannot be determined at the
 * door stays *nobody's* event rather than becoming everybody's (spec P-1/P-10).
 *
 * Two stores, two different defects:
 *   - the in-memory UI log (`server/data/webhooks.ts`) had **no tenant field at
 *     all** — `WebhookEvent` carried `eventId`/`type`/`payload` and nothing else,
 *     so every tenant's `/webhooks` page showed one shared firehose including
 *     raw provider payloads;
 *   - the durable `WebhookDelivery` row was attributed `"unresolved"`
 *     (`server/webhooks/store-delivery.ts:34`) because neither ingress route
 *     passes an organization or a connection.
 *
 * The connection→org mapping exists (`RuntimeConnection.organizationId`,
 * `PaymentProviderConnection`) but is keyed by `connectionId`, and there is one
 * shared ingress URL for all tenants — so attribution at the door is *named
 * debt* in this wave, not a silent pass: unattributable events land in a
 * dedicated `UNATTRIBUTED_ORGANIZATION_ID` partition that no tenant read can
 * see, and the structural suite pins that it never resolves to the demo org.
 *
 * Session-driven writes (the TEST MODE simulator and replay) *are* attributable,
 * so `recordInbound(ctx, …)` is ctx-first like every other writer.
 *
 * RED on `6c104ab`: `webhooks.ts` accepts no tenant — one process-wide
 * `{ events }` array shared by every merchant.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticWebhooksStore;
  delete g.__kineticTxStore;
}

/** Raw partition view — asserts on the store, not on a read that could filter. */
function rawPartitions(): Map<string, { events: unknown[] }> {
  const g = globalThis as unknown as { __kineticWebhooksStore?: { tenants?: Map<string, { events: unknown[] }> } };
  return g.__kineticWebhooksStore?.tenants ?? new Map();
}

const A_EVENT = { eventId: "evt_alpha_1", type: "payment.succeeded", source: "xendit" as const, payload: { id: "evt_alpha_1", amount: 4250000, merchant: "alpha" } };
const B_EVENT = { eventId: "evt_beta_1", type: "payment.succeeded", source: "stripe" as const, payload: { id: "evt_beta_1", amount: 99000, merchant: "beta" } };

beforeEach(() => {
  resetStores();
});

describe("G-1 the webhook log is per tenant", () => {
  it("the seeded callbacks belong to the demo tenant, not to every tenant", () => {
    const demo = listWebhooks(ctxDemo, { pageSize: 50 });
    expect(demo.total).toBeGreaterThan(0);
    expect(demo.rows.some((e) => e.id === "whk_seed_1")).toBe(true);

    // The leak that must not happen: a fresh tenant inheriting the demo firehose.
    expect(listWebhooks(ctxA, { pageSize: 50 }).total).toBe(0);
    expect(listWebhooks(ctxB, { pageSize: 50 }).total).toBe(0);
    expect(JSON.stringify(listWebhooks(ctxA, { pageSize: 50 }).rows)).not.toContain("whk_seed_1");
  });

  it("A's inbound callback is A's: B and demo never see it", () => {
    const { event } = recordInbound(ctxA, A_EVENT);
    expect(event.status).toBe("RECEIVED");

    const a = listWebhooks(ctxA, { pageSize: 50 });
    expect(a.total).toBe(1);
    expect(a.rows[0]?.eventId).toBe("evt_alpha_1");

    expect(listWebhooks(ctxB, { pageSize: 50 }).total).toBe(0);
    expect(JSON.stringify(listWebhooks(ctxB, { pageSize: 50 }).rows)).not.toContain("evt_alpha_1");
    expect(JSON.stringify(listWebhooks(ctxB, { pageSize: 50 }).rows)).not.toContain("alpha");
  });

  it("two tenants hold two callbacks at once, each seeing only its own", () => {
    recordInbound(ctxA, A_EVENT);
    recordInbound(ctxB, B_EVENT);

    expect(listWebhooks(ctxA, { pageSize: 50 }).rows.map((e) => e.eventId)).toEqual(["evt_alpha_1"]);
    expect(listWebhooks(ctxB, { pageSize: 50 }).rows.map((e) => e.eventId)).toEqual(["evt_beta_1"]);
  });

  it("status / type / q / page filters narrow inside the tenant and never widen", () => {
    recordInbound(ctxA, A_EVENT);
    recordInbound(ctxA, { eventId: "evt_alpha_2", type: "refund.succeeded", source: "xendit" as const, payload: null });
    recordInbound(ctxB, B_EVENT);

    expect(listWebhooks(ctxA, { status: "RECEIVED", pageSize: 50 }).total).toBe(2);
    expect(listWebhooks(ctxA, { type: "refund.succeeded", pageSize: 50 }).total).toBe(1);
    expect(listWebhooks(ctxA, { q: "evt_alpha_2", pageSize: 50 }).total).toBe(1);
    // A needle that matches only B's row returns nothing — not B's row.
    expect(listWebhooks(ctxA, { q: "evt_beta_1", pageSize: 50 }).total).toBe(0);
    expect(listWebhooks(ctxA, { q: "beta", pageSize: 50 }).rows).toEqual([]);

    const paged = listWebhooks(ctxA, { page: 1, pageSize: 1 });
    expect(paged.total).toBe(2);
    expect(paged.pageCount).toBe(2);
    expect(paged.rows).toHaveLength(1);
  });

  it("detail by id: A's event resolves for A and is null for B, identical to an unknown id", () => {
    const { event } = recordInbound(ctxA, A_EVENT);

    expect(getWebhookEvent(ctxA, event.id)?.eventId).toBe("evt_alpha_1");
    expect(getWebhookEvent(ctxB, event.id)).toBeNull();
    expect(getWebhookEvent(ctxDemo, event.id)).toBeNull();
    // No enumeration oracle: "not yours" and "does not exist" are the same answer.
    expect(getWebhookEvent(ctxB, event.id)).toEqual(getWebhookEvent(ctxB, "whk_does_not_exist"));
  });

  it("the system summary reports the caller's own inbound flow only", () => {
    recordInbound(ctxA, A_EVENT);
    recordInbound(ctxB, B_EVENT);

    const a = getSystemWebhookSummary(ctxA);
    expect(a.last24h.total).toBe(1);
    expect(a.last24h.received).toBe(1);
    expect(a.lastReceivedAt).not.toBeNull();
    expect(JSON.stringify(a.recent)).not.toContain("evt_beta_1");

    const b = getSystemWebhookSummary(ctxB);
    expect(b.last24h.total).toBe(1);
    expect(JSON.stringify(b.recent)).not.toContain("evt_alpha_1");

    // The demo tenant's own seeded window is untouched by either write.
    expect(getSystemWebhookSummary(ctxDemo).last24h.total).toBeGreaterThan(0);
  });

  it("dedupe is per tenant: the same provider event id in two tenants is two rows", () => {
    const a = recordInbound(ctxA, { eventId: "evt_shared", type: "payment.succeeded", source: "xendit" as const, payload: null });
    const b = recordInbound(ctxB, { eventId: "evt_shared", type: "payment.succeeded", source: "xendit" as const, payload: null });

    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
    expect(a.event.id).not.toBe(b.event.id);
    expect(getWebhookEvent(ctxA, a.event.id)?.status).toBe("RECEIVED");
    expect(getWebhookEvent(ctxB, b.event.id)?.status).toBe("RECEIVED");
  });

  it("dedupe within a tenant still classifies a provider retry as DUPLICATED", () => {
    recordInbound(ctxA, A_EVENT);
    const retry = recordInbound(ctxA, A_EVENT);

    expect(retry.deduped).toBe(true);
    expect(retry.event.status).toBe("DUPLICATED");
    expect(listWebhooks(ctxA, { status: "DUPLICATED", pageSize: 50 }).total).toBe(1);
    // B is unaffected by A's retry.
    expect(listWebhooks(ctxB, { pageSize: 50 }).total).toBe(0);
  });

  it("returned rows are copies: mutating the answer cannot reach the store", () => {
    const { event } = recordInbound(ctxA, A_EVENT);
    const row = getWebhookEvent(ctxA, event.id);
    expect(row).not.toBeNull();
    (row as { type: string }).type = "tampered";

    expect(getWebhookEvent(ctxA, event.id)?.type).toBe("payment.succeeded");
    expect(listWebhooks(ctxA, { pageSize: 50 }).rows[0]?.type).toBe("payment.succeeded");
  });
});

describe("G-2 an unattributable callback belongs to nobody", () => {
  it("ingress without a tenant is invisible to every tenant, including demo", () => {
    const { event } = recordUnattributedInbound({
      eventId: "evt_door_1",
      type: "payment.succeeded",
      source: "xendit",
      payload: { id: "evt_door_1" },
    });

    expect(event.status).toBe("RECEIVED");
    expect(listWebhooks(ctxA, { pageSize: 50 }).total).toBe(0);
    expect(listWebhooks(ctxB, { pageSize: 50 }).total).toBe(0);
    expect(listWebhooks(ctxDemo, { q: "evt_door_1", pageSize: 50 }).total).toBe(0);
    expect(getWebhookEvent(ctxDemo, event.id)).toBeNull();
    expect(getWebhookEvent(ctxA, event.id)).toBeNull();
  });

  it("unattributed ingress never defaults to the demo organization", () => {
    recordUnattributedInbound({ eventId: "evt_door_2", type: "invoice.issued", source: "stripe", payload: null });

    const partitions = rawPartitions();
    expect(partitions.has(UNATTRIBUTED_ORGANIZATION_ID)).toBe(true);
    expect(partitions.get(UNATTRIBUTED_ORGANIZATION_ID)?.events.length).toBe(1);
    // The specific degradation this pins: a door event landing in the demo tenant.
    expect(partitions.get(DEFAULT_DEMO_ORG)?.events ?? []).toHaveLength(0);
    expect(JSON.stringify(listWebhooks(ctxDemo, { pageSize: 50 }).rows)).not.toContain("evt_door_2");
  });

  it("a rejected callback is recorded without inventing a tenant", () => {
    const rejected = rejectInbound({ reason: "Invalid signature", raw: "{not json", source: "xendit" });
    expect(rejected.status).toBe("REJECTED");

    expect(listWebhooks(ctxA, { status: "REJECTED", pageSize: 50 }).total).toBe(0);
    expect(listWebhooks(ctxDemo, { q: "Invalid signature", pageSize: 50 }).total).toBe(0);
    expect(getWebhookEvent(ctxDemo, rejected.id)).toBeNull();
  });

  it("the door partition does not dedupe against a tenant's own event", () => {
    recordInbound(ctxA, A_EVENT);
    const door = recordUnattributedInbound(A_EVENT);
    expect(door.deduped).toBe(false);
    expect(door.event.status).toBe("RECEIVED");
    // A's own row is untouched by the door write.
    expect(listWebhooks(ctxA, { pageSize: 50 }).total).toBe(1);
  });
});

describe("G-13a attribution order and partition hygiene", () => {
  it("recording into A creates no row in any other partition", () => {
    recordInbound(ctxA, A_EVENT);

    const partitions = rawPartitions();
    expect(partitions.get(ORG_A)?.events.length).toBe(1);
    expect(partitions.get(ORG_B)?.events ?? []).toHaveLength(0);
    expect(partitions.get(DEFAULT_DEMO_ORG)?.events ?? []).toHaveLength(0);
    expect(partitions.get(UNATTRIBUTED_ORGANIZATION_ID)?.events ?? []).toHaveLength(0);
  });

  it("the store holds partitions, not one shared array", () => {
    recordInbound(ctxA, A_EVENT);
    recordInbound(ctxB, B_EVENT);

    const partitions = rawPartitions();
    expect([...partitions.keys()].sort()).toEqual([ORG_A, ORG_B].sort());
    expect(partitions.get(ORG_A)?.events.length).toBe(1);
    expect(partitions.get(ORG_B)?.events.length).toBe(1);
  });

  it("probes count tenants and never return an event", () => {
    expect(countWebhookTenants()).toBe(0);
    expect(soleWebhookOrganizationId()).toBeNull();

    recordInbound(ctxA, A_EVENT);
    expect(countWebhookTenants()).toBe(1);
    expect(soleWebhookOrganizationId()).toBe(ORG_A);

    recordInbound(ctxB, B_EVENT);
    expect(countWebhookTenants()).toBe(2);
    expect(soleWebhookOrganizationId()).toBeNull();
  });

  it("the unattributed partition is not counted as a tenant", () => {
    recordUnattributedInbound({ eventId: "evt_door_3", type: "unknown", source: "stripe", payload: null });

    expect(countWebhookTenants()).toBe(0);
    expect(soleWebhookOrganizationId()).toBeNull();
  });

  it("the demo seed counts as exactly one tenant", () => {
    expect(countWebhookTenants()).toBe(0); // reads do not materialise the seed
    listWebhooks(ctxDemo, { pageSize: 1 });
    expect(countWebhookTenants()).toBe(1);
    expect(soleWebhookOrganizationId()).toBe(DEFAULT_DEMO_ORG);
  });
});

describe("G-12c no context, no tenant", () => {
  it("a missing context is rejected on every read and write", async () => {
    const missing = undefined as unknown as OrganizationContext;
    expect(() => listWebhooks(missing)).toThrow();
    expect(() => getWebhookEvent(missing, "whk_seed_1")).toThrow();
    expect(() => getSystemWebhookSummary(missing)).toThrow();
    expect(() => recordInbound(missing, A_EVENT)).toThrow();
  });

  it("a blank organization id is rejected, not defaulted", () => {
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
    const blank = { organizationId: "" } as unknown as OrganizationContext;
    expect(() => listWebhooks(blank)).toThrow();
  });
});
