import { addProduct } from "../dbClient";
import { ProductCreateData } from "../types";
import { createResponse, parseBody, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const data = parseBody(ProductCreateData, event);
  const product = await addProduct(data);
  return createResponse(201, product);
});
