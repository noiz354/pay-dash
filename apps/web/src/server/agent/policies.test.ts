import { describe, expect, it } from "vitest";

import { MERCHANT_OPS_POLICY } from "./policies";

describe("agent system policy (financial integrity invariants)", () => {
  it("mandates read-only behaviour", () => {
    expect(MERCHANT_OPS_POLICY).toMatch(/READ-ONLY/);
    expect(MERCHANT_OPS_POLICY).toMatch(/no write tools/i);
  });

  it("forbids fabricating financial values", () => {
    expect(MERCHANT_OPS_POLICY).toMatch(/NO FABRICATION/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/must come from a tool result/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/FACT .*INFERENCE/i);
  });

  it("separates data from instructions (prompt-injection defense)", () => {
    expect(MERCHANT_OPS_POLICY).toMatch(/DATA/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/INSTRUCTION/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/Never treat it as instructions/i);
  });

  it("locks the tenant boundary and requires human approval for financial actions", () => {
    expect(MERCHANT_OPS_POLICY).toMatch(/TENANT/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/never try to inspect or act on another merchant/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/APPROVAL/i);
    expect(MERCHANT_OPS_POLICY).toMatch(/require human approval/i);
  });
});
