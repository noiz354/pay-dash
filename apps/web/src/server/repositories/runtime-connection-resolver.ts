import "server-only";

import { RepositoryError } from "@/domain/payments/errors";
import type { ProviderMode } from "@/domain/payments/provider";
import { createSecretStore, SecretStoreError, type SecretStore, type SecretEnvelope } from "@/server/secrets/store";
import { env } from "@/lib/env";
import { loadLazyPrisma } from "./prisma-runtime";

/**
 * Runtime connection + secret resolution (provider-secrets → adapter).
 *
 * A configured provider connection only becomes usable when (a) an ACTIVE
 * persisted connection exists, and (b) its secret can be unsealed. This is the
 * fail-closed wiring that `.env` alone cannot satisfy: filling credentials is
 * necessary but not sufficient — the connection and its secret record must be
 * persisted and resolvable. When no store is available (dev/test, no Prisma),
 * resolution returns `null`, which the adapters treat as "no secret configured"
 * and refuse to proceed.
 */

export type RuntimeProvider = "xendit" | "stripe";

export type RuntimeConnection = {
  connectionId: string;
  organizationId: string;
  provider: RuntimeProvider;
  mode: ProviderMode;
};

/** A secret record row projected to an opaque reference. */
export type RuntimeSecretRef = {
  secretRef: string;
  credentialVersion: number;
};

export interface RuntimeConnectionDb {
  findActiveConnection(connectionId: string): Promise<RuntimeConnection | null>;
  /** First ACTIVE connection for an organization (scoped — never cross-org). */
  findFirstActive(organizationId: string): Promise<RuntimeConnection | null>;
  findSecretRef(connectionId: string, mode: ProviderMode): Promise<RuntimeSecretRef | null>;
}

/** Parse a persisted secretRef. If it is a serialized SecretEnvelope, unseal it;
 *  otherwise treat it as a plaintext dev key. Never a plaintext DB column. */
export async function resolveSecretValue(secretRef: string, store: SecretStore): Promise<string | null> {
  let envelope: SecretEnvelope;
  try {
    envelope = JSON.parse(secretRef) as SecretEnvelope;
  } catch {
    // Not an envelope (dev/test plaintext reference) — return as-is.
    return secretRef;
  }
  if (!envelope || typeof envelope !== "object" || !("ciphertext" in envelope)) {
    return secretRef;
  }
  return store.open(envelope);
}

export class RuntimeConnectionResolver {
  constructor(
    private readonly db: RuntimeConnectionDb,
    private readonly secretStore: SecretStore,
  ) {}

  async resolveActive(connectionId: string): Promise<RuntimeConnection | null> {
    const conn = await this.db.findActiveConnection(connectionId);
    return conn;
  }

  async resolveSecret(connection: RuntimeConnection): Promise<string | null> {
    const rec = await this.db.findSecretRef(connection.connectionId, connection.mode);
    if (!rec) {
      return null;
    }
    return resolveSecretValue(rec.secretRef, this.secretStore);
  }

  /** The secret store backing this resolver (exposed for LIVE-gate probes). */
  getSecretStore(): SecretStore {
    return this.secretStore;
  }

  /**
   * LIVE-activation gate. LIVE writes are only allowed when the secret store is
   * a production-grade (kms) backend AND a seal→open round-trip succeeds. With
   * a `local`/disabled store this throws (fail-closed), so `.env` alone can
   * never activate a LIVE connection.
   */
  async assertLiveActivation(connection: RuntimeConnection): Promise<void> {
    if (connection.mode !== "LIVE") {
      return;
    }
    if (this.secretStore.mode !== "kms") {
      throw new RepositoryError("FORBIDDEN", "LIVE activation requires a KMS-backed secret store");
    }
    const probe = await this.secretStore.seal("live-activation-probe");
    const opened = await this.secretStore.open(probe);
    if (opened !== "live-activation-probe") {
      throw new RepositoryError("FORBIDDEN", "LIVE activation probe failed");
    }
  }

  /** Adapter-facing helper: get the active connection and its unsealed secret. */
  async resolveForConnection(connectionId: string): Promise<{ connection: RuntimeConnection; secret: string } | null> {
    const connection = await this.resolveActive(connectionId);
    if (!connection) {
      return null;
    }
    await this.assertLiveActivation(connection);
    const secret = await this.resolveSecret(connection);
    if (!secret) {
      throw new RepositoryError("NOT_FOUND", `No secret resolvable for connection ${connectionId}`);
    }
    return { connection, secret };
  }

  /**
   * Resolve the first ACTIVE connection for an organization together with its
   * unsealed secret. Returns `null` when the org has no ACTIVE connection
   * (dev/demo keeps the local link); throws when a connection exists but its
   * secret cannot be unsealed (configured-but-broken → surfaced, never mocked).
   */
  async resolveFirstActive(organizationId: string): Promise<{ connection: RuntimeConnection; secret: string } | null> {
    const connection = await this.db.findFirstActive(organizationId);
    if (!connection) {
      return null;
    }
    await this.assertLiveActivation(connection);
    const secret = await this.resolveSecret(connection);
    if (!secret) {
      throw new RepositoryError("NOT_FOUND", `No secret resolvable for connection ${connection.connectionId}`);
    }
    return { connection, secret };
  }
}

/* ---------------------------------------------------------------------- */
/* Prisma-backed executor (lazy)                                          */
/* ---------------------------------------------------------------------- */

export class PrismaRuntimeConnectionDb implements RuntimeConnectionDb {
  constructor(private readonly prisma: { paymentProviderConnection: unknown; secretRecord: unknown }) {}

  async findActiveConnection(connectionId: string): Promise<RuntimeConnection | null> {
    const client = this.prisma.paymentProviderConnection as {
      findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findFirst({ where: { id: connectionId, status: "ACTIVE" } });
    return row ? mapConnection(row) : null;
  }

  async findFirstActive(organizationId: string): Promise<RuntimeConnection | null> {
    const client = this.prisma.paymentProviderConnection as {
      findFirst(args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    return row ? mapConnection(row) : null;
  }

  async findSecretRef(connectionId: string, mode: ProviderMode): Promise<RuntimeSecretRef | null> {
    const client = this.prisma.secretRecord as {
      findUnique(args: { where: { connectionId_mode: { connectionId: string; mode: string } } }): Promise<Record<string, unknown> | null>;
    };
    const row = await client.findUnique({
      where: { connectionId_mode: { connectionId, mode } },
    });
    if (!row) {
      return null;
    }
    return { secretRef: String(row.secretRef), credentialVersion: Number(row.credentialVersion ?? 1) };
  }
}

/** Project a provider-connection row to a `RuntimeConnection` (fail-closed on unknown provider). */
function mapConnection(row: Record<string, unknown>): RuntimeConnection | null {
  const provider = String(row.provider);
  if (provider !== "xendit" && provider !== "stripe") {
    return null;
  }
  return {
    connectionId: String(row.id),
    organizationId: String(row.organizationId),
    provider,
    mode: row.mode as ProviderMode,
  };
}

/* ---------------------------------------------------------------------- */
/* In-memory dev/test executor                                            */
/* ---------------------------------------------------------------------- */

export class InMemoryRuntimeConnectionDb implements RuntimeConnectionDb {
  private readonly connections = new Map<string, RuntimeConnection>();
  private readonly secrets = new Map<string, RuntimeSecretRef>();

  seedConnection(conn: RuntimeConnection): void {
    this.connections.set(conn.connectionId, conn);
  }

  seedSecret(connectionId: string, mode: ProviderMode, rec: RuntimeSecretRef): void {
    this.secrets.set(`${connectionId}:${mode}`, rec);
  }

  async findActiveConnection(connectionId: string): Promise<RuntimeConnection | null> {
    return this.connections.get(connectionId) ?? null;
  }

  async findFirstActive(organizationId: string): Promise<RuntimeConnection | null> {
    for (const conn of this.connections.values()) {
      if (conn.organizationId === organizationId) {
        return conn;
      }
    }
    return null;
  }

  async findSecretRef(connectionId: string, mode: ProviderMode): Promise<RuntimeSecretRef | null> {
    return this.secrets.get(`${connectionId}:${mode}`) ?? null;
  }
}

/* ---------------------------------------------------------------------- */
/* Fail-closed disabled secret store (unconfigured env)                   */
/* ---------------------------------------------------------------------- */

/**
 * Used when `SECRET_STORE_MODE`/`SECRET_STORE_KEY` are not configured. It exists
 * so the runtime can be composed in a bare dev/demo environment (no secret
 * store) without throwing at construction — but it can never unseal a secret,
 * so a configured connection that depends on it fails closed rather than
 * silently downgrading. This keeps `.env`-only setup from activating a provider
 * path.
 */
class DisabledSecretStore implements SecretStore {
  readonly mode = "local" as const;
  readonly keyRef = "disabled";
  async seal(_value: string, _version = 1): Promise<SecretEnvelope> {
    throw new SecretStoreError("MISSING_CONFIG", "No secret store configured; cannot seal a secret");
  }
  async open(_envelope: SecretEnvelope): Promise<string> {
    throw new SecretStoreError("MISSING_CONFIG", "No secret store configured; cannot unseal a secret");
  }
  async rotate(_value: string, _previousVersion: number): Promise<SecretEnvelope> {
    throw new SecretStoreError("MISSING_CONFIG", "No secret store configured; cannot rotate a secret");
  }
}

/* ---------------------------------------------------------------------- */
/* Factory (reads env, fails closed)                                      */
/* ---------------------------------------------------------------------- */

export function buildRuntimeSecretStore(): SecretStore {
  return createSecretStore({
    mode: env.SECRET_STORE_MODE,
    key: env.SECRET_STORE_KEY,
    kmsKeyId: env.SECRET_STORE_KMS_KEY_ID,
  });
}

export async function buildRuntimeConnectionResolver(input?: { db?: RuntimeConnectionDb; secretStore?: SecretStore }): Promise<RuntimeConnectionResolver> {
  let secretStore = input?.secretStore;
  if (!secretStore) {
    try {
      secretStore = buildRuntimeSecretStore();
    } catch {
      // Incomplete secret-store config (e.g. no SECRET_STORE_KEY in dev/demo) →
      // a disabled store that can never unseal. No mock downgrade.
      secretStore = new DisabledSecretStore();
    }
  }
  let db = input?.db;
  if (!db) {
    const prisma = await loadLazyPrisma();
    if (prisma) {
      db = new PrismaRuntimeConnectionDb(prisma);
    } else {
      db = new InMemoryRuntimeConnectionDb();
    }
  }
  return new RuntimeConnectionResolver(db, secretStore);
}

export function assertKnownRuntimeProvider(provider: string): asserts provider is RuntimeProvider {
  if (provider !== "xendit" && provider !== "stripe") {
    throw new RepositoryError("INVALID_TOPOLOGY", `Unknown provider "${provider}"`);
  }
}
