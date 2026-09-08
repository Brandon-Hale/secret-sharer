/**
 * The wire format, defined once and imported by both the browser and the
 * Lambdas. If the two ever disagree about a field, it is a type error here
 * rather than a 400 in production.
 */

export const EXPIRY_OPTIONS = [3600, 86400, 604800] as const;
export type ExpiresIn = (typeof EXPIRY_OPTIONS)[number];

/** Decoded ciphertext ceiling. */
export const MAX_CIPHERTEXT_BYTES = 65536;

/**
 * 65536 bytes as unpadded base64url: 21845 whole 3-byte groups (87380 chars)
 * plus a trailing byte (2 chars). This is the number the API Gateway request
 * model uses as maxLength, so it has to be exact.
 */
export const MAX_CIPHERTEXT_LENGTH = 87382;

/** 16 random bytes as unpadded base64url. */
export const SECRET_ID_LENGTH = 22;

// Anchored with \A-style boundaries: JavaScript $ also matches before a
// trailing newline, which would let "id\n" through.
const SECRET_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface CreateSecretRequest {
  ciphertext: string;
  expiresIn: ExpiresIn;
}

export interface CreateSecretResponse {
  id: string;
}

export interface RetrieveSecretResponse {
  ciphertext: string;
}

export interface ErrorResponse {
  error: string;
}

/**
 * The one and only 404 body. Already claimed, expired and never existed are
 * indistinguishable on purpose: any difference leaks whether a link was real.
 */
export const NOT_FOUND: ErrorResponse = { error: "not_found" };
export const BAD_REQUEST: ErrorResponse = { error: "bad_request" };
export const SERVER_ERROR: ErrorResponse = { error: "server_error" };

export function isExpiresIn(value: unknown): value is ExpiresIn {
  return (EXPIRY_OPTIONS as readonly unknown[]).includes(value);
}

export function isSecretId(value: unknown): value is string {
  return typeof value === "string" && SECRET_ID_PATTERN.test(value);
}

export function isCiphertext(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CIPHERTEXT_LENGTH &&
    BASE64URL_PATTERN.test(value)
  );
}

/**
 * Validates and narrows an untrusted body, keeping only the two fields we
 * accept. API Gateway rejects malformed bodies before Lambda ever runs; this
 * is the second gate, and the only one the browser shares.
 */
export function parseCreateRequest(value: unknown): CreateSecretRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const { ciphertext, expiresIn } = value as Record<string, unknown>;
  if (!isCiphertext(ciphertext) || !isExpiresIn(expiresIn)) return null;

  return { ciphertext, expiresIn };
}
