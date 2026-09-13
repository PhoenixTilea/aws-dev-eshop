import type { APIGatewayEvent } from "aws-lambda";
import { uuid } from "zod";

import { createResponse } from "../utils";
import { getProduct } from "../dbClient";

export const handler = async (event: APIGatewayEvent) => {
  const id = uuid().parse(event.pathParameters?.id);
  const product = await getProduct(id);
  if (product) {
    return createResponse(200, product);
  } else {
    return createResponse(404, { message: `Product with ID ${id} does not exist.` });
  }
};
