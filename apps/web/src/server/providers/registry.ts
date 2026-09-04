import "server-only";

import type { ProviderMode } from "@/domain/payments/connection";
import type { ConnectionVerification } from "@/domain/payments/connection";
import {
  type CapabilityKey,
  type CapabilityManifest,
  parseCapabilityManifest,
} from "@/domain/payments/capabilities";

export type ProviderKey = "xendit" | "stripe";

/** Trusted, server-derived context. Never populated from browser input. */
export interface ProviderConnectionContext {
  organizationId: string;
  connectionId: string;
  provider: ProviderKey;
  mode: ProviderMode;
}

export interface ProviderVerificationContext {
  context: ProviderConnectionContext;
  /** Opaque reference resolved by provider-secrets; never a raw secret. */
  secretRef: string | null;
}

/* ---------------------------------------------------------------------- */
/* Capability-specific subinterfaces.                                    */
/*                                                                        */
/* An adapter implements a subinterface to declare that it structurally    */
/* supports the capability. The canonical result DTOs are supplied by the  */
/* owning module (money-in, refunds, payouts, ...) and replace `unknown`.  */
/* There is no implicit mock/fallback for an unimplemented subinterface.   */
/* ---------------------------------------------------------------------- */

export interface BalanceProvider {
  getBalance(ctx: ProviderConnectionContext): Promise<unknown>;
}
export interface TransactionProvider {
  listTransactions(ctx: ProviderConnectionContext): Promise<unknown>;
}
export interface HostedPaymentProvider {
  createHostedPayment(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface CustomerProvider {
  createCustomer(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface SavedPaymentMethodProvider {
  createPaymentMethod(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface RecurringProvider {
  createRecurringPlan(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface RefundProvider {
  createRefund(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface PayoutProvider {
  createPayout(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface ConnectedAccountProvider {
  createConnectedAccount(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface TransferProvider {
  createTransfer(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}
export interface SplitRoutingProvider {
  createSplitRule(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}

/**
 * Base adapter contract. Concrete adapters must be server-only and must never
 * leak SDK models. Capability DTOs are defined by the owning module.
 */
export interface PaymentProviderAdapter {
  readonly provider: ProviderKey;
  verifyConnection(ctx: ProviderVerificationContext): Promise<ConnectionVerification>;
  getCapabilities(ctx: ProviderConnectionContext): Promise<CapabilityManifest>;

  // Capability subinterfaces are optional; presence is the support signal.
  getBalance?(ctx: ProviderConnectionContext): Promise<unknown>;
  listTransactions?(ctx: ProviderConnectionContext): Promise<unknown>;
  createHostedPayment?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createCustomer?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createPaymentMethod?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createRecurringPlan?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createRefund?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createPayout?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createConnectedAccount?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createTransfer?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
  createSplitRule?(ctx: ProviderConnectionContext, input: unknown): Promise<unknown>;
}

/** Maps a manifest capability key to the adapter method that serves it. */
const CAPABILITY_METHOD: Record<Exclude<CapabilityKey, "webhookHealth">, keyof PaymentProviderAdapter> = {
  balanceRead: "getBalance",
  transactionRead: "listTransactions",
  hostedPaymentLinks: "createHostedPayment",
  customers: "createCustomer",
  savedPaymentMethods: "createPaymentMethod",
  recurringBilling: "createRecurringPlan",
  refunds: "createRefund",
  payouts: "createPayout",
  connectedAccounts: "createConnectedAccount",
  internalTransfers: "createTransfer",
  splitRouting: "createSplitRule",
};

export type InvokableCapabilityKey = Exclude<CapabilityKey, "webhookHealth">;

export type ProviderRegistryErrorCode =
  | "UNSUPPORTED_PROVIDER"
  | "CAPABILITY_NOT_SUPPORTED"
  | "CAPABILITY_NOT_CONFIGURED"
  | "DUPLICATE_PROVIDER"
  | "INVALID_MANIFEST";

export class ProviderRegistryError extends Error {
  constructor(
    readonly code: ProviderRegistryErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderKey, PaymentProviderAdapter>();

  register(adapter: PaymentProviderAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new ProviderRegistryError(
        "DUPLICATE_PROVIDER",
        `A provider adapter is already registered for "${adapter.provider}"`,
      );
    }
    this.adapters.set(adapter.provider, adapter);
  }

  resolve(provider: ProviderKey): PaymentProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new ProviderRegistryError(
        "UNSUPPORTED_PROVIDER",
        `No provider adapter is registered for "${provider}"`,
      );
    }
    return adapter;
  }

  getCapabilities(provider: ProviderKey, ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
    return this.resolve(provider).getCapabilities(ctx);
  }

  verifyConnection(provider: ProviderKey, ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
    return this.resolve(provider).verifyConnection(ctx);
  }

  /**
   * Route an in-scope capability to the owning adapter, gated by a truthfully
   * derived manifest. No capability may be invoked when the connection has not
   * verified it or has not configured it; there is no mock fallback.
   */
  async invokeCapability(
    provider: ProviderKey,
    capability: InvokableCapabilityKey,
    ctx: ProviderConnectionContext,
    input?: unknown,
  ): Promise<unknown> {
    const adapter = this.resolve(provider);
    const method = CAPABILITY_METHOD[capability];

    if (typeof adapter[method] !== "function") {
      throw new ProviderRegistryError(
        "CAPABILITY_NOT_SUPPORTED",
        `Provider "${provider}" does not implement capability "${capability}"`,
      );
    }

    const manifest = await this.validateManifest(adapter, ctx);
    const state = manifest[capability];
    if (!state.supported) {
      throw new ProviderRegistryError(
        "CAPABILITY_NOT_SUPPORTED",
        `Provider "${provider}" does not support capability "${capability}"`,
      );
    }
    if (!state.configured) {
      throw new ProviderRegistryError(
        "CAPABILITY_NOT_CONFIGURED",
        `Provider "${provider}" capability "${capability}" is not configured for this connection`,
      );
    }

    const fn = adapter[method] as (
      c: ProviderConnectionContext,
      i?: unknown,
    ) => Promise<unknown>;
    return fn(ctx, input);
  }

  private async validateManifest(
    adapter: PaymentProviderAdapter,
    ctx: ProviderConnectionContext,
  ): Promise<CapabilityManifest> {
    const raw = await adapter.getCapabilities(ctx);
    try {
      return parseCapabilityManifest(raw);
    } catch (err) {
      throw new ProviderRegistryError(
        "INVALID_MANIFEST",
        `Provider "${adapter.provider}" returned an invalid capability manifest`,
        err,
      );
    }
  }
}

export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
