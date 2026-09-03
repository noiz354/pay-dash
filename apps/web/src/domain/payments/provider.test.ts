import { describe, expect, it } from "vitest";
import { parseProviderResourceRef, ProviderKeySchema, providerResourceKey } from "./provider";

describe("provider identity", () => {
  it.each(["xendit", "stripe", "future-provider2"])("accepts %s", (provider) => {
    expect(ProviderKeySchema.parse(provider)).toBe(provider);
  });

  it.each(["Stripe", "x_endit", "-stripe", "", "has space"])("rejects %s", (provider) => {
    expect(() => ProviderKeySchema.parse(provider)).toThrow();
  });

  it("scopes equal resource IDs by connection", () => {
    const first = parseProviderResourceRef({ connectionId: "conn-a", provider: "stripe", mode: "TEST", resourceType: "payment", resourceId: "same" });
    const second = parseProviderResourceRef({ connectionId: "conn-b", provider: "stripe", mode: "TEST", resourceType: "payment", resourceId: "same" });
    expect(providerResourceKey(first)).not.toBe(providerResourceKey(second));
  });
});
