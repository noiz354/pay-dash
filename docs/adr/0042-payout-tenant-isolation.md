# ADR-0042: Payout tenant isolation on the Wave 7A contract

Date: 2026-09-13
Status: **Accepted** (Wave 7B, Payouts slice)

## Context

ADR-0041 proved the canonical tenant-scoping contract on one vertical slice (Transactions):
`OrganizationContext` required-first, no default organization, fail-closed quarantine for the rest.
Wave 7B applies the unchanged contract to the second slice — payouts + refunds — where the stakes
include direct money movement (`withdrawBalance`, bank account numbers) and a dual-control approval
rule whose error precedence against the tenant check was untested.

## Decision

1. Reuse `domain/tenancy/organization-context.ts` unchanged; partition the payout store by org;
   scope every read/write ctx-first, including the 5 settings/bank functions (account numbers are
   direct money — P-6).
2. Quarantine the 6 remaining derived readers in `server/data/payouts-unscoped.ts` (fail-closed,
   surface-naming); shrink the allowlist as surfaces are scoped (8 → 6 in Q7: `exports-payouts`,
   `mcp`).
3. Bind export routes to `guardExport().organizationId` (`private, no-store` + `Vary: Cookie`) and
   MCP payout tools to the existing `registerDomainTools` organization param (refuse when absent).
4. Tenant check precedes dual-control; the order is pinned by test (U-13b), not by review.

## Consequences

- Good: second slice proves the contract generalises; one pre-existing auth gap closed
  (`withdrawBalanceAction` had no auth — regression-locked); defense-in-depth documented (partition
  lookup + owner filter).
- Bad: 6 payout readers remain quarantined (fail-closed, not scoped) — Wave 7C+ work (D-28).

## Alternatives

- Separate MCP tenant resolver: rejected (user decision) — the shared param is the same trust
  source transaction tools use; a second resolver would fork the trust root.
- Scoping settings/bank globally: rejected — account numbers move money; per-org is the safe
  default until a genuine shared-account requirement appears.

## Verification

56 new tests green (17 isolation + 21 structural + 5 route + 4 MCP + 8 actions + 1 probe);
8/8 Q6 mutations reddened then reverted; suite 1442/17 (all pre-existing), typecheck clean,
lint 0/40; matrix `PAYOUTS_TENANT_ISOLATION_MATRIX.md`.
