import { ProvisionedThroughputExceededException } from "@aws-sdk/client-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addProduct } from "../../../src/api/dbClient";
import { handler } from "../../../src/api/products/addProduct";
import { Category } from "../../../src/api/types";
import type { Product, ProductCreateData } from "../../../src/api/types";
import { makeEvent } from "../../helpers/apiGateway";

vi.mock("../../../src/api/dbClient");

const addProductMock = vi.mocked(addProduct);

const newPotion: ProductCreateData = {
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

const created: Product = { id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f", ...newPotion };

const postEvent = (body: string | null) => makeEvent({ httpMethod: "POST", path: "/products", body });

const postJson = (body: unknown) => postEvent(JSON.stringify(body));

describe("addProduct handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 201 and the created product, id included", async () => {
    addProductMock.mockResolvedValue(created);

    const response = await handler(postJson(newPotion));

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual(created);
    expect(addProductMock).toHaveBeenCalledWith(newPotion);
  });

  it("accepts every category in the enum", async () => {
    addProductMock.mockResolvedValue(created);

    for (const category of Object.values(Category)) {
      const response = await handler(postJson({ ...newPotion, category }));

      expect(response.statusCode).toBe(201);
      expect(addProductMock).toHaveBeenLastCalledWith({ ...newPotion, category });
    }
  });

  describe("rejects bad input before touching the db", () => {
    it("returns 400 for a missing body", async () => {
      const response = await handler(postEvent(null));

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ message: "A request body is required." });
      expect(addProductMock).not.toHaveBeenCalled();
    });

    it("returns 400 for malformed JSON, naming JSON as the problem", async () => {
      const response = await handler(postEvent("{ not json"));

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ message: "The request body is not valid JSON." });
      expect(addProductMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a negative price", { ...newPotion, price: -5 }],
      ["a fractional price", { ...newPotion, price: 9.99 }],
      ["an empty title", { ...newPotion, title: "" }],
      ["an unknown category", { ...newPotion, category: "Swords" }],
      ["a missing field", { title: newPotion.title, price: 25 }],
      ["an unknown field", { ...newPotion, isOnSale: true }],
      // The client does not get to choose the id; dbClient generates it.
      ["a client-supplied id", { ...newPotion, id: created.id }]
    ])("returns 400 for %s", async (_case, body) => {
      const response = await handler(postJson(body));

      expect(response.statusCode).toBe(400);
      expect(addProductMock).not.toHaveBeenCalled();
    });

    it("says which field was wrong", async () => {
      const response = await handler(postJson({ ...newPotion, price: -5 }));

      const { message, details } = JSON.parse(response.body);
      expect(message).toContain("Invalid product data.");
      expect(details).toMatchObject({ properties: { price: { errors: [expect.any(String)] } } });
    });
  });

  describe("db failures", () => {
    it("returns 500 without leaking the failure", async () => {
      addProductMock.mockRejectedValue(new Error("connection reset by peer"));

      const response = await handler(postJson(newPotion));

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("connection reset");
    });

    it("returns a retryable 503 when the table is throttled", async () => {
      // The full path: an SDK exception maps to a status and a retry hint
      // without the handler itself knowing anything about DynamoDB.
      addProductMock.mockRejectedValue(
        new ProvisionedThroughputExceededException({ message: "slow down", $metadata: {} })
      );

      const response = await handler(postJson(newPotion));

      expect(response.statusCode).toBe(503);
      expect(response.headers).toMatchObject({ "retry-after": "1" });
    });
  });
});
