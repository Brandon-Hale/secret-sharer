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
 * DeleteItem with ReturnValues ALL_OLD both destroys the row and hands back
 * what it destroyed in one atomic operation, so concurrent callers race inside
 * DynamoDB and only one of them is handed the item. Reading first and deleting
 * afterwards would open a window where two people both receive the secret;
 * services/integration proves the difference.
 *
 * The ConditionExpression is not what makes this safe — ALL_OLD already is.
 * It turns "the item was not there" into an explicit exception rather than an
 * empty response, which keeps the null path deliberate instead of incidental.
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
