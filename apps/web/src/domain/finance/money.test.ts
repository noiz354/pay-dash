import { describe, expect, it } from "vitest";

import {
  MoneyError,
  absMinor,
  addMinor,
  cmpMinor,
  eqMinor,
  fromDecimalString,
  fromLegacyNumber,
  isNegative,
  minor,
  negateMinor,
  subMinor,
  sumMinor,
  toDecimalString,
  zero,
} from "./money";

describe("minor-unit money (INV-L8)", () => {
  it("accepts integer minor units and uppercases the currency", () => {
    expect(minor(1_500, "idr")).toEqual({ units: 1_500, currency: "IDR" });
  });

  it("refuses a fractional minor unit instead of rounding it", () => {
    // Rounding here would hide precision loss that happened upstream.
    expect(() => minor(10.5, "IDR")).toThrowError(MoneyError);
    try {
      minor(10.5, "IDR");
    } catch (e) {
      expect((e as MoneyError).code).toBe("NOT_INTEGER");
    }
  });

  it("refuses NaN and Infinity", () => {
    expect(() => minor(Number.NaN, "IDR")).toThrowError(/not finite/i);
    expect(() => minor(Number.POSITIVE_INFINITY, "IDR")).toThrowError(/not finite/i);
  });

  it("refuses cross-currency arithmetic (INV-L6)", () => {
    const idr = minor(1000, "IDR");
    const usd = minor(1000, "USD");
    expect(() => addMinor(idr, usd)).toThrowError(/never implicit/i);
    expect(() => subMinor(idr, usd)).toThrowError(/never implicit/i);
    expect(() => cmpMinor(idr, usd)).toThrowError(/never implicit/i);
  });

  it("adds, subtracts, negates and compares within one currency", () => {
    const a = minor(1000, "IDR");
    const b = minor(250, "IDR");
    expect(addMinor(a, b).units).toBe(1250);
    expect(subMinor(a, b).units).toBe(750);
    expect(negateMinor(a).units).toBe(-1000);
    expect(cmpMinor(a, b)).toBe(1);
    expect(cmpMinor(b, a)).toBe(-1);
    expect(cmpMinor(a, minor(1000, "IDR"))).toBe(0);
    expect(eqMinor(a, minor(1000, "IDR"))).toBe(true);
    expect(eqMinor(a, minor(1000, "USD"))).toBe(false);
    expect(isNegative(negateMinor(a))).toBe(true);
    expect(absMinor(negateMinor(a)).units).toBe(1000);
  });

  it("sums an empty list to an explicit zero in the named currency", () => {
    expect(sumMinor([], "IDR")).toEqual({ units: 0, currency: "IDR" });
    expect(zero("usd")).toEqual({ units: 0, currency: "USD" });
  });

  it("sums a list exactly — no float drift over many small values", () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3. In minor units it is exact.
    const cents = Array.from({ length: 1000 }, () => minor(1, "USD"));
    expect(sumMinor(cents, "USD").units).toBe(1000);
  });

  describe("decimal string boundary", () => {
    it("parses zero-decimal currencies", () => {
      expect(fromDecimalString("150000", "IDR").units).toBe(150000);
      expect(fromDecimalString("-150000", "IDR").units).toBe(-150000);
    });

    it("parses two-decimal currencies to cents", () => {
      expect(fromDecimalString("10.25", "USD").units).toBe(1025);
      expect(fromDecimalString("10", "USD").units).toBe(1000);
      expect(fromDecimalString("10.2", "USD").units).toBe(1020);
    });

    it("tolerates insignificant trailing zeros beyond the scale", () => {
      expect(fromDecimalString("10.2500", "USD").units).toBe(1025);
    });

    it("refuses significant precision the currency cannot hold", () => {
      expect(() => fromDecimalString("10.255", "USD")).toThrowError(/more significant precision/i);
      expect(() => fromDecimalString("1.5", "IDR")).toThrowError(/more significant precision/i);
    });

    it("refuses an unknown currency rather than guessing its scale", () => {
      expect(() => fromDecimalString("10", "XXX")).toThrowError(/Unknown currency/i);
    });

    it("round-trips through toDecimalString", () => {
      expect(toDecimalString(fromDecimalString("10.25", "USD"))).toBe("10.25");
      expect(toDecimalString(fromDecimalString("150000", "IDR"))).toBe("150000");
      expect(toDecimalString(minor(-1025, "USD"))).toBe("-10.25");
      expect(toDecimalString(minor(5, "USD"))).toBe("0.05");
    });
  });

  describe("legacy number boundary", () => {
    it("converts whole-rupiah legacy numbers losslessly", () => {
      expect(fromLegacyNumber(2_212_783_280, "IDR").units).toBe(2_212_783_280);
    });

    it("converts major-unit dollars to cents", () => {
      expect(fromLegacyNumber(10.25, "USD").units).toBe(1025);
    });

    it("refuses a legacy value that does not land on a whole minor unit", () => {
      expect(() => fromLegacyNumber(10.255, "USD")).toThrowError(/whole minor unit/i);
      expect(() => fromLegacyNumber(0.5, "IDR")).toThrowError(/whole minor unit/i);
    });
  });
});
