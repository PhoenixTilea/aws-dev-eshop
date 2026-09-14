import { writeFileSync } from "fs";

import { buildSpec } from "../../src/api/openapi";

/**
 * Writes the OpenAPI spec to a file (openapi.json unless a path is given), for
 * importing into an API client like Yaak or Postman. The spec only names a
 * server when API_BASE_URL is set.
 */
const out = process.argv[2] ?? "openapi.json";
writeFileSync(out, `${JSON.stringify(buildSpec(process.env.API_BASE_URL), null, 2)}\n`);
console.log(`Wrote ${out}`);
