// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import {
  addIpAllowEntry,
  countSettingsTenants,
  createApiKey,
  getApiKey,
  getDeveloperSettings,
  getMerchantProfile,
  getNotificationSettings,
  getSettingsOverview,
  listApiKeys,
  removeIpAllowEntry,
  revokeApiKey,
  rollApiKey,
  setDeveloperToggle,
  setNotificationChannel,
  soleSettingsOrganizationId,
  updateMerchantProfile,
  updateNotificationTopic,
} from "./settings";

/**
 * Wave 7F Q1 — Settings tenant isolation, target-API tests (F-6..F-8, F-13b).
 *
 * Invariant: **Org A cannot read or overwrite the profile, notification
 * preferences, API keys or developer settings of Org B.** Two of these are worse
 * than display bugs:
 *
 *   • `listApiKeys` is a **secret surface** — enumerating another tenant's keys
 *     leaks names, environments, scopes and masked secrets (spec P-4). A
 *     plaintext secret is returned exactly once at creation and must never
 *     resurface in another tenant's answer.
 *   • `updateMerchantProfile` is a **write on the tenant's legal identity**
 *     (legal name, tax id, statement descriptor). F-13b pins that the tenant
 *     check runs before the write, so a foreign update leaves the target
 *     byte-identical.
 *
 * Seeded topic ids (`successful_charges`, …) and seeded key ids (`key_live_main`)
 * are the same strings in every tenant, so — as with 7D's colliding invoice
 * month — isolation is the composite key `(organizationId, id)`, not id
 * uniqueness.
 *
 * RED on `f7cb1e2`: `settings.ts` accepts no tenant at all (P-3, P-4) — one
 * process-wide `{ merchant, notifications, keys, developer }` record.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticSettingsStore;
  __resetTenantDenials();
}

beforeEach(() => {
  resetStores();
});

describe("F-6 merchant profile is per tenant", () => {
  it("each tenant reads its own profile, and the prototype profile is the demo tenant's", async () => {
    const demo = await getMerchantProfile(ctxDemo);
    expect(demo.legalName).toBe("Acme Corporation LLC");
    expect(demo.taxId).toBe("12-3456789");

    // A tenant with no saved profile gets the defaults for *its own* partition,
    // never a neighbour's saved values.
    await updateMerchantProfile(ctxA, { legalName: "Alpha PT", taxId: "11-2223334" });
    expect((await getMerchantProfile(ctxA)).legalName).toBe("Alpha PT");
    expect((await getMerchantProfile(ctxB)).legalName).not.toBe("Alpha PT");
    expect((await getMerchantProfile(ctxDemo)).legalName).toBe("Acme Corporation LLC");
  });

  it("F-13b order pin — a foreign profile update throws and leaves the target untouched", async () => {
    await updateMerchantProfile(ctxB, { legalName: "Beta PT", taxId: "99-8887776", statementDescriptor: "BETA" });
    const before = await getMerchantProfile(ctxB);

    await expect(
      updateMerchantProfile(ctxA, { legalName: "Hijacked", taxId: "00-0000000" }),
    ).resolves.toBeDefined(); // A's own write is fine…
    // …but there is no way to address B's profile: the input carries no tenant,
    // the context does. B is byte-identical.
    expect(await getMerchantProfile(ctxB)).toEqual(before);
    expect((await getMerchantProfile(ctxB)).legalName).toBe("Beta PT");

    // And A's write landed in A only.
    expect((await getMerchantProfile(ctxA)).legalName).toBe("Hijacked");
    expect((await getMerchantProfile(ctxDemo)).legalName).toBe("Acme Corporation LLC");
  });

  it("the returned profile is a copy — mutating it does not reach the store", async () => {
    const profile = await getMerchantProfile(ctxA);
    profile.legalName = "Tampered";
    expect((await getMerchantProfile(ctxA)).legalName).not.toBe("Tampered");
  });
});

describe("F-7 notification settings are per tenant", () => {
  it("a channel toggle in A does not toggle B", async () => {
    await setNotificationChannel(ctxA, "sms", false);
    expect((await getNotificationSettings(ctxA)).channels.sms).toBe(false);
    expect((await getNotificationSettings(ctxB)).channels.sms).toBe(true);
    expect((await getNotificationSettings(ctxDemo)).channels.sms).toBe(true);
  });

  it("a seeded topic id is a composite key: muting A's topic leaves B's alone", async () => {
    const updated = await updateNotificationTopic(ctxA, { topicId: "successful_charges", digest: "off" });
    expect(updated?.digest).toBe("off");

    const topicA = (await getNotificationSettings(ctxA)).topics.find((t) => t.id === "successful_charges")!;
    const topicB = (await getNotificationSettings(ctxB)).topics.find((t) => t.id === "successful_charges")!;
    expect(topicA.digest).toBe("off");
    expect(topicB.digest).toBe("daily");
  });

  it("the critical-topic guard still fires inside a tenant", async () => {
    await expect(
      updateNotificationTopic(ctxA, { topicId: "disputes", digest: "off" }),
    ).rejects.toThrow(/critical alert/i);
    // Unknown topic id ⇒ null (not a throw), same as before.
    expect(await updateNotificationTopic(ctxA, { topicId: "nope" })).toBeNull();
  });

  it("the settings overview aggregates one tenant", async () => {
    await updateNotificationTopic(ctxA, { topicId: "payouts", digest: "off" });
    const overviewA = await getSettingsOverview(ctxA);
    const overviewB = await getSettingsOverview(ctxB);
    const notificationsA = overviewA.find((s) => s.id === "notifications")!;
    const notificationsB = overviewB.find((s) => s.id === "notifications")!;
    expect(notificationsA.status).toMatch(/1 topic muted/);
    expect(notificationsB.status).toBe("All topics active");
  });
});

describe("F-8 API keys are tenant-bound secrets", () => {
  it("A never sees B's keys — not even their metadata", async () => {
    const created = await createApiKey(ctxB, { name: "Beta Secret Key", environment: "LIVE", scopes: ["read", "write"] });
    expect(created.secret).toMatch(/^sk_live_/);
    expect(created.key.maskedSecret).not.toContain(created.secret.slice(8, -4));

    const keysA = await listApiKeys(ctxA);
    const serialized = JSON.stringify(keysA);
    expect(keysA.every((k) => k.organizationId === ORG_A)).toBe(true);
    expect(serialized).not.toContain("Beta Secret Key");
    expect(serialized).not.toContain(created.key.id);
    // The plaintext secret appears nowhere but the creation result.
    expect(serialized).not.toContain(created.secret);
    expect(JSON.stringify(await listApiKeys(ctxDemo))).not.toContain(created.secret);

    // B still sees its own.
    expect((await listApiKeys(ctxB)).some((k) => k.id === created.key.id)).toBe(true);
  });

  it("the environment filter narrows inside the tenant only", async () => {
    await createApiKey(ctxA, { name: "Alpha Test", environment: "TEST", scopes: ["read"] });
    const liveA = await listApiKeys(ctxA, "LIVE");
    expect(liveA.every((k) => k.environment === "LIVE")).toBe(true);
    expect(liveA.every((k) => k.organizationId === ORG_A)).toBe(true);
  });

  it("getApiKey answers null for a foreign key id", async () => {
    const { key } = await createApiKey(ctxB, { name: "Beta Key", environment: "TEST", scopes: ["read"] });
    expect((await getApiKey(ctxB, key.id))?.name).toBe("Beta Key");
    expect(await getApiKey(ctxA, key.id)).toBeNull();
    expect(await getApiKey(ctxA, "key_live_main")).toBeNull(); // demo-seeded key
    expect((await getApiKey(ctxDemo, "key_live_main"))?.name).toBe("Production Main");
  });

  it("revoke and roll refuse a foreign key and leave it active", async () => {
    const { key } = await createApiKey(ctxB, { name: "Beta Key", environment: "LIVE", scopes: ["read"] });

    await expect(revokeApiKey(ctxA, key.id)).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(rollApiKey(ctxA, key.id)).rejects.toBeInstanceOf(TenantIsolationError);

    const still = await getApiKey(ctxB, key.id);
    expect(still?.status).toBe("ACTIVE");
    // A's attempt did not mint a replacement key in any tenant.
    expect((await listApiKeys(ctxB)).filter((k) => k.rolledFrom === key.id)).toHaveLength(0);
    expect((await listApiKeys(ctxA)).filter((k) => k.rolledFrom === key.id)).toHaveLength(0);

    const denials = listTenantDenials().filter((d) => d.surface.startsWith("server/data/settings."));
    expect(denials.length).toBeGreaterThan(0);
    expect(denials[0]!.actorOrg).toBe(ORG_A);
    expect(denials[0]!.requestedOrg).toBe(ORG_B);
    expect(JSON.stringify(denials)).not.toMatch(/Beta Key|sk_live_/i);
  });

  it("own revoke and roll still work, and the secret is revealed once", async () => {
    const { key } = await createApiKey(ctxA, { name: "Alpha Key", environment: "LIVE", scopes: ["read"] });
    const rolled = await rollApiKey(ctxA, key.id);
    expect(rolled?.key.rolledFrom).toBe(key.id);
    expect(rolled?.secret).toMatch(/^sk_live_/);
    expect((await getApiKey(ctxA, key.id))?.status).toBe("REVOKED");
    await expect(revokeApiKey(ctxA, key.id)).rejects.toThrow(/already revoked/i);
    expect(await revokeApiKey(ctxA, "key_nope")).toBeNull();
  });
});

describe("F-8b developer settings and the IP allowlist are per tenant", () => {
  it("the sandbox toggle is per tenant", async () => {
    await setDeveloperToggle(ctxA, "sandboxMode", false);
    expect((await getDeveloperSettings(ctxA)).sandboxMode).toBe(false);
    expect((await getDeveloperSettings(ctxB)).sandboxMode).toBe(true);
  });

  it("the same IP may be allowlisted in two tenants (uniqueness is per tenant)", async () => {
    const inA = await addIpAllowEntry(ctxA, "203.0.113.99", "Alpha office");
    const inB = await addIpAllowEntry(ctxB, "203.0.113.99", "Beta office");
    expect(inA.id).not.toBe(inB.id);
    expect((await getDeveloperSettings(ctxA)).ipAllowlist.map((e) => e.label)).toContain("Alpha office");
    expect((await getDeveloperSettings(ctxB)).ipAllowlist.map((e) => e.label)).toContain("Beta office");
    expect((await getDeveloperSettings(ctxA)).ipAllowlist.map((e) => e.label)).not.toContain("Beta office");
    // A duplicate inside the same tenant is still refused.
    await expect(addIpAllowEntry(ctxA, "203.0.113.99", "Again")).rejects.toThrow(/already on the allowlist/i);
  });

  it("removing a foreign entry is refused and removes nothing", async () => {
    const entry = await addIpAllowEntry(ctxB, "198.51.100.7", "Beta CI");
    await expect(removeIpAllowEntry(ctxA, entry.id)).rejects.toBeInstanceOf(TenantIsolationError);
    expect((await getDeveloperSettings(ctxB)).ipAllowlist.some((e) => e.id === entry.id)).toBe(true);
    expect(await removeIpAllowEntry(ctxB, entry.id)).toBe(true);
    expect(await removeIpAllowEntry(ctxB, entry.id)).toBe(false);
  });
});

describe("F-12d probes, store privacy and no-context refusal", () => {
  it("the tenancy probes answer metadata, never values", async () => {
    // The demo tenant is seeded eagerly, so it is tenant #1 — not #0 (the 7C
    // seed rule). A partition counts once it *holds* something.
    await getMerchantProfile(ctxDemo);
    expect(countSettingsTenants()).toBe(1);
    expect(soleSettingsOrganizationId()).toBe(DEFAULT_DEMO_ORG);

    await createApiKey(ctxA, { name: "Alpha Key", environment: "TEST", scopes: ["read"] });
    expect(countSettingsTenants()).toBe(2);
    // Two tenants ⇒ there is no "the" settings record, which is exactly the
    // condition the quarantine gate refuses to guess about.
    expect(soleSettingsOrganizationId()).toBeNull();

    await createApiKey(ctxB, { name: "Beta Key", environment: "TEST", scopes: ["read"] });
    expect(countSettingsTenants()).toBe(3);
    expect(soleSettingsOrganizationId()).toBeNull();
    // A probe answers a question about the store, never a value from it.
    expect(JSON.stringify([countSettingsTenants(), soleSettingsOrganizationId()])).not.toMatch(
      /Alpha Key|Beta Key|sk_test_|sk_live_|12-3456789/,
    );
  });

  it("the store slot is partitioned, not one process-wide record", async () => {
    await getMerchantProfile(ctxA);
    const slot = (
      globalThis as unknown as { __kineticSettingsStore?: { merchant?: unknown; keys?: unknown } }
    ).__kineticSettingsStore;
    expect(slot?.merchant).toBeUndefined();
    expect(slot?.keys).toBeUndefined();
  });

  it("every settings entry point refuses a missing ctx", async () => {
    // @ts-expect-error — a missing ctx must not be callable where it counts
    await expect(getMerchantProfile()).rejects.toThrow();
    // @ts-expect-error — same for the secret surface
    await expect(listApiKeys()).rejects.toThrow();
    // @ts-expect-error — and for the identity write
    await expect(updateMerchantProfile({ legalName: "x" })).rejects.toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });
});
