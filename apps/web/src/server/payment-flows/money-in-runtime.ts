import "server-only";

import { buildProviderRegistry } from "@/server/providers";
import type { ProviderRegistry } from "@/server/providers/registry";
import { createXenditClient } from "@/lib/xendit";
import { createStripeClient } from "@/lib/stripe";
import type { XenditClientLike } from "@/server/providers/xendit";
import type { StripeClientLike } from "@/server/providers/stripe";
import { PaymentFlowService, type OperationStore, type AuditStore, type FlowActor, type ProviderFlowResult } from "./payment-flow";
import { buildRuntimeConnectionResolver, type RuntimeConnectionResolver } from "@/server/repositories/runtime-connection-resolver";
import { buildOperationStore } from "@/server/repositories/durable-operation-store";
import { buildAuditStore } from "@/server/repositories/audit-event-store";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";

/**
 * Runtime composition for TEST-mode money-in (Rekomendasi #1 + #2).
 * Resolves a real persisted connection + secret via `provider-secrets` and binds
 * the durable operation/audit stores to `DurableOperation`/`AuditEvent`.
 * When no store is available (dev/test, Prisma not generated) it falls back to
 * an in-memory store and a fail-closed resolver, so `.env` alone still cannot
 * activate a provider path without a persisted ACTIVE connection + secret.
 */

export { DEFAULT_DEMO_ORG };

export type MoneyInConnection = {
  provider: "xendit" | "stripe";
  connectionId: string;
  organizationId: string;
  mode: "TEST" | "LIVE";
};

export type MoneyInConnectionResolver = (organizationId?: string) => Promise<MoneyInConnection | null>;

export type MoneyInRuntimeDeps = {
  /** Optional override to select a connection (default: first ACTIVE TEST for the org). */
  connectionResolver?: MoneyInConnectionResolver;
  registry?: ProviderRegistry;
  operations?: OperationStore;
  audit?: AuditStore;
  actor?: FlowActor;
  /** Org to scope connection selection to; defaults to `DEFAULT_DEMO_ORG`. */
  organizationId?: string;
};

export type HostedPaymentInput = {
  externalId: string;
  amountMinor: string;
  currency: string;
  description?: string;
  payerEmail?: string | null;
  /** Optional org override for connection selection (scoped, never cross-org). */
  organizationId?: string;
};

/** Build the provider registry with real SDK clients + real secret resolution. */
function buildDefaultRegistry(resolver: RuntimeConnectionResolver): ProviderRegistry {
  const resolveSecretForConnection = async (connectionId: string): Promise<string | null> => {
    const resolved = await resolver.resolveForConnection(connectionId);
    return resolved?.secret ?? null;
  };

  return buildProviderRegistry({
    xendit: {
      createClient: (secretKey) => createXenditClient(secretKey) as unknown as XenditClientLike,
      resolveSecret: async () => {
        throw new Error("verifyConnection resolves secrets via provider-secrets; no direct ref path");
      },
      resolveSecretForConnection,
    },
    stripe: {
      createClient: (secretKey) => createStripeClient(secretKey) as unknown as StripeClientLike,
      resolveSecret: async () => {
        throw new Error("verifyConnection resolves secrets via provider-secrets; no direct ref path");
      },
      resolveSecretForConnection,
    },
  });
}

export async function createMoneyInRuntime(deps: MoneyInRuntimeDeps = {}) {
  const resolver = await buildRuntimeConnectionResolver();
  const connectionResolver =
    deps.connectionResolver ??
    (async (organizationId?: string): Promise<MoneyInConnection | null> => {
      const org = organizationId ?? deps.organizationId ?? DEFAULT_DEMO_ORG;
      const resolved = await resolver.resolveFirstActive(org);
      if (!resolved) {
        return null;
      }
      return {
        provider: resolved.connection.provider,
        connectionId: resolved.connection.connectionId,
        organizationId: resolved.connection.organizationId,
        mode: resolved.connection.mode,
      };
    });

  const registry = deps.registry ?? buildDefaultRegistry(resolver);
  const operations = deps.operations ?? (await buildOperationStore());
  const audit = deps.audit ?? (await buildAuditStore());
  const actor: FlowActor = deps.actor ?? { id: "system", roles: ["OWNER"] };

  return {
    async executeHostedPayment(input: HostedPaymentInput): Promise<ProviderFlowResult | null> {
      const connection = await connectionResolver(input.organizationId ?? deps.organizationId);
      if (!connection) {
        return null; // no ACTIVE TEST provider connection configured → dev/demo link
      }
      const service = new PaymentFlowService({
        organizationId: connection.organizationId,
        connectionId: connection.connectionId,
        provider: connection.provider,
        mode: connection.mode,
        registry,
        operations,
        audit,
      });
      return service.createHostedPayment({ actor, ...input });
    },
    _stores: { operations, audit },
  };
}
