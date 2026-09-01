import { describe, expect, it } from "vitest";
import { DIGEST_LABELS, DIGEST_OPTIONS, isValidHexColor, isValidIpOrCidr } from "./settings-options";

describe("settings vocabulary", () => {
  it("labels every digest option", () => {
    for (const option of DIGEST_OPTIONS) expect(DIGEST_LABELS[option]).toBeTruthy();
  });
});

describe("isValidHexColor", () => {
  it.each(["#1a56db", "#FFF", "  #0f172a  "])("accepts %s", (value) => {
    expect(isValidHexColor(value)).toBe(true);
  });

  it.each(["1a56db", "#12345", "#zzzzzz", "", "rgb(0,0,0)"])("rejects %s", (value) => {
    expect(isValidHexColor(value)).toBe(false);
  });
});

describe("isValidIpOrCidr", () => {
  it.each(["203.0.113.24", "198.51.100.0/24", "0.0.0.0/0", "255.255.255.255"])("accepts %s", (value) => {
    expect(isValidIpOrCidr(value)).toBe(true);
  });

  it.each(["256.0.0.1", "203.0.113", "203.0.113.24/33", "not-an-ip", "203.0.113.24/", "::1"])(
    "rejects %s",
    (value) => {
      expect(isValidIpOrCidr(value)).toBe(false);
    }
  );
});
