// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { UNATTRIBUTED_ORGANIZATION_ID, listWebhooks, getWebhookEvent } from "@/server/data/webhooks";
import { POST as postXendit } from "./xendit/route";
import { POST as postStripe } from "./stripe/route";

/**
 * Wave 7G Q1 (ingress level) — attribution at the door (G-8, spec P-1/P-10).
 *
 * There is one shared `/api/webhooks/xendit` URL and one shared
 * `/api/webhooks/stripe` URL for every tenant, and the connection→organization
 * mapping that exists in the schema (`PaymentProviderConnection.organizationId`,
 * `RuntimeConnection.organizationId`) is keyed by `connectionId`, which the
 * provider callback does not carry. So an inbound event's tenant **cannot be
 * determined at the door today** — that is named debt (D-30), not a licence:
 *
 *   - the event must NOT default to the demo organization (that would hand the
 *     demo tenant another merchant's provider payload, and hand an attacker a
 *     writable tenant);
 *   - it must NOT become visible to every tenant (today's shape: one shared
 *     process-wide log);
 *   - it must stay in a dedicated unattributed partition that no tenant read can
 *     see, while still deduping against a provider retry.
 *
 * These tests exercise the real routes end to end (no token is configured in the
 * test env, so the dev pass-through verification path applies — signature
 * verification itself is covered by `route.auth.test.ts`, which must stay green
 * unchanged).
 *
 * RED on `6c104ab`: `listWebhooks()` takes no tenant, so the assertions below
 * cannot even be written against the current API.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__kineticTxStore = undefined;
  g.__kineticWebhooksStore = undefined;
}

beforeEach(resetStores);

function xendit(body: string, headers: Record<string, string> = {}) {
  return postXendit(
    new Request("http://localhost/api/webhooks/xendit", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
}

function stripe(body: string) {
  return postStripe(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

/** A valid Xendit-shaped callback with a caller-chosen event id. The durable
 * WebhookDelivery store is module-cached (not on globalThis), so every test
 * must use its own id — a shared id would dedupe across tests. */
function validPayload(eventId: string) {
  return JSON.stringify({
    id: eventId,
    event: "payment.succeeded",
    data: { id: `txn_${eventId}`, status: "settle", amount: 5_000_000 },
  });
}

describe("POST /api/webhooks/* — attribution at the door", () => {
  it("accepts the callback and answers 200, exactly as before", async () => {
    const res = await xendit(validPayload("evt_door_accept"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: "payment.succeeded" });
  });

  it("an unattributable callback is invisible to every tenant, including demo", async () => {
    await xendit(validPayload("evt_door_invisible"));

    for (const ctx of [ctxA, ctxB, ctxDemo]) {
      const page = listWebhooks(ctx, { q: "evt_door_invisible", pageSize: 100 });
      expect(page.total, `tenant ${ctx.organizationId} must not see the door event`).toBe(0);
    }
    // The row exists — it is quarantined, not dropped.
    expect(listWebhooks(ctxDemo, { pageSize: 100 }).rows.some((e) => e.eventId === "evt_door_invisible")).toBe(false);
  });

  it("the door event never lands in the demo tenant's partition", async () => {
    await xendit(validPayload("evt_door_demo"));

    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { eventId: string }[] }> };
    };
    const tenants = g.__kineticWebhooksStore?.tenants ?? new Map<string, { events: { eventId: string }[] }>();
    expect(tenants.has(UNATTRIBUTED_ORGANIZATION_ID)).toBe(true);
    expect(tenants.get(UNATTRIBUTED_ORGANIZATION_ID)?.events.map((e) => e.eventId)).toContain("evt_door_demo");
    expect(tenants.get(DEFAULT_DEMO_ORG)?.events.map((e) => e.eventId) ?? []).not.toContain("evt_door_demo");
  });

  it("a provider retry still dedupes at the door", async () => {
    const retryBody = validPayload("evt_door_retry");
    const first = await xendit(retryBody);
    expect((await first.json()).deduped).toBeUndefined();

    const second = await xendit(retryBody);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, deduped: true });

    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { eventId: string; status: string }[] }> };
    };
    const door = g.__kineticWebhooksStore?.tenants?.get(UNATTRIBUTED_ORGANIZATION_ID)?.events ?? [];
    expect(door.filter((e) => e.eventId === "evt_door_retry")).toHaveLength(2);
    expect(door.some((e) => e.status === "DUPLICATED")).toBe(true);
  });

  it("a rejected callback is recorded without inventing a tenant", async () => {
    const res = await xendit("{not json");
    expect(res.status).toBe(400);

    // A and B have no seed, so they see zero rejections. Demo seeds two of its
    // own rejected callbacks — what the door must NOT do is add a third or make
    // the door's rejection visible to any tenant.
    expect(listWebhooks(ctxA, { status: "REJECTED", pageSize: 100 }).total).toBe(0);
    expect(listWebhooks(ctxB, { status: "REJECTED", pageSize: 100 }).total).toBe(0);
    const demoRejected = listWebhooks(ctxDemo, { status: "REJECTED", pageSize: 100 });
    expect(demoRejected.rows.some((e) => typeof e.payload === "string" && e.payload.includes("not json"))).toBe(false);
    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { status: string }[] }> };
    };
    const door = g.__kineticWebhooksStore?.tenants?.get(UNATTRIBUTED_ORGANIZATION_ID)?.events ?? [];
    expect(door.some((e) => e.status === "REJECTED")).toBe(true);
  });

  it("the stripe ingress behaves identically", async () => {
    const res = await stripe(JSON.stringify({ id: "evt_door_stripe", type: "payment_intent.succeeded", created: 1_700_000_000 }));
    expect(res.status).toBe(200);

    for (const ctx of [ctxA, ctxB, ctxDemo]) {
      expect(listWebhooks(ctx, { q: "evt_door_stripe", pageSize: 100 }).total).toBe(0);
    }
    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { eventId: string; source: string }[] }> };
    };
    const door = g.__kineticWebhooksStore?.tenants?.get(UNATTRIBUTED_ORGANIZATION_ID)?.events ?? [];
    expect(door.some((e) => e.eventId === "evt_door_stripe" && e.source === "stripe")).toBe(true);
  });

  it("a tenant-scoped read cannot reach a door event by id either", async () => {
    await xendit(validPayload("evt_door_byid"));
    const g = globalThis as unknown as {
      __kineticWebhooksStore?: { tenants?: Map<string, { events: { id: string }[] }> };
    };
    const doorId = g.__kineticWebhooksStore?.tenants?.get(UNATTRIBUTED_ORGANIZATION_ID)?.events[0]?.id;
    expect(doorId).toBeTruthy();

    expect(getWebhookEvent(ctxA, doorId!)).toBeNull();
    expect(getWebhookEvent(ctxDemo, doorId!)).toBeNull();
  });
});
