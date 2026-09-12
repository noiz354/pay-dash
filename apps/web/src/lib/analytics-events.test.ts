import { beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "./analytics";
import {
  ANALYTICS_EVENTS,
  isDeniedKey,
  registryOf,
  sanitizeProps,
  trackEvent,
  type AnalyticsEventKey,
} from "./analytics-events";

vi.mock("./analytics", () => ({ track: vi.fn() }));
const trackMock = vi.mocked(track);

beforeEach(() => {
  trackMock.mockClear();
});

// Wave 4 §6 — ANA-* completeness and the "no PII" contract.

describe("catalog completeness — spec §26 (ANA-001..014)", () => {
  it("covers every ANA registry id from the spec", () => {
    const registries = new Set<string>(Object.values(ANALYTICS_EVENTS).map((e) => e.registry));
    for (let i = 1; i <= 14; i += 1) {
      expect(registries.has(`ANA-${String(i).padStart(3, "0")}`), `ANA-${String(i).padStart(3, "0")} missing`).toBe(true);
    }
  });

  it.each([
    "journey_started",
    "journey_completed",
    "mutation_failed",
    "permission_denied",
    "stale_seen",
    "conflict_recovered",
    "sla_breached",
    "sla_filter_applied",
  ])("emits the Wave 4 event %s", (event) => {
    expect(ANALYTICS_EVENTS).toHaveProperty(event);
    expect(ANALYTICS_EVENTS[event as AnalyticsEventKey].name).toBe(event);
  });

  it("gives every event a stable name and a non-empty allowlist", () => {
    for (const [key, spec] of Object.entries(ANALYTICS_EVENTS)) {
      expect(spec.name, key).toBeTruthy();
      expect(spec.registry, key).toBeTruthy();
      expect(spec.props.length, `${key} has no declared props`).toBeGreaterThan(0);
      // No allowlist may itself contain a PII key.
      for (const prop of spec.props) expect(isDeniedKey(prop), `${key} allows ${prop}`).toBe(false);
    }
  });

  it("exposes registry ids for traceability", () => {
    expect(registryOf("sla_breached")).toBe("W4-SLA");
    expect(registryOf("sla_filter_applied")).toBe("W4-SLA");
    expect(registryOf("palette_invoked")).toBe("ANA-010");
  });
});

describe("sanitizeProps — allowlist enforcement", () => {
  it("drops keys the event did not declare", () => {
    const out = sanitizeProps(ANALYTICS_EVENTS.sla_breached, {
      entity_type: "payout_batch",
      band: "CRITICAL",
      // Not declared on this event:
      amount: 1234,
      href: "/payouts",
    });
    expect(out).toEqual({ entity_type: "payout_batch", band: "CRITICAL" });
  });

  it("keeps declared keys and strips undefined", () => {
    const out = sanitizeProps(ANALYTICS_EVENTS.payout_approved, {
      batch_id: "batch_1",
      role: "FINANCE_ADMIN",
      recipient_count: 3,
      jrn: undefined,
    });
    expect(out).toEqual({ batch_id: "batch_1", role: "FINANCE_ADMIN", recipient_count: 3 });
  });

  it("returns an empty object when no props are given", () => {
    expect(sanitizeProps(ANALYTICS_EVENTS.nav_used)).toEqual({});
  });
});

describe("PII redaction — the contract Wave 4 §6 requires", () => {
  it("drops PII-bearing keys by name even if a caller declares them", () => {
    // A hand-rolled spec could still allowlist `email`; the deny list is the
    // second line of defence and must win.
    const spec = { name: "test", registry: "TEST", props: ["email", "customer_name", "account_number", "token", "band"] };
    const out = sanitizeProps(spec, {
      email: "dinda@acme.co.id",
      customer_name: "Dinda",
      account_number: "1234567890",
      token: "sk_live_abc",
      band: "OVERDUE",
    });
    expect(out).toEqual({ band: "OVERDUE" });
  });

  it("is case-insensitive about denied keys", () => {
    expect(isDeniedKey("Email")).toBe(true);
    expect(isDeniedKey("API_KEY")).toBe(true);
    expect(isDeniedKey("band")).toBe(false);
  });

  it("redacts PII-shaped values hiding under an innocuous key", () => {
    const spec = { name: "test", registry: "TEST", props: ["entity_type"] };
    expect(sanitizeProps(spec, { entity_type: "sarah.chen@example.com" })).toEqual({});
    expect(sanitizeProps(spec, { entity_type: "4111 1111 1111 1111" })).toEqual({});
    expect(sanitizeProps(spec, { entity_type: "+62 812 3456 7890" })).toEqual({});
    expect(sanitizeProps(spec, { entity_type: "1234567890123456" })).toEqual({});
    // A legitimate value survives.
    expect(sanitizeProps(spec, { entity_type: "payout_batch" })).toEqual({ entity_type: "payout_batch" });
  });

  it("refuses long free text (a payload dump is not an analytics prop)", () => {
    const spec = { name: "test", registry: "TEST", props: ["entity_type"] };
    expect(sanitizeProps(spec, { entity_type: "x".repeat(200) })).toEqual({});
  });

  it("never transmits a raw palette query — only its length", () => {
    const spec = ANALYTICS_EVENTS.palette_invoked;
    expect(spec.props).toContain("query_length");
    expect(spec.props).not.toContain("query");
    // Even if a caller tries, `query` is on the global deny list.
    expect(isDeniedKey("query")).toBe(true);
    expect(sanitizeProps(spec, { query: "sarah.chen@example.com", query_length: 20 })).toEqual({ query_length: 20 });
  });

  it("never transmits a raw search term — only its length", () => {
    expect(ANALYTICS_EVENTS.search_performed.props).toContain("query_length");
    expect(isDeniedKey("q")).toBe(true);
    expect(isDeniedKey("search")).toBe(true);
  });
});

describe("trackEvent — emission", () => {
  it("sends the catalogued name plus the registry id", () => {
    trackEvent("sla_breached", { entity_type: "payout_batch", band: "CRITICAL", age_sec: 90000, sla_sec: 14400 });
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [name, props] = trackMock.mock.calls[0];
    expect(name).toBe("sla_breached");
    expect(props).toMatchObject({ entity_type: "payout_batch", band: "CRITICAL", registry: "W4-SLA" });
  });

  it("attaches the registry id to every event for funnel traceability", () => {
    trackEvent("journey_completed", { journey: "payout_approval", outcome: "approved" });
    expect(trackMock.mock.calls[0][1]).toMatchObject({ registry: "W4-JRN" });
  });

  it("emits nothing extra when props are all denied", () => {
    trackEvent("permission_denied", { email: "a@b.co" } as never);
    const [, props] = trackMock.mock.calls[0];
    expect(props).toEqual({ registry: "W4-AUTHZ" });
  });

  it("carries the cross-role journey props needed for handoff analytics", () => {
    trackEvent("journey_started", {
      journey: "refund_approval",
      from_role: "FINANCE_OPERATOR",
      to_role: "FINANCE_ADMIN",
      entity_type: "refund",
    });
    expect(trackMock.mock.calls[0][1]).toMatchObject({
      journey: "refund_approval",
      from_role: "FINANCE_OPERATOR",
      to_role: "FINANCE_ADMIN",
    });
  });

  it("carries conflict recovery and stale-visibility props", () => {
    trackEvent("conflict_recovered", { entity_type: "payout_batch", resolution: "retry", version_delta: 2 });
    expect(trackMock.mock.calls[0][1]).toMatchObject({ resolution: "retry", version_delta: 2 });

    trackMock.mockClear();
    trackEvent("stale_seen", { age_sec: 73, scr: "SCR-004", surface: "command_center" });
    expect(trackMock.mock.calls[0][1]).toMatchObject({ age_sec: 73, surface: "command_center" });
  });

  it("carries mutation failure diagnostics without leaking the payload", () => {
    trackEvent("mutation_failed", { mutation: "approveRefund", reason: "SAME_ACTOR", retryable: false });
    const [, props] = trackMock.mock.calls[0];
    expect(props).toMatchObject({ mutation: "approveRefund", reason: "SAME_ACTOR", retryable: false });
    expect(props).not.toHaveProperty("payload");
  });
});
