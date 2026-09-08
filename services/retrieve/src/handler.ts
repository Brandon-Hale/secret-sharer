import { isSecretId } from "@onetime/contracts";
import type { ApiEvent, HttpResponse, Responder } from "@onetime/lambda-http";

export interface StoredSecret {
  id: string;
  ciphertext: string;
  createdAt: string;
  expiresAt: number;
}

export interface RetrieveDeps {
  /** Deletes and returns the item atomically, or null if it was not there. */
  claim(id: string): Promise<StoredSecret | null>;
  now(): Date;
  responder: Responder;
}

export function createHandler({ claim, now, responder }: RetrieveDeps) {
  return async function handle(event: ApiEvent): Promise<HttpResponse> {
    const id = event.pathParameters?.["id"];

    // A malformed id cannot exist, so answer it exactly as a missing one and
    // skip the table entirely.
    if (!isSecretId(id)) return responder.notFound();

    let secret: StoredSecret | null;
    try {
      secret = await claim(id);
    } catch {
      return responder.serverError();
    }

    if (secret === null) return responder.notFound();

    // TTL deletion lags by up to 48 hours, so an expired row can still be
    // here. The delete has already happened; just refuse to hand it over.
    if (secret.expiresAt <= Math.floor(now().getTime() / 1000)) return responder.notFound();

    return responder.okNoStore({ ciphertext: secret.ciphertext });
  };
}
