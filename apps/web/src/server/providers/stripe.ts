import "server-only";

import { deriveCapabilityState, type CapabilityManifest, type CapabilityState } from "@/domain/payments/capabilities";
import type { ConnectionVerification, WebhookHealthState } from "@/domain/payments/connection";
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

export interface StripeClientLike {
  readonly accounts?: {
    retrieve(id: string): Promise<StripeAccountLike>;
  };
  readonly balance?: {
    retrieve(): Promise<StripeBalanceLike>;
  };
  readonly checkout?: {
    sessions: {
      create(params: Record<string, unknown>): Promise<StripeCheckoutSessionLike | StripeClientLike>;
    };
  };
}

export interface StripeAdapterDeps {
  createClient(secretKey: string): StripeClientLike;
  resolveSecret(secretRef: string): Promise<string>;
  resolveSecretForConnection(connectionId: string): Promise<string | null>;
  now?(): Date;
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

  private async capabilities(_ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
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
        configured: isRead,
        mode: "TEST",
        reason: supported
          ? isRead
            ? null
            : isWrite
              ? "Requires durable-operation + access/MFA/audit wiring before execution"
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
      mode: "TEST",
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

  async getBalance(ctx: ProviderConnectionContext): Promise<{ available: number; currency: string; source: "stripe-live"; asOf: string }> {
    const secret = await this.deps.resolveSecretForConnection(ctx.connectionId);
    if (!secret) {
      throw normalizeStripeError(new Error("No secret configured for this connection"), "stripe.getBalance");
    }
    const client = this.deps.createClient(secret);
    if (!client.balance) {
      throw normalizeStripeError(new Error("Balance capability not available on the client"), "stripe.getBalance");
    }
    const balance = await client.balance.retrieve();
    const available = balance.available?.[0]?.amount ?? 0;
    const currency = balance.available?.[0]?.currency ?? "IDR";
    return { available, currency, source: "stripe-live", asOf: new Date().toISOString() };
  }
}
