import { randomBytes } from "node:crypto";
import { parseCreateRequest } from "@onetime/contracts";
import { parseJsonBody } from "@onetime/lambda-http";
import type { ApiEvent, HttpResponse, Responder } from "@onetime/lambda-http";

export interface SecretItem {
  id: string;
  ciphertext: string;
  createdAt: string;
  expiresAt: number;
}

export interface CreateDeps {
  put(item: SecretItem): Promise<void>;
  newId(): string;
  now(): Date;
  responder: Responder;
}

/** Thrown by the storage adapter when attribute_not_exists(id) fails. */
export class IdCollisionError extends Error {
  constructor() {
    super("id collision");
    this.name = "IdCollisionError";
  }
}

/** 16 random bytes as unpadded base64url: 22 chars, 128 bits of entropy. */
export function newSecretId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Three is generous. With 128-bit ids a single collision means something is
 * badly wrong with the random source, and looping would turn that into a
 * hang rather than an alarm.
 */
const MAX_ID_ATTEMPTS = 3;

/**
 * The handler is a pure function of its dependencies, so the expiry maths and
 * the validation rules are testable without touching AWS.
 */
export function createHandler({ put, newId, now, responder }: CreateDeps) {
  return async function handle(event: ApiEvent): Promise<HttpResponse> {
    const request = parseCreateRequest(parseJsonBody(event));
    if (request === null) return responder.badRequest();

    const createdAt = now();
    const expiresAt = Math.floor(createdAt.getTime() / 1000) + request.expiresIn;

    try {
      for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
        const id = newId();
        try {
          await put({
            id,
            ciphertext: request.ciphertext,
            createdAt: createdAt.toISOString(),
            expiresAt,
          });
          return responder.created({ id });
        } catch (error) {
          if (error instanceof IdCollisionError) continue;
          throw error;
        }
      }
      return responder.serverError();
    } catch {
      // Never surface the underlying error: it names the table and the account.
      return responder.serverError();
    }
  };
}
