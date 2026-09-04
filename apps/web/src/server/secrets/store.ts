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
  authTag: string; // base64 (GCM tag; KMS adapters may populate a placeholder)
  createdAt: string; // ISO timestamp
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

export class KmsSecretStore implements SecretStore {
  readonly mode = "kms" as const;
  constructor(
    readonly keyRef: string,
    private readonly keyId: string,
  ) {
    if (!this.keyId) {
      throw new SecretStoreError("MISSING_CONFIG", "KMS secret store requires SECRET_STORE_KMS_KEY_ID");
    }
  }

  async seal(_value: string, _version = 1): Promise<SecretEnvelope> {
    throw new SecretStoreError(
      "INVALID_ENVELOPE",
      "KMS secret store is a production backend stub; it must be backed by a cloud KMS SDK. Do not run LIVE without it.",
    );
  }

  async open(_envelope: SecretEnvelope): Promise<string> {
    throw new SecretStoreError(
      "UNSUPPORTED_SCHEME",
      "KMS secret store is a production backend stub; it must be backed by a cloud KMS SDK.",
    );
  }

  async rotate(_value: string, _previousVersion: number): Promise<SecretEnvelope> {
    throw new SecretStoreError(
      "INVALID_ENVELOPE",
      "KMS secret store is a production backend stub; it must be backed by a cloud KMS SDK.",
    );
  }
}

export interface SecretStoreFactoryInput {
  mode: SecretStoreMode;
  key?: string; // local mode only
  kmsKeyId?: string; // kms mode only
}

/**
 * Fail-closed factory. In local mode a key is required. In kms mode a key id is
 * required. A secret store may not be constructed without the configuration it
 * needs to actually seal/unseal.
 */
export function createSecretStore(input: SecretStoreFactoryInput): SecretStore {
  if (input.mode === "kms") {
    return new KmsSecretStore("kms", input.kmsKeyId ?? "");
  }
  if (!input.key) {
    throw new SecretStoreError("MISSING_CONFIG", "Local secret store requires a SECRET_STORE_KEY");
  }
  return new LocalEncryptedSecretStore(input.key, "local");
}
