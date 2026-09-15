import { PRODUCTS_BUCKET_NAME } from "../constants";
import { getProduct } from "../dbClient";
import { notFound } from "../errors";
import { getUploadUrl } from "../s3Client";
import { ProductId, UploadProductImageData } from "../types";
import { createResponse, parseBody, parseParam, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const id = parseParam(ProductId, event.pathParameters?.id, "id");
  const { filename } = parseBody(UploadProductImageData, event);
  const product = await getProduct(id);
  if (!product) {
    throw notFound(`Product with ID ${id} does not exist.`);
  }

  const key = `products/${id}/${filename}`;
  const url = await getUploadUrl(PRODUCTS_BUCKET_NAME, key);
  return createResponse(200, { url });
});
