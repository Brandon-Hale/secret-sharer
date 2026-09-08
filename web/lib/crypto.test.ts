import { describe, expect, it } from "vitest";
import {
  DecryptionError,
  decryptSecret,
  encryptSecret,
  fromBase64Url,
  toBase64Url,
} from "./crypto.js";

/** noUncheckedIndexedAccess is on, so flip a byte through an explicit copy. */
function flipByte(bytes: Uint8Array<ArrayBuffer>, index: number): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  copy[index] = (copy[index] ?? 0) ^ 0xff;
  return copy;
}

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("round-trips every byte value", () => {
    const bytes = new Uint8Array(256).map((_, index) => index);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("round-trips each remainder length, where padding would appear", () => {
    for (const length of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(length).fill(255);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("emits no padding and none of the URL-hostile characters", () => {
    const bytes = new Uint8Array([251, 255, 190, 255, 255]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("agrees with Node's own base64url encoder", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
  });
});

describe("encryptSecret", () => {
  it("round-trips through decryptSecret", async () => {
    const { ciphertext, key } = await encryptSecret("hunter2");
    expect(await decryptSecret(ciphertext, key)).toBe("hunter2");
  });

  it("round-trips unicode and long input", async () => {
    const plaintext = `ключ 🔐 ${"x".repeat(10_000)}`;
    const { ciphertext, key } = await encryptSecret(plaintext);
    expect(await decryptSecret(ciphertext, key)).toBe(plaintext);
  });

  it("produces a different ciphertext and key every time for the same plaintext", async () => {
    const first = await encryptSecret("same");
    const second = await encryptSecret("same");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.key).not.toBe(second.key);
  });

  it("emits a 256-bit key and prepends a 12-byte IV", async () => {
    const { ciphertext, key } = await encryptSecret("x");
    expect(fromBase64Url(key)).toHaveLength(32);
    // 12-byte IV + 1 byte of plaintext + 16-byte GCM tag.
    expect(fromBase64Url(ciphertext)).toHaveLength(12 + 1 + 16);
  });

  it("uses a fresh IV per secret", async () => {
    const first = fromBase64Url((await encryptSecret("x")).ciphertext).slice(0, 12);
    const second = fromBase64Url((await encryptSecret("x")).ciphertext).slice(0, 12);
    expect(first).not.toEqual(second);
  });

  it("emits base64url only, so it survives a URL and a JSON body", async () => {
    const { ciphertext, key } = await encryptSecret("x".repeat(500));
    expect(ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never leaks the plaintext into the ciphertext", async () => {
    const { ciphertext } = await encryptSecret("correct horse battery staple");
    expect(ciphertext).not.toContain("horse");
    expect(Buffer.from(fromBase64Url(ciphertext)).toString("utf8")).not.toContain("horse");
  });
});

describe("decryptSecret", () => {
  it("throws DecryptionError for the wrong key", async () => {
    const { ciphertext } = await encryptSecret("hunter2");
    const decoy = await encryptSecret("decoy");
    await expect(decryptSecret(ciphertext, decoy.key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError for tampered ciphertext", async () => {
    const { ciphertext, key } = await encryptSecret("hunter2");
    const bytes = fromBase64Url(ciphertext);
    const tampered = toBase64Url(flipByte(bytes, bytes.length - 1));
    await expect(decryptSecret(tampered, key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError for a tampered IV", async () => {
    const { ciphertext, key } = await encryptSecret("hunter2");
    const bytes = fromBase64Url(ciphertext);
    const tamperedIv = toBase64Url(flipByte(bytes, 0));
    await expect(decryptSecret(tamperedIv, key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError for a malformed key", async () => {
    const { ciphertext } = await encryptSecret("hunter2");
    await expect(decryptSecret(ciphertext, "tooshort")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("throws DecryptionError for a blob too short to hold an IV", async () => {
    const { key } = await encryptSecret("hunter2");
    await expect(decryptSecret("aaaa", key)).rejects.toBeInstanceOf(DecryptionError);
    await expect(decryptSecret("", key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("says nothing about which failure it was", async () => {
    const { ciphertext, key } = await encryptSecret("hunter2");
    const decoy = await encryptSecret("decoy");
    const bytes = fromBase64Url(ciphertext);
    const flipped = toBase64Url(flipByte(bytes, bytes.length - 1));

    const wrongKey = await decryptSecret(ciphertext, decoy.key).catch((error: unknown) => error);
    const tampered = await decryptSecret(flipped, key).catch((error: unknown) => error);

    expect((wrongKey as Error).message).toBe((tampered as Error).message);
  });
});
