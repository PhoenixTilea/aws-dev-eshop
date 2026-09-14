export const PRODUCTS_TABLE_CATEGORY_INDEX = "GSI_Category_ProductID";
export const PRODUCTS_TABLE_NAME = "Products";

/**
 * Sent on every response, whether it comes from a Lambda (createResponse) or
 * from API Gateway itself (the gateway responses in ProductsApiStack).
 */
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type"
};
