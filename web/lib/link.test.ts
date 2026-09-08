import { describe, expect, it } from "vitest";
import { buildSecretUrl, keyFromHash } from "./link.js";

const ID = "8f2ka9dLmQ3xR7vB1nZpYw";

describe("buildSecretUrl", () => {
  it("puts the key in the fragment, never the path or the query", () => {
    const url = buildSecretUrl("https://onetime.example", ID, "KEY123");
    expect(url).toBe(`https://onetime.example/s/${ID}#KEY123`);

    const parsed = new URL(url);
    expect(parsed.search).toBe("");
    expect(parsed.pathname).not.toContain("KEY123");
    expect(parsed.hash).toBe("#KEY123");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(buildSecretUrl("https://onetime.example/", ID, "K")).toBe(
      `https://onetime.example/s/${ID}#K`,
    );
  });
});

describe("keyFromHash", () => {
  it("strips the leading hash", () => {
    expect(keyFromHash("#KEY123")).toBe("KEY123");
    expect(keyFromHash("KEY123")).toBe("KEY123");
  });

  it("round-trips with buildSecretUrl", () => {
    const url = new URL(buildSecretUrl("https://onetime.example", ID, "abcABC012_-"));
    expect(keyFromHash(url.hash)).toBe("abcABC012_-");
  });

  it("returns null for an empty or non-base64url fragment", () => {
    for (const bad of ["", "#", "#not a key", "#has/slash", "#has+plus", "#trailing="]) {
      expect(keyFromHash(bad)).toBeNull();
    }
  });
});
