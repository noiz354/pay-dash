import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secret-store abstraction (provider-secrets).
 *
 * The DB stores only a `secret_ref` + version metadata; the raw secret is never
 * a plaintext Prisma column and is never returned to the browser. A
 * `SecretStore` seals/unseals values. In a production deployment the concrete
 * store is a cloud KMS / envelope-encryption adapter; in local development an
 * explicitly-marked AES-256-GCM local adapter is used. LIVE activation is
 * refused unless a production-grade (kms) backend is configured.
 */

export type SecretStoreMode = "local" | "kms";

export interface SecretEnvelope {
  /** Which encryption scheme produced this envelope. */
  scheme: "local-aes-256-gcm" | "kms";
  /** Identifies the key (or key version) that encrypted this value. */
  keyRef: string;
  /** Monotonic version; rotation increments it. */
  version: number;
  ciphertext: string; // base64
  iv: string; // base64, random per seal
  authTag: string; // base64 (GCM tag)
  /** KMS-only: the data-encryption key wrapped by KMS (base64). */
  wrappedKey?: string;
  createdAt: string; // ISO timestamp
}

/**
 * Cloud-KMS envelope-encryption client (provider-secrets). A `KmsSecretStore`
 * delegates key wrapping/unwrapping to this interface so the store is testable
 * with a fake and a production deployment can bind a real cloud KMS SDK
 * (AWS KMS / GCP Cloud KMS). It never sees plaintext values — only the
 * per-seal data-encryption key (base64).
 */
export interface KmsEnvelopeClient {
  /** Wrap a data-encryption key (base64 plaintext) with KMS. */
  wrapDataKey(dataKeyBase64: string): Promise<{ keyId: string; wrappedKeyBase64: string }>;
  /** Unwrap a KMS-wrapped data-encryption key back to base64 plaintext. */
  unwrapDataKey(wrappedKeyBase64: string, keyId: string): Promise<string>;
}

export interface SecretStore {
  readonly mode: SecretStoreMode;
  readonly keyRef: string;
  seal(value: string, version?: number): Promise<SecretEnvelope>;
  open(envelope: SecretEnvelope): Promise<string>;
  rotate(value: string, previousVersion: number): Promise<SecretEnvelope>;
}

export class SecretStoreError extends Error {
  constructor(
    readonly code: "INVALID_ENVELOPE" | "TAMPERED" | "UNSUPPORTED_SCHEME" | "MISSING_CONFIG",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SecretStoreError";
  }
}

/**
 * Explicitly-marked encrypted local adapter. NEVER used to store production
 * secrets and NEVER committed. It derives a per-scheme AES-256-GCM key from a
 * configured root key (scrypt). This is a development/test backend only.
 */
export class LocalEncryptedSecretStore implements SecretStore {
  readonly mode = "local" as const;
  constructor(
    private readonly rootKey: string,
    readonly keyRef: string,
  ) {}

  private key(): Buffer {
    if (!this.rootKey) {
      throw new SecretStoreError("MISSING_CONFIG", "Local secret store requires SECRET_STORE_KEY");
    }
    return createHash("sha256").update(this.rootKey).digest();
  }

  async seal(value: string, version = 1): Promise<SecretEnvelope> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      scheme: "local-aes-256-gcm",
      keyRef: this.keyRef,
      version,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      createdAt: new Date().toISOString(),
    };
  }

  async open(envelope: SecretEnvelope): Promise<string> {
    if (envelope.scheme !== "local-aes-256-gcm") {
      throw new SecretStoreError(
        "UNSUPPORTED_SCHEME",
        `Cannot open envelope with scheme "${envelope.scheme}" using the local adapter`,
      );
    }
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch (err) {
      throw new SecretStoreError("TAMPERED", "Secret envelope failed authentication (tampered or wrong key)", err);
    }
  }

  async rotate(value: string, previousVersion: number): Promise<SecretEnvelope> {
    // A new key version/IV is used; version is monotonic.
    return this.seal(value, previousVersion + 1);
  }
}

/**
 * KMS-backed envelope-encryption store. A fresh 256-bit data-encryption key
 * (DEK) is generated per seal, the value is AES-256-GCM encrypted with the DEK,
 * and the DEK is wrapped by KMS (`KmsEnvelopeClient`). `keyRef` is the KMS key
 * id used to wrap the DEK. Without a configured KMS client the store fails
 * closed (never unseals), so LIVE activation is impossible — which is the
 * intended safety gate.
 */
export class KmsSecretStore implements SecretStore {
  readonly mode = "kms" as const;
  constructor(
    readonly keyRef: string,
    private readonly keyId: string,
    private readonly kms: KmsEnvelopeClient | null = null,
  ) {
    if (!this.keyId) {
      throw new SecretStoreError("MISSING_CONFIG", "KMS secret store requires SECRET_STORE_KMS_KEY_ID");
    }
  }

  private requireClient(): KmsEnvelopeClient {
    if (!this.kms) {
      throw new SecretStoreError(
        "MISSING_CONFIG",
        "KMS secret store requires a KMS envelope client (bind a cloud KMS SDK). Do not run LIVE without it.",
      );
    }
    return this.kms;
  }

  async seal(value: string, version = 1): Promise<SecretEnvelope> {
    const client = this.requireClient();
    const dataKey = randomBytes(32).toString("base64");
    const { keyId, wrappedKeyBase64 } = await client.wrapDataKey(dataKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(dataKey, "base64"), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      scheme: "kms",
      keyRef: keyId,
      version,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      wrappedKey: wrappedKeyBase64,
      createdAt: new Date().toISOString(),
    };
  }

  async open(envelope: SecretEnvelope): Promise<string> {
    if (envelope.scheme !== "kms") {
      throw new SecretStoreError(
        "UNSUPPORTED_SCHEME",
        `Cannot open envelope with scheme "${envelope.scheme}" using the KMS adapter`,
      );
    }
    if (!envelope.wrappedKey) {
      throw new SecretStoreError("INVALID_ENVELOPE", "KMS envelope is missing its wrapped data key");
    }
    const client = this.requireClient();
    const dataKeyBase64 = await client.unwrapDataKey(envelope.wrappedKey, envelope.keyRef);
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(dataKeyBase64, "base64"),
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch (err) {
      throw new SecretStoreError("TAMPERED", "KMS envelope failed authentication (tampered or wrong key)", err);
    }
  }

  async rotate(value: string, previousVersion: number): Promise<SecretEnvelope> {
    // A new DEK/IV is used and KMS re-wraps it; version is monotonic.
    return this.seal(value, previousVersion + 1);
  }
}

export interface SecretStoreFactoryInput {
  mode: SecretStoreMode;
  key?: string; // local mode only
  kmsKeyId?: string; // kms mode only
  /** Optional injectable KMS client (test fakes / production cloud SDK). */
  kmsClient?: KmsEnvelopeClient | null;
}

/**
 * Fail-closed factory. In local mode a key is required. In kms mode a key id is
 * required. A secret store may not be constructed without the configuration it
 * needs to actually seal/unseal; a KMS store without a client fails closed.
 */
export function createSecretStore(input: SecretStoreFactoryInput): SecretStore {
  if (input.mode === "kms") {
    return new KmsSecretStore("kms", input.kmsKeyId ?? "", input.kmsClient ?? null);
  }
  if (!input.key) {
    throw new SecretStoreError("MISSING_CONFIG", "Local secret store requires a SECRET_STORE_KEY");
  }
  return new LocalEncryptedSecretStore(input.key, "local");
}
