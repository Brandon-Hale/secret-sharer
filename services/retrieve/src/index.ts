import { createResponder } from "@onetime/lambda-http";
import { createClaimer } from "./ddb.js";
import { createHandler } from "./handler.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`missing env ${name}`);
  return value;
}

/** See services/create/src/index.ts for why this is built at module scope. */
export const handler = createHandler({
  claim: createClaimer({
    tableName: requireEnv("TABLE_NAME"),
    endpoint: process.env["DDB_ENDPOINT"],
  }),
  now: () => new Date(),
  responder: createResponder({ allowedOrigin: requireEnv("ALLOWED_ORIGIN") }),
});
