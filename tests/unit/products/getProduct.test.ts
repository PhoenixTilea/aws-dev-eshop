import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProduct } from "../../../src/clients/dbClient";
import { handler } from "../../../src/api/products/getProduct";
import { Category } from "../../../src/api/types";
import type { Product } from "../../../src/api/types";
import { makeEvent } from "../../helpers/apiGateway";

vi.mock("../../../src/clients/dbClient");

const getProductMock = vi.mocked(getProduct);

const potion: Product = {
  id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f",
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

const getEvent = (id: string | null) =>
  makeEvent({
    path: `/products/${id}`,
    pathParameters: id === null ? null : { id }
  });

describe("getProduct handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => { });
  });

  it("returns 200 and the product when it exists", async () => {
    getProductMock.mockResolvedValue(potion);

    const response = await handler(getEvent(potion.id));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(potion);
    expect(getProductMock).toHaveBeenCalledWith(potion.id);
  });

  it("returns 404 naming the id when the product does not exist", async () => {
    getProductMock.mockResolvedValue(null);

    const response = await handler(getEvent(potion.id));

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      message: `Product with ID ${potion.id} does not exist.`
    });
  });

  it("returns 400 and never hits the db for a non-uuid id", async () => {
    const response = await handler(getEvent("not-a-uuid"));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain("Invalid id parameter.");
    expect(getProductMock).not.toHaveBeenCalled();
  });

  it("returns 400 rather than 404 when the id is missing entirely", async () => {
    // An unroutable request in practice, but the handler must not hand
    // undefined to the db layer.
    const response = await handler(getEvent(null));

    expect(response.statusCode).toBe(400);
    expect(getProductMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the failure when the db layer throws", async () => {
    getProductMock.mockRejectedValue(new Error("connection reset by peer"));

    const response = await handler(getEvent(potion.id));

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("connection reset");
  });

  it("always sends JSON and permissive CORS headers", async () => {
    getProductMock.mockResolvedValue(potion);

    const response = await handler(getEvent(potion.id));

    expect(response.headers).toMatchObject({
      "Content-Type": "application/json",
      "access-control-allow-origin": "*"
    });
  });
});
