import "server-only";

import { deriveCapabilityState, type CapabilityManifest, type CapabilityState } from "@/domain/payments/capabilities";
import type { ConnectionVerification } from "@/domain/payments/connection";
import { amountFromMinor, canonicalTransactionStatus, type ProviderTransaction } from "@/domain/payments/provider-read";
import type {
  PaymentProviderAdapter,
  ProviderConnectionContext,
  ProviderVerificationContext,
} from "./registry";

/* ---------------------------------------------------------------------- */
/* Canonical error taxonomy (xendit-adapter)                              */
/* ---------------------------------------------------------------------- */

export type XenditErrorCode =
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
  | "UNKNOWN";

export type XenditErrorCategory = "auth" | "config" | "network" | "validation" | "upstream" | "unknown";

export class CanonicalProviderError extends Error {
  constructor(
    readonly provider: "xendit",
    readonly code: XenditErrorCode,
    readonly retryable: boolean,
    readonly category: XenditErrorCategory,
    message: string,
    readonly status: number | null,
    readonly operation: string,
  ) {
    super(message);
    this.name = "CanonicalProviderError";
  }
}

/** Redact obvious secret tokens (sk_/rk_/whsec_/Xendit keys) from text. */
function redactSecretsInText(text: string): string {
  return text
    .replace(/\b(sk|pk|rk|whsec)[-_][A-Za-z0-9_]{8,}\b/g, "[redacted]")
    .replace(/\b[xX]endit[_-][A-Za-z0-9_]{8,}\b/g, "[redacted]");
}

/** Map a thrown Xendit/HTTP error to a safe canonical error. No credentials leak. */
export function normalizeXenditError(err: unknown, operation = "xendit.operation"): CanonicalProviderError {
  const e = err as { status?: number; response?: { status?: number }; message?: string };
  const status = typeof e?.status === "number" ? e.status : e?.response?.status ?? null;
  const msg = redactSecretsInText(String(e?.message ?? "Unknown Xendit error")).slice(0, 200);

  const code: XenditErrorCode =
    status === 401 || status === 403
      ? status === 403
        ? "FORBIDDEN"
        : "UNAUTHORIZED"
      : status === 429
        ? "RATE_LIMITED"
        : status === 400 || status === 422
          ? "INVALID_REQUEST"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status && status >= 500
                ? "UNAVAILABLE"
                : "UNKNOWN";

  // TIMEOUT / IDEMPOTENCY_CONFLICT are emitted by explicit transport/idempotency
  // handling elsewhere; here we flag the retryable upstream classes.
  const retryable = code === "UNAVAILABLE" || code === "RATE_LIMITED";

  const category: XenditErrorCategory =
    code === "UNAUTHORIZED" || code === "FORBIDDEN"
      ? "auth"
      : code === "RATE_LIMITED"
        ? "network"
        : code === "INVALID_REQUEST"
          ? "validation"
          : code === "UNAVAILABLE"
            ? "upstream"
            : "unknown";

  return new CanonicalProviderError("xendit", code, retryable, category, msg, status, operation);
}

/* ---------------------------------------------------------------------- */
/* Structural client surface (server-only; never leaks SDK models)        */
/* ---------------------------------------------------------------------- */

export interface XenditBalanceClient {
  getBalance(args?: {
    accountType?: "CASH" | "HOLDING";
    currency?: string;
    forUserId?: string;
  }): Promise<{ balance: number; currency: string }>;
}

export interface XenditTransactionClient {
  getAllTransactions(args?: Record<string, unknown>): Promise<unknown>;
  getTransactionByID(args: { id: string }): Promise<unknown>;
}

export interface XenditInvoiceClient {
  createInvoice(args: Record<string, unknown>): Promise<{ id: string; invoiceUrl?: string; status?: string }>;
}

export interface XenditRefundClient {
  createRefund(args: { data: Record<string, unknown>; idempotencyKey?: string }): Promise<{ id: string; status?: string }>;
}

export interface XenditPayoutClient {
  createPayout(args: { idempotencyKey: string; data: Record<string, unknown> }): Promise<{ id: string; status?: string }>;
}

export interface XenditCustomerClient {
  create(args: { referenceId: string; givenNames?: string; email?: string; mobileNumber?: string; description?: string }): Promise<{ id: string; reference_id?: string }>;
}

export interface XenditClientLike {
  readonly Balance: XenditBalanceClient;
  readonly Transaction?: XenditTransactionClient;
  readonly Invoice?: XenditInvoiceClient;
  readonly Refund?: XenditRefundClient;
  readonly Payout?: XenditPayoutClient;
  readonly Customer?: XenditCustomerClient;
}

export interface XenditAdapterDeps {
  createClient(secretKey: string): XenditClientLike;
  /** Resolve a secret by its persisted reference (verifyConnection path). */
  resolveSecret(secretRef: string): Promise<string>;
  /** Resolve the secret for a connection by its id (capability invocation path). */
  resolveSecretForConnection(connectionId: string): Promise<string | null>;
  now?(): Date;
}

/** Map an arbitrary Xendit transaction/charge payload to the canonical DTO. */
export function mapXenditTransactions(raw: unknown): ProviderTransaction[] {
  const rows = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? []);
  return rows.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const amount = amountFromMinor(Number(o.amount ?? 0), String(o.currency ?? "IDR"));
    const status = canonicalTransactionStatus(o.status);
    const ref = String(o.referenceId ?? o.id ?? "");
    const id = String(o.id ?? "");
    return {
      id,
      referenceId: ref,
      at: String(o.createdAt ?? o.updatedAt ?? new Date().toISOString()),
      amount: amount.amount,
      currency: amount.currency,
      status,
      channel: String(o.channel ?? "VA"),
      methodLabel: String(o.paymentMethod ?? o.channel ?? "Xendit"),
      customerName: o.customerName ? String(o.customerName) : null,
      customerEmail: o.customerEmail ? String(o.customerEmail) : null,
      description: o.description ? String(o.description) : null,
      fee: o.fee != null ? Number(o.fee) : null,
      net: amount.amount,
      source: "xendit-live",
    };
  });
}

/* ---------------------------------------------------------------------- */
/* Adapter                                                               */
/* ---------------------------------------------------------------------- */

const SUPPORT_BY_CAPABILITY: Record<Exclude<keyof CapabilityManifest, "webhookHealth">, boolean> = {
  balanceRead: true,
  transactionRead: true,
  hostedPaymentLinks: true, // Invoice
  customers: true,
  savedPaymentMethods: true,
  refunds: true,
  payouts: true,
  recurringBilling: false, // requires approved direct HTTP API
  connectedAccounts: false, // xenPlatform manual HTTP
  internalTransfers: false, // manual HTTP / deferred
  splitRouting: false, // manual HTTP / deferred
};

export class XenditAdapter implements PaymentProviderAdapter {
  readonly provider = "xendit" as const;

  constructor(private readonly deps: XenditAdapterDeps) {}

  private async clientForRef(secretRef: string | null): Promise<XenditClientLike> {
    if (!secretRef) {
      throw normalizeXenditError(new Error("Missing secret reference"), "xendit.connect");
    }
    const secret = await this.deps.resolveSecret(secretRef);
    return this.deps.createClient(secret);
  }

  async verifyConnection(ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
    const now = this.deps.now?.() ?? new Date();
    try {
      const client = await this.clientForRef(ctx.secretRef);
      // Read-only CASH/IDR probe. This also certifies read permission presence.
      const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
      if (!Number.isFinite(balance.balance) || !balance.currency) {
        return {
          verified: false,
          provider: "xendit",
          mode: ctx.context.mode,
          accountIdentity: null,
          accountDisplayName: null,
          permissionsVerified: false,
          capabilities: await this.getCapabilities(ctx.context),
          webhookHealth: { status: "UNCONFIGURED", reason: "Webhook verification pending", lastCheckedAt: null },
          requirements: ["Verify webhook configuration before activation"],
          state: "ACTION_REQUIRED",
          reason: "Invalid balance response",
          verifiedAt: now.toISOString(),
        };
      }
      return {
        verified: true,
        provider: "xendit",
        mode: ctx.context.mode,
        accountIdentity: null, // Xendit account identity is derived from the key, not exposed here
        accountDisplayName: null,
        permissionsVerified: true,
        capabilities: await this.getCapabilities(ctx.context),
        webhookHealth: { status: "UNCONFIGURED", reason: "Configure the Xendit callback endpoint to activate", lastCheckedAt: null },
        requirements: ["Configure Xendit webhook callback"],
        state: "ACTIVE",
        reason: null,
        verifiedAt: now.toISOString(),
      };
    } catch (err) {
      const normalized = normalizeXenditError(err, "xendit.verifyConnection");
      return {
        verified: false,
        provider: "xendit",
        mode: ctx.context.mode,
        accountIdentity: null,
        accountDisplayName: null,
        permissionsVerified: false,
        capabilities: await this.getCapabilities(ctx.context),
        webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
        requirements: [],
        state: "FAILED",
        reason: normalized.message,
        verifiedAt: now.toISOString(),
      };
    }
  }

  async getCapabilities(ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
    const configuredRead = true; // a verified connection can read balance/transactions
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
      "refunds",
      "payouts",
      "recurringBilling",
      "connectedAccounts",
      "internalTransfers",
      "splitRouting",
    ] as const) {
      const supported = SUPPORT_BY_CAPABILITY[key];
      const isRead = key === "balanceRead" || key === "transactionRead";
      manifest[key] = build({
        supported,
        configured: isRead ? configuredRead : supported ? writesConfigured : false,
        mode: ctx.mode,
        reason: supported
          ? isRead
            ? null
            : ctx.mode === "TEST"
              ? "TEST-mode write is routed through the payment-flow orchestration"
              : "Required for LIVE activation: KMS-backed secret store + live-activation gates"
          : "Not supported by the Xendit SDK; requires an approved direct HTTP integration",
        requirements: supported
          ? isRead
            ? []
            : ["durable-operation", "organization-access", "financial-step-up", "audit"]
          : ["approved direct HTTP integration"],
        lastVerifiedAt: null,
      });
    }
    manifest.webhookHealth = build({
      supported: true,
      configured: false,
      mode: ctx.mode,
      reason: "Webhook callback is not yet verified",
      requirements: ["Configure the Xendit callback endpoint"],
      lastVerifiedAt: null,
    });
    return manifest;
  }

  private async clientForConnection(connectionId: string): Promise<XenditClientLike> {
    const secret = await this.deps.resolveSecretForConnection(connectionId);
    if (!secret) {
      throw normalizeXenditError(new Error("No secret configured for this connection"), "xendit.invoke");
    }
    return this.deps.createClient(secret);
  }

  async getBalance(ctx: ProviderConnectionContext): Promise<{ available: number; currency: string; source: "xendit-live"; asOf: string }> {
    const client = await this.clientForConnection(ctx.connectionId);
    const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
    return { available: balance.balance, currency: balance.currency, source: "xendit-live", asOf: new Date().toISOString() };
  }

  async listTransactions(ctx: ProviderConnectionContext): Promise<import("@/domain/payments/provider-read").ProviderTransaction[]> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.Transaction) {
      throw normalizeXenditError(new Error("Transaction capability not available on the client"), "xendit.listTransactions");
    }
    const raw = await client.Transaction.getAllTransactions({ currency: "IDR" });
    return mapXenditTransactions(raw);
  }

  async createHostedPayment(
    ctx: ProviderConnectionContext,
    input: { externalId: string; amount: number; currency: string; description?: string; payerEmail?: string | null },
  ): Promise<{ id: string; checkoutUrl: string; status: string; externalId: string; provider: "xendit" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.Invoice) {
      throw normalizeXenditError(new Error("Invoice capability not available on the client"), "xendit.createHostedPayment");
    }
    const invoice = await client.Invoice.createInvoice({
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      payerEmail: input.payerEmail ?? undefined,
    });
    if (!invoice?.invoiceUrl) {
      throw normalizeXenditError(new Error("Invalid invoice response: missing invoiceUrl"), "xendit.createHostedPayment");
    }
    return {
      id: invoice.id,
      checkoutUrl: invoice.invoiceUrl,
      status: invoice.status ?? "OPEN",
      externalId: input.externalId,
      provider: "xendit",
    };
  }

  async createRefund(
    ctx: ProviderConnectionContext,
    input: { idempotencyKey: string; paymentId: string; amount: number; currency: string; reason?: string | null },
  ): Promise<{ id: string; status: string; provider: "xendit" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.Refund) {
      throw normalizeXenditError(new Error("Refund capability not available on the client"), "xendit.createRefund");
    }
    const refund = await client.Refund.createRefund({
      idempotencyKey: input.idempotencyKey,
      data: {
        id: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason ?? undefined,
      },
    });
    return { id: refund.id, status: refund.status ?? "PENDING", provider: "xendit" };
  }

  async createCustomer(
    ctx: ProviderConnectionContext,
    input: { referenceId: string; name?: string; email?: string | null },
  ): Promise<import("@/domain/payments/commerce").ProviderCustomer> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.Customer) {
      throw normalizeXenditError(new Error("Customer capability not available on the client"), "xendit.createCustomer");
    }
    const customer = await client.Customer.create({
      referenceId: input.referenceId,
      givenNames: input.name,
      email: input.email ?? undefined,
      description: "Created from the payment dashboard",
    });
    return {
      id: customer.id,
      provider: "xendit",
      referenceId: customer.reference_id ?? input.referenceId,
      status: "NEW",
    };
  }

  async createPayout(
    ctx: ProviderConnectionContext,
    input: { idempotencyKey: string; referenceId: string; channelCode: string; accountNumber: string; accountHolderName?: string; amount: number; currency: string; description?: string },
  ): Promise<{ id: string; status: string; provider: "xendit" }> {
    const client = await this.clientForConnection(ctx.connectionId);
    if (!client.Payout) {
      throw normalizeXenditError(new Error("Payout capability not available on the client"), "xendit.createPayout");
    }
    const payout = await client.Payout.createPayout({
      idempotencyKey: input.idempotencyKey,
      data: {
        referenceId: input.referenceId,
        channelCode: input.channelCode,
        channelProperties: { accountNumber: input.accountNumber, accountHolderName: input.accountHolderName },
        amount: input.amount,
        currency: input.currency,
        description: input.description,
      },
    });
    return { id: payout.id, status: payout.status ?? "REQUESTED", provider: "xendit" };
  }
}
