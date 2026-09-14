import type { ZodOpenApiPathItemObject, ZodOpenApiPathsObject } from "zod-openapi";
import { createDocument } from "zod-openapi";

import { productRoutes } from "./products/routes";
import type { RouteContract } from "./routes";

/**
 * Each area of the API contributes its routes under one tag. Add new areas here
 * as they're built; the stack for that area reads the same route list.
 */
const areas: { tag: string; description: string; routes: RouteContract[] }[] = [
  { tag: "Products", description: "The shop's catalogue.", routes: productRoutes }
];

const toPaths = () => {
  const paths: ZodOpenApiPathsObject = {};
  for (const { tag, routes } of areas) {
    for (const { method, path, handler, operation } of routes) {
      const item: ZodOpenApiPathItemObject = (paths[path] ??= {});
      item[method.toLowerCase() as Lowercase<typeof method>] = { operationId: handler, tags: [tag], ...operation };
    }
  }
  return paths;
};

export const buildSpec = (serverUrl?: string): ReturnType<typeof createDocument> =>
  createDocument({
    openapi: "3.1.0",
    info: {
      title: "EShop API",
      version: "0.1.0",
      description: "CRUD API for the EShop, served by API Gateway and Lambda."
    },
    ...(serverUrl ? { servers: [{ url: serverUrl.replace(/\/+$/, ""), description: "Deployed stage" }] } : {}),
    tags: areas.map(({ tag, description }) => ({ name: tag, description })),
    paths: toPaths()
  });
