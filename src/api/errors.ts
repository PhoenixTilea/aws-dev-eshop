import { DynamoDBServiceException } from "@aws-sdk/client-dynamodb";
import { treeifyError, ZodError } from "zod";

/**
 * An error whose status code and message are safe to hand back to the caller.
 * Anything else that reaches the handler boundary is a bug or an outage, and is
 * reported as a bare 500 so we never leak internals into a response body.
 *
 * `details` is optional structured data for the client (field-level validation
 * errors, mostly). `cause` is for us: it keeps the original error attached so
 * the log line at the boundary can print its name, message and stack.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: { details?: unknown; cause?: unknown; retryable?: boolean } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export const badRequest = (message: string, options?: { details?: unknown; cause?: unknown }) =>
  new ApiError(400, message, options);

export const notFound = (message: string) => new ApiError(404, message);

const conflict = (message: string, cause: unknown) => new ApiError(409, message, { cause });

const unavailable = (message: string, cause: unknown) => new ApiError(503, message, { cause, retryable: true });

const internal = (cause: unknown) => new ApiError(500, "Something went wrong handling this request.", { cause });

/**
 * DynamoDB failures that mean something to an API caller. Everything not listed
 * here (ResourceNotFoundException for a missing table, ValidationException from
 * a malformed expression, credential problems) is our bug, not theirs, so it
 * falls through to a 500.
 */
const fromDynamoDb = (err: DynamoDBServiceException): ApiError => {
  switch (err.name) {
    case "ConditionalCheckFailedException":
    case "TransactionConflictException":
      return conflict("The item was modified by another request. Please retry.", err);
    case "ItemCollectionSizeLimitExceededException":
    case "RequestLimitExceeded":
    case "ProvisionedThroughputExceededException":
    case "ThrottlingException":
    case "InternalServerError":
      return unavailable("The data store is busy. Please retry shortly.", err);
    case "RequestEntityTooLargeException":
      return new ApiError(413, "The product data is too large to store.", { cause: err });
    default:
      // The SDK flags transient faults it would have retried itself; treat those
      // as availability problems rather than pretending the request was bad.
      return err.$retryable ? unavailable("The data store is unavailable. Please retry shortly.", err) : internal(err);
  }
};

/**
 * Normalises anything thrown inside a handler into an ApiError. This is the one
 * place that knows how each error source maps onto a status code.
 */
export const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) {
    return err;
  }
  if (err instanceof ZodError) {
    return badRequest("Request validation failed.", { details: treeifyError(err), cause: err });
  }
  if (err instanceof DynamoDBServiceException) {
    return fromDynamoDb(err);
  }
  return internal(err);
};

/**
 * Everything we know about a failure, flattened for CloudWatch. Logged for every
 * error regardless of status, because a 400 that keeps recurring is worth seeing
 * too — the response body is the part that stays terse.
 */
export const describeError = (err: ApiError) => {
  const cause = err.cause;
  const isService = cause instanceof DynamoDBServiceException;
  return {
    statusCode: err.statusCode,
    message: err.message,
    details: err.details,
    cause:
      cause instanceof Error
        ? {
            name: cause.name,
            message: cause.message,
            stack: cause.stack,
            // Present only on SDK errors; requestId is what AWS support asks for.
            requestId: isService ? cause.$metadata.requestId : undefined,
            httpStatusCode: isService ? cause.$metadata.httpStatusCode : undefined,
            attempts: isService ? cause.$metadata.attempts : undefined
          }
        : cause
  };
};
