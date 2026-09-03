# ADR-0027: Provider-neutral domain persistence

- Status: Accepted for provider-domain; downstream connection behavior pending
- Date: 2026-09-03
- Decision owners: payment platform maintainers
- Capability: `provider-domain`

## Context

The application began with app-owned mock/data facades, a limited `LedgerEntry`, and a Xendit SDK wrapper. It must support Xendit, Stripe, xenPlatform/Connect accounts, local and provider KYC/subscriptions, payouts, transfers, split routing, and durable financial operations without making provider SDK models the application domain.

The approved sources are:

- `docs/spec/payment-platform-capability-map.md`
- `docs/spec/SPEC-provider-domain.md`
- `tasks/plan.md`
- `tasks/todo.md`
- `docs/spec/provider-domain-verification-matrix.md`

## Decision

### Canonical core and explicit mappings

Persist app/business resources separately from provider mappings. Use explicit mapping tables for customers, payments, refunds, payment methods, recurring plans, payout attempts, transfers, and split-rule materializations rather than one polymorphic JSON resource table.

Every provider mapping is scoped to `PaymentProviderConnection`. Existing resources retain this origin; changing a future organization default affects only new resources.

### Organization ownership

Introduce a minimal `Organization` anchor now. Canonical records and provider mappings are organization-scoped, commonly through composite foreign keys that prevent cross-organization attachment. Membership, trusted tenant context, RBAC, and authorization remain owned by `organization-access`.

### Multiple provider connections

The structure permits multiple connections per organization/provider/mode. Active/default/capability selection remains owned by `provider-connections`. TEST and LIVE are explicit and cannot be replaced by browser-selected account context.

### Money and status

Persist financial amounts as Decimal(20,4) and expose money at domain boundaries as validated decimal strings with uppercase ISO currency. Native JavaScript floating point is not persistence authority.

Store canonical status separately from provider status. Unknown provider values map to safe `UNKNOWN`, never inferred success.

### Soft lifecycle and restrictive deletion

All provider-domain foreign keys use restrictive deletion. Provider connections and financial identities are retired/disconnected rather than hard-deleted through normal workflows. Rollback is destructive only while new tables remain empty; after financial identity exists, use a forward fix.

### Version and attempt history

Recurring provider plans and split rules preserve versions. Payouts and transfers preserve ordered provider attempts. Approved/active/retired split versions are immutable through the repository boundary.

### Narrow repository boundaries

Application-facing lookups require organization context. Repositories expose provider-neutral identity contracts and typed `NOT_FOUND`, `CONFLICT`, `INVALID_TOPOLOGY`, and `STALE_VERSION` failures. They do not expose provider SDK or Prisma input models to adapters.

## Database-enforced invariants

The migrations enforce, among other constraints:

- provider key and TEST/LIVE mode validity;
- organization/connection/account topology;
- scoped provider-ID and merchant-reference uniqueness;
- one originating provider mapping per payment/refund/payment method;
- refund connection tied to originating provider payment;
- exact non-negative/positive amounts and currency shape;
- recurring version and effective-range validity;
- payout/transfer attempt numbering;
- same-connection transfer accounts and distinct source/destination;
- split route allocation shape/range and provider topology;
- restrictive deletion.

## Transactionally enforced invariants

Some semantics are intentionally enforced in narrow repositories because a portable relational CHECK/FK cannot express the full rule cleanly:

- optional payment/customer organization match;
- canonical payment-method/provider-customer identity match beyond connection scope;
- unknown provider execution cannot activate entitlement;
- expected consecutive attempt intent;
- split-version immutability after approval;
- all materialized split routes obey the selected connection policy;
- optimistic expected-version matching.

These boundaries have focused tests and are listed in `docs/spec/provider-domain-verification-matrix.md`.

## Credential and payload boundary

No provider secret is stored in canonical tables. `capabilitiesSummary` is reserved for a strict normalized capability summary to be defined by `provider-connections`; it must not contain credentials or raw provider payloads. Encrypted webhook evidence and retention belong to `webhook-ingress`.

Masked payment-method details pass a strict discriminated schema. PAN, CVV, OTP, tokens, and arbitrary fields are forbidden.

## Migration policy

Eight additive migrations introduce foundations, money-in mappings, recurring/money-out identities, and split routing. Existing Better Auth models and `LedgerEntry` are not redefined or backfilled. Existing mock facades remain the user-facing behavior until capability modules receive separate approved plans.

Migration SQL is reviewed before deployment and first applied to disposable PostgreSQL. Production rollout, backfill, and reconciliation belong to `launch-operations`.

## Consequences

### Positive

- Xendit and Stripe can coexist without false model parity.
- Refund/cancel/detail routing can use immutable resource origin.
- Cross-organization and cross-connection mistakes are rejected early.
- Provider adapters can normalize into stable application contracts.
- Financial history remains traceable and non-destructively versioned.

### Costs

- Explicit mapping tables and composite foreign keys increase schema size.
- Some cross-record semantics still require transactional repository checks.
- Capability modules need deliberate projection/mapping logic.
- Provider connection and organization-access modules must complete trusted context before live use.

## Rejected alternatives

1. **One universal provider JSON table:** weak foreign keys, raw payload coupling, and poor financial invariants.
2. **Provider-specific application domains only:** duplicates product logic and makes reporting/routing inconsistent.
3. **Provider resource ID as global identity:** IDs can collide across providers, accounts, and modes.
4. **Current default provider for follow-up operations:** risks refund/cancel against the wrong provider.
5. **Email-based customer merging:** unsafe identity conflation.
6. **Hard deletion/cascades:** destroys financial/provider traceability.
7. **JavaScript number money:** permits precision loss.

## Downstream handoff: `provider-connections`

The next module may rely on:

- `Organization` and `PaymentProviderConnection` identity;
- provider key/mode/resource-ref schemas;
- connection-scoped provider mappings;
- strict organization scope parser;
- typed repository errors and optimistic version guard;
- `capabilitiesSummary` only after replacing free-form writes with a strict normalized schema;
- restrictive lifecycle references that prohibit deleting a used connection.

It must add, under a separately approved specification:

- complete connection state machine;
- capability manifest schema and verification evidence;
- active/default selection constraints;
- webhook-health/requirements state;
- safe disconnect/rotation semantics;
- no credential storage (delegated to `provider-secrets`).

It must not start provider SDK calls, OAuth/API-key storage, or UI work merely because the persistence identity exists.

## Verification

Implementation evidence and known baseline failures are recorded in `docs/spec/provider-domain-verification-matrix.md`. Final acceptance requires a fresh migration-chain run, Prisma validation/generation, focused repository/domain tests, typecheck, lint, build, static boundary review, and human approval.
