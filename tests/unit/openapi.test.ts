import { compileErrors, validate } from "@readme/openapi-parser";
import { describe, expect, it } from "vitest";

import { buildSpec } from "../../src/api/openapi";
import { productRoutes } from "../../src/api/products/routes";

const STAGE_URL = "https://abc123.execute-api.eu-west-1.amazonaws.com/dev";

describe("buildSpec", () => {
  it("produces a valid OpenAPI 3.1 document", async () => {
    // validate() dereferences as it goes, so give it a copy rather than the spec.
    const result = await validate(structuredClone(buildSpec(STAGE_URL)) as Parameters<typeof validate>[0]);

    expect(result.valid, result.valid ? "" : compileErrors(result)).toBe(true);
    expect(result.specification).toBe("OpenAPI");
  });

  it("documents each route exactly once", () => {
    // Several routes share a path (GET and POST /products), so this catches one
    // method overwriting another as the paths object is assembled.
    const operations = Object.values(buildSpec().paths ?? {}).flatMap(item => Object.keys(item));

    expect(operations).toHaveLength(productRoutes.length);
  });

  it.each(productRoutes)("documents $method $path as $handler under the Products tag", route => {
    const operation = buildSpec().paths?.[route.path]?.[route.method.toLowerCase() as "get"];

    expect(operation).toMatchObject({ operationId: route.handler, tags: ["Products"] });
  });

  it.each(productRoutes)("documents the 500 and 503 withErrorHandling can send from $method $path", route => {
    const operation = buildSpec().paths?.[route.path]?.[route.method.toLowerCase() as "get"];

    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["500", "503"]));
  });

  it("publishes the shared schemas as reusable components", () => {
    expect(Object.keys(buildSpec().components?.schemas ?? {})).toEqual(
      expect.arrayContaining(["Category", "Product", "ProductCreateData", "ProductUpdateData", "ErrorResponse"])
    );
  });

  it("strips the trailing slash from the stage URL so paths don't double up", () => {
    // The ProductsApiUrl output ends in "/dev/", and every path starts with "/".
    expect(buildSpec(`${STAGE_URL}/`).servers).toEqual([expect.objectContaining({ url: STAGE_URL })]);
  });

  it("omits servers when no URL is given", () => {
    expect(buildSpec()).not.toHaveProperty("servers");
  });
});
