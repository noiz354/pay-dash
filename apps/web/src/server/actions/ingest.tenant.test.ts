// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { __resetTenantDenials } from "@/server/services/tenant-denial";
import { addBlocklist, getBlocklistEntry, listBlocklist } from "@/server/data/blocklist";
import { createLink, getLink, listLinks } from "@/server/data/links";
import { getRiskOverview, patchDraft } from "@/server/data/risk";
import { getWebhookEvent, listWebhooks, recordInbound, UNATTRIBUTED_ORGANIZATION_ID } from "@/server/data/webhooks";
import { getLedgerRows } from "@/server/data/transactions";
import { addBlocklistAction, removeBlocklistAction } from "./blocklist";
import { createPaymentLinkAction, expirePaymentLinkAction, payPaymentLinkAction } from "./links";
import {
  deployRiskAction,
  discardDraftAction,
  saveVolumeDraftAction,
  setVolumeEnabledAction,
  toggleRuleAction,
} from "./risk";
import { replayWebhookAction, simulateWebhookAction } from "./webhooks";

/**
 * Wave 7G Q4.3 — action-level tenant boundary tests for ingest & integrity.
 *
 * The DAL tests prove the repository predicates; these prove the server-action
 * seam resolves the tenant from the session *before* touching a store, and that
 * a cross-tenant id answers exactly like an unknown id (no enumeration oracle on
 * the wire).
 *
 * These actions are also the wave's authorization finding, and it is the same
 * class 7F reported: at `6c104ab` **11 of the 12 exported ingest actions had no
 * authorization at all**. Any caller who could POST a form could extend or prune
 * a merchant's fraud blocklist, rewrite and *deploy* its live velocity limits,
 * mint payment links on its behalf, close them, or inject synthetic provider
 * callbacks into its webhook log. Only `payPaymentLinkAction` was authorized
 * (Wave 7A gave it `money_in.create` because it credits the ledger).
 *
 * Permissions are taken from the existing catalog in
 * `domain/organization/roles.ts`, never invented: `settings.manage` for the
 * fraud/risk administration surfaces, `money_in.create` for payment links, and
 * `provider.connect.test` for the TEST MODE callback simulator (the developer
 * capability it actually is). The catalog has no `fraud.manage`/`risk.manage` —
 * recorded as D-31 rather than silently widening a role.
 *
 * RED on `6c104ab`: no ctx, no permission, and process-wide stores behind them.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The hosted-payment path needs a provider connection; without one it returns
// null and the action keeps the local link. Mocked so the test does not depend
// on Prisma engine binaries (unavailable in this sandbox).
vi.mock("@/server/payment-flows/money-in-runtime", () => ({
  createMoneyInRuntime: async () => ({ executeHostedPayment: async () => null }),
}));

const requireStrict = vi.hoisted(() => vi.fn());
const resolveSession = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: resolveSession,
  requireStrictOrgContext: requireStrict,
  requireOrgContext: requireStrict,
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function asOrg(organizationId: string, roles: string[] = ["OWNER"], userId: string | null = "user_a") {
  const ctx = { organizationId, roles, userId, isDemoFallback: false };
  requireStrict.mockResolvedValue(ctx);
  resolveSession.mockResolvedValue(ctx);
}

function noSession() {
  const err = new OrgContextError("FORBIDDEN", "Authentication required — please sign in.");
  requireStrict.mockRejectedValue(err);
  resolveSession.mockRejectedValue(err);
}

function forbiddenRole() {
  const err = new OrgContextError("FORBIDDEN", "Your role cannot perform this action.");
  requireStrict.mockRejectedValue(err);
  resolveSession.mockResolvedValue({ organizationId: ORG_A, roles: ["ANALYST"], userId: "user_a", isDemoFallback: false });
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function rawPartitions(slot: string): Map<string, unknown> {
  const g = globalThis as unknown as Record<string, { tenants?: Map<string, unknown> }>;
  return g[slot]?.tenants ?? new Map();
}

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticBlocklistStore;
  delete g.__kineticLinksStore;
  delete g.__kineticRiskStore;
  delete g.__kineticWebhooksStore;
  delete g.__kineticTxStore;
  __resetTenantDenials();
  asOrg(ORG_A);
});

const LINK_FORM = { kind: "single", payerEmail: "ap@alpha.test", amount: "250000", items: "[]", expiresIn: "" };

describe("blocklist actions — tenant-bound, authorized", () => {
  it("addBlocklistAction binds the entry to the session tenant", async () => {
    const out = await addBlocklistAction(undefined, form({ type: "IP", value: "198.51.100.7", reason: "KNOWN_MALICIOUS" }));
    expect(out.status).toBe("success");

    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(1);
    expect((await listBlocklist(ctxB, { pageSize: 100 })).total).toBe(0);
    expect(requireStrict).toHaveBeenCalledWith("settings.manage", expect.anything());
  });

  it("addBlocklistAction fails closed with no session, before any store write", async () => {
    noSession();
    const out = await addBlocklistAction(undefined, form({ type: "IP", value: "198.51.100.8", reason: "KNOWN_MALICIOUS" }));
    expect(out.status).toBe("error");
    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(0);
    expect((await listBlocklist(ctxDemo, { q: "198.51.100.8", pageSize: 100 })).total).toBe(0);
  });

  it("a role without settings.manage is refused (least privilege, not invention)", async () => {
    forbiddenRole();
    const out = await addBlocklistAction(undefined, form({ type: "IP", value: "198.51.100.9", reason: "KNOWN_MALICIOUS" }));
    expect(out.status).toBe("error");
    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(0);
  });

  it("validation still runs first: a bad value is a field error, not an auth error", async () => {
    noSession();
    const out = await addBlocklistAction(undefined, form({ type: "IP", value: "not-an-ip", reason: "KNOWN_MALICIOUS" }));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/valid IPv4|valid i|Enter a valid/i);
  });

  it("removeBlocklistAction answers a foreign id exactly like an unknown id", async () => {
    const b = await addBlocklist(ctxB, { type: "IP", value: "203.0.113.99", reason: "CHARGEBACK_ABUSE" });
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const foreign = await removeBlocklistAction(undefined, form({ id: b.entry.id }));
    const unknown = await removeBlocklistAction(undefined, form({ id: "blk_nonsense" }));

    expect(foreign.status).toBe("error");
    expect(foreign.message).toBe(unknown.message);
    // B's fraud control survives the attempted prune.
    expect(await getBlocklistEntry(ctxB, b.entry.id)).not.toBeNull();
  });

  it("removeBlocklistAction removes the caller's own entry", async () => {
    await addBlocklist(ctxA, { type: "IP", value: "198.51.100.7", reason: "KNOWN_MALICIOUS" });
    const own = (await listBlocklist(ctxA, { pageSize: 10 })).rows[0]!;

    const out = await removeBlocklistAction(undefined, form({ id: own.id }));
    expect(out.status).toBe("success");
    expect((await listBlocklist(ctxA, { pageSize: 100 })).total).toBe(0);
  });
});

describe("payment-link actions — tenant-bound, authorized", () => {
  it("createPaymentLinkAction binds the new link to the session tenant", async () => {
    const out = await createPaymentLinkAction(undefined, form(LINK_FORM));
    expect(out.status).toBe("success");
    const id = out.data?.id;
    expect(id).toBeTruthy();

    expect(getLink(ctxA, id!)).not.toBeNull();
    expect(getLink(ctxB, id!)).toBeNull();
    expect(requireStrict).toHaveBeenCalledWith("money_in.create", expect.anything());
  });

  it("createPaymentLinkAction fails closed with no session", async () => {
    noSession();
    const out = await createPaymentLinkAction(undefined, form(LINK_FORM));
    expect(out.status).toBe("error");
    expect((await (async () => listLinks(ctxA, { pageSize: 100 }))()).total).toBe(0);
  });

  it("validation runs before authorization: an amount below the floor is a field error", async () => {
    noSession();
    const out = await createPaymentLinkAction(undefined, form({ ...LINK_FORM, amount: "500" }));
    expect(out.status).toBe("error");
    expect(out.fieldErrors?.amount?.[0]).toMatch(/Rp 10,000|Enter an amount/i);
  });

  it("expirePaymentLinkAction refuses a foreign link with the uniform not-found", async () => {
    const b = createLink(ctxB, { kind: "single", items: [{ label: "Beta", amount: 900_000 }], payerEmail: "ap@beta.test", expiresAt: null });

    const foreign = await expirePaymentLinkAction(undefined, form({ id: b.id }));
    const unknown = await expirePaymentLinkAction(undefined, form({ id: "plink_nonsense" }));

    expect(foreign.status).toBe("error");
    expect(foreign.message).toBe(unknown.message);
    expect(getLink(ctxB, b.id)?.status).toBe("OPEN");
  });

  it("expirePaymentLinkAction closes the caller's own link", async () => {
    const a = createLink(ctxA, { kind: "single", items: [{ label: "Alpha", amount: 250_000 }], payerEmail: "ap@alpha.test", expiresAt: null });
    const out = await expirePaymentLinkAction(undefined, form({ id: a.id }));
    expect(out.status).toBe("success");
    expect(getLink(ctxA, a.id)?.status).toBe("CANCELLED");
  });

  it("payPaymentLinkAction cannot pay a foreign link into the caller's ledger", async () => {
    const b = createLink(ctxB, { kind: "single", items: [{ label: "Beta", amount: 900_000 }], payerEmail: "ap@beta.test", expiresAt: null });

    const foreign = await payPaymentLinkAction(undefined, form({ id: b.id }));
    const unknown = await payPaymentLinkAction(undefined, form({ id: "plink_nonsense" }));

    expect(foreign.status).toBe("error");
    expect(foreign.message).toBe(unknown.message);
    // The money-path assertion: nothing was credited anywhere.
    expect(getLedgerRows(ctxA)).toHaveLength(0);
    expect(getLedgerRows(ctxB)).toHaveLength(0);
    expect(getLink(ctxB, b.id)?.status).toBe("OPEN");
  });

  it("payPaymentLinkAction settles the caller's own link", async () => {
    const a = createLink(ctxA, { kind: "single", items: [{ label: "Alpha", amount: 250_000 }], payerEmail: "ap@alpha.test", expiresAt: null });
    const out = await payPaymentLinkAction(undefined, form({ id: a.id }));
    expect(out.status).toBe("success");
    expect(out.data?.total).toBe(250_000);
    expect(getLink(ctxA, a.id)?.status).toBe("PAID");
    expect(getLedgerRows(ctxA).some((t) => t.referenceId === a.id)).toBe(true);
    expect(getLedgerRows(ctxB)).toHaveLength(0);
  });
});

describe("risk actions — tenant-bound, authorized", () => {
  it("saveVolumeDraftAction drafts in the caller's own partition", async () => {
    const out = await saveVolumeDraftAction(undefined, form({ dailyVolumeLimit: "1000000", monthlyVolumeLimit: "9000000" }));
    expect(out.status).toBe("success");

    expect((await getRiskOverview(ctxA)).effective.dailyVolumeLimit).toBe(1_000_000);
    expect((await getRiskOverview(ctxB)).effective.dailyVolumeLimit).toBe(2_000_000_000);
    expect(requireStrict).toHaveBeenCalledWith("settings.manage", expect.anything());
  });

  it("saveVolumeDraftAction fails closed with no session, leaving no draft anywhere", async () => {
    noSession();
    const out = await saveVolumeDraftAction(undefined, form({ dailyVolumeLimit: "1000000", monthlyVolumeLimit: "9000000" }));
    expect(out.status).toBe("error");
    expect(rawPartitions("__kineticRiskStore").size).toBe(0);
  });

  it("validation runs first: a monthly cap below the daily cap is a field error", async () => {
    noSession();
    const out = await saveVolumeDraftAction(undefined, form({ dailyVolumeLimit: "9000000", monthlyVolumeLimit: "1000000" }));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/monthly cap/i);
  });

  it("setVolumeEnabledAction toggles only the caller's policy", async () => {
    const out = await setVolumeEnabledAction(undefined, form({ enabled: "false" }));
    expect(out.status).toBe("success");
    expect((await getRiskOverview(ctxA)).effective.volumeLimitsEnabled).toBe(false);
    expect((await getRiskOverview(ctxB)).effective.volumeLimitsEnabled).toBe(true);
  });

  it("toggleRuleAction answers an unknown rule with 'Rule not found.' and changes nothing", async () => {
    const out = await toggleRuleAction(undefined, form({ id: "rule_nonsense", enabled: "false" }));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/Rule not found/);
    expect((await getRiskOverview(ctxB)).draft).toBeNull();
  });

  it("deployRiskAction deploys the caller's draft and nobody else's", async () => {
    patchDraft(ctxB, { dailyVolumeLimit: 777 });
    await saveVolumeDraftAction(undefined, form({ dailyVolumeLimit: "1000000", monthlyVolumeLimit: "9000000" }));

    const out = await deployRiskAction(undefined, form({}));
    expect(out.status).toBe("success");
    expect((await getRiskOverview(ctxA)).deployed.dailyVolumeLimit).toBe(1_000_000);
    // B's pending draft is untouched by A's deployment.
    expect((await getRiskOverview(ctxB)).draft).not.toBeNull();
    expect((await getRiskOverview(ctxB)).deployed.dailyVolumeLimit).toBe(2_000_000_000);
  });

  it("discardDraftAction cannot discard another tenant's draft", async () => {
    patchDraft(ctxB, { dailyVolumeLimit: 777 });

    const out = await discardDraftAction(undefined, form({}));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/No draft to discard/);
    expect((await getRiskOverview(ctxB)).draft).not.toBeNull();
  });
});

describe("webhook actions — the simulator attributes to the caller, not to the door", () => {
  it("simulateWebhookAction records into the session tenant's own log", async () => {
    const out = await simulateWebhookAction(undefined, form({ event: "payment.succeeded", reference: "" }));
    expect(out.status).toBe("success");
    const id = out.data?.id;
    expect(id).toBeTruthy();

    expect(getWebhookEvent(ctxA, id!)).not.toBeNull();
    expect(getWebhookEvent(ctxB, id!)).toBeNull();
    // A session-driven simulation is attributable, so it must NOT land in the
    // unattributed door partition.
    expect(rawPartitions("__kineticWebhooksStore").has(UNATTRIBUTED_ORGANIZATION_ID)).toBe(false);
    expect(requireStrict).toHaveBeenCalledWith("provider.connect.test", expect.anything());
  });

  it("simulateWebhookAction fails closed with no session", async () => {
    noSession();
    const out = await simulateWebhookAction(undefined, form({ event: "payment.succeeded", reference: "" }));
    expect(out.status).toBe("error");
    // A has no seed, so its log stays empty. Demo seeds lazily on read, so the
    // honest assertion is that the failed simulation added nothing attributable
    // to the door or to demo — not that demo's own seed vanished.
    expect((await (async () => listWebhooks(ctxA, { pageSize: 100 }))()).total).toBe(0);
    expect(rawPartitions("__kineticWebhooksStore").has(UNATTRIBUTED_ORGANIZATION_ID)).toBe(false);
    expect(
      (await (async () => listWebhooks(ctxDemo, { pageSize: 100 }))()).rows.some(
        (e) => e.source === "simulate",
      ),
    ).toBe(false);
  });

  it("simulateWebhookAction validates the event type before it writes", async () => {
    const out = await simulateWebhookAction(undefined, form({ event: "not-an-event", reference: "" }));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/Pick an event type/);
  });

  it("replayWebhookAction answers a foreign event exactly like an unknown one", async () => {
    const b = recordInbound(ctxB, { eventId: "evt_beta_replay", type: "payment.succeeded", source: "xendit", payload: { id: "evt_beta_replay" } });

    const foreign = await replayWebhookAction(undefined, form({ id: b.event.id }));
    const unknown = await replayWebhookAction(undefined, form({ id: "whk_nonsense" }));

    expect(foreign.status).toBe("error");
    expect(foreign.message).toBe(unknown.message);
    expect(foreign.message).toMatch(/not found/i);
    // No replay row was created in A's log from B's event.
    expect((await (async () => listWebhooks(ctxA, { pageSize: 100 }))()).total).toBe(0);
  });

  it("replayWebhookAction replays the caller's own event as a duplicate", async () => {
    const a = recordInbound(ctxA, { eventId: "evt_alpha_replay", type: "payment.succeeded", source: "xendit", payload: { id: "evt_alpha_replay" } });

    const out = await replayWebhookAction(undefined, form({ id: a.event.id }));
    expect(out.status).toBe("success");
    expect((await (async () => listWebhooks(ctxA, { status: "DUPLICATED", pageSize: 100 }))()).total).toBe(1);
    expect((await (async () => listWebhooks(ctxB, { pageSize: 100 }))()).total).toBe(0);
  });
});
