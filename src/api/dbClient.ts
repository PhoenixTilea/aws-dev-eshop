import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import { PRODUCTS_TABLE_CATEGORY_INDEX, PRODUCTS_TABLE_NAME as TableName } from "./constants";
import type { Category, Product, ProductCreateData, ProductUpdateData } from "./types";

// AWS_ENDPOINT_URL points the client at DynamoDB Local (or LocalStack) during
// integration tests. In Lambda it is unset and the SDK resolves the real regional
// endpoint. Built lazily so a test can set the variable before the first call.
let client: DynamoDBDocumentClient | undefined;

const docClient = () => {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  client ??= DynamoDBDocumentClient.from(new DynamoDBClient(endpoint ? { endpoint } : {}));
  return client;
};

export const addProduct = async (product: ProductCreateData) => {
  const Item: Product = {
    id: crypto.randomUUID(),
    ...product
  };
  const command = new PutCommand({
    TableName,
    Item
  });
  await docClient().send(command);
  return Item;
};

export const getProduct = async (id: string) => {
  const command = new GetCommand({
    TableName,
    Key: { id },
    ConsistentRead: true
  });
  const response = await docClient().send(command);
  return response.Item ? (response.Item as Product) : null;
};

export const getProducts = async (category?: Category) => {
  if (category) {
    const command = new QueryCommand({
      TableName,
      IndexName: PRODUCTS_TABLE_CATEGORY_INDEX,
      KeyConditionExpression: "category = :c",
      ExpressionAttributeValues: { ":c": category }
    });
    const response = await docClient().send(command);
    return response.Items ? (response.Items as Product[]) : [];
  } else {
    const command = new ScanCommand({
      TableName,
      ConsistentRead: true
    });
    const response = await docClient().send(command);
    return response.Items ? (response.Items as Product[]) : [];
  }
};

/**
 * Updates an existing product, or returns null if there is no such product.
 *
 * UpdateCommand creates the item when the key is absent, which would let a PUT
 * to an unknown id silently invent a product. The condition blocks that, and
 * does so atomically: a read-then-write would leave a window in which the
 * product could be deleted between the check and the update.
 */
export const updateProduct = async (id: string, product: ProductUpdateData) => {
  const command = new UpdateCommand({
    TableName,
    Key: { id },
    ConditionExpression: "attribute_exists(id)",
    UpdateExpression: "SET title = :title, price = :price, description = :desc",
    ExpressionAttributeValues: {
      ":title": product.title,
      ":price": product.price,
      ":desc": product.description
    },
    ReturnValues: "ALL_NEW"
  });

  try {
    const response = await docClient().send(command);
    return response.Attributes as Product;
  } catch (err) {
    // Existence is the only condition on this command, so a failed check can
    // only mean the product is not there. Callers that set a second predicate
    // (an optimistic-locking version, say) would have to tell the two apart.
    if (err instanceof ConditionalCheckFailedException) {
      return null;
    }
    throw err;
  }
};
