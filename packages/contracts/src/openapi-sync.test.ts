import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPIRY_OPTIONS, MAX_CIPHERTEXT_LENGTH } from "./index.js";

/**
 * The API Gateway request model is the outer gate: a body it rejects never
 * reaches Lambda. That makes it a second, duplicated copy of the rules in this
 * package, and a silent divergence would either reject valid payloads or let
 * oversized ones through to be rejected again a layer deeper. These assertions
 * are what keep the copy honest.
 *
 * Read as text rather than parsed: the file is a Terraform template, so it is
 * not valid YAML until templatefile() has rendered it.
 */
const openapi = readFileSync(
  fileURLToPath(new URL("../../../infra/openapi.yaml", import.meta.url)),
  "utf8",
);

describe("infra/openapi.yaml stays in step with the contracts", () => {
  it("caps ciphertext at exactly MAX_CIPHERTEXT_LENGTH", () => {
    const match = /maxLength:\s*(\d+)/.exec(openapi);
    expect(match?.[1]).toBe(String(MAX_CIPHERTEXT_LENGTH));
  });

  it("allows exactly the expiry options this package defines", () => {
    const match = /enum:\s*\[([^\]]+)\]/.exec(openapi);
    const values = match?.[1]?.split(",").map((value) => Number(value.trim()));
    expect(values).toEqual([...EXPIRY_OPTIONS]);
  });

  it("uses the same base64url pattern for ciphertext", () => {
    expect(openapi).toContain('pattern: "^[A-Za-z0-9_-]+$"');
  });

  it("refuses unknown fields at the gateway", () => {
    expect(openapi).toContain("additionalProperties: false");
  });

  it("keeps the nested single quotes on every CORS header value", () => {
    // A VTL string literal. Without the inner quotes API Gateway drops the
    // header, at runtime, with no error at apply time.
    const headerValues = openapi.match(/method\.response\.header\.Access-Control-[\w-]+: (.+)/g);
    expect(headerValues?.length).toBeGreaterThan(0);
    for (const line of headerValues ?? []) {
      expect(line).toMatch(/: "'.*'"$/);
    }
  });
});
