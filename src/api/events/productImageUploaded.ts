import type { S3Event } from "aws-lambda";
import { validate } from "zod";

import { updateProductImages } from "../../clients/dbClient";
import type { RejectedImageEvent } from "../eventErrors";
import { BrokenEventError, describeError, isBrokenEvent } from "../eventErrors";
import { rejectImageEvent } from "../../clients/sqsClient";
import { ProductId } from "../types";

export const handler = async (event: S3Event) => {
  const rejected: RejectedImageEvent[] = [];
  const productImages = new Map<string, string[]>();

  for (const { s3 } of event.Records) {
    const key = decodeURIComponent(s3.object.key.replace(/\+/g, " "));
    const productId = key.split("/")[1];
    if (!validate(ProductId, productId)) {
      rejected.push(reject([key], new BrokenEventError(`Could not extract product ID from object key ${key}.`)));
      continue;
    }
    const list = productImages.get(productId) ?? [];
    productImages.set(productId, [...list, key]);
  }

  const updates = [...productImages];
  const results = await Promise.allSettled(updates.map(([id, images]) => updateProductImages(id, images)));

  const retryable: unknown[] = [];
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      continue;
    }
    const [productId, keys] = updates[i];
    if (isBrokenEvent(result.reason)) {
      rejected.push(reject(keys, result.reason, productId));
    } else {
      retryable.push(result.reason);
    }
  }

  if (retryable.length) {
    throw new AggregateError(retryable, `${retryable.length} of ${updates.length} product image updates failed.`);
  }

  await Promise.all(rejected.map(rejection => rejectImageEvent(rejection)));
};

const reject = (keys: string[], err: unknown, productId?: string): RejectedImageEvent => ({
  rejectedAt: new Date().toISOString(),
  keys,
  ...(productId ? { productId } : {}),
  reason: describeError(err)
});
