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
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCTS_BUCKET_NAME, PRODUCTS_TABLE_CATEGORY_INDEX, PRODUCTS_TABLE_NAME } from "../../src/api/constants";
import { addProduct, getProduct, getProducts, updateProduct, updateProductImages } from "../../src/api/dbClient";
import { getDownloadUrl } from "../../src/api/s3Client";
import { Category } from "../../src/api/types";
import type { Product } from "../../src/api/types";

// Presigning is exercised in s3Client.test.ts; here it only needs to be
// observable and deterministic.
vi.mock("../../src/api/s3Client");

const getDownloadUrlMock = vi.mocked(getDownloadUrl);

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

const imageKey = (name: string) => `product/${potion.id}/${name}`;

/** The exception DynamoDB raises for a failed condition, with or without the item. */
const conditionFailed = (Item?: Record<string, unknown>) =>
  new ConditionalCheckFailedException({
    message: "The conditional request failed",
    $metadata: {},
    ...(Item ? { Item: Item as never } : {})
  });

describe("dbClient", () => {
  beforeEach(() => {
    ddbMock.reset();
    vi.resetAllMocks();
    getDownloadUrlMock.mockImplementation((_bucket, key) => Promise.resolve(`https://signed.example/${key}`));
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

    it("returns an empty array when the category matches nothing", async () => {
      ddbMock.on(QueryCommand).resolves({});

      await expect(getProducts(Category.Shields)).resolves.toEqual([]);
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
  describe("updateProductImages", () => {
    it("appends the key, creating the list on the first upload", async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await updateProductImages(potion.id, [imageKey("front.jpg")]);

      expect(ddbMock).toHaveReceivedCommandExactlyOnceWith(UpdateCommand, {
        TableName: PRODUCTS_TABLE_NAME,
        Key: { id: potion.id },
        ConditionExpression: "attribute_exists(id) AND NOT contains(images, :image)",
        UpdateExpression: "SET images = list_append(if_not_exists(images, :empty), :images)",
        ExpressionAttributeValues: {
          ":empty": [],
          ":image": imageKey("front.jpg"),
          ":images": [imageKey("front.jpg")]
        },
        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
      });
    });

    it("writes one guarded update per key, in the order given", async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await updateProductImages(potion.id, [imageKey("front.jpg"), imageKey("back.jpg")]);

      const values = ddbMock.commandCalls(UpdateCommand).map(call => call.args[0].input.ExpressionAttributeValues);
      expect(values.map(v => v?.[":image"])).toEqual([imageKey("front.jpg"), imageKey("back.jpg")]);
    });

    it("collapses a key repeated within one batch into a single write", async () => {
      ddbMock.on(UpdateCommand).resolves({});

      await updateProductImages(potion.id, [imageKey("front.jpg"), imageKey("front.jpg")]);

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
    });

    it("treats an already-recorded key as done rather than an error", async () => {
      // S3 delivers at least once and a re-upload reuses the key, so the guard
      // failing on an item that exists is the normal duplicate path.
      ddbMock.on(UpdateCommand).rejects(conditionFailed({ id: potion.id }));

      await expect(updateProductImages(potion.id, [imageKey("front.jpg")])).resolves.toBeUndefined();
    });

    it("keeps going through the rest of the batch after a duplicate", async () => {
      ddbMock
        .on(UpdateCommand)
        .rejects(conditionFailed({ id: potion.id }))
        .on(UpdateCommand, { ExpressionAttributeValues: { ":image": imageKey("back.jpg") } }, false)
        .resolves({});

      await expect(
        updateProductImages(potion.id, [imageKey("front.jpg"), imageKey("back.jpg")])
      ).resolves.toBeUndefined();

      expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 2);
    });

    it("throws when the product is gone, since no item comes back with the failure", async () => {
      // Both halves of the condition raise the same exception; only the returned
      // item distinguishes "already there" from "no such product".
      ddbMock.on(UpdateCommand).rejects(conditionFailed());

      await expect(updateProductImages(potion.id, [imageKey("front.jpg")])).rejects.toBeInstanceOf(
        ConditionalCheckFailedException
      );
    });

    it("lets any other DynamoDB failure propagate", async () => {
      ddbMock
        .on(UpdateCommand)
        .rejects(new ProvisionedThroughputExceededException({ message: "slow down", $metadata: {} }));

      await expect(updateProductImages(potion.id, [imageKey("front.jpg")])).rejects.toBeInstanceOf(
        ProvisionedThroughputExceededException
      );
    });

    it("writes nothing when there are no keys", async () => {
      await updateProductImages(potion.id, []);

      expect(ddbMock).not.toHaveReceivedCommand(UpdateCommand);
    });
  });

  describe("image url conversion", () => {
    const stored = { ...potion, images: [imageKey("front.jpg"), imageKey("back.jpg")] };

    it("replaces stored keys with presigned urls on a single product", async () => {
      // Keys are what the table holds; callers only ever see signed urls.
      ddbMock.on(GetCommand).resolves({ Item: stored });

      await expect(getProduct(potion.id)).resolves.toEqual({
        ...potion,
        images: [`https://signed.example/${imageKey("front.jpg")}`, `https://signed.example/${imageKey("back.jpg")}`]
      });
      expect(getDownloadUrlMock).toHaveBeenCalledWith(PRODUCTS_BUCKET_NAME, imageKey("front.jpg"));
    });

    it("converts on the scan path as well as the query path", async () => {
      // These two branches returned different shapes for the same field once.
      ddbMock.on(ScanCommand).resolves({ Items: [stored] });
      ddbMock.on(QueryCommand).resolves({ Items: [stored] });

      const [scanned] = await getProducts();
      const [queried] = await getProducts(Category.Potions);

      expect(scanned.images).toEqual(queried.images);
      expect(scanned.images?.every(image => image.startsWith("https://"))).toBe(true);
    });

    it("keeps each product's urls with that product", async () => {
      const shield = { ...potion, id: "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e", images: ["product/shield/s.jpg"] };
      ddbMock.on(ScanCommand).resolves({ Items: [stored, shield] });

      const products = await getProducts();

      expect(products[0].images).toHaveLength(2);
      expect(products[1].images).toEqual(["https://signed.example/product/shield/s.jpg"]);
    });

    it("signs nothing for a product with no images", async () => {
      ddbMock.on(GetCommand).resolves({ Item: potion });

      await expect(getProduct(potion.id)).resolves.toMatchObject({ id: potion.id });
      expect(getDownloadUrlMock).not.toHaveBeenCalled();
    });
  });
});
