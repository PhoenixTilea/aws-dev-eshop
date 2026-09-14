import { getProduct } from "../dbClient";
import { notFound } from "../errors";
import { ProductId } from "../types";
import { createResponse, parseParam, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const id = parseParam(ProductId, event.pathParameters?.id, "id");
  const product = await getProduct(id);
  if (!product) {
    throw notFound(`Product with ID ${id} does not exist.`);
  }
  return createResponse(200, product);
});
