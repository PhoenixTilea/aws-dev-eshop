import { describe, expect, it } from "vitest";

import { handler } from "../../../src/api/products/options";

describe("options handler", () => {
  it("returns 200 with an empty body", () => {
    const response = handler();

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
  });

  it("advertises the methods and headers the browser preflight asks about", () => {
    // This handler exists only to answer CORS preflight, so the headers are
    // the entire contract.
    const response = handler();

    expect(response.headers).toMatchObject({
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type"
    });
  });
});
