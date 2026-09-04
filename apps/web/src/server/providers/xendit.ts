import "server-only";

import { deriveCapabilityState, type CapabilityManifest, type CapabilityState } from "@/domain/payments/capabilities";
import type { ConnectionVerification } from "@/domain/payments/connection";
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

export interface XenditClientLike {
  readonly Balance: XenditBalanceClient;
  readonly Transaction?: XenditTransactionClient;
}

export interface XenditAdapterDeps {
  createClient(secretKey: string): XenditClientLike;
  /** Resolve a secret by its persisted reference (verifyConnection path). */
  resolveSecret(secretRef: string): Promise<string>;
  /** Resolve the secret for a connection by its id (capability invocation path). */
  resolveSecretForConnection(connectionId: string): Promise<string | null>;
  now?(): Date;
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

  async getCapabilities(_ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
    const configuredRead = true; // a verified connection can read balance/transactions
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
        configured: isRead ? configuredRead : false,
        mode: "TEST",
        reason: supported
          ? isRead
            ? null
            : "Requires durable-operation + access/MFA/audit wiring before execution"
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
      mode: "TEST",
      reason: "Webhook callback is not yet verified",
      requirements: ["Configure the Xendit callback endpoint"],
      lastVerifiedAt: null,
    });
    return manifest;
  }

  async getBalance(ctx: ProviderConnectionContext): Promise<{ available: number; currency: string; source: "xendit-live"; asOf: string }> {
    const secret = await this.deps.resolveSecretForConnection(ctx.connectionId);
    if (!secret) {
      throw normalizeXenditError(new Error("No secret configured for this connection"), "xendit.getBalance");
    }
    const client = this.deps.createClient(secret);
    const balance = await client.Balance.getBalance({ accountType: "CASH", currency: "IDR" });
    return { available: balance.balance, currency: balance.currency, source: "xendit-live", asOf: new Date().toISOString() };
  }
}
