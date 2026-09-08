import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import dynalite from "dynalite";

export interface TestTable {
  endpoint: string;
  tableName: string;
  stop(): Promise<void>;
}

/**
 * A throwaway DynamoDB table for tests that need real conditional-write
 * semantics rather than a stub.
 *
 * DDB_ENDPOINT wins when set, which is how CI points the same suite at
 * DynamoDB Local. Otherwise an in-process dynalite binds an ephemeral port,
 * so the suite needs neither Docker nor a JVM.
 */
export async function startTestTable(tableName = "onetime-secrets-test"): Promise<TestTable> {
  const external = process.env["DDB_ENDPOINT"];
  let endpoint = external ?? "";
  let stop = async (): Promise<void> => {};

  if (external === undefined) {
    const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, () => resolve());
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("dynalite did not bind a TCP port");
    }
    endpoint = `http://127.0.0.1:${address.port}`;
    stop = () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
  }

  const client = new DynamoDBClient({
    endpoint,
    region: "ap-southeast-2",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    }),
  );
  client.destroy();

  return { endpoint, tableName, stop };
}
