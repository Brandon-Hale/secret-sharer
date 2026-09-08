import { isSecretId } from "@onetime/contracts";
import type {
  CreateSecretRequest,
  CreateSecretResponse,
  RetrieveSecretResponse,
} from "@onetime/contracts";

/** Everything the user is ever told about a transport failure. */
export class ApiError extends Error {
  constructor(message = "Something went wrong. Please try again.") {
    super(message);
    this.name = "ApiError";
  }
}

function endpoint(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/$/, "")}${path}`;
}

export async function createSecret(apiUrl: string, request: CreateSecretRequest): Promise<string> {
  let response: Response;
  try {
    response = await fetch(endpoint(apiUrl, "/secrets"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError();
  }

  if (response.status !== 201) throw new ApiError();

  const body = (await response.json()) as CreateSecretResponse;
  // The link is built from this id. A malformed one would produce a dead link
  // that looks perfectly fine, so refuse it here rather than later.
  if (!isSecretId(body.id)) throw new ApiError();

  return body.id;
}

/**
 * Resolves to null for 404 — already claimed, expired, or never existed. The
 * API refuses to distinguish those, and so does this.
 *
 * Calling this destroys the secret. Only ever call it from a user gesture.
 */
export async function fetchSecret(apiUrl: string, id: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(endpoint(apiUrl, `/secrets/${id}`), { cache: "no-store" });
  } catch {
    throw new ApiError();
  }

  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError();

  const body = (await response.json()) as RetrieveSecretResponse;
  return body.ciphertext;
}
