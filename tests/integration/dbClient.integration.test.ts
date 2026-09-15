import { DeleteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startDynamoDb } from "../helpers/dynamodb";
import { PRODUCTS_TABLE_NAME } from "../../src/constants";
import { addProduct, getProduct, getProducts, updateProduct } from "../../src/clients/dbClient";
import { Category } from "../../src/api/types";
import type { ProductCreateData } from "../../src/api/types";

const potion: ProductCreateData = {
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

const shield: ProductCreateData = {
  title: "Shield of Adequate Defence",
  description: "Blocks roughly half of things.",
  price: 120,
  category: Category.Shields
};

describe("dbClient against DynamoDB Local", () => {
  let db: Awaited<ReturnType<typeof startDynamoDb>>;
  let docs: DynamoDBDocumentClient;

  beforeAll(async () => {
    db = await startDynamoDb();
    docs = DynamoDBDocumentClient.from(db.admin);
  });

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    // Cheaper than recreating the table between tests.
    const { Items = [] } = await docs.send(new ScanCommand({ TableName: PRODUCTS_TABLE_NAME }));
    await Promise.all(
      Items.map(item => docs.send(new DeleteCommand({ TableName: PRODUCTS_TABLE_NAME, Key: { id: item.id } })))
    );
  });

  it("round-trips a product through add and get", async () => {
    const created = await addProduct(potion);

    await expect(getProduct(created.id)).resolves.toEqual(created);
  });

  it("returns null for an id that was never written", async () => {
    await expect(getProduct("7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f")).resolves.toBeNull();
  });

  it("scans every product when no category is given", async () => {
    const created = await Promise.all([addProduct(potion), addProduct(shield)]);

    const all = await getProducts();

    expect(all).toHaveLength(2);
    expect(all.map(p => p.id).sort()).toEqual(created.map(p => p.id).sort());
  });

  it("queries the category index and returns only that category", async () => {
    const created = await addProduct(potion);
    await addProduct(shield);

    await expect(getProducts(Category.Potions)).resolves.toEqual([created]);
    await expect(getProducts(Category.Arrows)).resolves.toEqual([]);
  });

  it("persists an update and returns the new attributes", async () => {
    const created = await addProduct(potion);

    const updated = await updateProduct(created.id, {
      title: "Potion of Severe Inconvenience",
      description: potion.description,
      price: 99
    });

    expect(updated).toEqual({
      ...created,
      title: "Potion of Severe Inconvenience",
      price: 99
    });
    await expect(getProduct(created.id)).resolves.toEqual(updated);
  });

  it("returns null when updating an id that was never written", async () => {
    const updated = await updateProduct("7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f", {
      title: "Potion of Severe Inconvenience",
      description: potion.description,
      price: 99
    });

    expect(updated).toBeNull();
  });

  it("does not invent a product when updating an unknown id", async () => {
    // The behaviour the ConditionExpression exists to prevent: without it
    // UpdateCommand upserts, and this scan would come back with one item.
    await updateProduct("7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f", {
      title: "Potion of Severe Inconvenience",
      description: potion.description,
      price: 99
    });

    await expect(getProducts()).resolves.toEqual([]);
  });
});
