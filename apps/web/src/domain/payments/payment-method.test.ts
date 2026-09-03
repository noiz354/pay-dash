import { describe, expect, it } from "vitest";
import { MaskedPaymentMethodDetailsSchema } from "./payment-method";

describe("masked payment-method details", () => {
  it("accepts allowlisted masked card details", () => {
    expect(MaskedPaymentMethodDetailsSchema.parse({ kind: "CARD", brand: "visa", last4: "4242" })).toEqual({ kind: "CARD", brand: "visa", last4: "4242" });
  });

  it.each(["pan", "cvv", "otp", "secret", "token"])("rejects forbidden/unrecognized %s fields", (field) => {
    expect(() => MaskedPaymentMethodDetailsSchema.parse({ kind: "CARD", brand: "visa", last4: "4242", [field]: "sensitive" })).toThrow();
  });
});
