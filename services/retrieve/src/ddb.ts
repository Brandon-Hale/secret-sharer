import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { StoredSecret } from "./handler.js";

export interface DdbOptions {
  tableName: string;
  /** Set only by tests, which point at a local DynamoDB implementation. */
  endpoint?: string | undefined;
}

/**
 * The once-only guarantee, in one call.
 *
 * A conditional DeleteItem with ReturnValues ALL_OLD both destroys the row and
 * hands back what it destroyed, atomically. Concurrent callers race inside
 * DynamoDB and exactly one wins; the losers get ConditionalCheckFailed, which
 * is a 404. Reading first and deleting afterwards would open a window where
 * two people both receive the secret.
 */
export function createClaimer({ tableName, endpoint }: DdbOptions) {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient(endpoint === undefined ? {} : { endpoint }),
  );

  return async function claim(id: string): Promise<StoredSecret | null> {
    try {
      const result = await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id },
          ConditionExpression: "attribute_exists(id)",
          ReturnValues: "ALL_OLD",
        }),
      );
      return (result.Attributes as StoredSecret | undefined) ?? null;
    } catch (error) {
      // Losing the race is the expected outcome for every caller but one.
      if (error instanceof ConditionalCheckFailedException) return null;
      throw error;
    }
  };
}
