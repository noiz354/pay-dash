// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgContextError } from "@/server/services/org-context";
import { getDeveloperSettings, getMerchantProfile, listApiKeys } from "@/server/data/settings";
import {
  addIpAllowAction,
  createApiKeyAction,
  removeIpAllowAction,
  revokeApiKeyAction,
  rollApiKeyAction,
  updateDeveloperToggleAction,
  updateMerchantProfileAction,
  updateNotificationChannelAction,
  updateNotificationPreferenceAction,
} from "./settings";

/**
 * Audit finding S-02 — nine merchant-configuration actions with no authorization.
 *
 * Nothing in `actions/settings.ts` read the session: no `getSession`, no
 * `requireOrgContext`, no permission check. The most consequential was
 * `createApiKeyAction`, which mints a live API credential and returns its secret
 * in the response body for one-time display — so any caller who could reach the
 * endpoint could mint a key and read it. `rollApiKeyAction` and
 * `revokeApiKeyAction` are the outage half, breaking whatever production
 * integration holds the current credential. `addIpAllowAction` /
 * `removeIpAllowAction` edit the API allowlist, which can lock the merchant's own
 * servers out or open the API to any origin. And
 * `updateNotificationChannelAction` rewrites alerting destinations, which can
 * blind the on-call team to every subsequent incident.
 *
 * Payloads below are all *valid*, so a refusal can only have come from the
 * authorization guard and never from schema validation.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

function asOwner() {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles: ["OWNER"],
    userId: "user_owner",
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function authenticatedButNotOwner() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for settings.manage in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticSettingsStore?: unknown }).__kineticSettingsStore = undefined;
}

// --- valid payloads, one per action -----------------------------------------
function merchantForm() {
  const fd = new FormData();
  fd.set("legalName", "Acme Corporation");
  fd.set("dba", "Acme");
  fd.set("address", "1 Test Street");
  fd.set("city", "Bukittinggi");
  fd.set("state", "West Sumatra");
  fd.set("postalCode", "26100");
  fd.set("taxId", "01.234.567");
  fd.set("supportEmail", "support@acmecorp.test");
  fd.set("statementDescriptor", "ACME PAYMENTS");
  fd.set("brandColor", "#1a56db");
  fd.set("logoUrl", "");
  fd.set("autoDebit", "on");
  return fd;
}

function channelForm() {
  const fd = new FormData();
  fd.set("channel", "email");
  fd.set("enabled", "on");
  return fd;
}

function topicForm() {
  const fd = new FormData();
  fd.set("topicId", "successful_charges");
  fd.set("dashboard", "on");
  return fd;
}

function createKeyForm() {
  const fd = new FormData();
  fd.set("name", "Incident response key");
  fd.set("environment", "TEST");
  fd.append("scopes", "read");
  fd.set("confirm", "on");
  return fd;
}

function keyIdForm(id = "key_test_sandbox") {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("confirm", "on");
  return fd;
}

function addIpForm() {
  const fd = new FormData();
  fd.set("value", "203.0.113.50");
  fd.set("label", "Incident responder");
  return fd;
}

function removeIpForm(id = "ip_ci") {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

function devToggleForm() {
  const fd = new FormData();
  fd.set("field", "sandboxMode");
  fd.set("enabled", "on");
  return fd;
}

/**
 * Structurally typed so one table can drive all nine: each action returns an
 * `ActionState<T>` for a different `T`, and the denial path never populates
 * `data`, so the widest useful shape is what the assertions need.
 */
type GatedAction = {
  name: string;
  invoke: (form: FormData) => Promise<{ status: string; message: string; data?: unknown; fieldErrors?: Record<string, string[]> }>;
  form: () => FormData;
};

const ALL_NINE: GatedAction[] = [
  { name: "updateMerchantProfileAction", invoke: (f) => updateMerchantProfileAction(undefined, f), form: merchantForm },
  { name: "updateNotificationChannelAction", invoke: (f) => updateNotificationChannelAction(undefined, f), form: channelForm },
  { name: "updateNotificationPreferenceAction", invoke: (f) => updateNotificationPreferenceAction(undefined, f), form: topicForm },
  { name: "createApiKeyAction", invoke: (f) => createApiKeyAction(undefined, f), form: createKeyForm },
  { name: "revokeApiKeyAction", invoke: (f) => revokeApiKeyAction(undefined, f), form: keyIdForm },
  { name: "rollApiKeyAction", invoke: (f) => rollApiKeyAction(undefined, f), form: keyIdForm },
  { name: "addIpAllowAction", invoke: (f) => addIpAllowAction(undefined, f), form: addIpForm },
  { name: "removeIpAllowAction", invoke: (f) => removeIpAllowAction(undefined, f), form: removeIpForm },
  { name: "updateDeveloperToggleAction", invoke: (f) => updateDeveloperToggleAction(undefined, f), form: devToggleForm },
];

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asOwner();
});

describe("every settings action demands settings.manage", () => {
  it.each(ALL_NINE)("$name authorizes settings.manage", async ({ invoke, form }) => {
    await invoke(form());
    expect(requireStrict).toHaveBeenCalledWith("settings.manage");
  });
});

describe("S-02 — a signed-out caller changes no configuration", () => {
  it("refuses all nine with valid payloads and mutates nothing", async () => {
    const keysBefore = await listApiKeys();
    const profileBefore = await getMerchantProfile();
    const devBefore = await getDeveloperSettings();

    signedOut();
    for (const { name, invoke, form } of ALL_NINE) {
      const state = await invoke(form());
      expect(state.status, name).toBe("error");
      expect(state.message, name).toMatch(/Sign in to manage these settings/i);
    }

    expect(await listApiKeys()).toHaveLength(keysBefore.length);
    expect(await getMerchantProfile()).toEqual(profileBefore);
    expect(await getDeveloperSettings()).toEqual(devBefore);
  });

  it("mints no credential and leaks no secret", async () => {
    signedOut();
    const state = await createApiKeyAction(undefined, createKeyForm());

    expect(state.status).toBe("error");
    expect(state.data).toBeUndefined();
    // The secret is the whole harm: it is shown once and cannot be recovered.
    expect(JSON.stringify(state)).not.toMatch(/sk_|secret/i);
  });

  it("authorizes before validating, so an unauthorized caller cannot probe the schema", async () => {
    signedOut();
    // An empty form would fail every schema in the file. The caller must still
    // see only the authorization answer, not which fields exist or what they
    // require — that is the difference between a refusal and a form spec.
    const state = await createApiKeyAction(undefined, new FormData());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage these settings/i);
    expect(state.message).not.toMatch(/fix the highlighted fields/i);
    expect(state.fieldErrors).toBeUndefined();
  });
});

describe("S-02 — an authenticated non-owner changes no configuration", () => {
  it("cannot mint an API key", async () => {
    const before = await listApiKeys();
    authenticatedButNotOwner();

    const state = await createApiKeyAction(undefined, createKeyForm());
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission/i);
    expect(state.data).toBeUndefined();
    expect(await listApiKeys()).toHaveLength(before.length);
  });

  it("cannot roll or revoke a credential a production integration holds", async () => {
    authenticatedButNotOwner();

    const rolled = await rollApiKeyAction(undefined, keyIdForm());
    expect(rolled.status).toBe("error");
    expect(rolled.data).toBeUndefined();

    const revoked = await revokeApiKeyAction(undefined, keyIdForm());
    expect(revoked.status).toBe("error");

    const keys = await listApiKeys();
    expect(keys.find((k) => k.id === "key_test_sandbox")?.status).toBe("ACTIVE");
  });

  it("cannot edit the API allowlist", async () => {
    authenticatedButNotOwner();

    expect((await addIpAllowAction(undefined, addIpForm())).status).toBe("error");
    expect((await removeIpAllowAction(undefined, removeIpForm())).status).toBe("error");
  });

  it("cannot blind the on-call team by rewriting alerting", async () => {
    authenticatedButNotOwner();

    expect((await updateNotificationChannelAction(undefined, channelForm())).status).toBe("error");
    expect((await updateNotificationPreferenceAction(undefined, topicForm())).status).toBe("error");
  });

  it("cannot rewrite the merchant's legal profile", async () => {
    const before = await getMerchantProfile();
    authenticatedButNotOwner();

    const fd = merchantForm();
    fd.set("legalName", "Attacker Holdings");
    expect((await updateMerchantProfileAction(undefined, fd)).status).toBe("error");
    expect((await getMerchantProfile()).legalName).toBe(before.legalName);
  });
});

describe("an OWNER still gets working settings management", () => {
  it("mints a key and returns the secret exactly once", async () => {
    const before = await listApiKeys();
    const state = await createApiKeyAction(undefined, createKeyForm());

    expect(state.status).toBe("success");
    expect(state.data?.secret).toBeTruthy();
    expect(state.data?.name).toBe("Incident response key");
    expect(await listApiKeys()).toHaveLength(before.length + 1);
  });

  it("adds an allowlist entry", async () => {
    const state = await addIpAllowAction(undefined, addIpForm());
    expect(state.status).toBe("success");
  });

  it("still validates input after authorizing", async () => {
    const fd = createKeyForm();
    fd.set("name", "x"); // below the 3-character minimum
    const state = await createApiKeyAction(undefined, fd);

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/fix the highlighted fields/i);
    expect(state.fieldErrors?.name).toBeTruthy();
  });

  it("rejects an invalid IP rather than widening the allowlist", async () => {
    const fd = addIpForm();
    fd.set("value", "not-an-ip");
    const state = await addIpAllowAction(undefined, fd);
    expect(state.status).toBe("error");
  });
});
