# Spec: Provider Connections

> Module ID: `provider-connections`
> Initiative map: `docs/spec/payment-platform-capability-map.md`
> Workflow: Addy Osmani `spec-driven-development` — Phase 1 Specify
> Status: **IMPLEMENTED (foundation slice) — VERIFY GATE**
> Date: 2026-09-03 (+07:00)
> Inputs: `payment-provider-plugin-and-agent-skills.md` §§4–13; `xendit-shared-contracts.md`; `SPEC-provider-domain.md`; `xendit-platform-product-decisions.md` §5.

## Assumptions

1. PostgreSQL + Prisma remain the store; `PaymentProviderConnection` identity already exists (module `provider-domain`).
2. Connection lifecycle and capability resolution are server-boundary concerns; no page/action imports a provider SDK.
3. Xendit and Stripe are the first providers; the registry is extensible without a database enum per provider.
4. A connection becomes `ACTIVE` only after **server-side verification** of provider identity, TEST/LIVE mode, account identity, required permissions, provider requirements/capabilities, and webhook configuration/health where required.
5. Credential presence alone is never treated as "connected." Secret handling belongs to `provider-secrets`; this module only stores a `secretRef`/verification metadata and never the raw secret.
6. Provider-specific verification (Xendit API key vs Stripe Connect onboarding) is injected as an adapter; this module defines the contract, not the SDK calls.
7. This slice is a foundation: it defines and tests the **state machine, capability manifest, and provider registry** contract. It does **not** implement Xendit/Stripe SDK calls, OAuth, webhook wiring, or dashboard UI — those are downstream module gates.

## Objective

Make a provider connection a first-class, audited, server-verified entity and give the rest of the platform a single place to:

- enumerate and resolve payment providers (`xendit`, `stripe`);
- know which capabilities a connection truly supports, has configured, and can currently use — truthfully;
- drive connection lifecycle through a validated state machine;
- refuse to pretend an unverified or unsupported capability is usable;
- keep provider-origin decision-making out of the browser.

## Non-goals

- Storing or decrypting secrets (owned by `provider-secrets`).
- Invoking Xendit/Stripe SDK methods (owned by `xendit-adapter` / `stripe-adapter`).
- OAuth/onboarding flows (owned by `connected-accounts`).
- Webhook verification/DB delivery (owned by `webhook-ingress`).
- RBAC/MFA policy (owned by `organization-access` / `financial-step-up`).
- Dashboard connection UI (owned by `provider-dashboard`).

## Connection state machine

Persisted statuses:

```text
DRAFT
CONNECTING
VERIFYING
ACTION_REQUIRED
ACTIVE
DEGRADED
ROTATION_REQUIRED
DISCONNECTING
DISCONNECTED
FAILED
REVOKED
```

### Allowed transitions

The domain exposes a validated transition table. Implemented allowed transitions:

| From | Allowed next |
|---|---|
| `DRAFT` | `CONNECTING`, `FAILED`, `DISCONNECTED` |
| `CONNECTING` | `VERIFYING`, `FAILED`, `DISCONNECTING`, `DISCONNECTED` |
| `VERIFYING` | `ACTIVE`, `ACTION_REQUIRED`, `DEGRADED`, `FAILED`, `DISCONNECTING`, `DISCONNECTED` |
| `ACTION_REQUIRED` | `VERIFYING`, `DEGRADED`, `DISCONNECTING`, `DISCONNECTED`, `ROTATION_REQUIRED` |
| `ACTIVE` | `DEGRADED`, `ROTATION_REQUIRED`, `DISCONNECTING`, `DISCONNECTED`, `FAILED` |
| `DEGRADED` | `VERIFYING`, `ACTIVE`, `ROTATION_REQUIRED`, `DISCONNECTING`, `DISCONNECTED`, `FAILED` |
| `ROTATION_REQUIRED` | `VERIFYING`, `ACTION_REQUIRED`, `DEGRADED`, `DISCONNECTING`, `DISCONNECTED`, `FAILED` |
| `DISCONNECTING` | `DISCONNECTED`, `FAILED`, `ACTIVE` |
| `DISCONNECTED` | `CONNECTING`, `FAILED` |
| `FAILED` | `DISCONNECTING`, `DISCONNECTED`, `CONNECTING` |
| `REVOKED` | (terminal) |

Rules:

- Every transition is validated and audited by `audit-ledger` (downstream); this module validates the transition is permitted.
- `ACTIVE` is not permanent: capability/webhook regression drives `DEGRADED`/`ACTION_REQUIRED`/`ROTATION_REQUIRED`.
- `REVOKED` is terminal for a connection's usable lifetime; a replacement is a new connection.
- Browser input cannot set a connection's status directly; only server services with policy/mode context may transition it.

## Capability manifest

A connection owns a normalized, server-derived manifest. Canonical capability keys:

```text
balanceRead
transactionRead
hostedPaymentLinks
customers
savedPaymentMethods
recurringBilling
refunds
payouts
connectedAccounts
internalTransfers
splitRouting
webhookHealth
```

Each capability exposes:

```text
supported       boolean  // provider structurally supports the capability
configured      boolean  // the current connection has enough setup (keys/tokens/accounts/webhook)
available       boolean  // supported && configured && no blocking requirement
mode            "TEST" | "LIVE"
reason          string | null  // truthful explanation when not available
requirements    string[]      // explicit requirements to make it available
lastVerifiedAt  string | null // ISO timestamp of last server verification
```

Rules:

- `supported` is derived from the provider adapter, never guessed.
- `configured`/`available` are derived from persisted connection evidence, never from credential presence alone.
- The manifest is validated by a strict Zod schema; unknown capability keys are rejected (no raw payload dumping, no secrets).
- Unsupported capabilities are reported as `supported: false` with a truthful `reason`, not hidden by a fake fallback.
- `available` is compute-only: `supported && configured && no requirements blocking`.
- Changing an organization's default provider affects only new resources; it does not mutate existing connection manifests.

## Provider registry

A server-only registry resolves providers by `ProviderKey` and routes a requested capability to the owning adapter.

```ts
type ProviderKey = "xendit" | "stripe";

interface PaymentProviderAdapter {
  readonly provider: ProviderKey;
  verifyConnection(ctx: ProviderConnectionContext): Promise<ConnectionVerification>;
  getCapabilities(ctx: ProviderConnectionContext): Promise<CapabilityManifest>;
}
```

Capability subinterfaces are optional on an adapter so unsupported provider features are structurally explicit (e.g. `BalanceProvider`, `TransactionProvider`, `HostedPaymentProvider`). An adapter not implementing a subinterface means the capability is unsupported; there is no mock/fallback.

Registry responsibilities:

- `register(adapter)` — idempotent per provider key.
- `resolve(providerKey)` — return adapter or throw `UNSUPPORTED_PROVIDER`.
- `getCapabilities(providerKey, ctx)` — return a normalized, validated manifest.
- `invokeCapability(providerKey, capabilityKey, ctx, payload)` — route only if the adapter implements the capability subinterface and the manifest reports it supported/configurable; otherwise throw a typed `CAPABILITY_NOT_SUPPORTED` / `CAPABILITY_NOT_CONFIGURED` error. No silent success.
- Reject duplicate registration for the same provider key.
- Registry is server-only; no provider SDK is imported inside the registry.

## Verification contract

```ts
type ConnectionVerification = {
  verified: boolean;
  provider: ProviderKey;
  mode: "TEST" | "LIVE";
  accountIdentity: string | null;   // provider account id, server-derived
  accountDisplayName: string | null;
  permissionsVerified: boolean;
  capabilities: CapabilityManifest;
  webhookHealth: WebhookHealthState | null;
  requirements: string[];
  state: ConnectionStatus;          // e.g. ACTIVE or ACTION_REQUIRED
  reason: string | null;
  verifiedAt: string;               // ISO timestamp
};
```

The verification adapter is injected (a Xendit or Stripe verifier). This module defines the shape and the rule that verification evidence, not credential presence, drives `ACTIVE`. `accountIdentity`/`for-user-id`/`Stripe-Account` are only ever derived inside the verifier from trusted persisted mapping; never from the browser.

## Mode, tenancy, and secrets

- `mode` is `TEST | LIVE`, stored on the connection, fixed at create, never chosen by tab state.
- TEST and LIVE connections are distinct records.
- Every registry/verification call receives `ProviderConnectionContext` = `{ connectionId, organizationId, provider, mode }`, resolved server-side.
- No secret is accepted from the browser; `provider-secrets` supplies an opaque `secretRef` for verification only.
- A connection is `ACTIVE` only when verification evidence (account identity + mode + permissions + capability scan + webhook health) is present and current.

## File structure (this slice)

```text
apps/web/src/domain/payments/connection.ts      # status state machine + verification shape
apps/web/src/domain/payments/capabilities.ts    # capability keys, manifest schema, derivation
apps/web/src/server/providers/registry.ts       # server-only provider registry + adapter contract
apps/web/src/server/providers/registry.test.ts
apps/web/src/domain/payments/connection.test.ts
apps/web/src/domain/payments/capabilities.test.ts
```

## Persistence follow-up (documented, requires Prisma engine)

The connection needs these durable columns to hold verification evidence. They are the immediate next implementation artifact after this contract slice and must be applied through a reviewed migration once `prisma validate`/`generate`/`migrate` can run (engine download is blocked in the development sandbox that produced this slice):

```text
PaymentProviderConnection
  capabilityManifest Json?     // strict normalized manifest (replaces free-form capabilitiesSummary)
  requirements Json?           // redacted requirement list
  webhookHealthStatus   String?  // e.g. VERIFIED | PENDING | UNHEALTHY
  lastVerifiedAt        DateTime?
  createdByUserId       String?  @relation(User, Restrict)
  updatedByUserId       String?  @relation(User, Restrict)
```

`ProviderAccount.capabilitiesSummary` (free-form) will be deprecated in favor of `PaymentProviderConnection.capabilityManifest`. No secret column is ever added.

## Test plan (this slice)

### connection.test.ts

- every status value is a valid member of the union;
- each valid transition is accepted;
- every invalid/disallowed transition throws a typed `INVALID_STATUS_TRANSITION` error;
- terminal `REVOKED` accepts no outgoing transition;
- transition validation is provider-agnostic (no SDK import).

### capabilities.test.ts

- manifest parsing rejects unknown capability keys (no raw payload);
- manifest parsing rejects secret-shaped/PAN-shaped values;
- `supported: false` with a truthful reason never becomes `available`;
- `available` = `supported && configured && no blocking requirements`;
- all 12 canonical capability keys are present and typed.

### registry.test.ts

- registers an adapter and resolves it by provider key;
- resolves provider from a trusted `ProviderConnectionContext`;
- duplicate registration for the same provider key is rejected;
- an unknown provider resolves to a typed `UNSUPPORTED_PROVIDER`;
- `getCapabilities` forwards a normalized manifest;
- invoking an unsupported (`supported: false`) capability throws `CAPABILITY_NOT_SUPPORTED` (no fake fallback);
- invoking a supported-but-not-configured capability throws `CAPABILITY_NOT_CONFIGURED`;
- the registry file contains no provider SDK import (static/unit assertion).

## Acceptance criteria

1. The connection state machine is a single source of truth for allowed transitions, with unit tests.
2. The capability manifest is a strict, server-derived, secret-free contract with a truthful `available` derivation.
3. The provider registry is server-only, resolves by provider key, and refuses to fall back to mock/unsupported success.
4. `ACTIVE` is a function of server verification evidence, never credential presence.
5. No page, component, or action can reach a provider SDK through this module; adapters are injected and capability-gated.
6. The following are explicitly NOT implemented in this slice: SDK calls, secret storage, OAuth/webhook wiring, dashboard UI, RBAC/MFA policy, and DB integration tests (blocked by the missing Prisma/Postgres environment).

## Out of scope / not claimed

This slice does **not** claim: a live provider is connected; secrets are stored or rotated; webhooks are verified; Xendit or Stripe adapters exist; the dashboard connects a provider; any money movement or TEST/LIVE financial write occurred. It delivers the verified foundation contracts that the adapters, dashboard, and financial-operation modules build on.
