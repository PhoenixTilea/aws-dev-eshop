import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProducts } from "../../../src/clients/dbClient";
import { handler } from "../../../src/api/products/getProducts";
import { Category } from "../../../src/api/types";
import type { Product } from "../../../src/api/types";
import { makeEvent } from "../../helpers/apiGateway";

// Replaces every export of dbClient with a vi.fn(). The handler is the unit
// under test here; whether DynamoDB is spoken to correctly is dbClient.test.ts.
vi.mock("../../../src/clients/dbClient");

const getProductsMock = vi.mocked(getProducts);

const potion: Product = {
  id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f",
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

describe("getProducts handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 and the full catalogue when no category is given", async () => {
    getProductsMock.mockResolvedValue([potion]);

    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([potion]);
    expect(getProductsMock).toHaveBeenCalledWith(undefined);
  });

  it("passes a valid category through to the db layer", async () => {
    getProductsMock.mockResolvedValue([potion]);

    const response = await handler(makeEvent({ queryStringParameters: { category: Category.Potions } }));

    expect(response.statusCode).toBe(200);
    expect(getProductsMock).toHaveBeenCalledWith(Category.Potions);
  });

  it("accepts every category in the enum", async () => {
    getProductsMock.mockResolvedValue([]);

    for (const category of Object.values(Category)) {
      const response = await handler(makeEvent({ queryStringParameters: { category } }));

      expect(response.statusCode).toBe(200);
      expect(getProductsMock).toHaveBeenLastCalledWith(category);
    }
  });

  it("returns 400 and never hits the db for an unknown category", async () => {
    // A string that is deliberately not a member of Category.
    const response = await handler(makeEvent({ queryStringParameters: { category: "Swords" } }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain("Invalid category parameter.");
    expect(getProductsMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the underlying failure when the db layer throws", async () => {
    getProductsMock.mockRejectedValue(new Error("ProvisionedThroughputExceeded"));

    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(500);
    // The cause is logged, never sent: the body carries no detail about it.
    expect(JSON.parse(response.body)).toEqual({ message: "Something went wrong handling this request." });
    expect(response.body).not.toContain("ProvisionedThroughputExceeded");
  });

  it("always sends JSON and permissive CORS headers", async () => {
    getProductsMock.mockResolvedValue([]);

    const response = await handler(makeEvent());

    expect(response.headers).toMatchObject({
      "Content-Type": "application/json",
      "access-control-allow-origin": "*"
    });
  });
});
