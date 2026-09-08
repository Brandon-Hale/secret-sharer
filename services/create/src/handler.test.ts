import { describe, expect, it, vi } from "vitest";
import { createResponder } from "@onetime/lambda-http";
import { IdCollisionError, createHandler, newSecretId } from "./handler.js";
import type { SecretItem } from "./handler.js";

const responder = createResponder({ allowedOrigin: "https://example.com" });
const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");
const FIXED_ID = "8f2ka9dLmQ3xR7vB1nZpYw";

const validBody = JSON.stringify({ ciphertext: "abcABC012_-", expiresIn: 3600 });

function harness(put?: (item: SecretItem) => Promise<void>) {
  const written: SecretItem[] = [];
  const handler = createHandler({
    put:
      put ??
      (async (item) => {
        written.push(item);
      }),
    newId: () => FIXED_ID,
    now: () => FIXED_NOW,
    responder,
  });
  return { handler, written };
}

describe("createHandler", () => {
  it("returns 201 with the generated id", async () => {
    const { handler } = harness();
    const response = await handler({ body: validBody, pathParameters: null });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: FIXED_ID });
  });

  it("stores expiresAt as epoch seconds now + expiresIn", async () => {
    const { handler, written } = harness();
    await handler({ body: validBody, pathParameters: null });
    expect(written[0]?.expiresAt).toBe(Math.floor(FIXED_NOW.getTime() / 1000) + 3600);
    expect(written[0]?.createdAt).toBe(FIXED_NOW.toISOString());
    expect(written[0]?.ciphertext).toBe("abcABC012_-");
    expect(written[0]?.id).toBe(FIXED_ID);
  });

  it("never returns anything but the id — no ciphertext, no key", async () => {
    const { handler } = harness();
    const response = await handler({ body: validBody, pathParameters: null });
    expect(Object.keys(JSON.parse(response.body))).toEqual(["id"]);
    expect(response.body).not.toContain("abcABC012_-");
  });

  it("rejects a disallowed expiry with 400 and writes nothing", async () => {
    const { handler, written } = harness();
    const response = await handler({
      body: JSON.stringify({ ciphertext: "abc", expiresIn: 60 }),
      pathParameters: null,
    });
    expect(response.statusCode).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("rejects oversized ciphertext with 400", async () => {
    const { handler, written } = harness();
    const response = await handler({
      body: JSON.stringify({ ciphertext: "a".repeat(87383), expiresIn: 3600 }),
      pathParameters: null,
    });
    expect(response.statusCode).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("rejects a malformed or missing body with 400", async () => {
    const { handler } = harness();
    expect((await handler({ body: "{oops", pathParameters: null })).statusCode).toBe(400);
    expect((await handler({ body: null, pathParameters: null })).statusCode).toBe(400);
  });

  it("retries on an id collision, then succeeds with the next id", async () => {
    const written: SecretItem[] = [];
    let attempts = 0;
    const put = vi.fn(async (item: SecretItem) => {
      attempts += 1;
      if (attempts === 1) throw new IdCollisionError();
      written.push(item);
    });
    const ids = ["aaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbb"];

    const handler = createHandler({
      put,
      newId: () => ids.shift() ?? "cccccccccccccccccccccc",
      now: () => FIXED_NOW,
      responder,
    });

    const response = await handler({ body: validBody, pathParameters: null });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: "bbbbbbbbbbbbbbbbbbbbbb" });
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("gives up with a 500 rather than looping forever on repeated collisions", async () => {
    const put = vi.fn(async () => {
      throw new IdCollisionError();
    });
    const handler = createHandler({ put, newId: newSecretId, now: () => FIXED_NOW, responder });

    const response = await handler({ body: validBody, pathParameters: null });
    expect(response.statusCode).toBe(500);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it("returns 500 without leaking the underlying error", async () => {
    const { handler } = harness(async () => {
      throw new Error("ProvisionedThroughputExceededException: table onetime-secrets");
    });
    const response = await handler({ body: validBody, pathParameters: null });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("onetime-secrets");
    expect(response.body).not.toContain("Provisioned");
  });
});

describe("newSecretId", () => {
  it("produces 22-char base64url ids", () => {
    expect(newSecretId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("does not repeat across 1000 draws", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newSecretId()));
    expect(seen.size).toBe(1000);
  });
});
