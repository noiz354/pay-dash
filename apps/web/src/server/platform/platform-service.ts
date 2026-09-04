import "server-only";

import { resolveProviderWrite, type ProviderWriteResolution, type ProviderWriteDeps } from "@/server/payment-flows/execute-provider-write";
import type { ProviderConnectionContext, ProviderRegistry } from "@/server/providers/registry";
import type { KycVerification, ProviderConnectedAccount, ProviderSplitRule, ProviderTransfer } from "@/domain/payments/platform";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";

/**
 * Platform capabilities (rekomendasi #6). Routes connected-accounts, transfers,
 * split-routing, and KYC verification through the provider adapters when a
 * persisted ACTIVE connection + unsealed secret resolves for an org. Returns
 * `{ connected: false }` when no connection resolves (dev/demo shell stays read-
 * only); a configured-but-failing provider propagates (never mocked).
 */

export type PlatformResolution =
  | { connected: false }
  | { connected: true; ctx: ProviderConnectionContext; res: Extract<ProviderWriteResolution, { connected: true }> };

export interface PlatformService {
  createConnectedAccount(input: { organizationId?: string; email: string; type: "express" | "custom" | "standard" }): Promise<
    { connected: false } | { connected: true; account: ProviderConnectedAccount }
  >;
  createSplitRule(input: {
    organizationId?: string;
    name: string;
    currency: string;
    destinations: Array<{ accountId: string; amount: number; percent: number | null }>;
  }): Promise<{ connected: false } | { connected: true; rule: ProviderSplitRule }>;
  createTransfer(input: { organizationId?: string; amount: number; currency: string; destination: string; description?: string | null }): Promise<
    { connected: false } | { connected: true; transfer: ProviderTransfer }
  >;
}

let cachedRegistry: ProviderRegistry | null = null;

async function getRegistry(deps: ProviderWriteDeps): Promise<ProviderRegistry> {
  if (deps.registry) return deps.registry;
  if (!cachedRegistry) {
    const { buildRuntimeConnectionResolver } = await import("@/server/repositories/runtime-connection-resolver");
    const c = await buildRuntimeConnectionResolver();
    const { buildProviderRuntimeRegistry: bpr } = await import("@/server/payment-flows/money-in-runtime");
    cachedRegistry = bpr(c);
  }
  return cachedRegistry;
}

export async function buildPlatformService(deps: ProviderWriteDeps = {}): Promise<PlatformService> {
  const resolver = deps.resolver ?? null;
  const makeCtx = async (organizationId?: string): Promise<PlatformResolution> => {
    const res = await resolveProviderWrite(organizationId, resolver ? { resolver } : {});
    if (!res.connected) {
      return { connected: false };
    }
    return { connected: true, ctx: { organizationId: res.organizationId, connectionId: res.connectionId, provider: res.provider, mode: res.mode }, res };
  };

  // Lazy-build the default registry (deferred SDK import so server-only modules
  // don't pull provider SDKs during jsdom unit tests).
  const registry = () => getRegistry(deps);

  return {
    async createConnectedAccount(input) {
      const resolved = await makeCtx(input.organizationId);
      if (!resolved.connected) return { connected: false };
      const reg = await registry();
      const raw = (await reg.invokeCapability(resolved.ctx.provider, "connectedAccounts", resolved.ctx, {
        email: input.email,
        type: input.type,
      })) as { id: string; provider: "xendit" | "stripe" };
      return { connected: true, account: { id: raw.id, provider: raw.provider, status: "PENDING", displayName: input.email, requirements: [] } };
    },

    async createSplitRule(input) {
      const resolved = await makeCtx(input.organizationId);
      if (!resolved.connected) return { connected: false };
      const reg = await registry();
      const raw = (await reg.invokeCapability(resolved.ctx.provider, "splitRouting", resolved.ctx, {
        idempotencyKey: `${resolved.res.organizationId}:${input.name}`,
        name: input.name,
        currency: input.currency,
        destinations: input.destinations,
      })) as ProviderSplitRule;
      return { connected: true, rule: raw };
    },

    async createTransfer(input) {
      const resolved = await makeCtx(input.organizationId ?? DEFAULT_DEMO_ORG);
      if (!resolved.connected) return { connected: false };
      const reg = await registry();
      const raw = (await reg.invokeCapability(resolved.ctx.provider, "internalTransfers", resolved.ctx, {
        idempotencyKey: `${resolved.res.organizationId}:${input.destination}:${input.amount}`,
        amount: input.amount,
        currency: input.currency,
        destination: input.destination,
        description: input.description ?? null,
      })) as ProviderTransfer;
      return { connected: true, transfer: raw };
    },
  };
}

/**
 * Route a KYC submission's verification state through the provider when a
 * connection resolves. A connected provider returns the authoritative
 * VERIFIED / ACTION_REQUIRED / FAILED outcome (Stripe reads the connected
 * account's verification requirements); a provider that doesn't support KYC
 * verification fails closed to ACTION_REQUIRED rather than claiming verified.
 */
export async function verifyKycProvider(organizationId?: string, deps: ProviderWriteDeps = {}): Promise<KycVerification> {
  const res = await resolveProviderWrite(organizationId ?? DEFAULT_DEMO_ORG, deps);
  if (!res.connected) {
    return { state: "SUBMITTED", provider: "xendit", requirements: ["Connect a provider to verify KYC"], verifiedAt: null };
  }
  const registry = await getRegistry(deps);
  const adapter = registry.resolve(res.provider);
  if (typeof adapter.verifyKyc !== "function") {
    return {
      state: "ACTION_REQUIRED",
      provider: res.provider,
      requirements: ["KYC verification is not available from this provider"],
      verifiedAt: null,
    };
  }
  const ctx: ProviderConnectionContext = {
    organizationId: res.organizationId,
    connectionId: res.connectionId,
    provider: res.provider,
    mode: res.mode,
  };
  return (await adapter.verifyKyc(ctx, { submissionReference: `${res.organizationId}:kyc` })) as KycVerification;
}
