import type { ZodType } from "zod";
import type { ZodOpenApiOperationObject, ZodOpenApiResponseObject } from "zod-openapi";

import { ErrorResponse } from "./types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * One API Gateway method, described once. The stack reads this to create the
 * Lambda, grant it table access and wire up the method; the OpenAPI builder
 * reads it to document the same route. Keep this module free of CDK and handler
 * imports, so the docs tooling can load it without pulling either in.
 *
 * `handler` is the handler's file name in its area's directory. It also becomes
 * the construct id (capitalised) and the operationId.
 */
export type RouteContract = {
  method: HttpMethod;
  path: `/${string}`;
  handler: string;
  bucketAccess?: "read" | "put";
  tableAccess: "read" | "readWrite";
  operation: Omit<ZodOpenApiOperationObject, "operationId" | "tags">;
};

export const json = (description: string, schema: ZodType): ZodOpenApiResponseObject => ({
  description,
  content: { "application/json": { schema } }
});

/**
 * Responses withErrorHandling can produce for any route: a bug or unmapped
 * failure (500), and a throttled or unavailable data store (503).
 */
export const commonErrors = {
  500: json("Something went wrong handling the request. Details are logged, not returned.", ErrorResponse),
  503: json("The data store is busy or unavailable. Safe to retry; see the retry-after header.", ErrorResponse)
};
