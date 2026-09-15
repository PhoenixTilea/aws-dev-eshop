import type { S3Event } from "aws-lambda";
import { validate } from "zod";

import { updateProductImages } from "../dbClient";
import { ProductId } from "../types";

export const handler = async (event: S3Event) => {
  const productImages = new Map<string, string[]>();
  for (const { s3 } of event.Records) {
    const key = s3.object.key;
    const productId = key.split("/")[1];
    if (validate(ProductId, productId)) {
      throw new Error(`Could not extract product ID from object key ${key}.`);
    }
    const list = productImages.get(productId) ?? [];
    productImages.set(productId, [...list, key]);
  }

  const updates: (() => Promise<void>)[] = [];
  for (const [id, images] of productImages) {
    updates.push(() => updateProductImages(id, images));
  }
  await Promise.all(updates.map(u => u()));
};
