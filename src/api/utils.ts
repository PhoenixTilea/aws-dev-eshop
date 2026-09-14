import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import type { ZodType, infer as zInfer } from "zod";
import { prettifyError, treeifyError } from "zod";

import { ApiError, badRequest, describeError, toApiError } from "./errors";

export const createResponse = (
  statusCode = 200,
  body?: unknown,
  headers: Record<string, string> = {}
): APIGatewayProxyResult => ({
  statusCode,
  body: body ? JSON.stringify(body) : "",
  headers: {
    "Content-Type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    ...headers
  }
});

/**
 * Wraps a handler so it can throw instead of returning error responses. Every
 * throw lands here, gets logged with its full context, and leaves as a response
 * whose body carries only what the caller is allowed to see.
 */
export const withErrorHandling =
  (handler: (event: APIGatewayEvent) => Promise<APIGatewayProxyResult>) =>
  async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    try {
      return await handler(event);
    } catch (err) {
      const apiError = toApiError(err);
      console.error(
        JSON.stringify({
          level: apiError.statusCode >= 500 ? "ERROR" : "WARN",
          route: `${event.httpMethod} ${event.path}`,
          ...describeError(apiError)
        })
      );
      return createResponse(
        apiError.statusCode,
        { message: apiError.message, ...(apiError.details ? { details: apiError.details } : {}) },
        apiError.retryable ? { "retry-after": "1" } : {}
      );
    }
  };

const parseOrThrow = <T extends ZodType>(schema: T, value: unknown, message: string): zInfer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, `${message} ${prettifyError(result.error)}`, {
      details: treeifyError(result.error),
      cause: result.error
    });
  }
  return result.data;
};

/**
 * Parses and validates a JSON request body. JSON.parse is caught here rather
 * than at the boundary so that a SyntaxError thrown anywhere else stays a 500.
 */
export const parseBody = <T extends ZodType>(schema: T, event: APIGatewayEvent): zInfer<T> => {
  if (!event.body) {
    throw badRequest("A request body is required.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch (err) {
    throw badRequest("The request body is not valid JSON.", { cause: err });
  }

  return parseOrThrow(schema, parsed, "Invalid product data.");
};

/**
 * Validates a single path or query string parameter. Separate from parseBody so
 * the 400 names the parameter the caller got wrong.
 */
export const parseParam = <T extends ZodType>(schema: T, value: string | undefined, name: string): zInfer<T> =>
  parseOrThrow(schema, value, `Invalid ${name} parameter.`);
