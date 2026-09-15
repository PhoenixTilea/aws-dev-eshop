import { beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCTS_BUCKET_NAME } from "../../../src/constants";
import { getProduct } from "../../../src/clients/dbClient";
import { handler } from "../../../src/api/products/uploadProductImage";
import { getUploadUrl } from "../../../src/clients/s3Client";
import { Category } from "../../../src/api/types";
import type { Product } from "../../../src/api/types";
import { makeEvent } from "../../helpers/apiGateway";

vi.mock("../../../src/clients/dbClient");
vi.mock("../../../src/clients/s3Client");

const getProductMock = vi.mocked(getProduct);
const getUploadUrlMock = vi.mocked(getUploadUrl);

const potion: Product = {
  id: "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f",
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: Category.Potions
};

const signedUrl = "https://products-dev.s3.eu-west-1.amazonaws.com/product/x.jpg?X-Amz-Signature=abc";

const uploadEvent = (id: string | null, body: unknown) =>
  makeEvent({
    httpMethod: "PUT",
    path: `/products/${id}/images`,
    pathParameters: id === null ? null : { id },
    body: body === undefined ? null : JSON.stringify(body)
  });

const validBody = { contentType: "image/jpeg", filename: "Wooden Shield.jpg" };

describe("uploadProductImage handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => { });
    getProductMock.mockResolvedValue(potion);
    getUploadUrlMock.mockResolvedValue(signedUrl);
  });

  it("returns 200 and the presigned url", async () => {
    const response = await handler(uploadEvent(potion.id, validBody));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ url: signedUrl });
  });

  it("signs a key namespaced by the image prefix and the product id", async () => {
    // The prefix has to match the bucket notification filter in
    // ProductsStorageStack, or the upload lands without ever being recorded.
    await handler(uploadEvent(potion.id, validBody));

    expect(getUploadUrlMock).toHaveBeenCalledExactlyOnceWith(
      PRODUCTS_BUCKET_NAME,
      `product/${potion.id}/Wooden Shield.jpg`,
      "image/jpeg"
    );
  });

  it("signs for the content type the caller asked for", async () => {
    await handler(uploadEvent(potion.id, { contentType: "image/png", filename: "shield.png" }));

    expect(getUploadUrlMock).toHaveBeenCalledWith(PRODUCTS_BUCKET_NAME, expect.any(String), "image/png");
  });

  it("returns 404 and signs nothing when the product does not exist", async () => {
    getProductMock.mockResolvedValue(null);

    const response = await handler(uploadEvent(potion.id, validBody));

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      message: `Product with ID ${potion.id} does not exist.`
    });
    expect(getUploadUrlMock).not.toHaveBeenCalled();
  });

  it("returns 400 and never hits the db for a non-uuid id", async () => {
    const response = await handler(uploadEvent("not-a-uuid", validBody));

    expect(response.statusCode).toBe(400);
    expect(getProductMock).not.toHaveBeenCalled();
    expect(getUploadUrlMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is missing", async () => {
    const response = await handler(uploadEvent(potion.id, undefined));

    expect(response.statusCode).toBe(400);
    expect(getUploadUrlMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a path separator", "../../evil.jpg"],
    ["a nested path", "images/shield.jpg"],
    ["a name that is only an extension", ".jpg"],
    ["a trailing dot", "shield."]
  ])("returns 400 for a filename with %s", async (_label, filename) => {
    const response = await handler(uploadEvent(potion.id, { ...validBody, filename }));

    expect(response.statusCode).toBe(400);
    expect(getUploadUrlMock).not.toHaveBeenCalled();
  });

  it.each(["image/svg+xml", "text/html", "image/", "application/octet-stream"])(
    "returns 400 for the disallowed content type %s",
    async contentType => {
      // The signed content type becomes the stored object's Content-Type, and
      // download URLs are served inline — an SVG here would be active content.
      const response = await handler(uploadEvent(potion.id, { ...validBody, contentType }));

      expect(response.statusCode).toBe(400);
      expect(getUploadUrlMock).not.toHaveBeenCalled();
    }
  );

  it("returns 400 for an unknown field rather than silently dropping it", async () => {
    const response = await handler(uploadEvent(potion.id, { ...validBody, bucket: "somewhere-else" }));

    expect(response.statusCode).toBe(400);
    expect(getUploadUrlMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the failure when signing throws", async () => {
    getUploadUrlMock.mockRejectedValue(new Error("no credentials in the chain"));

    const response = await handler(uploadEvent(potion.id, validBody));

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("credentials");
  });

  it("always sends JSON and permissive CORS headers", async () => {
    const response = await handler(uploadEvent(potion.id, validBody));

    expect(response.headers).toMatchObject({
      "Content-Type": "application/json",
      "access-control-allow-origin": "*"
    });
  });
});
