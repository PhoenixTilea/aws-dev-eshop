import { z } from "zod";
import type { APIGatewayProxyResult } from "aws-lambda";

export const createResponse = (statusCode = 200, body?: unknown): APIGatewayProxyResult => ({
  statusCode,
  body: body ? JSON.stringify(body) : "",
  headers: {
    "Content-Type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type"
  }
});

export const createErrorResponse = (err: unknown) => {
  if (err instanceof z.ZodError) {
    return createResponse(400, { message: `Invalid product data: ${z.prettifyError(err)}.` });
  }
  return createResponse(400, { message: "Invalid JSON for product data." });
}
