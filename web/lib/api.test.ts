import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createSecret, fetchSecret } from "./api.js";

const ID = "8f2ka9dLmQ3xR7vB1nZpYw";
const API = "https://api.example";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createSecret", () => {
  it("POSTs JSON to /secrets and returns the id", async () => {
    const fetchMock = stubFetch(201, { id: ID });

    expect(await createSecret(API, { ciphertext: "abc", expiresIn: 3600 })).toBe(ID);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/secrets");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ciphertext: "abc", expiresIn: 3600 });
  });

  it("tolerates a trailing slash on the API url", async () => {
    const fetchMock = stubFetch(201, { id: ID });
    await createSecret("https://api.example/", { ciphertext: "abc", expiresIn: 3600 });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/secrets");
  });

  it("throws ApiError on a non-201", async () => {
    stubFetch(400, { error: "bad_request" });
    await expect(createSecret(API, { ciphertext: "abc", expiresIn: 3600 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("throws ApiError when the returned id is not a valid secret id", async () => {
    stubFetch(201, { id: "nope" });
    await expect(createSecret(API, { ciphertext: "abc", expiresIn: 3600 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("fetchSecret", () => {
  it("returns the ciphertext on 200", async () => {
    stubFetch(200, { ciphertext: "abc" });
    expect(await fetchSecret(API, ID)).toBe("abc");
  });

  it("requests the id path with caching disabled", async () => {
    const fetchMock = stubFetch(200, { ciphertext: "abc" });
    await fetchSecret(API, ID);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.example/secrets/${ID}`);
    expect(init.cache).toBe("no-store");
  });

  it("returns null on 404 rather than throwing", async () => {
    stubFetch(404, { error: "not_found" });
    expect(await fetchSecret(API, ID)).toBeNull();
  });

  it("throws ApiError on 500", async () => {
    stubFetch(500, { error: "server_error" });
    await expect(fetchSecret(API, ID)).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError rather than surfacing a network failure verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchSecret(API, ID)).rejects.toBeInstanceOf(ApiError);
  });
});
