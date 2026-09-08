import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { IdCollisionError } from "./handler.js";
import type { SecretItem } from "./handler.js";

export interface DdbOptions {
  tableName: string;
  /** Set only by tests, which point at a local DynamoDB implementation. */
  endpoint?: string | undefined;
}

export function createPutter({ tableName, endpoint }: DdbOptions) {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient(endpoint === undefined ? {} : { endpoint }),
  );

  return async function put(item: SecretItem): Promise<void> {
    try {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          // PutItem overwrites by default. Without this guard an id collision
          // would silently destroy the earlier secret.
          ConditionExpression: "attribute_not_exists(id)",
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) throw new IdCollisionError();
      throw error;
    }
  };
}
