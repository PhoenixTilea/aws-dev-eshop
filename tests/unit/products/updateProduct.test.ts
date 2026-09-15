import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateProduct } from "../../../src/clients/dbClient";
import { handler } from "../../../src/api/products/updateProduct";
import { Category } from "../../../src/api/types";
import type { Product } from "../../../src/api/types";
import { makeEvent } from "../../helpers/apiGateway";

vi.mock("../../../src/clients/dbClient");

const updateProductMock = vi.mocked(updateProduct);

const potion: Product = {
  id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f",
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

const edit = {
  title: "Potion of Severe Inconvenience",
  description: potion.description,
  price: 99
};

const putEvent = (id: string, body: unknown = edit) =>
  makeEvent({
    httpMethod: "PUT",
    path: `/products/${id}`,
    pathParameters: { id },
    body: JSON.stringify(body)
  });

describe("updateProduct handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => { });
  });

  it("returns 200 and the updated product", async () => {
    const updated = { ...potion, ...edit };
    updateProductMock.mockResolvedValue(updated);

    const response = await handler(putEvent(potion.id));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(updated);
    expect(updateProductMock).toHaveBeenCalledWith(potion.id, edit);
  });

  it("returns 404 when the id does not exist rather than creating it", async () => {
    // dbClient returns null when its attribute_exists condition fails.
    updateProductMock.mockResolvedValue(null);

    const response = await handler(putEvent(potion.id));

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      message: `Product with ID ${potion.id} does not exist.`
    });
  });

  it("returns 400 and never hits the db for a non-uuid id", async () => {
    const response = await handler(putEvent("not-a-uuid"));

    expect(response.statusCode).toBe(400);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("returns 400 and never hits the db for an invalid body", async () => {
    const response = await handler(putEvent(potion.id, { ...edit, price: -5 }));

    expect(response.statusCode).toBe(400);
    expect(updateProductMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the failure when the db layer throws", async () => {
    updateProductMock.mockRejectedValue(new Error("ProvisionedThroughputExceeded"));

    const response = await handler(putEvent(potion.id));

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("ProvisionedThroughputExceeded");
  });
});
