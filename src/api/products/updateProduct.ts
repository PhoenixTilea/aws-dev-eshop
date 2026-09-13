import type { APIGatewayEvent } from "aws-lambda";
import { z } from "zod";

import { updateProduct } from "../dbClient";
import { ProductUpdateData } from "../types";
import { createErrorResponse, createResponse } from "../utils";

export const handler = async (event: APIGatewayEvent) => {
  const id = z.uuid().parse(event.pathParameters?.id);
  let data: ProductUpdateData;
  try {
    data = ProductUpdateData.parse(JSON.parse(event.body ?? ""));
  } catch (err) {
    return createErrorResponse(err);
  }

  try {
    const updated = await updateProduct(id, data);
    return createResponse(200, updated);
  } catch (err) {
    return createResponse(500, { message: (err as Error).message });
  }
}
