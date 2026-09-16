// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/domain/organization/roles";
import { OrgContextError } from "@/server/services/org-context";
import { listWebhooks, recordInbound } from "@/server/data/webhooks";
import { replayWebhookAction, simulateWebhookAction } from "./webhooks";

/**
 * Audit finding S-02 — the TEST-MODE webhook tools wrote to the operational log
 * with no authorization.
 *
 * `simulateWebhookAction` injects a synthetic callback through the *shared*
 * inbound pipeline, so any caller who could reach it added fabricated
 * "payment.succeeded" events to the log that `/webhooks` and `/system` present
 * as operational data. That is finding R-07's harm — seeded rows
 * indistinguishable from real ones — but caused rather than merely displayed.
 * `replayWebhookAction` re-POSTs a previously received callback, re-running the
 * pipeline against a real payload.
 *
 * Gated behind `provider.connect.test`, the existing permission for exercising
 * an integration without moving money (OWNER and DEVELOPER). Both actions are
 * labelled TEST MODE in the source and neither is a merchant workflow, so a
 * provider-test privilege fits better than `settings.manage`.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

function asRole(roles: string[]) {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles,
    userId: "user_caller",
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function lackingPermission() {
  requireStrict.mockRejectedValue(
    new OrgContextError(
      "FORBIDDEN",
      "Actor is not authorized for provider.connect.test in org_alpha",
    ),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticWebhooksStore?: unknown }).__kineticWebhooksStore =
    undefined;
}

function eventCount() {
  return listWebhooks({ pageSize: 100 }).total;
}

function replayableEventId() {
  const row = listWebhooks({ pageSize: 100 }).rows.find((e) => e.status !== "REJECTED");
  return row?.id ?? "";
}

function simulateForm() {
  const fd = new FormData();
  fd.set("event", "payment.succeeded");
  fd.set("reference", "req_authz_probe");
  return fd;
}

function idForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
});

describe("S-02 — webhook simulation demands provider.connect.test", () => {
  it.each([
    { name: "simulateWebhookAction", run: () => simulateWebhookAction(undefined, simulateForm()) },
    {
      name: "replayWebhookAction",
      run: () => replayWebhookAction(undefined, idForm(replayableEventId())),
    },
  ])("$name authorizes provider.connect.test", async ({ run }) => {
    await run();
    expect(requireStrict).toHaveBeenCalledWith("provider.connect.test");
  });

  it("is held by the integration role and not by finance", () => {
    expect(hasPermission("DEVELOPER", "provider.connect.test")).toBe(true);
    expect(hasPermission("OWNER", "provider.connect.test")).toBe(true);
    expect(hasPermission("FINANCE_OPERATOR", "provider.connect.test")).toBe(false);
  });
});

describe("S-02 — a signed-out caller cannot write to the operational log", () => {
  it("refuses to inject a synthetic callback", async () => {
    const before = eventCount();
    signedOut();

    const state = await simulateWebhookAction(undefined, simulateForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to simulate webhooks/i);
    expect(eventCount()).toBe(before);
  });

  it("refuses to replay a real callback", async () => {
    const before = eventCount();
    const id = replayableEventId();
    expect(id).not.toBe("");
    signedOut();

    const state = await replayWebhookAction(undefined, idForm(id));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to simulate webhooks/i);
    expect(eventCount()).toBe(before);
  });
});

describe("S-02 — a caller without provider.connect.test cannot write to the log", () => {
  it("refuses to inject a synthetic callback", async () => {
    const before = eventCount();
    lackingPermission();

    const state = await simulateWebhookAction(undefined, simulateForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to simulate or replay webhooks/i);
    expect(eventCount()).toBe(before);
  });

  it("refuses to replay a real callback", async () => {
    const before = eventCount();
    lackingPermission();

    const state = await replayWebhookAction(undefined, idForm(replayableEventId()));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to simulate or replay webhooks/i);
    expect(eventCount()).toBe(before);
  });
});

describe("the denials above are attributable to the guard, not to a dead pipeline", () => {
  it("an authorized caller really does inject the event", async () => {
    const before = eventCount();
    asRole(["DEVELOPER"]);

    const state = await simulateWebhookAction(undefined, simulateForm());

    expect(state.status).toBe("success");
    // Either a new row, or the pipeline deduped it — both prove the write path
    // ran rather than being refused.
    expect(state.data).toBeDefined();
    expect(eventCount() >= before).toBe(true);
  });

  it("an authorized caller really does replay through the pipeline", async () => {
    // Seed a known event so the replay target is unambiguous.
    recordInbound({
      eventId: "evt_authz_replay_target",
      type: "payment.succeeded",
      payload: { id: "evt_authz_replay_target", event: "payment.succeeded" },
      source: "simulate",
    });
    const id = listWebhooks({ pageSize: 100 }).rows.find(
      (e) => e.eventId === "evt_authz_replay_target",
    )?.id;
    expect(id).toBeDefined();
    asRole(["DEVELOPER"]);

    const state = await replayWebhookAction(undefined, idForm(id!));

    expect(state.status).toBe("success");
    expect(state.data?.eventId).toBe("evt_authz_replay_target");
  });
});
