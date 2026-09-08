import { createResponder } from "@onetime/lambda-http";
import { createPutter } from "./ddb.js";
import { createHandler, newSecretId } from "./handler.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`missing env ${name}`);
  return value;
}

/**
 * Built at module scope on purpose: the client and its connection pool are
 * reused across warm invocations, and a missing variable kills the whole
 * container at init rather than returning a puzzling 500 on every request.
 */
export const handler = createHandler({
  put: createPutter({
    tableName: requireEnv("TABLE_NAME"),
    endpoint: process.env["DDB_ENDPOINT"],
  }),
  newId: newSecretId,
  now: () => new Date(),
  responder: createResponder({ allowedOrigin: requireEnv("ALLOWED_ORIGIN") }),
});
