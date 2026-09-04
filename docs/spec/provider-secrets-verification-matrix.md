# Provider Secrets Verification Matrix

> Module: `provider-secrets`
> Specification: `docs/spec/SPEC-provider-secrets.md`

## Results (2026-09-03, +07:00)

```
corepack pnpm test -- src/server/secrets/store.test.ts src/server/secrets/redact.test.ts
# 15 passed (store 9, redact 6)
corepack pnpm exec tsc --noEmit          # exit 0
corepack pnpm exec eslint src/server/secrets/ src/lib/env.ts  # exit 0
```

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| Seal/Open never leaks plaintext in envelope | `store.test.ts` ciphertext-not-contains + round-trip |
| Fresh IV per seal | `store.test.ts` distinct iv/ciphertext for same value |
| Tamper/wrong-key rejected | `store.test.ts` TAMPERED for corrupted ciphertext and wrong key |
| Unsupported scheme rejected | `store.test.ts` UNSUPPORTED_SCHEME for kms envelope opened by local |
| Version monotonic on rotate | `store.test.ts` version == previous + 1 |
| Factory fail-closed (local w/o key, kms w/o key id) | `store.test.ts` MISSING_CONFIG |
| Secret/account/identifier/email masking | `redact.test.ts` never reveals source |
| Safe log context drops secrets + nested objects | `redact.test.ts` JSON does not contain secret |
| Config centralized in env | `env.ts` SECRET_STORE_* + PAYMENTS_PUBLIC_ORIGIN validated by Zod |

## Environment constraint / outstanding

- Prisma engine download is blocked in this sandbox and no PostgreSQL is available, so `secret_ref`/`credential_version`/rotation persistence columns and DB-backed integration tests are **not** run here. The fail-closed `KmsSecretStore` is a stub that must be wired to a real KMS before LIVE use. No secret was submitted or stored.
