export const PRESIGNED_DOWNLOAD_EXPIRE_SECONDS = 60 * 60 * 4;
export const PRESIGNED_UPLOAD_EXPIRE_SECONDS = 20 * 60;
export const PRODUCTS_BUCKET_NAME = "products-dev";
export const PRODUCTS_IMAGE_KEY_PREFIX = "product";
export const PRODUCTS_TABLE_CATEGORY_INDEX = "GSI_Category_ProductID";
export const PRODUCTS_TABLE_NAME = "Products";

/** Env var naming the queue for events the image trigger refuses to retry. */
export const REJECTED_IMAGE_EVENTS_QUEUE_URL = "REJECTED_IMAGE_EVENTS_QUEUE_URL";

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "Content-Type"
};
