# Xendit Adapter Verification Matrix

> Module: `xendit-adapter`
> Specification: `docs/spec/SPEC-xendit-adapter.md`

## Results (2026-09-03, +07:00)

```
corepack pnpm test -- src/server/providers/xendit.test.ts   # 10 passed
corepack pnpm exec tsc --noEmit                             # exit 0
corepack pnpm exec eslint src/lib/xendit.ts src/server/providers/xendit.ts src/server/providers/xendit.test.ts  # exit 0
```

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| Single SDK import boundary | `src/lib/xendit.ts` imports `xendit-node`; `src/server/providers/xendit.ts` only consumes an injected `createClient` surface. Source-boundary test (registry.test.ts) also asserts no `xendit-node`/`stripe` import in the registry. |
| Canonical error taxonomy + redaction | `normalizeXenditError` + tests (auth non-retryable, 429/5xx retryable, 404/unknown) |
| Secret never in error message | `redactSecretsInText` strips `sk_*`/`rk_*`/`whsec_*`/Xendit key patterns; test asserts no secret substring |
| Truthful capability manifest | getCapabilities tests: SDK reads supported; writes supported-not-available; manual-HTTP caps unsupported; webhookHealth unconfigured |
| Credential presence ≠ ACTIVE | verifyConnection requires a read probe; failure → FAILED, invalid response → ACTION_REQUIRED |
| Server-derived account context | `accountIdentity`/`forUserId` left null / not accepted from browser in the adapter |
| No SDK model leak | adapter returns normalized `{ available, currency, source, asOf }`; no SDK model in return type |
| Read-only verification | probe uses `Balance.getBalance` (read-only) only |

## Environment constraint / outstanding

- Prisma engine + Postgres are unavailable in this sandbox, so DB-backed contract tests and the durable operation persistence for write capabilities (refunds, payouts, customers, payment methods, invoices) are **not** run here. Those write capabilities are reported `supported` but `available: false` until `durable-operations` + `organization-access` + `financial-step-up` + `audit` wiring exists, and must be gated by the `provider-registry` capability gate in a DB-enabled environment.
- The direct HTTP transport (`https://api.xendit.co`) and manual-HTTP capabilities (`recurringBilling`, `connectedAccounts`, `internalTransfers`, `splitRouting`) are deferred to an approved tranche. No such proxy/transport is implemented.
