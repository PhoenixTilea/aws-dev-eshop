import { ConditionalCheckFailedException, ProvisionedThroughputExceededException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";

import { PRODUCTS_TABLE_CATEGORY_INDEX, PRODUCTS_TABLE_NAME } from "../../src/api/constants";
import { addProduct, getProduct, getProducts, updateProduct } from "../../src/api/dbClient";
import { Category } from "../../src/api/types";
import type { Product } from "../../src/api/types";

// Mock the document client, not the bare DynamoDBClient: dbClient.ts sends its
// commands through DynamoDBDocumentClient.from(...), so that is the .send()
// that needs intercepting.
const ddbMock = mockClient(DynamoDBDocumentClient);

const potion: Product = {
  id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f",
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

describe("dbClient", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe("addProduct", () => {
    it("puts the product under a generated uuid and returns it", async () => {
      ddbMock.on(PutCommand).resolves({});

      const created = await addProduct({
        title: potion.title,
        description: potion.description,
        price: potion.price,
        category: potion.category
      });

      expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(ddbMock).toHaveReceivedCommandExactlyOnceWith(PutCommand, {
        TableName: PRODUCTS_TABLE_NAME,
        Item: created
      });
    });
  });

  describe("getProduct", () => {
    it("returns the item when one exists", async () => {
      ddbMock.on(GetCommand).resolves({ Item: potion });

      await expect(getProduct(potion.id)).resolves.toEqual(potion);
      expect(ddbMock).toHaveReceivedCommandExactlyOnceWith(GetCommand, {
        TableName: PRODUCTS_TABLE_NAME,
        Key: { id: potion.id }
      });
    });

    it("returns null when the key is absent", async () => {
      ddbMock.on(GetCommand).resolves({});

      await expect(getProduct(potion.id)).resolves.toBeNull();
    });
  });

  describe("getProducts", () => {
    it("scans the table when no category is given", async () => {
      ddbMock.on(ScanCommand).resolves({ Items: [potion] });

      await expect(getProducts()).resolves.toEqual([potion]);
      expect(ddbMock).toHaveReceivedCommandOnce(ScanCommand);
      expect(ddbMock).not.toHaveReceivedCommand(QueryCommand);
    });

    it("queries the category index when a category is given", async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [potion] });

      await expect(getProducts(Category.Potions)).resolves.toEqual([potion]);
      expect(ddbMock).toHaveReceivedCommandExactlyOnceWith(QueryCommand, {
        TableName: PRODUCTS_TABLE_NAME,
        IndexName: PRODUCTS_TABLE_CATEGORY_INDEX,
        KeyConditionExpression: "category = :c",
        ExpressionAttributeValues: { ":c": Category.Potions }
      });
      // DynamoDB rejects a consistent read against a GSI with ValidationException,
      // and toHaveReceivedCommandWith only matches the keys it is given.
      expect(ddbMock.commandCalls(QueryCommand)[0]?.args[0].input).not.toHaveProperty("ConsistentRead");
    });

    it("returns an empty array when DynamoDB returns no Items key", async () => {
      ddbMock.on(ScanCommand).resolves({});

      await expect(getProducts()).resolves.toEqual([]);
    });
  });

  describe("updateProduct", () => {
    it("returns the updated attributes", async () => {
      const updated = { ...potion, price: 30 };
      ddbMock.on(UpdateCommand).resolves({ Attributes: updated });

      await expect(
        updateProduct(potion.id, {
          title: potion.title,
          description: potion.description,
          price: 30
        })
      ).resolves.toEqual(updated);

      expect(ddbMock).toHaveReceivedCommandExactlyOnceWith(UpdateCommand, {
        TableName: PRODUCTS_TABLE_NAME,
        Key: { id: potion.id },
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW",
        ExpressionAttributeValues: {
          ":title": potion.title,
          ":price": 30,
          ":desc": potion.description
        }
      });
    });

    it("returns null when the product does not exist", async () => {
      // The condition guards against UpdateCommand's upsert behaviour, so a
      // failed check is DynamoDB reporting a missing item, not a conflict.
      ddbMock
        .on(UpdateCommand)
        .rejects(new ConditionalCheckFailedException({ message: "The conditional request failed", $metadata: {} }));

      await expect(
        updateProduct(potion.id, {
          title: potion.title,
          description: potion.description,
          price: 30
        })
      ).resolves.toBeNull();
    });

    it("lets any other DynamoDB failure propagate", async () => {
      // Only the condition check means "missing"; everything else is still a
      // real failure and must reach the error boundary.
      ddbMock
        .on(UpdateCommand)
        .rejects(new ProvisionedThroughputExceededException({ message: "slow down", $metadata: {} }));

      await expect(
        updateProduct(potion.id, {
          title: potion.title,
          description: potion.description,
          price: 30
        })
      ).rejects.toBeInstanceOf(ProvisionedThroughputExceededException);
    });
  });
});
