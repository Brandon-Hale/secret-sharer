import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPutter } from "@onetime/service-create/ddb";
import { createClaimer } from "@onetime/service-retrieve/ddb";
import { startTestTable } from "./table.js";
import type { TestTable } from "./table.js";

let table: TestTable;
let put: ReturnType<typeof createPutter>;
let claim: ReturnType<typeof createClaimer>;

beforeAll(async () => {
  table = await startTestTable();
  put = createPutter({ tableName: table.tableName, endpoint: table.endpoint });
  claim = createClaimer({ tableName: table.tableName, endpoint: table.endpoint });
}, 30_000);

afterAll(async () => {
  await table.stop();
});

const future = (): number => Math.floor(Date.now() / 1000) + 3600;

async function seed(id: string): Promise<void> {
  await put({
    id,
    ciphertext: "abcABC012_-",
    createdAt: new Date().toISOString(),
    expiresAt: future(),
  });
}

describe("once-only claim", () => {
  it("gives the item to exactly one of two concurrent claimers", async () => {
    const id = "aaaaaaaaaaaaaaaaaaaaaa";
    await seed(id);

    const results = await Promise.all([claim(id), claim(id)]);
    const winners = results.filter((result) => result !== null);

    expect(winners).toHaveLength(1);
    expect(winners[0]?.ciphertext).toBe("abcABC012_-");
  });

  it("gives the item to exactly one of twenty concurrent claimers", async () => {
    const id = "bbbbbbbbbbbbbbbbbbbbbb";
    await seed(id);

    const results = await Promise.all(Array.from({ length: 20 }, () => claim(id)));

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("returns null on every claim after the first", async () => {
    const id = "cccccccccccccccccccccc";
    await seed(id);

    expect(await claim(id)).not.toBeNull();
    expect(await claim(id)).toBeNull();
    expect(await claim(id)).toBeNull();
  });

  it("returns null for an id that never existed", async () => {
    expect(await claim("zzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
  });

  it("returns every stored attribute to the winner", async () => {
    const id = "dddddddddddddddddddddd";
    await seed(id);

    const claimed = await claim(id);
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe(id);
    expect(claimed?.ciphertext).toBe("abcABC012_-");
    expect(typeof claimed?.expiresAt).toBe("number");
    expect(typeof claimed?.createdAt).toBe("string");
  });

  it("refuses to overwrite an existing id at write time", async () => {
    const id = "eeeeeeeeeeeeeeeeeeeeee";
    await seed(id);
    await expect(seed(id)).rejects.toThrow();
  });

  it("survives many independent secrets claimed concurrently", async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `f${String(index).padStart(21, "0")}`);
    await Promise.all(ids.map((id) => seed(id)));

    // Two claimers per id, all in flight at once.
    const results = await Promise.all(ids.flatMap((id) => [claim(id), claim(id)]));

    expect(results.filter((result) => result !== null)).toHaveLength(ids.length);
  });
});
