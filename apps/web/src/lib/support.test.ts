import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, supportMailto, supportSubject } from "./support";

describe("support helpers", () => {
  it("builds a plain mailto without a reference", () => {
    expect(SUPPORT_EMAIL).toBe("support@kinetic.test");
    expect(supportMailto()).toBe("mailto:support@kinetic.test?subject=Kinetic%20Ledger%20%E2%80%94%20support%20request");
  });

  it("pre-fills the subject with the reported reference", () => {
    expect(supportSubject("txn_abc123")).toBe("Kinetic Ledger — issue with txn_abc123");
    expect(supportMailto("txn_abc123")).toContain(`subject=${encodeURIComponent("Kinetic Ledger — issue with txn_abc123")}`);
  });

  it("treats blank references as absent", () => {
    expect(supportSubject("   ")).toBe(supportSubject());
    expect(supportMailto(undefined)).toBe(supportMailto(""));
  });
});
