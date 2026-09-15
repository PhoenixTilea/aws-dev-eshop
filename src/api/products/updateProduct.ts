import { updateProduct } from "../../clients/dbClient";
import { notFound } from "../errors";
import { ProductId, ProductUpdateData } from "../types";
import { createResponse, parseBody, parseParam, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const id = parseParam(ProductId, event.pathParameters?.id, "id");
  const data = parseBody(ProductUpdateData, event);
  const updated = await updateProduct(id, data);
  if (!updated) {
    throw notFound(`Product with ID ${id} does not exist.`);
  }
  return createResponse(200, updated);
});
