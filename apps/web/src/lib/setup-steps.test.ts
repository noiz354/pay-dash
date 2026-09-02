import { describe, expect, it } from "vitest";
import { nextSetupStep, resolveSetupSteps, SETUP_STEPS } from "./setup-steps";

describe("resolveSetupSteps", () => {
  it("treats steps without ground truth as self-attested", () => {
    const states = resolveSetupSteps(["business", "webhooks"], false);
    const byId = Object.fromEntries(states.map((s) => [s.id, s]));
    expect(byId.business.done).toBe(true);
    expect(byId.webhooks.done).toBe(true);
    expect(byId.routing.done).toBe(false);
    expect(byId.bank.done).toBe(false);
    // Nothing is derived without a verified account.
    expect(states.every((s) => !s.derived)).toBe(true);
  });

  it("derives the bank step from a verified destination account", () => {
    // The operator never ticked "bank" — the real state did.
    const states = resolveSetupSteps(["business"], true);
    const byId = Object.fromEntries(states.map((s) => [s.id, s]));
    expect(byId.bank.done).toBe(true);
    expect(byId.bank.derived).toBe(true);
    // Other steps are unaffected.
    expect(byId.business.done).toBe(true);
    expect(byId.business.derived).toBe(false);
    expect(byId.routing.done).toBe(false);
  });

  it("keeps a manually ticked bank step done when the account is not verified", () => {
    const states = resolveSetupSteps(["bank"], false);
    const bank = states.find((s) => s.id === "bank")!;
    expect(bank.done).toBe(true);
    expect(bank.derived).toBe(false);
  });

  it("covers every defined step exactly once", () => {
    const states = resolveSetupSteps([], false);
    expect(states).toHaveLength(SETUP_STEPS.length);
    expect(states.map((s) => s.id)).toEqual(SETUP_STEPS.map((s) => s.id));
  });
});

describe("nextSetupStep", () => {
  it("points at the first open step in definition order", () => {
    const next = nextSetupStep([], false);
    expect(next?.id).toBe(SETUP_STEPS[0].id);
  });

  it("skips a bank step that is done by real state", () => {
    // business done (manual), bank done (derived) → routing is next.
    const next = nextSetupStep(["business"], true);
    expect(next?.id).toBe("routing");
  });

  it("is undefined when everything is done", () => {
    const all = SETUP_STEPS.map((s) => s.id);
    expect(nextSetupStep(all, false)).toBeUndefined();
    // Bank never ticked but derived-done still counts.
    expect(nextSetupStep(all.filter((id) => id !== "bank"), true)).toBeUndefined();
  });
});
