import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import { PRODUCTS_BUCKET_NAME, PRODUCTS_TABLE_CATEGORY_INDEX, PRODUCTS_TABLE_NAME as TableName } from "./constants";
import { getDownloadUrl } from "./s3Client";
import type { Category, Product, ProductCreateData, ProductUpdateData } from "./types";

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
  return response.Item ? (await convertProductImageUrls([response.Item as Product]))[0] : null;
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
    return response.Items ? convertProductImageUrls(response.Items as Product[]) : [];
  } else {
    const command = new ScanCommand({
      TableName,
      ConsistentRead: true
    });
    const response = await docClient().send(command);
    return response.Items ? (response.Items as Product[]) : [];
  }
};

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
    return (await convertProductImageUrls([response.Attributes as Product]))[0];
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return null;
    }
    throw err;
  }
};

export const updateProductImages = async (id: string, images: string[]) => {
  const command = new UpdateCommand({
    TableName,
    Key: { id },
    ConditionExpression: "attribute_exists(id)",
    UpdateExpression: "SET images = list_append(if_not_exists(images, :empty), :images)",
    ExpressionAttributeValues: {
      ":empty": [],
      ":images": images
    }
  });
  await docClient().send(command);
};

const convertProductImageUrls = async (products: Product[]): Promise<Product[]> => {
  const promises: (() => Promise<{ id: string; url: string }>)[] = [];
  for (const product of products) {
    if (!product.images?.length) {
      continue;
    }
    for (const image of product.images) {
      promises.push(async () => {
        const url = await getDownloadUrl(PRODUCTS_BUCKET_NAME, image);
        return { id: product.id, url };
      });
    }
  }

  const urls = await Promise.all(promises.map(p => p()));
  const productDownloadUrls = new Map<string, string[]>();
  for (const { id, url } of urls) {
    const list = productDownloadUrls.get(id) ?? [];
    productDownloadUrls.set(id, [...list, url]);
  }

  return products.map(p => ({
    ...p,
    images: productDownloadUrls.get(p.id)
  }));
};
