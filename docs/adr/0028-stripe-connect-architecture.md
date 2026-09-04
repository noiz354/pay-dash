# ADR-0028: Stripe Connect charge ownership and integration architecture

- Status: Accepted (architecture decision — gates `stripe-adapter`)
- Date: 2026-09-03
- Decision owners: payment platform maintainers
- Capability: `stripe-adapter`, `platform-routing`, `connected-accounts`
- Sources reviewed: Stripe Connect docs (integration-recommendations, integrate-billing-connect, configuration-migration-guide)

## Context

The platform will let a merchant connect a Stripe account and process payments through a provider-neutral domain. We must decide, before writing `stripe-adapter` code, how Stripe Connect charges are owned, how fees/disputes/refunds/negative balances are assigned, which charge types are the default, how hosted payments and saved methods are modeled, and how the account/API version context is derived. Guessing these in code is unsafe.

The business is a payment-gateway/ISV dashboard: each `Organization` is a single merchant that connects its own Stripe account to collect from that merchant's customers. The platform may take an application fee / split for the merchant partners it serves.

## Decision

### Accounts v2 (Connect Accounts) as the account model

Use Stripe Connect **Accounts v2**. Account controller `properties` (Dashboard access and responsibility defaults) are set at creation and re-synced on requirement/capability callbacks:

- `defaults.responsibilities.fees_collector`: `application` (platform collects application fees; Stripe collects payment fees from the platform).
- `defaults.responsibilities.losses_collector`: `application` (platform owns negative balances for indirect charges).
- `dashboard`: `full` (the merchant manages its own account; Embedded/Express Dashboard where the merchant must not see platform internals).
- Request the capabilities needed for the selected charge type (e.g. `transfers`, `card_payments`, `stripe_transfers`).

These are persisted in `ProviderAccount.providerAccountType` / a normalized capability manifest, never trusted from the browser. `Stripe-Account` and connected-account IDs come only from the persisted mapping.

### Charge types

1. **Default: destination charges.** A charge is created on the **platform** account with `on_behalf_of` = connected account so the connected account is the settlement merchant (settles in its country, uses its fee structure, shows its statement descriptor). A transfer of the designated amount is created to the connected account. The platform takes `application_fee_amount`. Suits the single-merchant-per-org model and simple application-fee capture. Requires the `transfers` capability.

2. **Separate charges and transfers (for multi-party / deferred routing).** The platform creates the charge and, separately, creates one or more `Transfer`s to connected accounts at a later time. Used when funds must be split across accounts or when the receiving account is not known at charge time (marketplace / deferred payouts). This is the backend for `platform-routing`.

3. **Direct charges (only where approved).** A charge is created with the `Stripe-Account` header so the **connected account is the merchant of record** and owns disputes, refunds, and payment fees. This is **not** the default because it moves dispute/refund/fee ownership to the connected account. It may be enabled only for a reviewed, flag-gated scenario where the merchant must be merchant of record; when used, set `losses_collector: stripe` and `fees_collector: stripe`.

### Liability and fee ownership

- **Destination / separate charges:** platform is merchant of record unless `on_behalf_of` is set; Stripe collects payment fees from the platform; the platform is responsible for negative balances and for refunds/disputes on those charges. Platform cannot easily recover refunded/disputed funds from connected accounts.
- **Direct charges:** connected account is merchant of record; Stripe recommends Stripe owns negative-balance liability; connected account pays payment fees; connected account handles disputes/refunds. Platform monitors each account separately.

### Refund source

- Refund the originating charge **on the account that created it** (platform for destination/separate; connected account for direct), using the persisted `ProviderPayment` origin. Never refund on the organization's current default provider/connection.
- On destination/separate charges, if a transfer was made, **reverse the transfer** as part of refund recovery; respect Stripe's cross-border transfer-reversal restriction (wait for disputed cross-border transfers to resolve before retransferring).
- Refund status converges via reads/webhooks; never mock a refund from an HTTP success.

### Dispute & transfer reversal

- Disputes on indirect charges are debited from the platform; on direct charges from the connected account. `transfer_reversal`/transfer reversal is only used where a transfer exists and is safe to reverse.
- The platform owns the `application_fee_amount` and, for platform fees, the fee-reversal policy.

### Hosted payments & saved methods

- **Hosted payment = Stripe Checkout Session** (the app maps its canonical `hostedPaymentLinks` capability to Checkout; the canonical transaction is a Stripe PaymentIntent created by Checkout).
- **Custom / deferred flows = PaymentIntent**.
- **Saved methods = SetupIntent + saved PaymentMethod** (never store PAN/CVV; only the `pm_` id and masked metadata).
- **Billing = Stripe Billing Subscription** (Product/Price owned by the platform, recurring charges executed per the approved policy through the platform's connected-account flow).

### API version & SDK

- Pin the official `stripe` Node SDK and an explicit `apiVersion` in the server-only `apps/web/src/lib/stripe.ts` wrapper. The version is reviewed/upgraded through the `upgrade-stripe` skill flow; it is never guessed.

### Webhook scope

- Provider-specific ingress at `/api/webhooks/stripe`: verify the raw request body signature with the pinned endpoint secret before any mutation; scope accepted events by the persisted connection mapping; dedupe by `stripe:<event_id>`.
- Listen to charge/transfer/payout/account-capability events relevant to the selected charge type; do not trust event `account` context without matching a persisted connection.

### TEST/LIVE & environment

- Separate TEST/LIVE credentials and modes (no cross-mode confusion).
- `Stripe-Account` context is server-derived from the persisted Connect mapping, never browser input.
- LIVE provider operations are refused without: a production-grade secret backend, webhook verification, a trusted public origin, MFA/authorization policy, a durable database, and an audit sink.

## Consequences

### Positive

- Charge ownership, fee/liability, refund, dispute, negative-balance, and transfer-ownership semantics are explicit rather than guessed.
- Destination charges give a straightforward application-fee flow for the single-merchant model; separate charges/transfers support multi-party and deferred routing.
- Direct charges are available and correctly gated, so merchant-of-record use cases are supported without becoming the default.
- Webhooks and refunds route by resource origin, never by the current default provider.

### Costs

- Indirect charges put negative-balance, refund, and dispute liability on the platform; that must be accounted for in financial policy and dashboards.
- Destination charges with `on_behalf_of` require the `card_payments` capability (which requires `transfers`), and cross-border transfer reversals have restrictions.
- Two charge-type code paths (indirect vs direct) increase adapter complexity; each must be tested.
- Connected accounts may not be changed between configurations without re-onboarding (Stripe limitation).

## Alternatives considered

1. **Direct charges as default:** rejected as default because the brief and product prefer the platform to own fees/splitting and to keep dispute ownership predictable; direct charges are kept, but gated.
2. **Separate charges and transfers as default:** rejected as default because it adds transfers for the common single-merchant case; it remains available for multi-party/deferred routing.
3. **Legacy Stripe Standard OAuth:** rejected as the default; Connect Accounts v2 hosted onboarding is used. Standard OAuth is available only if a future ADR explicitly selects it.
4. **Onboarding via raw OAuth with browser-selected account IDs:** rejected; `Stripe-Account` and account IDs are server-derived from the persisted mapping, and onboarding uses signed, allowlisted, one-time Account Links.

## Verification

- `apps/web/src/lib/stripe.ts` is server-only, imports `stripe` exactly once, and pins an explicit `apiVersion`.
- Capability manifest maps `hostedPaymentLinks` → Checkout Session, `savedPaymentMethods` → SetupIntent+PaymentMethod, `recurringBilling` → Billing Subscription.
- Refund/cancel/detail for an existing Stripe `ProviderPayment` routes to the origin connection/account (unit + integration test).
- Webhook ingress verifies raw-body signature with a synthetic test secret (unit test) and never reuses Xendit's token logic.
- No `Stripe-Account` value is accepted from browser input (source-boundary test).
- LIVE operations are gated on the fail-closed startup checks (documented in `provider-secrets`/`launch-operations`).
