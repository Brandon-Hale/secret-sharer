/**
 * The whole reason the server can be trusted with the ciphertext: it never
 * sees a key. Everything here runs in the browser, using WebCrypto directly.
 * No library — one less dependency with read access to plaintext.
 */

/**
 * TypeScript 5.7 made the backing-buffer type of a typed array explicit, and
 * WebCrypto insists on ArrayBuffer rather than the SharedArrayBuffer a bare
 * Uint8Array might hold. Naming it once keeps that noise out of every
 * signature below.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const IV_BYTES = 12;
const KEY_BITS = 256;

export class DecryptionError extends Error {
  constructor() {
    // Deliberately uninformative. Wrong key, tampered blob and truncated input
    // are the same event to the person holding the link, and distinguishing
    // them tells an attacker which part of a guess was right.
    super("Could not decrypt this secret.");
    this.name = "DecryptionError";
  }
}

export function toBase64Url(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64Url(text: string): Bytes {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes: Bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface EncryptedSecret {
  /** base64url(IV || ciphertext). This is what the server stores. */
  ciphertext: string;
  /** base64url raw AES key. Goes in the URL fragment, never to the server. */
  key: string;
}

export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: KEY_BITS }, true, [
    "encrypt",
    "decrypt",
  ]);

  // A fresh key per secret means a fresh IV is belt and braces, but GCM fails
  // catastrophically on IV reuse and the cost of getting it right is nil.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );

  // One field on the wire: the IV is not secret, and prepending it means there
  // is no second value to lose track of.
  const blob = new Uint8Array(iv.length + encrypted.length);
  blob.set(iv, 0);
  blob.set(encrypted, iv.length);

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));

  return { ciphertext: toBase64Url(blob), key: toBase64Url(rawKey) };
}

export async function decryptSecret(ciphertext: string, key: string): Promise<string> {
  try {
    const blob = fromBase64Url(ciphertext);
    if (blob.length <= IV_BYTES) throw new DecryptionError();

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(key),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    // GCM authenticates as it decrypts: a tampered blob throws rather than
    // returning plausible garbage.
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.subarray(0, IV_BYTES) },
      cryptoKey,
      blob.subarray(IV_BYTES),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    throw new DecryptionError();
  }
}
