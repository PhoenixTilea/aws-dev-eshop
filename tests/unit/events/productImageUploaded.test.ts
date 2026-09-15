import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateProductImages } from "../../../src/clients/dbClient";
import { handler } from "../../../src/api/events/productImageUploaded";
import { rejectImageEvent } from "../../../src/clients/sqsClient";
import { makeS3Event } from "../../helpers/s3";

vi.mock("../../../src/clients/dbClient");
vi.mock("../../../src/clients/sqsClient");

const updateProductImagesMock = vi.mocked(updateProductImages);
const rejectImageEventMock = vi.mocked(rejectImageEvent);

/** The product row is gone, which is how dbClient reports it. */
const productGone = () =>
  new ConditionalCheckFailedException({ $metadata: {}, message: "The conditional request failed" });

const potionId = "7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f";
const shieldId = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

describe("productImageUploaded trigger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateProductImagesMock.mockResolvedValue(undefined);
    rejectImageEventMock.mockResolvedValue(undefined);
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

  it("parks a key with no product id instead of throwing, so it is never retried", async () => {
    // Returning normally is the whole point: a throw here would buy two more
    // invocations that fail on the same character of the same key.
    await expect(handler(makeS3Event(["product/not-a-uuid/potion.jpg"]))).resolves.toBeUndefined();

    expect(rejectImageEventMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        keys: ["product/not-a-uuid/potion.jpg"],
        reason: "BrokenEventError: Could not extract product ID from object key product/not-a-uuid/potion.jpg."
      })
    );
  });

  it("parks rather than guesses when the key has no id segment at all", async () => {
    await handler(makeS3Event(["product/"]));

    expect(rejectImageEventMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ reason: expect.stringContaining("Could not extract product ID") })
    );
  });

  it("still records the usable keys when another key in the batch is broken", async () => {
    // The batch used to be all-or-nothing, so one malformed key cost every
    // other upload delivered alongside it.
    await handler(makeS3Event([`product/${potionId}/potion.jpg`, "product/not-a-uuid/shield.jpg"]));

    expect(updateProductImagesMock).toHaveBeenCalledExactlyOnceWith(potionId, [`product/${potionId}/potion.jpg`]);
    expect(rejectImageEventMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ keys: ["product/not-a-uuid/shield.jpg"] })
    );
  });

  it("parks the keys when the product they belong to is gone", async () => {
    // dbClient only lets this exception out once it has ruled out the benign
    // case, so it means the row is missing and no retry will conjure it back.
    updateProductImagesMock.mockRejectedValue(productGone());

    await handler(makeS3Event([`product/${potionId}/potion.jpg`]));

    expect(rejectImageEventMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        productId: potionId,
        keys: [`product/${potionId}/potion.jpg`],
        reason: expect.stringContaining("ConditionalCheckFailedException")
      })
    );
  });

  it("lets an unrecognised write failure propagate so the event is retried", async () => {
    // The default has to be retry: an unknown fault is far more likely to be
    // the world misbehaving than the event being malformed.
    updateProductImagesMock.mockRejectedValue(new Error("throughput exceeded"));

    await expect(handler(makeS3Event([`product/${potionId}/potion.jpg`]))).rejects.toThrow(AggregateError);

    expect(rejectImageEventMock).not.toHaveBeenCalled();
  });

  it("parks nothing when part of the batch is going to be retried anyway", async () => {
    // The retry replays the whole event, so parking now would queue the same
    // rejection again on every attempt. It is re-derived on the way back.
    updateProductImagesMock.mockImplementation(id =>
      id === shieldId ? Promise.reject(new Error("throughput exceeded")) : Promise.resolve()
    );

    await expect(
      handler(makeS3Event(["product/not-a-uuid/potion.jpg", `product/${shieldId}/shield.jpg`]))
    ).rejects.toThrow(AggregateError);

    expect(rejectImageEventMock).not.toHaveBeenCalled();
  });

  it("keeps going for the healthy products when one of them is gone", async () => {
    updateProductImagesMock.mockImplementation(id =>
      id === shieldId ? Promise.reject(productGone()) : Promise.resolve()
    );

    await handler(makeS3Event([`product/${potionId}/potion.jpg`, `product/${shieldId}/shield.jpg`]));

    expect(updateProductImagesMock).toHaveBeenCalledWith(potionId, [`product/${potionId}/potion.jpg`]);
    expect(rejectImageEventMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ productId: shieldId }));
  });

  it("retries when the event cannot even be parked", async () => {
    // Losing the parking write would lose the record of the failure itself, so
    // this one failure is worth throwing over.
    rejectImageEventMock.mockRejectedValue(new Error("queue unreachable"));

    await expect(handler(makeS3Event(["product/not-a-uuid/potion.jpg"]))).rejects.toThrow("queue unreachable");
  });
});
