import { describe, expect, it } from "vitest";
import {
  CONNECTION_STATUSES,
  InvalidStatusTransitionError,
  canServiceConnection,
  canTransitionConnectionStatus,
  isTerminalConnectionStatus,
  parseConnectionStatus,
  transitionConnectionStatus,
  type ConnectionStatus,
} from "./connection";

describe("connection status", () => {
  it("keeps every declared status as a valid member of the enum", () => {
    expect(CONNECTION_STATUSES).toHaveLength(11);
    for (const status of CONNECTION_STATUSES) {
      expect(parseConnectionStatus(status)).toBe(status);
    }
  });

  it("rejects an unknown status value", () => {
    expect(() => parseConnectionStatus("NOT_A_STATUS")).toThrow();
  });
});

describe("connection transitions", () => {
  const valid: Array<[ConnectionStatus, ConnectionStatus]> = [
    ["DRAFT", "CONNECTING"],
    ["CONNECTING", "VERIFYING"],
    ["VERIFYING", "ACTIVE"],
    ["VERIFYING", "ACTION_REQUIRED"],
    ["ACTION_REQUIRED", "VERIFYING"],
    ["ACTIVE", "DEGRADED"],
    ["DEGRADED", "ACTIVE"],
    ["ACTIVE", "ROTATION_REQUIRED"],
    ["ROTATION_REQUIRED", "VERIFYING"],
    ["ACTIVE", "DISCONNECTING"],
    ["DISCONNECTING", "DISCONNECTED"],
    ["DISCONNECTED", "CONNECTING"],
    ["FAILED", "CONNECTING"],
  ];

  it("accepts every permitted transition and returns the next status", () => {
    for (const [from, to] of valid) {
      expect(canTransitionConnectionStatus(from, to)).toBe(true);
      expect(transitionConnectionStatus(from, to)).toBe(to);
    }
  });

  it("rejects disallowed transitions", () => {
    const invalid: Array<[ConnectionStatus, ConnectionStatus]> = [
      ["DRAFT", "ACTIVE"],
      ["ACTIVE", "CONNECTING"],
      ["DRAFT", "REVOKED"],
      ["REVOKED", "ACTIVE"],
    ];
    for (const [from, to] of invalid) {
      expect(canTransitionConnectionStatus(from, to)).toBe(false);
      expect(() => transitionConnectionStatus(from, to)).toThrow(InvalidStatusTransitionError);
    }
  });

  it("treats REVOKED as terminal", () => {
    expect(isTerminalConnectionStatus("REVOKED")).toBe(true);
    expect(isTerminalConnectionStatus("ACTIVE")).toBe(false);
  });

  it("only ACTIVE can service operations", () => {
    expect(canServiceConnection("ACTIVE")).toBe(true);
    expect(canServiceConnection("DEGRADED")).toBe(false);
    expect(canServiceConnection("REVOKED")).toBe(false);
  });
});
