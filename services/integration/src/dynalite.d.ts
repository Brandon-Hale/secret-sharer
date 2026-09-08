// dynalite ships no types. This is the whole surface the test harness uses.
declare module "dynalite" {
  import type { Server } from "node:http";

  interface DynaliteOptions {
    /** Milliseconds a table spends in CREATING. 0 makes it immediate. */
    createTableMs?: number;
    deleteTableMs?: number;
    updateTableMs?: number;
    path?: string;
    ssl?: boolean;
  }

  export default function dynalite(options?: DynaliteOptions): Server;
}
