import { describe, expect, it } from "vitest";
import { assertAccountConnectionTopology } from "./provider-connections";

const connection = {
  id: "connection-1",
  organizationId: "organization-1",
  provider: "xendit",
  mode: "TEST" as const,
};

describe("provider account topology", () => {
  it("accepts an account under the same organization and connection", () => {
    expect(() => assertAccountConnectionTopology(connection, {
      organizationId: "organization-1",
      connectionId: "connection-1",
    })).not.toThrow();
  });

  it("rejects cross-organization attachment", () => {
    expect(() => assertAccountConnectionTopology(connection, {
      organizationId: "organization-2",
      connectionId: "connection-1",
    })).toThrow(/same organization/);
  });

  it("rejects cross-connection attachment", () => {
    expect(() => assertAccountConnectionTopology(connection, {
      organizationId: "organization-1",
      connectionId: "connection-2",
    })).toThrow(/same organization/);
  });
});
