import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateProductImages } from "../../../src/api/dbClient";
import { handler } from "../../../src/api/events/productImageUploaded";
import { makeS3Event } from "../../helpers/s3";

vi.mock("../../../src/api/dbClient");

const updateProductImagesMock = vi.mocked(updateProductImages);

const potionId = "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f";
const shieldId = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

describe("productImageUploaded trigger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateProductImagesMock.mockResolvedValue(undefined);
  });

  it("records the uploaded key against the product in its prefix", async () => {
    await handler(makeS3Event([`product/${potionId}/potion.jpg`]));

    expect(updateProductImagesMock).toHaveBeenCalledExactlyOnceWith(potionId, [`product/${potionId}/potion.jpg`]);
  });

  it("groups several keys for one product into a single update", async () => {
    // S3 can batch records into one invocation; one update per product keeps the
    // appends from racing each other on the same item.
    await handler(makeS3Event([`product/${potionId}/front.jpg`, `product/${potionId}/back.jpg`]));

    expect(updateProductImagesMock).toHaveBeenCalledExactlyOnceWith(potionId, [
      `product/${potionId}/front.jpg`,
      `product/${potionId}/back.jpg`
    ]);
  });

  it("updates each product separately when one batch spans several", async () => {
    await handler(makeS3Event([`product/${potionId}/potion.jpg`, `product/${shieldId}/shield.jpg`]));

    expect(updateProductImagesMock).toHaveBeenCalledTimes(2);
    expect(updateProductImagesMock).toHaveBeenCalledWith(potionId, [`product/${potionId}/potion.jpg`]);
    expect(updateProductImagesMock).toHaveBeenCalledWith(shieldId, [`product/${shieldId}/shield.jpg`]);
  });

  it("decodes the form-encoded key so the stored key matches the real object", async () => {
    // S3 sends keys form-encoded: spaces arrive as "+", everything else as a
    // percent escape. Storing the raw value would leave a key that 404s when a
    // presigned download URL is built from it.
    await handler(makeS3Event([`product/${potionId}/Wooden+Shield%20%281%29.jpg`]));

    expect(updateProductImagesMock).toHaveBeenCalledExactlyOnceWith(potionId, [
      `product/${potionId}/Wooden Shield (1).jpg`
    ]);
  });

  it("throws when the key has no product id where one is expected", async () => {
    await expect(handler(makeS3Event(["product/not-a-uuid/potion.jpg"]))).rejects.toThrow(
      "Could not extract product ID from object key product/not-a-uuid/potion.jpg."
    );
  });

  it("throws rather than guessing when the key has no id segment at all", async () => {
    await expect(handler(makeS3Event(["product/"]))).rejects.toThrow("Could not extract product ID");
  });

  it("writes nothing when any key in the batch is unusable", async () => {
    // The whole batch is validated before the first write, so a bad key leaves
    // the table untouched and the event is retried as a unit.
    await expect(
      handler(makeS3Event([`product/${potionId}/potion.jpg`, "product/not-a-uuid/shield.jpg"]))
    ).rejects.toThrow("Could not extract product ID");

    expect(updateProductImagesMock).not.toHaveBeenCalled();
  });

  it("lets a write failure propagate so the event is retried", async () => {
    updateProductImagesMock.mockRejectedValue(new Error("throughput exceeded"));

    await expect(handler(makeS3Event([`product/${potionId}/potion.jpg`]))).rejects.toThrow("throughput exceeded");
  });
});
