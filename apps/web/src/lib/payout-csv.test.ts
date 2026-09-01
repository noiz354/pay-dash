import { describe, expect, it } from "vitest";
import { parseRecipientsCsv, rejectionsToCsv, RECIPIENT_CSV_TEMPLATE } from "./payout-csv";
import { isValidAccountNumber, parseAmount } from "./payout-status";

describe("parseAmount", () => {
  it.each([
    ["50,000", 50000],
    ["Rp 50.000", 50000],
    ["50000", 50000],
    ["1 250 890", 1250890],
  ])("parses %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it("returns null when there are no digits", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("isValidAccountNumber", () => {
  it("accepts 8–20 digits with separators", () => {
    expect(isValidAccountNumber("12345678")).toBe(true);
    expect(isValidAccountNumber("1234-5678-9012")).toBe(true);
  });
  it("rejects short, long and non-numeric values", () => {
    expect(isValidAccountNumber("1234567")).toBe(false);
    expect(isValidAccountNumber("1".repeat(21))).toBe(false);
    expect(isValidAccountNumber("12345678a")).toBe(false);
  });
});

describe("parseRecipientsCsv", () => {
  it("parses the shipped template cleanly", () => {
    const parsed = parseRecipientsCsv(RECIPIENT_CSV_TEMPLATE);
    expect(parsed.valid).toHaveLength(3);
    expect(parsed.invalid).toHaveLength(0);
    expect(parsed.totalAmount).toBe(250000 + 1750000 + 499500);
  });

  it("skips the header and blank lines", () => {
    const parsed = parseRecipientsCsv("name,bank,account_number,amount\n\nBudi,BCA,12345678,1000\n\n");
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it("works without a header row", () => {
    expect(parseRecipientsCsv("Budi,BCA,12345678,1000").valid).toHaveLength(1);
  });

  it("reports a reason and line number for every rejection", () => {
    const parsed = parseRecipientsCsv(
      [
        "Budi,BCA,12345678,1000",
        "Missing,Columns",
        ",BCA,12345678,1000",
        "NoBank,,12345678,1000",
        "BadAcct,BCA,123,1000",
        "BadAmount,BCA,12345678,abc",
        "Zero,BCA,12345678,0",
        "Budi,BCA,1234-5678,1000",
      ].join("\n")
    );
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.invalid.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(parsed.invalid[0].reason).toMatch(/Expected 4–5 columns/);
    expect(parsed.invalid[1].reason).toMatch(/name is empty/i);
    expect(parsed.invalid[2].reason).toMatch(/Bank is empty/i);
    expect(parsed.invalid[3].reason).toMatch(/account number/i);
    expect(parsed.invalid[4].reason).toMatch(/not an amount/i);
    expect(parsed.invalid[5].reason).toMatch(/greater than zero/i);
    expect(parsed.invalid[6].reason).toMatch(/Duplicate/i);
  });

  it("normalises separators in account numbers", () => {
    expect(parseRecipientsCsv("Budi,BCA,1234-5678-90,1000").valid[0].accountNumber).toBe("1234567890");
  });

  it("handles quoted cells containing commas", () => {
    const parsed = parseRecipientsCsv('"Santoso, Budi",BCA,12345678,"1,250,000",REF-1');
    expect(parsed.valid[0].name).toBe("Santoso, Budi");
    expect(parsed.valid[0].amount).toBe(1250000);
    expect(parsed.valid[0].reference).toBe("REF-1");
  });

  it("exports rejected rows as CSV for re-upload", () => {
    const parsed = parseRecipientsCsv("BadAcct,BCA,123,1000");
    const csv = rejectionsToCsv(parsed.invalid);
    expect(csv.split("\n")[0]).toBe("line,reason,row");
    expect(csv).toContain("BadAcct");
  });
});
