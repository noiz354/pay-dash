import { describe, expect, it } from "vitest";
import {
  CAPABILITY_KEYS,
  capabilityIsSupported,
  deriveCapabilityState,
  isCapabilityAvailable,
  parseCapabilityManifest,
} from "./capabilities";

const baseState = (overrides?: Partial<{
  supported: boolean;
  configured: boolean;
  reasons: string[];
  lastVerifiedAt: string | null;
}>) =>
  deriveCapabilityState({
    supported: overrides?.supported ?? true,
    configured: overrides?.configured ?? true,
    mode: "TEST",
    reason: null,
    requirements: overrides?.reasons ?? [],
    lastVerifiedAt: overrides?.lastVerifiedAt ?? "2026-09-03T00:00:00.000Z",
  });

const completeManifest = (opts?: { supportedAll?: boolean }): Record<string, unknown> => {
  const manifest: Record<string, unknown> = {};
  for (const key of CAPABILITY_KEYS) {
    manifest[key] = {
      supported: opts?.supportedAll ?? true,
      configured: true,
      available: true,
      mode: "TEST",
      reason: null,
      requirements: [],
      lastVerifiedAt: "2026-09-03T00:00:00.000Z",
    };
  }
  return manifest;
};

describe("capability manifest", () => {
  it("exposes all 12 canonical capability keys", () => {
    expect(CAPABILITY_KEYS).toHaveLength(12);
    expect(CAPABILITY_KEYS).toContain("balanceRead");
    expect(CAPABILITY_KEYS).toContain("webhookHealth");
    expect(CAPABILITY_KEYS).toContain("splitRouting");
  });

  it("parses a valid manifest", () => {
    const manifest = parseCapabilityManifest(completeManifest());
    expect(manifest.balanceRead.supported).toBe(true);
    expect(manifest.webhookHealth.configured).toBe(true);
  });

  it("rejects an unknown capability key (no raw payload)", () => {
    const bad = completeManifest() as Record<string, unknown>;
    bad["totallyMadeUp"] = {
      supported: true,
      configured: true,
      available: true,
      mode: "TEST",
      reason: null,
      requirements: [],
      lastVerifiedAt: null,
    };
    expect(() => parseCapabilityManifest(bad)).toThrow();
  });

  it("rejects secret/PAN-shaped fields in a capability state", () => {
    const bad = completeManifest() as Record<string, Record<string, unknown>>;
    bad["balanceRead"]!.secretKey = "sk_test_SHOULD_NOT_BE_HERE";
    bad["balanceRead"]!.pan = "4242424242424242";
    expect(() => parseCapabilityManifest(bad)).toThrow();
  });
});

describe("capability derivation", () => {
  it("derives available from supported + configured + no requirements", () => {
    expect(baseState().available).toBe(true);
    expect(baseState({ configured: false }).available).toBe(false);
    expect(baseState({ supported: false }).available).toBe(false);
    expect(baseState({ reasons: ["requires account verification"] }).available).toBe(false);
  });

  it("never treats supported:false as available even when configured", () => {
    const state = baseState({ supported: false });
    expect(capabilityIsSupported(state)).toBe(false);
    expect(isCapabilityAvailable(state)).toBe(false);
  });

  it("propagates a truthful reason for an unsupported capability", () => {
    const state = deriveCapabilityState({
      supported: false,
      configured: false,
      mode: "LIVE",
      reason: "Xendit does not expose this capability",
      requirements: [],
      lastVerifiedAt: null,
    });
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Xendit does not expose this capability");
  });
});
