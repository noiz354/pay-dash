import "server-only";

import { buildProviderRegistry } from "@/server/providers";
import type { ProviderRegistry } from "@/server/providers/registry";
import { createXenditClient } from "@/lib/xendit";
import { createStripeClient } from "@/lib/stripe";
import type { XenditClientLike } from "@/server/providers/xendit";
import type { StripeClientLike } from "@/server/providers/stripe";
import { PaymentFlowService, type OperationStore, type AuditStore, type FlowActor, type ProviderFlowResult } from "./payment-flow";
import { InMemoryOperationStore, InMemoryAuditStore } from "./in-memory-stores";

/**
 * Runtime composition for TEST-mode money-in. Wires the provider registry
 * (real SDK client factories at the server-only boundary), the durable
 * operation/audit stores (or in-memory dev substitutes), and the payment-flow
 * orchestration into a single callable. The server action's money-in path calls
 * `executeHostedPayment`; when no provider connection is configured it returns
 * `null` and the caller keeps the local (dev/demo) link — a configured provider
 * that fails is never silently downgraded to mock success.
 */

export type MoneyInConnection = {
  provider: "xendit" | "stripe";
  connectionId: string;
  organizationId: string;
  mode: "TEST" | "LIVE";
};

export type MoneyInConnectionResolver = () => Promise<MoneyInConnection | null>;

export type MoneyInRuntimeDeps = {
  connectionResolver?: MoneyInConnectionResolver;
  registry?: ProviderRegistry;
  operations?: OperationStore;
  audit?: AuditStore;
  resolveSecretNotSupported?: never;
  /** Optional actor used when the action has no authenticated member context. */
  actor?: FlowActor;
};

export type HostedPaymentInput = {
  externalId: string;
  amountMinor: string;
  currency: string;
  description?: string;
  payerEmail?: string | null;
};

/** Build the default provider registry with real SDK clients + fail-closed secret resolution. */
function buildDefaultRegistry(): ProviderRegistry {
  return buildProviderRegistry({
    xendit: {
      createClient: (secretKey) => createXenditClient(secretKey) as unknown as XenditClientLike,
      resolveSecret: async () => {
        throw new Error("No secret resolver configured; provider-secrets must be wired");
      },
      resolveSecretForConnection: async () => null,
    },
    stripe: {
      createClient: (secretKey) => createStripeClient(secretKey) as unknown as StripeClientLike,
      resolveSecret: async () => {
        throw new Error("No secret resolver configured; provider-secrets must be wired");
      },
      resolveSecretForConnection: async () => null,
    },
  });
}

export function createMoneyInRuntime(deps: MoneyInRuntimeDeps = {}) {
  const connectionResolver = deps.connectionResolver ?? (async (): Promise<MoneyInConnection | null> => null);
  const registry = deps.registry ?? buildDefaultRegistry();
  const operations = deps.operations ?? new InMemoryOperationStore();
  const audit = deps.audit ?? new InMemoryAuditStore();
  const actor: FlowActor = deps.actor ?? { id: "system", roles: ["OWNER"] };

  return {
    async executeHostedPayment(input: HostedPaymentInput): Promise<ProviderFlowResult | null> {
      const connection = await connectionResolver();
      if (!connection) {
        return null; // no TEST provider connection configured → dev/demo link
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
