import { BAD_REQUEST, NOT_FOUND, SERVER_ERROR } from "@onetime/contracts";
import type { CreateSecretResponse } from "@onetime/contracts";

/**
 * The slice of the API Gateway proxy event these handlers actually read.
 * Narrowing it here keeps the handlers testable without an aws-lambda types
 * dependency and makes it obvious how little of the event matters.
 */
export interface ApiEvent {
  body: string | null;
  pathParameters: Record<string, string | undefined> | null;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface Responder {
  json<T>(statusCode: number, body: T): HttpResponse;
  created(body: CreateSecretResponse): HttpResponse;
  okNoStore<T>(body: T): HttpResponse;
  notFound(): HttpResponse;
  badRequest(): HttpResponse;
  serverError(): HttpResponse;
}

/**
 * API Gateway does not attach CORS headers to proxy responses, so every
 * response this app produces has to carry them itself — errors included.
 * Without that, a browser sees a CORS failure instead of the real 404, and
 * the 404 is a normal, expected outcome here rather than an edge case.
 */
export function createResponder({ allowedOrigin }: { allowedOrigin: string }): Responder {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
  };

  const json = <T>(statusCode: number, body: T): HttpResponse => ({
    statusCode,
    headers: { ...baseHeaders },
    body: JSON.stringify(body),
  });

  const noStore = <T>(statusCode: number, body: T): HttpResponse => ({
    statusCode,
    headers: { ...baseHeaders, "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  });

  return {
    json,
    created: (body) => json(201, body),
    okNoStore: (body) => noStore(200, body),
    notFound: () => noStore(404, NOT_FOUND),
    badRequest: () => noStore(400, BAD_REQUEST),
    serverError: () => noStore(500, SERVER_ERROR),
  };
}

/** Never throws: a malformed body is a 400, not a stack trace. */
export function parseJsonBody(event: ApiEvent): unknown {
  if (event.body === null || event.body === "") return null;
  try {
    return JSON.parse(event.body) as unknown;
  } catch {
    return null;
  }
}
