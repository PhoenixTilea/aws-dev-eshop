import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { PRODUCTS_TABLE_CATEGORY_INDEX } from "./constants";
import type { Category, Product, ProductCreateData, ProductUpdateData } from "./types";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TableName = "ProductsDbStack-ProductsTable241ADBFF-1UNJVSZOWRSAU";

export const addProduct = async (product: ProductCreateData) => {
  const Item: Product = {
    id: crypto.randomUUID(),
    ...product
  };
  const command = new PutCommand({
    TableName,
    Item
  });
  await client.send(command);
  return Item;
}

export const getProduct = async (id: string) => {
  const command = new GetCommand({
    TableName,
    Key: { id },
    ConsistentRead: true
  });
  const response = await client.send(command);
  return response.Item ? response.Item as Product : null;
}

export const getProducts = async (category?: Category) => {
  if (category) {
    const command = new QueryCommand({
      TableName,
      IndexName: PRODUCTS_TABLE_CATEGORY_INDEX,
      KeyConditionExpression: "category = :c",
      ExpressionAttributeValues: { ":c": category },
      ConsistentRead: true
    });
    const response = await client.send(command);
    return response.Items ? response.Items as Product[] : [];
  } else {
    const command = new ScanCommand({
      TableName,
      ConsistentRead: true
    });
    const response = await client.send(command);
    return response.Items ? response.Items as Product[] : [];
  }
}

export const updateProduct = async (id: string, product: ProductUpdateData) => {
  const command = new UpdateCommand({
    TableName,
    Key: { id },
    UpdateExpression: "SET title = :title, price = :price, description = :desc",
    ExpressionAttributeValues: {
      ":title": product.title,
      ":price": product.price,
      ":desc": product.description
    },
    ReturnValues: "ALL_NEW"
  });
  const response = await client.send(command);
  return response.Attributes as Product;
}
