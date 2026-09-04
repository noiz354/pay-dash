import "server-only";

import { deriveCapabilityState, type CapabilityManifest, type CapabilityState } from "@/domain/payments/capabilities";
import type { ConnectionVerification, WebhookHealthState } from "@/domain/payments/connection";
import { amountFromMinor, canonicalTransactionStatus, type ProviderTransaction } from "@/domain/payments/provider-read";
import type {
  PaymentProviderAdapter,
  ProviderConnectionContext,
  ProviderVerificationContext,
} from "./registry";

/* ---------------------------------------------------------------------- */
/* Canonical Stripe error taxonomy                                         */
/* ---------------------------------------------------------------------- */

export type StripeErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "ACCOUNT_REQUIRES_ACTION"
  | "UNKNOWN";

export class StripeError<T extends StripeErrorCode = StripeErrorCode> extends Error {
  constructor(
    readonly provider: "stripe",
    readonly code: T,
    readonly retryable: boolean,
    readonly category: "auth" | "config" | "network" | "validation" | "upstream" | "unknown",
    message: string,
    readonly status: number | null,
    readonly operation: string,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

function redactSecretsInText(text: string): string {
  return text
    .replace(/\b(sk|pk|rk|whsec)[-_][A-Za-z0-9_]{8,}\b/g, "[redacted]")
    .replace(/Bearer [A-Za-z0-9_\-]{8,}/g, "Bearer [redacted]");
}

export function normalizeStripeError(err: unknown, operation = "stripe.operation"): StripeError {
  const e = err as {
    type?: string;
    code?: string;
    statusCode?: number;
    status?: number;
    raw?: { statusCode?: number };
    message?: string;
    param?: string;
  };
  const status = typeof e?.statusCode === "number" ? e.statusCode : e?.raw?.statusCode ?? e?.status ?? null;
  const type = e?.type ?? "";
  const rawCode = e?.code ?? "";
  const msg = redactSecretsInText(String(e?.message ?? "Unknown Stripe error")).slice(0, 240);

  let code: StripeErrorCode;
  if (rawCode === "idempotency_error") code = "IDEMPOTENCY_CONFLICT";
  else if (rawCode === "account_invalid") code = "ACCOUNT_REQUIRES_ACTION";
  else if (type === "StripeAuthenticationError" || status === 401) code = "UNAUTHORIZED";
  else if (type === "StripePermissionError" || status === 403) code = "FORBIDDEN";
  else if (type === "StripeRateLimitError" || status === 429) code = "RATE_LIMITED";
  else if (type === "StripeInvalidRequestError" || status === 400 || status === 422) code = "INVALID_REQUEST";
  else if (type === "StripeCardError") code = "INVALID_REQUEST";
  else if (type === "StripeInvalidRequestError" && status === 404) code = "NOT_FOUND";
  else if (type === "StripeConnectionError") code = "TIMEOUT";
  else if (status && status >= 500) code = "UNAVAILABLE";
  else code = "UNKNOWN";

  const retryable =
    code === "RATE_LIMITED" || code === "TIMEOUT" || code === "UNAVAILABLE" || code === "IDEMPOTENCY_CONFLICT";

  const category =
    code === "UNAUTHORIZED" || code === "FORBIDDEN"
      ? "auth"
      : code === "RATE_LIMITED" || code === "TIMEOUT"
        ? "network"
        : code === "INVALID_REQUEST"
          ? "validation"
          : code === "ACCOUNT_REQUIRES_ACTION"
            ? "config"
            : code === "UNAVAILABLE"
              ? "upstream"
              : "unknown";

  return new StripeError("stripe", code, retryable, category, msg, status, operation);
}

/* ---------------------------------------------------------------------- */
/* Structural client surface (server-only; never leaks SDK models)         */
/* ---------------------------------------------------------------------- */

export interface StripeAccountLike {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  capabilities?: Record<string, string>;
  requirements?: {
    currently_due?: string[];
    eventually_due?: string[];
    disabled_reason?: string | null;
  };
}

export interface StripeBalanceLike {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
}

export interface StripeCheckoutSessionLike {
  id: string;
  url: string | null;
  status: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  customer: string | null;
}

export interface StripeRefundLike {
  id: string;
  status: string;
}

export interface StripeChargeLike {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created?: number;
  livemode?: boolean;
  description?: string | null;
  refunded?: boolean;
  metadata?: Record<string, unknown>;
}

export interface StripeConnectAccountLike {
  id: string;
  object: string;
}

export interface StripeTransferLike {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  status?: string | null;
}

export interface StripeCustomerLike {
  id: string;
  object: string;
  email?: string | null;
}

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  currency: string | null;
  customer: string | null;
}

export interface StripeClientLike {
  readonly accounts?: {
    retrieve(id: string): Promise<StripeAccountLike>;
    create?(params: Record<string, unknown>): Promise<StripeConnectAccountLike>;
  };
  readonly balance?: {
    retrieve(): Promise<StripeBalanceLike>;
  };
  readonly checkout?: {
    sessions: {
      create(params: Record<string, unknown>): Promise<StripeCheckoutSessionLike | StripeClientLike>;
    };
  };
  readonly refunds?: {
    create(params: Record<string, unknown>): Promise<StripeRefundLike>;
  };
  readonly charges?: {
    list(params?: Record<string, unknown>): Promise<{ data: StripeChargeLike[] }>;
  };
  readonly transfers?: {
    create(params: Record<string, unknown>): Promise<StripeTransferLike>;
  };
  readonly customers?: {
    create(params: Record<string, unknown>): Promise<StripeCustomerLike>;
  };
  readonly subscriptions?: {
    create(params: Record<string, unknown>): Promise<StripeSubscriptionLike>;
  };
}

export interface StripeAdapterDeps {
  createClient(secretKey: string): StripeClientLike;
  resolveSecret(secretRef: string): Promise<string>;
  resolveSecretForConnection(connectionId: string): Promise<string | null>;
  now?(): Date;
}

/** Map a Stripe Charge to the canonical transaction DTO (never leaks SDK model). */
export function mapStripeCharge(charge: StripeChargeLike): ProviderTransaction {
  const amount = amountFromMinor(charge.amount, charge.currency);
  const status = charge.refunded ? "REFUNDED" : canonicalTransactionStatus(charge.status);
  const referenceId = String((charge.metadata?.referenceId as string | undefined) ?? charge.id);
  return {
    id: charge.id,
    referenceId,
    at: new Date((charge.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    amount: amount.amount,
    currency: amount.currency,
    status,
    channel: "CARD",
    methodLabel: "Card",
    customerName: (charge.metadata?.customerName as string | undefined) ?? null,
    customerEmail: (charge.metadata?.customerEmail as string | undefined) ?? null,
    description: charge.description ?? null,
    fee: null,
    net: amount.amount,
    source: "stripe-live",
  };
}

/* ---------------------------------------------------------------------- */
/* Adapter                                                                */
/* ---------------------------------------------------------------------- */

const SUPPORT_BY_CAPABILITY: Record<Exclude<keyof CapabilityManifest, "webhookHealth">, boolean> = {
  balanceRead: true,
  transactionRead: true,
  hostedPaymentLinks: true, // Checkout Session
  customers: true,
  savedPaymentMethods: true, // SetupIntent + PaymentMethod
  refunds: true,
  payouts: true,
  recurringBilling: true, // Billing Subscription
  connectedAccounts: true, // Connect Account
  internalTransfers: true, // Connect Transfer
  splitRouting: true, // application fee / separate charges and transfers
};

export class StripeAdapter implements PaymentProviderAdapter {
  readonly provider = "stripe" as const;

  constructor(private readonly deps: StripeAdapterDeps) {}

  private async clientForRef(secretRef: string | null): Promise<StripeClientLike> {
    if (!secretRef) {
      throw normalizeStripeError(new Error("Missing secret reference"), "stripe.connect");
    }
    const secret = await this.deps.resolveSecret(secretRef);
    return this.deps.createClient(secret);
  }

  private async capabilities(ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
    // Write capabilities are executed through the payment-flow orchestration
    // (idempotency + durable-operation state machine + access/step-up + audit),
    // which is now wired. TEST-mode writes are configured and routed; LIVE-mode
    // writes stay blocked until a KMS-backed secret store and live-activation
    // gates are in place.
    const writesConfigured = ctx.mode === "TEST";
    const manifest = {} as CapabilityManifest;
    const build = (state: Omit<CapabilityState, "available">): CapabilityState => deriveCapabilityState(state);
    for (const key of [
      "balanceRead",
      "transactionRead",
      "hostedPaymentLinks",
      "customers",
      "savedPaymentMethods",
      "recurringBilling",
      "refunds",
      "payouts",
      "connectedAccounts",
      "internalTransfers",
      "splitRouting",
    ] as const) {
      const supported = SUPPORT_BY_CAPABILITY[key];
      const isRead = key === "balanceRead" || key === "transactionRead";
      const isWrite = !isRead;
      manifest[key] = build({
        supported,
        configured: isRead ? true : supported ? writesConfigured : false,
        mode: ctx.mode,
        reason: supported
          ? isRead
            ? null
            : isWrite
              ? ctx.mode === "TEST"
                ? "TEST-mode write is routed through the payment-flow orchestration"
                : "Required for LIVE activation: KMS-backed secret store + live-activation gates"
              : null
          : "Not supported by Stripe",
        requirements: supported
          ? isRead
            ? []
            : ["durable-operation", "organization-access", "financial-step-up", "audit"]
          : [],
        lastVerifiedAt: null,
      });
    }
    manifest.webhookHealth = build({
      supported: true,
      configured: false,
      mode: ctx.mode,
      reason: "Stripe webhook endpoint is not yet verified",
      requirements: ["Configure the Stripe webhook endpoint"],
      lastVerifiedAt: null,
    });
    return manifest;
  }

  async getCapabilities(ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
    return this.capabilities(ctx);
  }

  async verifyConnection(ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
    const now = this.deps.now?.() ?? new Date();
    const account = await this.retrieveAccount(ctx);
    const webhookHealth: WebhookHealthState = { status: "UNCONFIGURED", reason: "Configure the Stripe webhook endpoint", lastCheckedAt: null };
    if (account.charges_enabled && account.payouts_enabled && !account.requirements?.disabled_reason) {
      return {
        verified: true,
        provider: "stripe",
        mode: ctx.context.mode,
        accountIdentity: account.id,
        accountDisplayName: account.id,
        permissionsVerified: true,
        capabilities: await this.capabilities(ctx.context),
        webhookHealth,
        requirements: account.requirements?.currently_due ?? [],
        state: "ACTIVE",
        reason: null,
        verifiedAt: now.toISOString(),
      };
    }
    const due = account.requirements?.currently_due ?? [];
    return {
      verified: false,
      provider: "stripe",
      mode: ctx.context.mode,
      accountIdentity: account.id,
      accountDisplayName: account.id,
      permissionsVerified: false,
      capabilities: await this.capabilities(ctx.context),
      webhookHealth,
      requirements: due,
      state: due.length ? "ACTION_REQUIRED" : "FAILED",
      reason: account.requirements?.disabled_reason ?? null,
      verifiedAt: now.toISOString(),
    };
  }

  private async retrieveAccount(ctx: ProviderVerificationContext): Promise<StripeAccountLike> {
    try {
      const client = await this.clientForRef(ctx.secretRef);
      if (!client.accounts) {
        return { id: "", charges_enabled: false, payouts_enabled: false };
      }
      const account = await client.accounts.retrieve("self");
      return account;
    } catch (err) {
      const normalized = normalizeStripeError(err, "stripe.verifyConnection");
      return {
        id: "",
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { disabled_reason: normalized.message },
      };
    }
  }

  private async clientForConnection(connectionId: string): Promise<StripeClientLike> {
    const secret = await this.deps.resolveSecretForConnection(connectionId);
    if (!secret) {
      throw normalizeStripeError(new Error("No secret configured for this connection"), "stripe.invoke");
    }
    return this.deps.createClient(secret);
  }

  async getBalance(ctx: ProviderConnectionContext): Promise<{ available: number; currency: string; source: "stripe-live"; asOf: string }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.balance) {
      throw normalizeStripeError(new Error("Balance capability not available on the client"), "stripe.getBalance");
    }
    const balance = await client.balance.retrieve();
    const available = balance.available?.[0]?.amount ?? 0;
    const currency = balance.available?.[0]?.currency ?? "IDR";
    return { available, currency, source: "stripe-live", asOf: new Date().toISOString() };
  }

  async listTransactions(ctx: ProviderConnectionContext): Promise<ProviderTransaction[]> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.charges) {
      throw normalizeStripeError(new Error("Charge list capability not available on the client"), "stripe.listTransactions");
    }
    const res = await client.charges.list({ limit: 100 });
    return (res?.data ?? []).map((c) => mapStripeCharge(c));
  }

  async createHostedPayment(
    ctx: ProviderConnectionContext,
    input: { externalId: string; amount: number; currency: string; customerEmail?: string | null; mode: "TEST" | "LIVE" },
  ): Promise<{ id: string; checkoutUrl: string; status: string; externalId: string; provider: "stripe" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.checkout?.sessions) {
      throw normalizeStripeError(new Error("Checkout Sessions capability not available on the client"), "stripe.createHostedPayment");
    }
    const session = (await client.checkout.sessions.create({
      mode: "payment",
      success_url: "https://example.test/checkout/success",
      cancel_url: "https://example.test/checkout/cancel",
      line_items: [{ price_data: { currency: input.currency, unit_amount: input.amount, product_data: { name: input.externalId } }, quantity: 1 }],
      client_reference_id: input.externalId,
      customer_email: input.customerEmail ?? undefined,
    })) as StripeCheckoutSessionLike;
    if (!session?.url) {
      throw normalizeStripeError(new Error("Invalid Checkout Session response: missing url"), "stripe.createHostedPayment");
    }
    return { id: session.id, checkoutUrl: session.url, status: session.payment_status ?? "unpaid", externalId: input.externalId, provider: "stripe" };
  }

  async createRefund(
    ctx: ProviderConnectionContext,
    input: { idempotencyKey: string; paymentId: string; amount: number; currency: string; reason?: string | null },
  ): Promise<{ id: string; status: string; provider: "stripe" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.refunds) {
      throw normalizeStripeError(new Error("Refund capability not available on the client"), "stripe.createRefund");
    }
    const refund = await client.refunds.create({
      payment_intent: input.paymentId,
      amount: input.amount,
      reason: input.reason === "requested_by_customer" ? "requested_by_customer" : undefined,
    });
    return { id: refund.id, status: refund.status ?? "pending", provider: "stripe" };
  }

  async createTransfer(
    ctx: ProviderConnectionContext,
    input: { idempotencyKey: string; amount: number; currency: string; destination: string; description?: string | null },
  ): Promise<import("@/domain/payments/platform").ProviderTransfer> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.transfers) {
      throw normalizeStripeError(new Error("Transfers capability not available on the client"), "stripe.createTransfer");
    }
    const transfer = await client.transfers.create({
      amount: input.amount,
      currency: input.currency,
      destination: input.destination,
      description: input.description ?? undefined,
      transfer_group: input.idempotencyKey,
    });
    return { id: transfer.id, provider: "stripe", amount: transfer.amount, currency: transfer.currency, status: transfer.status ?? "pending", destination: transfer.destination };
  }

  async createSplitRule(
    ctx: ProviderConnectionContext,
    input: { idempotencyKey: string; name: string; currency: string; destinations: Array<{ accountId: string; amount: number; percent: number | null }> },
  ): Promise<import("@/domain/payments/platform").ProviderSplitRule> {
    // Stripe applies split at charge time via application_fee_amount / transfer_data
    // (ADR-0028). The rule itself is modeled server-side as the canonical split;
    // it is not a standalone Stripe object. Return the normalized rule.
    const ruleId = `split_${ctx.organizationId.slice(0, 8)}_${input.idempotencyKey.replace(/[\W_]/g, "").slice(0, 12)}`;
    return {
      id: ruleId,
      provider: "stripe",
      name: input.name,
      currency: input.currency,
      destinations: input.destinations,
      status: "ACTIVE",
    };
  }

  async createCustomer(
    ctx: ProviderConnectionContext,
    input: { referenceId: string; name?: string; email?: string | null },
  ): Promise<import("@/domain/payments/commerce").ProviderCustomer> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.customers) {
      throw normalizeStripeError(new Error("Customer capability not available on the client"), "stripe.createCustomer");
    }
    const customer = await client.customers.create({
      email: input.email ?? undefined,
      name: input.name ?? undefined,
      metadata: { referenceId: input.referenceId },
    });
    return { id: customer.id, provider: "stripe", referenceId: input.referenceId, status: "VERIFIED" };
  }

  async createRecurringPlan(
    ctx: ProviderConnectionContext,
    input: {
      idempotencyKey: string;
      planName: string;
      currency: string;
      interval: "monthly" | "yearly";
      amountMinor: number;
      customerId: string;
    },
  ): Promise<import("@/domain/payments/commerce").ProviderRecurringPlan> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.subscriptions) {
      throw normalizeStripeError(new Error("Subscriptions capability not available on the client"), "stripe.createRecurringPlan");
    }
    const interval = input.interval === "monthly" ? "month" : "year";
    const subscription = await client.subscriptions.create({
      customer: input.customerId,
      items: [{ price_data: { currency: input.currency, unit_amount: input.amountMinor, recurring: { interval }, product_data: { name: input.planName } } }],
      metadata: { referenceId: input.idempotencyKey },
    });
    return {
      id: subscription.id,
      provider: "stripe",
      planName: input.planName,
      currency: subscription.currency ?? input.currency,
      interval: input.interval,
      amountMinor: input.amountMinor,
      status: subscription.status === "active" || subscription.status === "trialing" ? "ACTIVE" : "DRAFT",
    };
  }

  async createConnectedAccount(
    ctx: ProviderConnectionContext,
    input: { email: string; type: "express" | "custom" | "standard" },
  ): Promise<{ id: string; provider: "stripe" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.accounts?.create) {
      throw normalizeStripeError(new Error("Accounts.create capability not available on the client"), "stripe.createConnectedAccount");
    }
    const account = await client.accounts.create({
      type: input.type,
      email: input.email,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
    });
    return { id: account.id, provider: "stripe" };
  }
}
