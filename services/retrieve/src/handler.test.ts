import { describe, expect, it, vi } from "vitest";
import { createResponder } from "@onetime/lambda-http";
import { createHandler } from "./handler.js";
import type { StoredSecret } from "./handler.js";

const responder = createResponder({ allowedOrigin: "https://example.com" });
const NOW = new Date("2026-01-01T00:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const ID = "8f2ka9dLmQ3xR7vB1nZpYw";

function stored(overrides: Partial<StoredSecret> = {}): StoredSecret {
  return {
    id: ID,
    ciphertext: "abcABC012_-",
    createdAt: "2025-12-31T00:00:00.000Z",
    expiresAt: NOW_SECONDS + 3600,
    ...overrides,
  };
}

function harness(claim: (id: string) => Promise<StoredSecret | null>) {
  return createHandler({ claim, now: () => NOW, responder });
}

const event = { body: null, pathParameters: { id: ID } };

describe("retrieve handler", () => {
  it("returns 200 with the ciphertext on the first claim", async () => {
    const response = await harness(async () => stored())(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ciphertext: "abcABC012_-" });
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns only the ciphertext, never the stored metadata", async () => {
    const response = await harness(async () => stored())(event);
    expect(Object.keys(JSON.parse(response.body))).toEqual(["ciphertext"]);
  });

  it("returns 404 when the item was already claimed", async () => {
    const response = await harness(async () => null)(event);
    expect(response.statusCode).toBe(404);
  });

  it("returns 404 past expiresAt even though the delete succeeded", async () => {
    const response = await harness(async () => stored({ expiresAt: NOW_SECONDS - 1 }))(event);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("abcABC012_-");
  });

  it("treats expiresAt exactly equal to now as expired", async () => {
    const response = await harness(async () => stored({ expiresAt: NOW_SECONDS }))(event);
    expect(response.statusCode).toBe(404);
  });

  it("still serves a secret one second before it expires", async () => {
    const response = await harness(async () => stored({ expiresAt: NOW_SECONDS + 1 }))(event);
    expect(response.statusCode).toBe(200);
  });

  it("returns a byte-identical 404 for claimed, expired and never-existed", async () => {
    const claimed = await harness(async () => null)(event);
    const expired = await harness(async () => stored({ expiresAt: NOW_SECONDS - 1 }))(event);
    const missing = await harness(async () => null)({
      body: null,
      pathParameters: { id: "aaaaaaaaaaaaaaaaaaaaaa" },
    });

    expect(expired.body).toBe(claimed.body);
    expect(missing.body).toBe(claimed.body);
    expect(expired.statusCode).toBe(claimed.statusCode);
    expect(missing.statusCode).toBe(claimed.statusCode);
    expect(expired.headers).toEqual(claimed.headers);
    expect(missing.headers).toEqual(claimed.headers);
  });

  it("returns 404 for a malformed id without touching the table", async () => {
    const claim = vi.fn(async () => stored());
    const handler = createHandler({ claim, now: () => NOW, responder });

    const response = await handler({ body: null, pathParameters: { id: "not-an-id" } });
    expect(response.statusCode).toBe(404);
    expect(claim).not.toHaveBeenCalled();
  });

  it("returns 404 when the path parameter is missing entirely", async () => {
    const response = await harness(async () => stored())({ body: null, pathParameters: null });
    expect(response.statusCode).toBe(404);
  });

  it("returns 500 without leaking the underlying error", async () => {
    const response = await harness(async () => {
      throw new Error("ResourceNotFoundException: table onetime-secrets");
    })(event);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("onetime-secrets");
  });

  it("claims exactly once per request", async () => {
    const claim = vi.fn(async () => stored());
    const handler = createHandler({ claim, now: () => NOW, responder });

    await handler(event);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith(ID);
  });
});
