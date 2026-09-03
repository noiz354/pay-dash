# Payment Provider Plugin Architecture and Agent Skills Research

> Status: **SPECIFICATION / RESEARCH — NO PROVIDER CODE YET**  
> Date: 2026-09-03 (+07:00)  
> Goal: Xendit and Stripe can be connected from one dashboard workflow, while provider differences remain explicit and secure.

## 1. Product decision

The dashboard will be **multi-provider**, not Xendit-hardcoded.

A merchant administrator sees a provider catalog, selects Xendit or Stripe, completes a provider-specific connection wizard, verifies capabilities/webhooks, and activates the connection. “One click” means one consistent dashboard entry point and guided setup—not pretending every provider supports identical OAuth.

- Stripe: prefer Stripe Connect hosted onboarding/Account Links for new Connect platforms; Standard OAuth is supported where product/account model requires it.
- Xendit: current official setup primarily requires a secret API key generated in Xendit Dashboard with least-privilege permissions, plus webhook setup. Unless Xendit grants this platform an approved OAuth/partner flow, connection requires a secure paste-once credential step.
- No provider secret is shown again after submission.
- A provider is not “Connected” until server-side verification and required webhook/capability checks pass.

## 2. Relevant Agent Skills found

### Tier A — recommended authoritative skills

1. **Addy Osmani Agent Skills**
   - `spec-driven-development`
   - `planning-and-task-breakdown`
   - `api-and-interface-design`
   - `test-driven-development`
   - `incremental-implementation`
   - `debugging-and-error-recovery`
   - `code-review-and-quality`
   - `shipping-and-launch`
   - Source: `addyosmani/agent-skills`
   - Purpose: enforce DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP lifecycle.

2. **Stripe official AI skill**
   - `stripe-best-practices`
   - Source: `stripe/ai`
   - Purpose: API selection, Checkout, Setup Intents, Billing, Connect Accounts v2, security, webhooks, and launch review.
   - Preferred over generic community Stripe snippets because it is provider-maintained.

3. **Stripe upgrade skill**
   - `upgrade-stripe`
   - Source: `stripe/ai`
   - Purpose: pinned API versions, SDK upgrades, webhook compatibility, and migration review.

4. **Hookdeck webhook skills**
   - `stripe-webhooks` from `hookdeck/webhook-skills`
   - General webhook patterns for Next.js, signature verification, retries, replay, and idempotency.
   - Use as supplementary guidance; provider official docs remain authoritative.

### Tier B — useful architecture/security skills

From `wshobson/agents`:

- `api-design-principles`
- `nodejs-backend-patterns`
- `nextjs-app-router-patterns`
- `postgresql-table-design`
- `auth-implementation-patterns`
- `error-handling-patterns`
- `e2e-testing-patterns`
- `pci-compliance`
- `threat-mitigation-mapping`
- `code-review-excellence`
- `stripe-integration` (secondary to Stripe's official skill)
- `billing-automation`

Additional useful skill categories:

- Prisma/database migration skill;
- Zod/schema validation skill;
- Playwright E2E skill;
- accessibility skill;
- secrets/key-management and encryption skill.

### Skills not sufficient by themselves

Generic `frontend-developer`, broad fintech skills, copied blog prompts, and payment snippets cannot authorize architecture decisions or replace current provider API references. Community skills must be reviewed before installation because a SKILL.md can instruct an agent to run commands or follow insecure patterns.

## 3. Skill installation policy

Agent Skills use portable `SKILL.md` directories and can be installed with the `npx skills` ecosystem. Project-local installation is preferred so versions and review history are reproducible.

Before installing any third-party skill:

1. pin repository commit/tag;
2. inspect `SKILL.md`, scripts, references, and license;
3. reject credential collection, arbitrary network execution, destructive commands, or hidden setup;
4. record source and checksum/commit;
5. keep provider official skill higher priority than community skill;
6. never let a skill read real `.env` credentials or execute live financial operations;
7. run generated code through tests, review, and security gates.

Recommended future project layout:

```text
.agents/skills/
  spec-driven-development/
  payment-provider-integration/     # repository-owned
  xendit-integration/               # repository-owned from verified specs
  stripe-best-practices/            # pinned provider-owned skill
  payment-webhook-processing/       # repository-owned/provider references
  financial-security-review/        # repository-owned policy
```

A repository-owned `payment-provider-integration` skill should encode this project's provider interface, RBAC/MFA, durable operations, webhook/outbox, redaction, and acceptance-test requirements. It prevents a generic Stripe or Xendit skill from bypassing local invariants.

## 4. Provider-neutral architecture

```text
Dashboard
  -> Provider Connection Service
     -> Provider Registry
        -> Xendit Adapter
        -> Stripe Adapter
        -> future provider adapter
  -> Canonical Payment Domain
  -> Durable Operation Store
  -> Provider-specific Webhook Ingress
  -> Canonical Event Projectors
```

### Rule

Normalize business capabilities, not every provider object. Provider-specific IDs, statuses, requirements, actions, and raw metadata remain in provider-specific records. The canonical layer contains only semantics the application can guarantee.

## 5. Provider adapter contract

```ts
type ProviderKind = "xendit" | "stripe";

type PaymentProviderAdapter = {
  kind: ProviderKind;
  capabilities(): ProviderCapabilityManifest;
  verifyConnection(input: ProviderCredentialRef): Promise<ProviderHealth>;
  disconnect(connectionId: string): Promise<void>;

  balance?: BalanceProvider;
  transactions?: TransactionProvider;
  hostedLinks?: HostedLinkProvider;
  customers?: CustomerProvider;
  paymentMethods?: PaymentMethodProvider;
  subscriptions?: SubscriptionProvider;
  refunds?: RefundProvider;
  payouts?: PayoutProvider;
  connectedAccounts?: ConnectedAccountProvider;
  transfers?: TransferProvider;
  splitRouting?: SplitRoutingProvider;
};
```

No screen imports Xendit or Stripe SDK clients directly. Server actions call canonical application services, which select the organization's active provider connection and adapter.

## 6. Capability manifest

Each connection exposes a server-derived manifest:

```ts
type ProviderCapabilityManifest = {
  balanceRead: CapabilityState;
  transactionRead: CapabilityState;
  hostedPaymentLinks: CapabilityState;
  customers: CapabilityState;
  savedPaymentMethods: CapabilityState;
  recurringBilling: CapabilityState;
  refunds: CapabilityState;
  payouts: CapabilityState;
  connectedAccounts: CapabilityState;
  internalTransfers: CapabilityState;
  splitRouting: CapabilityState;
  webhookHealth: CapabilityState;
};

type CapabilityState = {
  supported: boolean;
  configured: boolean;
  mode: "test" | "live";
  reason?: string;
};
```

UI actions are rendered from this manifest. Unsupported operations are hidden or explicitly unavailable; the application never fabricates parity.

## 7. Canonical resource mappings

| Canonical capability | Xendit | Stripe |
|---|---|---|
| hosted payment link | Invoice | Checkout Session / Payment Link, selected by Stripe spec |
| payment request | PaymentRequest | PaymentIntent / Checkout Session |
| customer | Customer | Customer |
| saved method | PaymentMethod | PaymentMethod + SetupIntent |
| subscription execution | Recurring Plan HTTP API | Billing Subscription |
| refund | Refund | Refund |
| payout to external destination | Payout | Connect payout/transfer model selected by ownership flow |
| sub-merchant | xenPlatform Account | Connect Account |
| account-context header | `for-user-id` | `Stripe-Account` |
| split routing | Split Rules | application fee / destination/separate charges and transfers |
| internal balance transfer | xenPlatform Transfer | Connect Transfer, subject to charge architecture |
| webhook verification | callback token/provider contract | signed raw-body event |

These are not assumed to be identical. A provider-specific architecture decision is required for charge ownership, liability, fees, disputes, refunds, and negative balances.

## 8. Dashboard connection experience

### Provider catalog

Route concept:

```text
/settings/payment-providers
```

Cards show:

- provider name/logo;
- test/live connection status;
- supported capability summary;
- webhook health;
- last successful verification;
- Connect, Manage, Test, Disconnect actions.

### Stripe connection flow

1. Admin clicks **Connect Stripe**.
2. Server creates/starts the approved Stripe Connect onboarding flow.
3. User is redirected to Stripe-hosted onboarding or Account Link.
4. Callback validates state and stores only provider account mapping/tokens if the selected model requires them.
5. Server verifies account requirements/capabilities—not one boolean only.
6. Webhook endpoint/Connect webhook configuration is checked.
7. Dashboard shows pending requirements or Active.

Stripe documentation recommends hosted/embedded onboarding and checking requirements/capabilities, `charges_enabled`, and `payouts_enabled`; verification can change later, so webhooks must keep state synchronized.

### Xendit connection flow

1. Admin clicks **Connect Xendit**.
2. Wizard links to Xendit Dashboard API-key creation and lists exact least-privilege permissions.
3. Admin pastes secret once into a secure server form and confirms test/live mode.
4. Secret is encrypted through the approved secret store/KMS; it is never returned.
5. Server performs read-only verification and capability probes.
6. Wizard supplies webhook URL and verifies callback-token setup through a safe challenge/test event where supported.
7. Dashboard marks connection Active only after checks pass.

Xendit currently documents secret-key Basic authentication and Dashboard-generated keys. Therefore true provider OAuth must not be promised without an approved Xendit partner/OAuth product.

## 9. Connection persistence

```text
PaymentProviderConnection
- id
- organization_id
- provider
- mode (TEST/LIVE)
- status (DRAFT/PENDING/ACTION_REQUIRED/ACTIVE/DEGRADED/DISCONNECTED)
- provider_account_id
- credential_secret_ref (never plaintext)
- credential_version
- capability_manifest_json
- requirements_json (redacted)
- webhook_status
- last_verified_at
- created_by / updated_by
- created_at / updated_at
- UNIQUE organization/provider/mode for active connection policy
```

Provider credentials belong in a secret manager/KMS-backed envelope, not a normal Prisma text column. Database stores a secret reference and metadata.

## 10. Provider selection policy

An organization may connect both providers, but financial ownership must be deterministic.

Recommended policy:

- one default provider per capability and currency/region;
- each created resource persists `provider` and `provider_resource_id` permanently;
- follow-up detail/refund/cancel operations route to the resource's original provider, not the current default;
- changing default affects new resources only;
- cross-provider refund, payout cancellation, or resource lookup is forbidden;
- reports may aggregate normalized projections while retaining provider identity.

## 11. Webhook architecture

Use separate ingress routes:

```text
/api/webhooks/xendit
/api/webhooks/stripe
```

Both feed a canonical durable delivery/outbox system, but verification remains provider-specific.

- Stripe requires raw-body signature verification and event dedupe.
- Xendit uses its documented callback verification contract/token and event IDs.
- Provider event payloads are validated by versioned schemas.
- Projectors write canonical resource state idempotently.
- Unknown events are retained without mutation.
- A provider/resource composite key prevents ID collisions.

## 12. Security and “one-click” constraints

1. Only OWNER or authorized integration admin can connect/disconnect providers.
2. Live connection, credential replacement, and disconnect require MFA/step-up.
3. Provider mode mismatch is rejected.
4. OAuth state/PKCE/redirect allowlists are mandatory where OAuth is used.
5. API keys are paste-once, encrypted, redacted, and rotated through a versioned flow.
6. Connection verification is read-only.
7. Disconnect does not delete financial history.
8. Webhook health is monitored continuously.
9. Provider requirements/capabilities can regress; Active is not permanent.
10. Agents and skills never receive production credentials or authorization to execute live money movement.

## 13. Stripe-specific architecture decisions still required

Before Stripe code:

- Accounts v2/controller properties and account model;
- direct charges vs destination charges vs separate charges/transfers;
- fee and negative-balance liability;
- dispute ownership;
- refund source and transfer reversal;
- Checkout Session vs PaymentIntent per flow;
- Billing product/price ownership;
- Connect webhook event scope;
- sandbox/live account strategy;
- API version pinning and upgrade process.

The official `stripe-best-practices` skill should be invoked during these decisions.

## 14. Xendit-specific architecture remains governed by

- `xendit-live-balance.md`
- `xendit-live-transactions.md`
- `xendit-hosted-payment-links.md`
- `xendit-payouts.md`
- `xendit-remaining-sdk-and-http-gaps.md`
- `xendit-platform-product-decisions.md`
- `xendit-shared-contracts.md`

## 15. Acceptance criteria

1. Dashboard lists Xendit and Stripe through one provider registry.
2. Clicking Connect starts a provider-appropriate secure wizard.
3. Stripe can use hosted Connect onboarding without sharing secret keys with merchants.
4. Xendit connection honestly uses paste-once credentials unless approved OAuth exists.
5. Credentials are never stored plaintext or returned to browser.
6. Active requires verified account, mode, capabilities, and webhook health.
7. Screens depend on canonical services/capability manifest, not provider SDKs.
8. Every resource retains original provider identity.
9. Switching default provider cannot reroute existing refunds/cancellations.
10. Unsupported provider capabilities cannot appear operational.
11. Webhook ingress is provider-specific and projection is canonical/idempotent.
12. Connection/disconnection/rotation require authorization, audit, and live-mode MFA.
13. Mock/test/live modes remain distinct.
14. Agent skills are pinned, reviewed, and denied credentials/live execution.
15. Stripe integration follows provider official skill/docs and pinned API version.
16. Xendit integration follows repository specs and verified SDK/HTTP contracts.

## 16. Recommended skill adoption order

1. Addy Osmani lifecycle skills.
2. Repository-owned `payment-provider-integration` skill generated from this spec.
3. Stripe official `stripe-best-practices` and `upgrade-stripe`.
4. Repository-owned `xendit-integration` skill generated from the completed Xendit specs.
5. Webhook/security/database/testing skills after source review.
6. Community generic payment skills only as secondary review input.

## 17. Sources reviewed

- Addy Osmani Agent Skills repository and OpenCode setup guidance.
- Agent Skills open standard documentation referenced by VS Code.
- Stripe official `stripe/ai` skills (`stripe-best-practices`, upgrade guidance).
- Stripe Connect architecture, hosted/API onboarding, connected-account authentication, OAuth reference, embedded components, and MCP access documentation.
- Xendit API key authentication/permissions and existing repository Xendit API research.
- Hookdeck webhook Agent Skills.
- `wshobson/agents` payment, architecture, security, database, and testing skill catalog.

## 18. Next specification tranche

Before coding, create:

1. provider-neutral canonical data model/ERD;
2. provider connection state machine and secret-storage ADR;
3. Stripe Connect architecture decision document;
4. Stripe capability-by-capability mapping equivalent to the Xendit portfolio;
5. repository-owned Agent Skills with pinned references and safety rules;
6. dashboard provider-connection UX acceptance spec and E2E plan.
