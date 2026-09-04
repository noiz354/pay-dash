import { describe, expect, it } from "vitest";
import {
  createStepUpChallenge,
  isApproverDistinct,
  markProofUsed,
  requiresDualControl,
  verifyStepUpProof,
  type StepUpBinding,
} from "./step-up";

const baseBinding = (overrides?: Partial<StepUpBinding>): StepUpBinding => ({
  operationType: "payout.release",
  organizationId: "org-1",
  actorId: "actor-1",
  amountMinor: "1000000",
  currency: "IDR",
  destinationCount: 1,
  nonce: "nonce-123",
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  ...overrides,
});

describe("step-up challenge binding", () => {
  it("produces a challenge whose proof verifies with the identical binding", () => {
    const binding = baseBinding();
    const challenge = createStepUpChallenge(binding);
    expect(verifyStepUpProof(challenge, binding, new Date())).toEqual({ valid: true });
  });

  it("rejects a proof when the operation binding changed", () => {
    const binding = baseBinding();
    const challenge = createStepUpChallenge(binding);
    const changed = { ...binding, amountMinor: "999999999" };
    const res = verifyStepUpProof(challenge, changed, new Date());
    expect(res).toMatchObject({ valid: false, reason: "OPERATION_CHANGED" });
  });

  it("rejects a proof after it has been used (single-use)", () => {
    const binding = baseBinding();
    const challenge = createStepUpChallenge(binding);
    const used = markProofUsed(challenge);
    const res = verifyStepUpProof(used, binding, new Date());
    expect(res).toMatchObject({ valid: false, reason: "PROOF_ALREADY_USED" });
  });

  it("rejects an expired proof", () => {
    const binding = baseBinding({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const challenge = createStepUpChallenge(binding);
    const res = verifyStepUpProof(challenge, binding, new Date());
    expect(res).toMatchObject({ valid: false, reason: "PROOF_EXPIRED" });
  });

  it("rejects a nonce mismatch (replay protection)", () => {
    const binding = baseBinding();
    const challenge = createStepUpChallenge(binding);
    const diff = { ...binding, nonce: "different-nonce" };
    const res = verifyStepUpProof(challenge, diff, new Date());
    expect(res).toMatchObject({ valid: false, reason: "NONCE_MISMATCH" });
  });

  it("is not thrown by destination REORDERING (set is sorted before digest)", () => {
    const binding = { ...baseBinding(), destinationRefs: ["dst-2", "dst-1"] };
    const challenge = createStepUpChallenge(binding);
    const reordered = { ...binding, destinationRefs: ["dst-1", "dst-2"] };
    expect(verifyStepUpProof(challenge, reordered, new Date())).toEqual({ valid: true });
  });
});

describe("dual-control policy", () => {
  it("requires dual control for a live platform transfer always", () => {
    expect(requiresDualControl("platform.transfer", { mode: "LIVE", amountMinor: "1" })).toBe(true);
    expect(requiresDualControl("platform.transfer", { mode: "TEST", amountMinor: "1" })).toBe(false);
  });

  it("requires dual control for a live split-rule activation always", () => {
    expect(requiresDualControl("split.activation", { mode: "LIVE" })).toBe(true);
  });

  it("applies the payout per-recipient threshold", () => {
    expect(requiresDualControl("payout.recipient", { mode: "LIVE", amountMinor: "24000000" })).toBe(false);
    expect(requiresDualControl("payout.recipient", { mode: "LIVE", amountMinor: "25000000" })).toBe(true);
  });

  it("applies the payout per-batch threshold", () => {
    expect(requiresDualControl("payout.batch", { mode: "LIVE", batchAmountMinor: "99999999" })).toBe(false);
    expect(requiresDualControl("payout.batch", { mode: "LIVE", batchAmountMinor: "100000000" })).toBe(true);
  });

  it("applies the refund amount threshold (IDR 10M)", () => {
    expect(requiresDualControl("refund.amount", { mode: "LIVE", amountMinor: "9000000" })).toBe(false);
    expect(requiresDualControl("refund.amount", { mode: "LIVE", amountMinor: "10000000" })).toBe(true);
  });

  it("applies the >50% of original refund rule", () => {
    expect(
      requiresDualControl("refund.pct", { mode: "LIVE", amountMinor: "4000000", originalPaymentAmountMinor: "10000000" }),
    ).toBe(false);
    expect(
      requiresDualControl("refund.pct", { mode: "LIVE", amountMinor: "6000000", originalPaymentAmountMinor: "10000000" }),
    ).toBe(true);
  });

  it("requires dual control for recurring immediate payment at threshold", () => {
    expect(requiresDualControl("recurring.immediate", { mode: "LIVE", amountMinor: "10000000" })).toBe(true);
  });
});

describe("approver separation", () => {
  it("disallows the same actor approving their own operation", () => {
    expect(isApproverDistinct("actor-1", "actor-1")).toBe(false);
    expect(isApproverDistinct("actor-1", "actor-2")).toBe(true);
  });
});
