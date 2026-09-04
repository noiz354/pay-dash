import { describe, expect, it } from "vitest";
import {
  maskEmail,
  maskIdentifier,
  maskSecret,
  maskTail,
  redactValueInText,
  safeLogContext,
} from "./redact";

describe("redaction helpers", () => {
  it("masks secrets entirely", () => {
    expect(maskSecret("sk_test_sensitive")).toBe("[redacted]");
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret("")).toBeNull();
  });

  it("masks an account number keeping a short tail", () => {
    expect(maskTail("1234567890", 4)).toBe("••••••7890");
    expect(maskTail("12", 4)).toBe("[redacted]");
    expect(maskTail("")).toBeNull();
  });

  it("never reveals a full identifier", () => {
    const masked = maskIdentifier("acct_xendit_987654321");
    expect(masked).not.toContain("987654321");
    expect(masked).toContain("4321");
  });

  it("masks an email local part", () => {
    const masked = maskEmail("jane.doe@example.com");
    expect(masked).not.toContain("jane.doe");
    expect(masked).toContain("@example.com");
  });

  it("redacts a secret appearing in free text", () => {
    expect(redactValueInText("header: sk_test_abc", "sk_test_abc")).toBe("header: [redacted]");
  });

  it("composes a safe log context that drops secrets and nested objects", () => {
    const out = safeLogContext({
      amount: 1000,
      currency: "IDR",
      secretKey: "sk_test_leak",
      event: { nested: "raw" },
    });
    expect(out.secretKey).toBe("[redacted]");
    expect(out.amount).toBe(1000);
    expect(out.event).toBe("[object]");
    expect(JSON.stringify(out)).not.toContain("sk_test_leak");
  });
});
