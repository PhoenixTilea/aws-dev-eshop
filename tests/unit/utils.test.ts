import { ProvisionedThroughputExceededException, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { makeEvent } from "../helpers/apiGateway";
import { badRequest, notFound } from "../../src/api/errors";
import { CategorySchema, ProductCreateData } from "../../src/api/types";
import { createResponse, parseBody, parseParam, withErrorHandling } from "../../src/api/utils";

const validProduct = {
  title: "Potion of Mild Inconvenience",
  description: "Restores 1 HP. Tastes of pennies.",
  price: 25,
  category: "Potions"
};

describe("withErrorHandling", () => {
  // The boundary logs every failure. Silence it here, and assert on the spy
  // where the log line itself is what is under test.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrap = (err: unknown) =>
    withErrorHandling(() => {
      throw err;
    });

  it("returns a successful response untouched", async () => {
    const handler = withErrorHandling(() => Promise.resolve(createResponse(201, { id: "abc" })));

    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: "abc" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("turns a thrown ApiError into its own status code", async () => {
    const response = await wrap(notFound("Product with ID abc does not exist."))(makeEvent());

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ message: "Product with ID abc does not exist." });
  });

  it("catches a rejected promise as well as a synchronous throw", async () => {
    const handler = withErrorHandling(() => Promise.reject(notFound("gone")));

    await expect(handler(makeEvent())).resolves.toMatchObject({ statusCode: 404 });
  });

  it("includes details in the body when the error carries them", async () => {
    const response = await wrap(badRequest("Bad input.", { details: { field: "price" } }))(makeEvent());

    expect(JSON.parse(response.body)).toEqual({
      message: "Bad input.",
      details: { field: "price" }
    });
  });

  it("omits the details key entirely when there are none", async () => {
    const response = await wrap(notFound("gone"))(makeEvent());

    expect(JSON.parse(response.body)).not.toHaveProperty("details");
  });

  it("sends retry-after on a retryable failure", async () => {
    const throttled = new ProvisionedThroughputExceededException({ message: "slow down", $metadata: {} });

    const response = await wrap(throttled)(makeEvent());

    expect(response.statusCode).toBe(503);
    expect(response.headers).toMatchObject({ "retry-after": "1" });
  });

  it("does not send retry-after on a failure that will not succeed on retry", async () => {
    const response = await wrap(notFound("gone"))(makeEvent());

    expect(response.headers).not.toHaveProperty("retry-after");
  });

  it("keeps the CORS headers on error responses", async () => {
    const response = await wrap(new Error("boom"))(makeEvent());

    expect(response.headers).toMatchObject({
      "Content-Type": "application/json",
      "access-control-allow-origin": "*"
    });
  });

  it("never lets an unexpected failure reach the caller as a throw", async () => {
    const response = await wrap("a bare string")(makeEvent());

    expect(response.statusCode).toBe(500);
  });

  describe("logging", () => {
    const loggedLine = () => JSON.parse(consoleError.mock.calls[0]![0] as string);

    it("logs a 5xx at ERROR with the route that failed", async () => {
      await wrap(new Error("connection reset by peer"))(makeEvent({ httpMethod: "POST", path: "/products" }));

      expect(loggedLine()).toMatchObject({ level: "ERROR", route: "POST /products", statusCode: 500 });
    });

    it("logs a 4xx at WARN, since it is the caller's mistake", async () => {
      await wrap(notFound("gone"))(makeEvent());

      expect(loggedLine()).toMatchObject({ level: "WARN", statusCode: 404 });
    });

    it("logs the cause that the response body withholds", async () => {
      const hidden = new ResourceNotFoundException({
        message: "Requested resource not found: Table: Products not found",
        $metadata: { requestId: "REQ-1" }
      });

      const response = await wrap(hidden)(makeEvent());

      expect(response.body).not.toContain("Products not found");
      expect(loggedLine().cause).toMatchObject({
        name: "ResourceNotFoundException",
        message: "Requested resource not found: Table: Products not found",
        requestId: "REQ-1"
      });
    });
  });
});

describe("parseBody", () => {
  const eventWithBody = (body: string | null) => makeEvent({ body });

  it("returns the parsed data when the body is valid", () => {
    expect(parseBody(ProductCreateData, eventWithBody(JSON.stringify(validProduct)))).toEqual(validProduct);
  });

  it("rejects a missing body with a 400", () => {
    expect(() => parseBody(ProductCreateData, eventWithBody(null))).toThrow(
      expect.objectContaining({ statusCode: 400, message: "A request body is required." })
    );
  });

  it("rejects an empty body with a 400", () => {
    expect(() => parseBody(ProductCreateData, eventWithBody(""))).toThrow(
      expect.objectContaining({ statusCode: 400, message: "A request body is required." })
    );
  });

  it("distinguishes malformed JSON from invalid product data", () => {
    expect(() => parseBody(ProductCreateData, eventWithBody("{ not json"))).toThrow(
      expect.objectContaining({ statusCode: 400, message: "The request body is not valid JSON." })
    );
  });

  it("keeps the SyntaxError as the cause of a malformed-JSON 400", () => {
    try {
      parseBody(ProductCreateData, eventWithBody("{ not json"));
      expect.unreachable("parseBody should have thrown");
    } catch (err) {
      expect((err as Error).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it("rejects well-formed JSON that is not a valid product", () => {
    const body = JSON.stringify({ ...validProduct, price: -5 });

    expect(() => parseBody(ProductCreateData, eventWithBody(body))).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining("Invalid product data.") })
    );
  });

  it("names the offending field in the details", () => {
    const body = JSON.stringify({ ...validProduct, price: -5 });

    try {
      parseBody(ProductCreateData, eventWithBody(body));
      expect.unreachable("parseBody should have thrown");
    } catch (err) {
      expect((err as { details: unknown }).details).toMatchObject({
        properties: { price: { errors: [expect.any(String)] } }
      });
    }
  });

  it("rejects a body of literal null", () => {
    // JSON.parse succeeds here, so this has to be caught by the schema.
    expect(() => parseBody(ProductCreateData, eventWithBody("null"))).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining("Invalid product data.") })
    );
  });

  it("rejects unknown keys, since the product schema is strict", () => {
    const body = JSON.stringify({ ...validProduct, isOnSale: true });

    expect(() => parseBody(ProductCreateData, eventWithBody(body))).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});

describe("parseParam", () => {
  it("returns the parsed value when it is valid", () => {
    expect(parseParam(CategorySchema, "Potions", "category")).toBe("Potions");
  });

  it("names the parameter that was wrong", () => {
    expect(() => parseParam(CategorySchema, "Swords", "category")).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining("Invalid category parameter.") })
    );
  });

  it("rejects a missing parameter rather than passing undefined downstream", () => {
    expect(() => parseParam(z.uuid(), undefined, "id")).toThrow(
      expect.objectContaining({ statusCode: 400, message: expect.stringContaining("Invalid id parameter.") })
    );
  });

  it("rejects an id that is not a uuid", () => {
    expect(() => parseParam(z.uuid(), "not-a-uuid", "id")).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
