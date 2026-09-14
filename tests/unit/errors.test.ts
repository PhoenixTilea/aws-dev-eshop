import {
  ConditionalCheckFailedException,
  DynamoDBServiceException,
  InternalServerError,
  ProvisionedThroughputExceededException,
  RequestLimitExceeded,
  ResourceNotFoundException,
  TransactionConflictException
} from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError, badRequest, describeError, notFound, toApiError } from "../../src/api/errors";

// The real SDK exception classes are used rather than hand-rolled stand-ins so
// that the duck-typed `instanceof DynamoDBServiceException` check in errors.ts
// is exercised the same way it will be in Lambda.
const serviceError = <T extends DynamoDBServiceException>(
  Exception: new (opts: never) => T,
  metadata: Record<string, unknown> = {}
): T => new Exception({ message: "from dynamodb", $metadata: metadata } as never);

// Some DynamoDB faults have no generated class of their own — the SDK throws a
// bare DynamoDBServiceException carrying the wire name instead.
const unmodeledError = (name: string, fault: "client" | "server" = "client") =>
  new DynamoDBServiceException({ name, $fault: fault, $metadata: {}, message: "from dynamodb" });

const GENERIC_500 = "Something went wrong handling this request.";

describe("toApiError", () => {
  describe("ApiError", () => {
    it("passes an ApiError through untouched", () => {
      const original = new ApiError(418, "I am a teapot", { details: { brewing: false } });

      expect(toApiError(original)).toBe(original);
    });

    it("keeps the status code set by the notFound factory", () => {
      const error = toApiError(notFound("Product with ID abc does not exist."));

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Product with ID abc does not exist.");
      expect(error.retryable).toBe(false);
    });

    it("keeps details attached by the badRequest factory", () => {
      const error = toApiError(badRequest("Bad input.", { details: { field: "price" } }));

      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: "price" });
    });
  });

  describe("zod validation errors", () => {
    const zodError = (): z.ZodError => {
      const result = z.strictObject({ price: z.number() }).safeParse({ price: "free" });
      if (result.success) {
        throw new Error("expected the fixture to fail validation");
      }
      return result.error;
    };

    it("maps a raw ZodError to a 400", () => {
      const error = toApiError(zodError());

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Request validation failed.");
    });

    it("reports which field failed in the details", () => {
      const error = toApiError(zodError());

      expect(error.details).toMatchObject({ properties: { price: { errors: [expect.any(String)] } } });
    });

    it("keeps the ZodError as the cause", () => {
      const original = zodError();

      expect(toApiError(original).cause).toBe(original);
    });
  });

  describe("DynamoDB errors the caller can act on", () => {
    it.each([
      ["ConditionalCheckFailedException", ConditionalCheckFailedException, 409],
      ["TransactionConflictException", TransactionConflictException, 409],
      ["ProvisionedThroughputExceededException", ProvisionedThroughputExceededException, 503],
      ["RequestLimitExceeded", RequestLimitExceeded, 503],
      ["InternalServerError", InternalServerError, 503]
    ])("maps %s to a %i", (_name, Exception, statusCode) => {
      const error = toApiError(serviceError(Exception as never));

      expect(error.statusCode).toBe(statusCode);
    });

    it("maps a ThrottlingException to a retryable 503", () => {
      const error = toApiError(unmodeledError("ThrottlingException"));

      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);
    });

    it("maps an oversized item to a 413", () => {
      const error = toApiError(unmodeledError("RequestEntityTooLargeException"));

      expect(error.statusCode).toBe(413);
      expect(error.message).toBe("The product data is too large to store.");
      expect(error.retryable).toBe(false);
    });

    it("marks throttling as retryable so the boundary can send retry-after", () => {
      const error = toApiError(serviceError(ProvisionedThroughputExceededException));

      expect(error.retryable).toBe(true);
    });

    it("does not mark a conflict as retryable", () => {
      const error = toApiError(serviceError(ConditionalCheckFailedException));

      expect(error.retryable).toBe(false);
    });

    it("treats an unmapped fault the SDK flags as retryable as a 503", () => {
      // Not in the switch, but the SDK says it would have retried it itself.
      const retryable = new DynamoDBServiceException({
        name: "SomeFutureTransientException",
        $fault: "server",
        $metadata: {},
        message: "transient"
      });
      retryable.$retryable = { throttling: false };

      const error = toApiError(retryable);

      expect(error.statusCode).toBe(503);
      expect(error.retryable).toBe(true);
    });
  });

  describe("DynamoDB errors that are our bug, not the caller's", () => {
    it("maps a missing table to a 500", () => {
      // ResourceNotFoundException is a misconfigured table name, never a missing
      // product, so it must not turn into a 404.
      const error = toApiError(serviceError(ResourceNotFoundException));

      expect(error.statusCode).toBe(500);
    });

    it("maps an unmodeled ValidationException to a 500", () => {
      const error = toApiError(unmodeledError("ValidationException"));

      expect(error.statusCode).toBe(500);
    });

    it("never puts the DynamoDB message in the client-facing message", () => {
      const error = toApiError(serviceError(ResourceNotFoundException));

      expect(error.message).toBe(GENERIC_500);
      expect(error.details).toBeUndefined();
    });

    it("still keeps the original exception as the cause", () => {
      const original = serviceError(ResourceNotFoundException);

      expect(toApiError(original).cause).toBe(original);
    });
  });

  describe("anything else", () => {
    it("maps a plain Error to an opaque 500", () => {
      const error = toApiError(new Error("connection reset by peer"));

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe(GENERIC_500);
    });

    it("keeps the plain Error as the cause", () => {
      const original = new Error("connection reset by peer");

      expect(toApiError(original).cause).toBe(original);
    });

    it("survives a thrown non-Error", () => {
      const error = toApiError("just a string");

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe(GENERIC_500);
      expect(error.cause).toBe("just a string");
    });

    it("survives a thrown undefined", () => {
      const error = toApiError(undefined);

      expect(error.statusCode).toBe(500);
      expect(error).toBeInstanceOf(ApiError);
    });
  });
});

describe("describeError", () => {
  it("reports the status and client-facing message", () => {
    const described = describeError(notFound("Product with ID abc does not exist."));

    expect(described).toMatchObject({
      statusCode: 404,
      message: "Product with ID abc does not exist."
    });
  });

  it("pulls requestId and attempts off an SDK exception for support tickets", () => {
    const described = describeError(
      toApiError(
        serviceError(ProvisionedThroughputExceededException, {
          requestId: "REQ-1",
          httpStatusCode: 400,
          attempts: 3
        })
      )
    );

    expect(described.cause).toMatchObject({
      name: "ProvisionedThroughputExceededException",
      message: "from dynamodb",
      requestId: "REQ-1",
      httpStatusCode: 400,
      attempts: 3
    });
  });

  it("keeps the stack of a plain Error so the log line is debuggable", () => {
    const described = describeError(toApiError(new Error("connection reset by peer")));

    expect(described.cause).toMatchObject({
      name: "Error",
      message: "connection reset by peer",
      stack: expect.stringContaining("connection reset by peer")
    });
  });

  it("leaves SDK-only fields off a non-SDK cause", () => {
    const described = describeError(toApiError(new Error("boom")));

    expect(described.cause).toMatchObject({ requestId: undefined, attempts: undefined });
  });

  it("passes a non-Error cause through as-is", () => {
    expect(describeError(toApiError("just a string")).cause).toBe("just a string");
  });

  it("survives an ApiError with no cause at all", () => {
    expect(describeError(notFound("gone")).cause).toBeUndefined();
  });

  it("is JSON-serialisable, since the boundary stringifies it", () => {
    const described = describeError(toApiError(serviceError(ResourceNotFoundException, { requestId: "REQ-2" })));

    expect(() => JSON.stringify(described)).not.toThrow();
    expect(JSON.parse(JSON.stringify(described))).toMatchObject({ statusCode: 500 });
  });
});
