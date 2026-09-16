// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgContextError } from "@/server/services/org-context";
import { listLinks } from "@/server/data/links";
import { createPaymentLinkAction, expirePaymentLinkAction } from "./links";

/**
 * Audit finding S-02 — `createPaymentLinkAction` and `expirePaymentLinkAction`
 * had no authorization.
 *
 * Creating a link mints a payable instrument in the process-global store with no
 * tenant attribution. Expiring one is the sharper edge: `expireLink(id)` takes an
 * unscoped id, so any caller who could reach the endpoint took down a live
 * payment link a merchant had already sent to customers. That is revenue denial
 * with no record of who caused it — the link simply shows EXPIRED and support
 * has nothing to trace.
 *
 * `payPaymentLinkAction` in this file was already gated through the transaction
 * seam, which left two of three actions on one resource open. Both now demand
 * `money_in.create`, matching it, so the three agree.
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
    new OrgContextError("FORBIDDEN", "Actor is not authorized for money_in.create in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticLinksStore?: unknown }).__kineticLinksStore = undefined;
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
}

function openLinkIds(): string[] {
  return listLinks({ pageSize: 100 })
    .rows.filter((r) => r.status === "OPEN")
    .map((r) => r.id);
}

function snapshot() {
  return JSON.stringify(listLinks({ pageSize: 100 }).rows.map((r) => [r.id, r.status]));
}

function idForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

function createForm() {
  const fd = new FormData();
  fd.set("kind", "single");
  fd.set("amount", "2500000");
  fd.set("payerEmail", "buyer@example.com");
  fd.set("expiresIn", "7");
  return fd;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
});

describe("S-02 — payment links demand money_in.create", () => {
  it.each([
    { name: "createPaymentLinkAction", run: () => createPaymentLinkAction(undefined, createForm()) },
    {
      name: "expirePaymentLinkAction",
      run: () => expirePaymentLinkAction(undefined, idForm(openLinkIds()[0])),
    },
  ])("$name authorizes money_in.create", async ({ run }) => {
    await run();
    expect(requireStrict).toHaveBeenCalledWith("money_in.create");
  });
});

describe("S-02 — a signed-out caller cannot touch payment links", () => {
  it("refuses to expire a live link and leaves it OPEN", async () => {
    const before = snapshot();
    const ids = openLinkIds();
    expect(ids.length).toBeGreaterThan(0);
    signedOut();

    const state = await expirePaymentLinkAction(undefined, idForm(ids[0]));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage payment links/i);
    expect(snapshot()).toBe(before);
    expect(openLinkIds()).toEqual(ids);
  });

  it("refuses to mint a link", async () => {
    const before = snapshot();
    signedOut();

    const state = await createPaymentLinkAction(undefined, createForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage payment links/i);
    expect(snapshot()).toBe(before);
  });
});

describe("S-02 — a caller without money_in.create cannot touch payment links", () => {
  it("refuses to expire a live link", async () => {
    const before = snapshot();
    const [id] = openLinkIds();
    lackingPermission();

    const state = await expirePaymentLinkAction(undefined, idForm(id));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to manage payment links/i);
    expect(snapshot()).toBe(before);
  });

  it("refuses to mint a link", async () => {
    const before = snapshot();
    lackingPermission();

    const state = await createPaymentLinkAction(undefined, createForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to manage payment links/i);
    expect(snapshot()).toBe(before);
  });
});

describe("the denials above are attributable to the guard, not to bad input", () => {
  it("an authorized caller really does expire the link", async () => {
    const before = snapshot();
    const ids = openLinkIds();
    asRole(["FINANCE_ADMIN"]);

    const state = await expirePaymentLinkAction(undefined, idForm(ids[0]));

    expect(state.status).toBe("success");
    expect(snapshot()).not.toBe(before);
    expect(openLinkIds()).not.toContain(ids[0]);
  });
});
