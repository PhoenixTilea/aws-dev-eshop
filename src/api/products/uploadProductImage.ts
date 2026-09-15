import { PRODUCTS_BUCKET_NAME, PRODUCTS_IMAGE_KEY_PREFIX } from "../../constants";
import { getProduct } from "../../clients/dbClient";
import { notFound } from "../errors";
import { getUploadUrl } from "../../clients/s3Client";
import { ProductId, UploadProductImageData } from "../types";
import { createResponse, parseBody, parseParam, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const id = parseParam(ProductId, event.pathParameters?.id, "id");
  const { contentType, filename } = parseBody(UploadProductImageData, event);
  const product = await getProduct(id);
  if (!product) {
    throw notFound(`Product with ID ${id} does not exist.`);
  }

  const key = `${PRODUCTS_IMAGE_KEY_PREFIX}/${id}/${filename}`;
  const url = await getUploadUrl(PRODUCTS_BUCKET_NAME, key, contentType);
  return createResponse(200, { url });
});
