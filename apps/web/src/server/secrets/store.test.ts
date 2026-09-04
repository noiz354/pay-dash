import { describe, expect, it } from "vitest";
import {
  createSecretStore,
  LocalEncryptedSecretStore,
  SecretStoreError,
} from "./store";

async function rejectsWithCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    expect.unreachable(`expected to reject with ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(SecretStoreError);
    expect((err as SecretStoreError).code).toBe(code);
  }
}

const KEY = "unit-test-key-that-is-long-enough-for-scrypt-derivation-0000";
const OTHER_KEY = "unit-test-key-that-is-long-enough-for-scrypt-derivation-1111";

describe("local encrypted secret store", () => {
  it("seals and opens a value without leaking the plaintext", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const envelope = await store.seal("sk_test_xendit_do_not_leak");
    expect(envelope.ciphertext).not.toContain("sk_test");
    expect(envelope.iv.length).toBeGreaterThan(0);
    expect(envelope.authTag.length).toBeGreaterThan(0);
    expect(await store.open(envelope)).toBe("sk_test_xendit_do_not_leak");
  });

  it("uses a fresh IV per seal", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const a = await store.seal("same-value");
    const b = await store.seal("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a tampered ciphertext", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const envelope = await store.seal("secret");
    const tampered = { ...envelope, ciphertext: Buffer.from("corrupted").toString("base64") };
    await rejectsWithCode(store.open(tampered), "TAMPERED");
  });

  it("rejects an envelope opened with the wrong key", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const other = new LocalEncryptedSecretStore(OTHER_KEY, "local");
    const envelope = await store.seal("secret");
    await rejectsWithCode(other.open(envelope), "TAMPERED");
  });

  it("rejects a non-local scheme", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    await rejectsWithCode(
      store.open({ scheme: "kms", keyRef: "kms", version: 1, ciphertext: "", iv: "", authTag: "", createdAt: "" }),
      "UNSUPPORTED_SCHEME",
    );
  });

  it("increments version on rotate", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const original = await store.seal("v1");
    const rotated = await store.rotate("v2", original.version);
    expect(rotated.version).toBe(original.version + 1);
    expect(await store.open(rotated)).toBe("v2");
  });
});

describe("secret store factory", () => {
  it("creates a local store when a key is supplied", () => {
    const store = createSecretStore({ mode: "local", key: KEY });
    expect(store.mode).toBe("local");
  });

  it("fails closed when local mode has no key", () => {
    expect(() => createSecretStore({ mode: "local", key: undefined })).toThrow(SecretStoreError);
    expect(() => createSecretStore({ mode: "local", key: undefined })).toThrow(/SECRET_STORE_KEY/);
  });

  it("requires a kms key id in kms mode", () => {
    expect(() => createSecretStore({ mode: "kms", kmsKeyId: undefined })).toThrow(/KMS/);
  });
});
