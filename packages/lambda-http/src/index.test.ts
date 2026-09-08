import { describe, expect, it } from "vitest";
import { NOT_FOUND } from "@onetime/contracts";
import { createResponder, parseJsonBody } from "./index.js";

const responder = createResponder({ allowedOrigin: "https://example.com" });

describe("createResponder", () => {
  it("puts the CORS origin on every response, errors included", () => {
    const all = [
      responder.json(200, {}),
      responder.created({ id: "8f2ka9dLmQ3xR7vB1nZpYw" }),
      responder.okNoStore({ ciphertext: "abc" }),
      responder.notFound(),
      responder.badRequest(),
      responder.serverError(),
    ];
    for (const response of all) {
      expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://example.com");
    }
  });

  it("never emits a wildcard origin", () => {
    expect(responder.json(200, {}).headers["Access-Control-Allow-Origin"]).not.toBe("*");
  });

  it("sets no-store on secret-bearing responses", () => {
    expect(responder.okNoStore({ ciphertext: "abc" }).headers["Cache-Control"]).toBe("no-store");
    expect(responder.notFound().headers["Cache-Control"]).toBe("no-store");
  });

  it("returns the shared 404 body verbatim", () => {
    const response = responder.notFound();
    expect(response.statusCode).toBe(404);
    expect(response.body).toBe(JSON.stringify(NOT_FOUND));
  });

  it("returns 201 from created()", () => {
    const response = responder.created({ id: "8f2ka9dLmQ3xR7vB1nZpYw" });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: "8f2ka9dLmQ3xR7vB1nZpYw" });
  });

  it("hands out a fresh header object per response", () => {
    const first = responder.notFound();
    const second = responder.json(200, {});
    first.headers["X-Injected"] = "yes";
    expect(second.headers["X-Injected"]).toBeUndefined();
  });
});

describe("parseJsonBody", () => {
  it("parses a JSON body", () => {
    expect(parseJsonBody({ body: JSON.stringify({ a: 1 }), pathParameters: null })).toEqual({
      a: 1,
    });
  });

  it("returns null for missing or malformed bodies instead of throwing", () => {
    expect(parseJsonBody({ body: null, pathParameters: null })).toBeNull();
    expect(parseJsonBody({ body: "{oops", pathParameters: null })).toBeNull();
    expect(parseJsonBody({ body: "", pathParameters: null })).toBeNull();
  });
});
