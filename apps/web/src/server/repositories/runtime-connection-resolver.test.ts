// @vitest-environment node
import { describe, expect, it } from "vitest";

import { KmsSecretStore, LocalEncryptedSecretStore, type KmsEnvelopeClient } from "@/server/secrets/store";
import { InMemoryRuntimeConnectionDb, buildRuntimeConnectionResolver } from "./runtime-connection-resolver";

const KEY = "resolver-test-key-that-is-long-enough-for-scrypt-derivation";

function fakeKms(): KmsEnvelopeClient {
  return {
    async wrapDataKey(dataKeyBase64) {
      return { keyId: "alias/live-key", wrappedKeyBase64: `wrapped:${dataKeyBase64}` };
    },
    async unwrapDataKey(wrappedKeyBase64) {
      if (!wrappedKeyBase64.startsWith("wrapped:")) throw new Error("invalid wrapped key");
      return wrappedKeyBase64.slice("wrapped:".length);
    },
  };
}

describe("runtime resolver LIVE-activation gate", () => {
  it("allows a TEST connection without a KMS store", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "stripe", mode: "TEST" });
    const envelope = await store.seal("sk_test");
    db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });
    const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
    const resolved = await resolver.resolveFirstActive("org-1");
    expect(resolved?.connection.mode).toBe("TEST");
    expect(resolved?.secret).toBe("sk_test");
  });

  it("refuses LIVE resolution when the secret store is not KMS", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-2", organizationId: "org-1", provider: "stripe", mode: "LIVE" });
    const envelope = await store.seal("sk_live");
    db.seedSecret("conn-2", "LIVE", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });
    const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
    await expect(resolver.resolveFirstActive("org-1")).rejects.toThrow(/KMS-backed secret store/);
  });

  it("allows LIVE resolution with a working KMS store (round-trip probe)", async () => {
    const store = new KmsSecretStore("alias/live-key", "alias/live-key", fakeKms());
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-2", organizationId: "org-1", provider: "stripe", mode: "LIVE" });
    const envelope = await store.seal("sk_live");
    db.seedSecret("conn-2", "LIVE", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });
    const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
    const resolved = await resolver.resolveFirstActive("org-1");
    expect(resolved?.connection.mode).toBe("LIVE");
    expect(resolved?.secret).toBe("sk_live");
  });

  it("refuses LIVE resolution when the KMS probe fails", async () => {
    const store = new KmsSecretStore("alias/live-key", "alias/live-key", {
      async wrapDataKey(dataKeyBase64) {
        return { keyId: "alias/live-key", wrappedKeyBase64: dataKeyBase64 };
      },
      async unwrapDataKey() {
        throw new Error("KMS unavailable");
      },
    });
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-2", organizationId: "org-1", provider: "stripe", mode: "LIVE" });
    const envelope = await store.seal("sk_live");
    db.seedSecret("conn-2", "LIVE", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });
    const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
    await expect(resolver.resolveFirstActive("org-1")).rejects.toThrow();
  });
});
