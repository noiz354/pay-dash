import { describe, expect, it } from "vitest";
import { isTerminalSuccess, mapProviderStatus } from "./statuses";

describe("canonical statuses", () => {
  const mapping = { PAID: "SUCCEEDED", PENDING: "PENDING" } as const;

  it("maps an unknown provider status to UNKNOWN", () => {
    const status = mapProviderStatus("NEW_PROVIDER_VALUE", mapping);
    expect(status).toBe("UNKNOWN");
    expect(isTerminalSuccess(status)).toBe(false);
  });

  it("maps only an explicit success value to success", () => {
    expect(mapProviderStatus("PAID", mapping)).toBe("SUCCEEDED");
  });
});
