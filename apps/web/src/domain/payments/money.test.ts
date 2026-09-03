import { describe, expect, it } from "vitest";
import { assertSupportedMinorUnits, parseMoney } from "./money";

describe("money", () => {
  it.each(["0", "1", "10000", "9999999999999999.9999"])("round-trips %s exactly", (amount) => {
    expect(parseMoney({ amount, currency: "USD" }).amount).toBe(amount);
  });

  it.each([1, NaN, Infinity, "01", "1e3", "1,000", "-1", "1.12345"])("rejects unsafe amount %s", (amount) => {
    expect(() => parseMoney({ amount, currency: "USD" })).toThrow();
  });

  it("enforces known currency minor units", () => {
    expect(() => assertSupportedMinorUnits(parseMoney({ amount: "100.01", currency: "IDR" }))).toThrow();
    expect(assertSupportedMinorUnits(parseMoney({ amount: "100.01", currency: "USD" }))).toEqual({ amount: "100.01", currency: "USD" });
  });

  it("rejects non-uppercase currency codes", () => {
    expect(() => parseMoney({ amount: "1", currency: "usd" })).toThrow();
  });
});
