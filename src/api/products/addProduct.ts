import type { APIGatewayEvent } from "aws-lambda";

import { addProduct } from "../dbClient";
import { ProductCreateData } from "../types";
import { createErrorResponse, createResponse } from "../utils";

export const handler = async (event: APIGatewayEvent) => {
  let data: ProductCreateData;
  try {
    data = ProductCreateData.parse(JSON.parse(event.body ?? ""));
  } catch (err) {
    return createErrorResponse(err);
  }

  const product = await addProduct(data);
  return createResponse(201, product);
}
