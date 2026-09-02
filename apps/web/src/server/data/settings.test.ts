import { beforeEach, describe, expect, it } from "vitest";
import {
  addIpAllowEntry,
  createApiKey,
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
  updateMerchantProfile,
  updateNotificationTopic,
} from "./settings";

// The store is a module-level singleton keyed on globalThis so it survives HMR;
// tests reset it the same way the invoice tests do.
beforeEach(() => {
  (globalThis as unknown as { __kineticSettingsStore?: unknown }).__kineticSettingsStore = undefined;
});

describe("merchant profile", () => {
  it("seeds the values the prototype hard-coded", async () => {
    const profile = await getMerchantProfile();
    expect(profile.legalName).toBe("Acme Corporation LLC");
    expect(profile.brandColor).toBe("#1a56db");
    expect(profile.updatedAt).toBeNull();
  });

  it("merges a partial update and stamps updatedAt", async () => {
    const updated = await updateMerchantProfile({ dba: "Acme Pay", brandColor: "#0f172a" });
    expect(updated.dba).toBe("Acme Pay");
    expect(updated.brandColor).toBe("#0f172a");
    expect(updated.legalName).toBe("Acme Corporation LLC");
    expect(updated.updatedAt).not.toBeNull();
    expect((await getMerchantProfile()).dba).toBe("Acme Pay");
  });

  it("ignores undefined fields instead of blanking them", async () => {
    await updateMerchantProfile({ city: undefined, state: "CA" });
    const profile = await getMerchantProfile();
    expect(profile.city).toBe("New York");
    expect(profile.state).toBe("CA");
  });
});

describe("notifications", () => {
  it("toggles a global channel", async () => {
    const settings = await setNotificationChannel("sms", false);
    expect(settings.channels.sms).toBe(false);
    expect(settings.channels.email).toBe(true);
    expect(settings.updatedAt).not.toBeNull();
  });

  it("updates only the fields provided on a topic", async () => {
    const topic = await updateNotificationTopic({ topicId: "payouts", digest: "off" });
    expect(topic?.digest).toBe("off");
    expect(topic?.dashboard).toBe(true);
  });

  it("returns null for an unknown topic", async () => {
    expect(await updateNotificationTopic({ topicId: "nope", digest: "off" })).toBeNull();
  });

  it("refuses to silence a critical topic", async () => {
    await expect(updateNotificationTopic({ topicId: "disputes", digest: "off" })).rejects.toThrow(
      /cannot be silenced/i
    );
    await expect(updateNotificationTopic({ topicId: "disputes", dashboard: false })).rejects.toThrow();
    const settings = await getNotificationSettings();
    expect(settings.topics.find((t) => t.id === "disputes")?.digest).toBe("instant");
  });
});

describe("api keys", () => {
  it("filters by environment and sorts newest first", async () => {
    const live = await listApiKeys("LIVE");
    expect(live).toHaveLength(2);
    expect(live[0].createdAt >= live[1].createdAt).toBe(true);
    expect(await listApiKeys("TEST")).toHaveLength(1);
  });

  it("returns the plaintext secret once and only stores a mask", async () => {
    const { key, secret } = await createApiKey({ name: "Checkout", environment: "TEST", scopes: ["read"] });
    expect(secret.startsWith("sk_test_")).toBe(true);
    expect(key.maskedSecret).toContain("•");
    expect(key.maskedSecret).not.toBe(secret);
    expect(key.maskedSecret.endsWith(secret.slice(-4))).toBe(true);
    const stored = (await listApiKeys()).find((k) => k.id === key.id);
    expect(JSON.stringify(stored)).not.toContain(secret);
  });

  it("defaults to the read scope when none are given", async () => {
    const { key } = await createApiKey({ name: "Empty", environment: "TEST", scopes: [] });
    expect(key.scopes).toEqual(["read"]);
  });

  it("revokes a key without deleting it, and refuses a double revoke", async () => {
    const before = (await listApiKeys()).length;
    const revoked = await revokeApiKey("key_live_main");
    expect(revoked?.status).toBe("REVOKED");
    expect((await listApiKeys()).length).toBe(before);
    await expect(revokeApiKey("key_live_main")).rejects.toThrow(/already revoked/i);
  });

  it("returns null when revoking an unknown key", async () => {
    expect(await revokeApiKey("key_nope")).toBeNull();
  });

  it("rolls a key: same name and scopes, old one revoked, new secret issued", async () => {
    const result = await rollApiKey("key_live_mobile");
    expect(result).not.toBeNull();
    expect(result!.key.name).toBe("Mobile App Prod");
    expect(result!.key.scopes).toEqual(["read", "write"]);
    expect(result!.key.rolledFrom).toBe("key_live_mobile");
    expect(result!.secret.startsWith("sk_live_")).toBe(true);
    const keys = await listApiKeys();
    expect(keys.find((k) => k.id === "key_live_mobile")?.status).toBe("REVOKED");
  });

  it("refuses to roll a revoked key", async () => {
    await revokeApiKey("key_test_sandbox");
    await expect(rollApiKey("key_test_sandbox")).rejects.toThrow(/revoked/i);
  });
});

describe("developer settings", () => {
  it("toggles sandbox mode", async () => {
    await setDeveloperToggle("sandboxMode", false);
    const dev = await getDeveloperSettings();
    expect(dev.sandboxMode).toBe(false);
  });

  it("adds and removes allowlist entries", async () => {
    const entry = await addIpAllowEntry("192.0.2.10", "Laptop");
    expect(entry.value).toBe("192.0.2.10");
    expect((await getDeveloperSettings()).ipAllowlist).toHaveLength(3);
    expect(await removeIpAllowEntry(entry.id)).toBe(true);
    expect(await removeIpAllowEntry(entry.id)).toBe(false);
    expect((await getDeveloperSettings()).ipAllowlist).toHaveLength(2);
  });

  it("rejects duplicates", async () => {
    await expect(addIpAllowEntry("203.0.113.24", "Dup")).rejects.toThrow(/already on the allowlist/i);
  });

  it("labels an unlabelled entry", async () => {
    const entry = await addIpAllowEntry("192.0.2.11", "   ");
    expect(entry.label).toBe("Untitled");
  });
});

describe("settings overview", () => {
  it("summarises all four sections with live counts", async () => {
    const sections = await getSettingsOverview();
    expect(sections.map((s) => s.id)).toEqual(["merchant", "notifications", "api-keys", "developer"]);
    expect(sections.find((s) => s.id === "api-keys")?.status).toBe("2 live keys active");
    expect(sections.find((s) => s.id === "notifications")?.status).toBe("All topics active");
    expect(sections.find((s) => s.id === "developer")?.status).toBe("2 IP rules");
  });

  it("flags attention when everything live is revoked or topics are muted", async () => {
    await revokeApiKey("key_live_main");
    await revokeApiKey("key_live_mobile");
    await updateNotificationTopic({ topicId: "invoices", digest: "off" });
    const sections = await getSettingsOverview();
    const keys = sections.find((s) => s.id === "api-keys")!;
    const notifications = sections.find((s) => s.id === "notifications")!;
    expect(keys.status).toBe("0 live keys active");
    expect(keys.tone).toBe("attention");
    expect(notifications.status).toBe("1 topic muted");
    expect(notifications.tone).toBe("attention");
  });
});
