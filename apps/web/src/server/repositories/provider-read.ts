import "server-only";

import { buildProviderRegistry } from "@/server/providers";
import type { ProviderConnectionContext } from "@/server/providers/registry";
import { createXenditClient } from "@/lib/xendit";
import { createStripeClient } from "@/lib/stripe";
import type { XenditClientLike } from "@/server/providers/xendit";
import type { StripeClientLike } from "@/server/providers/stripe";
import type { ProviderBalance, ProviderReadResult, ProviderTransaction } from "@/domain/payments/provider-read";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { buildRuntimeConnectionResolver } from "./runtime-connection-resolver";

/**
 * Provider read path (rekomendasi #4). Routes balance/transaction reads through
 * the provider adapter when a persisted ACTIVE connection + unsealed secret
 * resolves for an organization (org-scoped, never cross-org). When no connection
 * is configured it returns `{ connected: false }` so the caller can fall back to
 * the in-memory dev/demo store. A configured-but-failing provider is never
 * silently downgraded — the error propagates.
 */

export type ReadContext = { provider: "xendit" | "stripe"; organizationId: string; connectionId: string; mode: "TEST" | "LIVE" };

export interface ProviderReadService {
  readBalance(organizationId?: string): Promise<ProviderReadResult<ProviderBalance>>;
  readTransactions(organizationId?: string): Promise<ProviderReadResult<ProviderTransaction[]>>;
}

function toContext(resolved: { connection: { provider: "xendit" | "stripe"; connectionId: string; organizationId: string; mode: "TEST" | "LIVE" } }): ProviderConnectionContext {
  const c = resolved.connection;
  return { organizationId: c.organizationId, connectionId: c.connectionId, provider: c.provider, mode: c.mode };
}

let cachedReadService: Promise<ProviderReadService> | null = null;

/** Memoized read service shared by the data modules (avoids re-building the
 *  registry on every read). In tests with no connection it stays `connected:false`,
 *  so the in-memory dev/demo ledger remains the fallback. */
export function getProviderReadService(): Promise<ProviderReadService> {
  if (!cachedReadService) {
    cachedReadService = buildProviderReadService();
  }
  return cachedReadService;
}

/** Test hook: reset the memoized read service so tests can inject a resolver. */
export function resetProviderReadService(): void {
  cachedReadService = null;
}

export async function buildProviderReadService(input?: {
  resolver?: Awaited<ReturnType<typeof buildRuntimeConnectionResolver>>;
  registry?: ReturnType<typeof buildProviderRegistry>;
  now?: () => Date;
}): Promise<ProviderReadService> {
  const resolver = input?.resolver ?? (await buildRuntimeConnectionResolver());

  // Build a registry that resolves secrets for a resolved connection.
  // Reuse the same resolver as the money-in path so secret resolution is real.
  const registry =
    input?.registry ??
    buildProviderRegistry({
      xendit: {
        createClient: (secretKey) => createXenditClient(secretKey) as unknown as XenditClientLike,
        resolveSecret: async () => {
          throw new Error("Read path resolves secrets via a connection; no direct ref path");
        },
        resolveSecretForConnection: async (connectionId: string) => {
          const r = await resolver.resolveForConnection(connectionId);
          return r?.secret ?? null;
        },
      },
      stripe: {
        createClient: (secretKey) => createStripeClient(secretKey) as unknown as StripeClientLike,
        resolveSecret: async () => {
          throw new Error("Read path resolves secrets via a connection; no direct ref path");
        },
        resolveSecretForConnection: async (connectionId: string) => {
          const r = await resolver.resolveForConnection(connectionId);
          return r?.secret ?? null;
        },
      },
    });

  return {
    async readBalance(organizationId?: string): Promise<ProviderReadResult<ProviderBalance>> {
      const resolved = await resolver.resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG);
      if (!resolved) {
        return { connected: false };
      }
      const balance = (await registry.invokeCapability(resolved.connection.provider, "balanceRead", toContext(resolved))) as ProviderBalance;
      return { connected: true, data: balance as ProviderBalance };
    },

    async readTransactions(organizationId?: string): Promise<ProviderReadResult<ProviderTransaction[]>> {
      const resolved = await resolver.resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG);
      if (!resolved) {
        return { connected: false };
      }
      const rows = (await registry.invokeCapability(resolved.connection.provider, "transactionRead", toContext(resolved))) as ProviderTransaction[];
      return { connected: true, data: rows };
    },
  };
}
