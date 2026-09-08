import { describe, expect, it } from "vitest";
import {
  MAX_CIPHERTEXT_LENGTH,
  isCiphertext,
  isExpiresIn,
  isSecretId,
  parseCreateRequest,
} from "./index.js";

describe("isExpiresIn", () => {
  it("accepts exactly the three allowed durations", () => {
    expect(isExpiresIn(3600)).toBe(true);
    expect(isExpiresIn(86400)).toBe(true);
    expect(isExpiresIn(604800)).toBe(true);
  });

  it("rejects everything else, including near-misses", () => {
    for (const bad of [0, -3600, 3599, 604801, 31536000, "3600", null, undefined, NaN]) {
      expect(isExpiresIn(bad)).toBe(false);
    }
  });
});

describe("isSecretId", () => {
  it("accepts a 22-char base64url string", () => {
    expect(isSecretId("8f2ka9dLmQ3xR7vB1nZpYw")).toBe(true);
    expect(isSecretId("_-_-_-_-_-_-_-_-_-_-_-")).toBe(true);
  });

  it("rejects wrong length, padding and non-base64url alphabets", () => {
    const bad = [
      "short",
      "8f2ka9dLmQ3xR7vB1nZpY",
      "8f2ka9dLmQ3xR7vB1nZpYww",
      "8f2ka9dLmQ3xR7vB1nZpY=",
      "8f2ka9dLmQ3xR7vB1nZp/w",
      "8f2ka9dLmQ3xR7vB1nZp+w",
      "",
      null,
      22,
    ];
    for (const value of bad) expect(isSecretId(value)).toBe(false);
  });

  it("rejects a newline smuggled past a naive anchor", () => {
    expect(isSecretId("8f2ka9dLmQ3xR7vB1nZpYw\n")).toBe(false);
  });
});

describe("isCiphertext", () => {
  it("accepts unpadded base64url up to the size cap", () => {
    expect(isCiphertext("abcABC012_-")).toBe(true);
    expect(isCiphertext("a".repeat(MAX_CIPHERTEXT_LENGTH))).toBe(true);
  });

  it("rejects empty, oversized, padded and non-base64url input", () => {
    expect(isCiphertext("")).toBe(false);
    expect(isCiphertext("a".repeat(MAX_CIPHERTEXT_LENGTH + 1))).toBe(false);
    expect(isCiphertext("abc=")).toBe(false);
    expect(isCiphertext("abc/+")).toBe(false);
    expect(isCiphertext(null)).toBe(false);
  });
});

describe("parseCreateRequest", () => {
  it("returns a typed request for a valid body", () => {
    expect(parseCreateRequest({ ciphertext: "abc", expiresIn: 3600 })).toEqual({
      ciphertext: "abc",
      expiresIn: 3600,
    });
  });

  it("drops unknown fields rather than passing them through", () => {
    expect(parseCreateRequest({ ciphertext: "abc", expiresIn: 3600, admin: true })).toEqual({
      ciphertext: "abc",
      expiresIn: 3600,
    });
  });

  it("returns null for every invalid shape", () => {
    const bad = [
      null,
      undefined,
      "string",
      42,
      [],
      {},
      { ciphertext: "abc" },
      { expiresIn: 3600 },
      { ciphertext: "abc", expiresIn: 60 },
      { ciphertext: "", expiresIn: 3600 },
      { ciphertext: 123, expiresIn: 3600 },
    ];
    for (const value of bad) expect(parseCreateRequest(value)).toBeNull();
  });
});

describe("size limits", () => {
  it("expresses the 64 KB cap as its exact unpadded base64url length", () => {
    // 65536 bytes = 21845 full 3-byte groups (87380 chars) + 1 byte (2 chars).
    expect(MAX_CIPHERTEXT_LENGTH).toBe(87382);
    expect(Buffer.alloc(65536).toString("base64url")).toHaveLength(MAX_CIPHERTEXT_LENGTH);
  });
});
