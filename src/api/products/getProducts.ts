import type { APIGatewayEvent } from "aws-lambda";

import { createResponse } from "../utils";
import { getProducts } from "../dbClient";
import { CategorySchema, type Category } from "../types";

export const handler = async (event: APIGatewayEvent) => {
  let category: Category | undefined = undefined;
  const qs = event.queryStringParameters?.["category"];
  if (qs) {
    try {
      category = CategorySchema.parse(qs);
    } catch (err) {
      return createResponse(400, { message: `Invalid category name ${qs}` });
    }
  }

  try {
    const result = await getProducts(category);
    return createResponse(200, result);
  } catch (err) {
    return createResponse(500, { message: (err as Error).message });
  }
}
