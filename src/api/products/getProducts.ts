import { getProducts } from "../dbClient";
import { CategorySchema } from "../types";
import { createResponse, parseParam, withErrorHandling } from "../utils";

export const handler = withErrorHandling(async event => {
  const qs = event.queryStringParameters?.["category"];
  const category = qs ? parseParam(CategorySchema, qs, "category") : undefined;
  const products = await getProducts(category);
  return createResponse(200, products);
});
