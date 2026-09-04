import { describe, expect, it } from "vitest";
import {
  auditMetadataIsSafe,
  makeAuditEvent,
  type AuditMetadata,
} from "./audit";

const baseMetadata: AuditMetadata = {
  organizationId: "org-1",
  actorId: "actor-1",
  provider: "xendit",
  mode: "TEST",
  operationId: "op-1",
  amountMinor: "1000",
  currency: "IDR",
};

describe("audit event", () => {
  it("builds a validated, immutable-shaped audit event", () => {
    const event = makeAuditEvent({
      organizationId: "org-1",
      actorId: "actor-1",
      action: "PAYOUT_RELEASE",
      outcome: "SUCCESS",
      metadata: baseMetadata,
    });
    expect(event.id.length).toBeGreaterThan(0);
    expect(event.action).toBe("PAYOUT_RELEASE");
    expect(event.outcome).toBe("SUCCESS");
    expect(event.version).toBe(1);
  });

  it("allows a deterministic event id for dedupe", () => {
    const meta = { ...baseMetadata, operationId: "op-1" };
    const a = makeAuditEvent({ organizationId: "org-1", actorId: "a", action: "MFA_PROOF_VERIFIED", outcome: "SUCCESS", metadata: meta, eventId: "event-1" });
    const b = makeAuditEvent({ organizationId: "org-1", actorId: "a", action: "MFA_PROOF_VERIFIED", outcome: "SUCCESS", metadata: meta, eventId: "event-1" });
    expect(a.id).toBe(b.id);
  });

  it("rejects forbidden metadata keys", () => {
    const bad = { ...baseMetadata, secretKey: "sk_test" } as unknown as AuditMetadata;
    expect(auditMetadataIsSafe({ ...bad })).toBe(false);
    expect(() =>
      makeAuditEvent({ organizationId: "org-1", actorId: "a", action: "OPERATION_SUCCEEDED", outcome: "SUCCESS", metadata: bad }),
    ).toThrow(/forbidden/);
  });

  it("marks a secret-shaped key unsafe", () => {
    expect(auditMetadataIsSafe({ otp: "123456" })).toBe(false);
    expect(auditMetadataIsSafe({ pan: "4242" })).toBe(false);
    expect(auditMetadataIsSafe({ cvv: "123" })).toBe(false);
  });

  it("accepts only the strict allowed metadata shape", () => {
    expect(() =>
      makeAuditEvent({
        organizationId: "org-1",
        actorId: "a",
        action: "OPERATION_FAILED",
        outcome: "FAILURE",
        metadata: { ...baseMetadata, extra: "should-be-rejected" } as unknown as AuditMetadata,
      }),
    ).toThrow();
  });
});
