// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgContextError } from "@/server/services/org-context";
import {
  getRuntimeSettingsAction,
  rotateMcpTokenAction,
  setDataSourceAction,
  setMcpEnabledAction,
  setXenditEnabledAction,
  testXenditConnectionAction,
} from "./runtime";

/**
 * Audit finding S-04 — global runtime switches guarded only by "is anyone signed
 * in?".
 *
 * `getRuntimeSettingsStore()` is process-global, so `dataSource` decides whether
 * *every* organization reads the mock ledger or the live one, and `xenditEnabled`
 * decides whether payment calls reach the real provider. `rotateMcpTokenAction`
 * additionally returned the freshly minted token in its response body, so any
 * authenticated caller could both take over the MCP surface and read the
 * credential that proves it.
 *
 * These tests pin two things: the permission each action demands, and — more
 * important — that a denial never reaches the store at all.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

const store = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  rotateMcpToken: vi.fn(),
}));
vi.mock("@/server/settings/runtime-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/settings/runtime-settings")>();
  return { ...actual, getRuntimeSettingsStore: () => store };
});

const SETTINGS = {
  dataSource: "memory" as const,
  mcpEnabled: false,
  xenditEnabled: false,
  mcpToken: "mcp_existing_token",
};

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

function lackingPermission() {
  // What a SUPPORT or memberless principal looks like at this seam: authenticated,
  // but the role catalogue does not grant the permission.
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for settings.manage in org_alpha"),
  );
}

beforeEach(() => {
  requireStrict.mockReset();
  store.get.mockReset();
  store.update.mockReset();
  store.rotateMcpToken.mockReset();
  store.get.mockResolvedValue(SETTINGS);
  store.update.mockImplementation(async (patch: Record<string, unknown>) => ({ ...SETTINGS, ...patch }));
  store.rotateMcpToken.mockResolvedValue({ token: "mcp_rotated_token", settings: SETTINGS });
  asOwner();
});

describe("each runtime action demands the privilege it actually needs", () => {
  const EXPECTED: Array<[string, string, () => Promise<unknown>]> = [
    ["getRuntimeSettingsAction", "settings.manage", () => getRuntimeSettingsAction()],
    ["setDataSourceAction", "settings.manage", () => setDataSourceAction("postgres")],
    ["setMcpEnabledAction", "settings.manage", () => setMcpEnabledAction(true)],
    // Enabling live provider calls is a provider privilege, not a settings one.
    ["setXenditEnabledAction", "provider.connect.live", () => setXenditEnabledAction(true)],
    ["rotateMcpTokenAction", "settings.manage", () => rotateMcpTokenAction()],
    ["testXenditConnectionAction", "provider.connect.test", () => testXenditConnectionAction()],
  ];

  it.each(EXPECTED)("%s authorizes %s", async (_name, permission, invoke) => {
    await invoke();
    expect(requireStrict).toHaveBeenCalledWith(permission);
  });
});

describe("S-04 — an unauthenticated caller changes nothing", () => {
  it("refuses every action and never touches the global store", async () => {
    signedOut();

    const results = await Promise.all([
      getRuntimeSettingsAction(),
      setDataSourceAction("postgres"),
      setMcpEnabledAction(true),
      setXenditEnabledAction(true),
      rotateMcpTokenAction(),
      testXenditConnectionAction(),
    ]);

    for (const r of results) {
      expect(r.status).toBe("error");
      expect(r.message).toMatch(/Sign in to manage MCP and runtime settings/i);
    }
    expect(store.get).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.rotateMcpToken).not.toHaveBeenCalled();
  });

  it("does not leak a rotated token in the denial", async () => {
    signedOut();
    const state = await rotateMcpTokenAction();

    expect(state.status).toBe("error");
    expect(state.data).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain("mcp_rotated_token");
  });
});

describe("S-04 — an authenticated principal without the privilege changes nothing", () => {
  it("refuses the data-source switch and leaves the store untouched", async () => {
    lackingPermission();

    const state = await setDataSourceAction("postgres");
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission/i);
    // The regression that matters: previously this returned success and moved
    // every tenant in the process off Postgres and onto the in-memory ledger.
    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses to enable live Xendit calls", async () => {
    requireStrict.mockRejectedValue(
      new OrgContextError("FORBIDDEN", "Actor is not authorized for provider.connect.live in org_alpha"),
    );

    const state = await setXenditEnabledAction(true);
    expect(state.status).toBe("error");
    expect(store.update).not.toHaveBeenCalled();
  });

  it("refuses to rotate the MCP token", async () => {
    lackingPermission();

    const state = await rotateMcpTokenAction();
    expect(state.status).toBe("error");
    expect(store.rotateMcpToken).not.toHaveBeenCalled();
    expect(state.data).toBeUndefined();
  });

  it("refuses to read current settings back", async () => {
    lackingPermission();

    const state = await getRuntimeSettingsAction();
    expect(state.status).toBe("error");
    expect(state.data).toBeUndefined();
    expect(store.get).not.toHaveBeenCalled();
  });
});

describe("an authorized OWNER still gets working controls", () => {
  it("switches the data source", async () => {
    const state = await setDataSourceAction("postgres");
    expect(state.status).toBe("success");
    expect(store.update).toHaveBeenCalledWith({ dataSource: "postgres" });
    expect(state.data?.settings.dataSource).toBe("postgres");
  });

  it("rejects an unknown data source before writing", async () => {
    const state = await setDataSourceAction("not-a-source");
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/valid data source/i);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("toggles the MCP server", async () => {
    const state = await setMcpEnabledAction(true);
    expect(state.status).toBe("success");
    expect(store.update).toHaveBeenCalledWith({ mcpEnabled: true });
  });

  it("rotates the token and returns it exactly once", async () => {
    const state = await rotateMcpTokenAction();
    expect(state.status).toBe("success");
    expect(state.data?.token).toBe("mcp_rotated_token");
  });
});
