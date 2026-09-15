import type { ZodSchema } from "zod";
import { object } from "zod";

import type { RouteContract } from "../routes";
import { commonErrors, json } from "../routes";
import {
  CategorySchema,
  ErrorResponse,
  Product,
  ProductCreateData,
  ProductId,
  ProductList,
  ProductUpdateData,
  UploadProductImageData,
  UploadProductImageResponse
} from "../types";

const body = (schema: ZodSchema) => ({
  required: true,
  content: { "application/json": { schema } }
});

const byId = { path: object({ id: ProductId }) };

export const productRoutes: RouteContract[] = [
  {
    method: "GET",
    path: "/products",
    handler: "getProducts",
    bucketAccess: "read",
    tableAccess: "read",
    operation: {
      summary: "List products",
      description: "Returns every product, or only those in one category.",
      requestParams: { query: object({ category: CategorySchema.optional() }) },
      responses: {
        200: json("The matching products. Empty when none match.", ProductList),
        400: json("The category is not one of the known categories.", ErrorResponse),
        ...commonErrors
      }
    }
  },
  {
    method: "POST",
    path: "/products",
    handler: "addProduct",
    tableAccess: "readWrite",
    operation: {
      summary: "Create a product",
      description: "Adds a new product with an auto-generated ID.",
      requestBody: body(ProductCreateData),
      responses: {
        201: json("The created product, including its new id.", Product),
        400: json("The body is missing, is not JSON, or fails validation.", ErrorResponse),
        413: json("The product data is too large to store.", ErrorResponse),
        ...commonErrors
      }
    }
  },
  {
    method: "GET",
    path: "/products/{id}",
    handler: "getProduct",
    bucketAccess: "read",
    tableAccess: "read",
    operation: {
      summary: "Get a product",
      description: "Get a single product by its ID.",
      requestParams: byId,
      responses: {
        200: json("The product.", Product),
        400: json("The id is not a UUID.", ErrorResponse),
        404: json("No product has this id.", ErrorResponse),
        ...commonErrors
      }
    }
  },
  {
    method: "PUT",
    path: "/products/{id}",
    handler: "updateProduct",
    bucketAccess: "read",
    tableAccess: "readWrite",
    operation: {
      summary: "Update a product",
      description: "Replaces the title, description and price. The category cannot be changed.",
      requestParams: byId,
      requestBody: body(ProductUpdateData),
      responses: {
        200: json("The updated product.", Product),
        400: json("The id is not a UUID, or the body fails validation.", ErrorResponse),
        404: json("No product has this id.", ErrorResponse),
        413: json("The product data is too large to store.", ErrorResponse),
        ...commonErrors
      }
    }
  },
  {
    method: "PUT",
    path: "/products/{id}/images",
    handler: "uploadProductImage",
    bucketAccess: "put",
    tableAccess: "read",
    operation: {
      summary: "Request product image upload",
      description: "Returns a presigned upload URL for a product image.",
      requestParams: byId,
      requestBody: body(UploadProductImageData),
      responses: {
        200: json("The updated product.", UploadProductImageResponse),
        400: json("The id is not a UUID, or the body fails validation.", ErrorResponse),
        404: json("No product has this id.", ErrorResponse),
        ...commonErrors
      }
    }
  }
];
