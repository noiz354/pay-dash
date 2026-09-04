# Spec: Provider Secrets

> Module ID: `provider-secrets`
> Initiative map: `docs/spec/payment-platform-capability-map.md`
> Workflow: Addy Osmani `spec-driven-development` — Phase 1 Specify
> Status: **IMPLEMENTED (abstraction + local adapter + redaction) — VERIFY GATE**
> Date: 2026-09-03 (+07:00)
> Inputs: `payment-provider-plugin-and-agent-skills.md` §9; `xendit-shared-contracts.md` (auth, HTTP constitution); `SPEC-provider-domain.md` (no-secret boundary); `xendit-remaining-sdk-and-http-gaps.md` §9.

## Assumptions

1. Provider secrets (Xendit secret keys, Stripe secret keys/webhook secrets, OAuth access/refresh tokens) are never stored as plaintext Prisma columns and never returned to the browser.
2. The database stores an opaque secret reference plus version/metadata. Raw secret values exist only transiently inside a `SecretStore`.
3. In production a cloud KMS / envelope-encryption backend seals/unseals values. In local development an explicitly-marked AES-256-GCM adapter is used.
4. LIVE activation is refused unless a production-grade (`kms`) secret backend is configured and a valid key is present.
5. Secrets are paste-once and redacted after submission; they never appear in logs, error messages, analytics, HTML, React props, audit payloads, or Sentry.

## Contracts

### SecretStore

```ts
type SecretStoreMode = "local" | "kms";

interface SecretEnvelope {
  scheme: "local-aes-256-gcm" | "kms";
  keyRef: string;
  version: number;
  ciphertext: string; // base64
  iv: string;         // base64, random per seal
  authTag: string;    // base64
  createdAt: string;  // ISO
}

interface SecretStore {
  readonly mode: SecretStoreMode;
  readonly keyRef: string;
  seal(value: string, version?: number): Promise<SecretEnvelope>;
  open(envelope: SecretEnvelope): Promise<string>;
  rotate(value: string, previousVersion: number): Promise<SecretEnvelope>;
}
```

- `seal` does not include plaintext in the returned envelope.
- `open` authenticates; any tamper/wrong-key yields `TAMPERED`.
- `rotate` produces a monotonic version and a fresh IV.
- Factory `createSecretStore` fails closed when required configuration is missing.

### Redaction

```ts
maskSecret(value): "[redacted]" | null
maskTail(value, visible=4): masked string
maskIdentifier(value, visible=5): masked string
maskEmail(value): masked string
redactValueInText(text, secret): text with secret -> "[redacted]"
safeLogContext(input, sensitiveKeys?): drops nested objects, redacts sensitive keys
```

## File structure (this slice)

```text
apps/web/src/server/secrets/store.ts     # SecretStore, LocalEncryptedSecretStore, KMS stub, factory
apps/web/src/server/secrets/store.test.ts
apps/web/src/server/secrets/redact.ts    # redaction helpers
apps/web/src/server/secrets/redact.test.ts
apps/web/src/lib/env.ts                  # SECRET_STORE_MODE / KEY / KMS_KEY_ID, PAYMENTS_PUBLIC_ORIGIN
```

## Security rules

1. No secret in plaintext Prisma fields; DB stores `secret_ref` + `credential_version` + rotation timestamps.
2. Values are paste-once; after submission the UI/service only ever sees a redacted form.
3. `LocalEncryptedSecretStore` is explicitly a development/test adapter; it derives an AES-256-GCM key and never persists the root key.
4. `KmsSecretStore` is a production backend stub; it cannot seal/open and forces a real KMS SDK to be wired before LIVE use.
5. `safeLogContext` removes unknown nested objects and redacts sensitive keys before any log/observability/audit payload.
6. TEST and LIVE credentials are separate secrets with distinct references; rotation is versioned.

## Test plan

- `store.test.ts`: seal/open round-trip without plaintext leak; fresh IV per seal; tampered ciphertext rejected; wrong key rejected; non-local scheme rejected; version increments on rotate; factory fail-closed for local-without-key and kms-without-key.
- `redact.test.ts`: secret/account/identifier/email masking never reveals the source; substring redaction; safe log context drops nested objects and sensitive keys.

## Environment

`SECRET_STORE_MODE` (`local` default, `kms`), `SECRET_STORE_KEY` (local only), `SECRET_STORE_KMS_KEY_ID` (kms only), and `PAYMENTS_PUBLIC_ORIGIN` (trusted public origin for webhooks/redirects/OAuth) are centralized in `env.ts`. LIVE provider operations must not start without a production secret backend, webhook verification, a trusted public origin, MFA/authorization policy, a durable database, and an audit sink.

## Out of scope / not claimed

No secret has been submitted, stored, rotated, or returned; no LIVE backend is wired; the `KmsSecretStore` is a fail-closed stub awaiting a KMS SDK; the DB `secret_ref` column and rotation persistence are owned by the next migration (blocked here by the missing Prisma engine/Postgres).
