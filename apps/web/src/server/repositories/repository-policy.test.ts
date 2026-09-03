import { describe, expect, it } from "vitest";
import { RepositoryError } from "@/domain/payments/errors";
import { assertExpectedVersion, parseOrganizationScope, requiredIdentity } from "./repository-policy";

describe("repository policy", () => {
  it("requires a strict non-empty organization scope", () => {
    expect(parseOrganizationScope({ organizationId: "org" })).toEqual({ organizationId: "org" });
    expect(() => parseOrganizationScope({ organizationId: "" })).toThrow();
    expect(() => parseOrganizationScope({ organizationId: "org", userChosenProviderId: "untrusted" })).toThrow();
  });

  it("returns typed not-found errors", () => {
    expect(requiredIdentity({ id: "resource" }, "Payment")).toEqual({ id: "resource" });
    try {
      requiredIdentity(null, "Payment");
      throw new Error("expected requiredIdentity to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryError);
      expect((error as RepositoryError).code).toBe("NOT_FOUND");
    }
  });

  it("rejects stale or invalid optimistic versions", () => {
    expect(() => assertExpectedVersion(2, 2)).not.toThrow();
    expect(() => assertExpectedVersion(3, 2)).toThrowError(expect.objectContaining({ code: "STALE_VERSION" }));
    expect(() => assertExpectedVersion(0, 0)).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
  });
});
