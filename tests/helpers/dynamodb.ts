import { CreateTableCommand, DynamoDBClient, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import type { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";

import { ProductsDbStack } from "../../src/api/ProductsDbStack";

// Pinned so a new upstream release can't change test behaviour underneath us.
const IMAGE = "amazon/dynamodb-local:3.3.1";
const PORT = 8000;

/**
 * The CreateTable input for the products table, read back out of the synthesized
 * CloudFormation rather than hand-copied. If someone renames the GSI or changes a
 * key in ProductsDbStack, the integration tests move with it instead of passing
 * against a schema that no longer exists.
 */
export const productsTableSchema = (): CreateTableCommandInput => {
  const stack = new ProductsDbStack(new App(), "SchemaProbe", {});
  const tables = Template.fromStack(stack).findResources("AWS::DynamoDB::GlobalTable");
  const properties = Object.values(tables)[0]?.Properties as CreateTableCommandInput | undefined;

  if (!properties) {
    throw new Error("ProductsDbStack no longer synthesizes an AWS::DynamoDB::GlobalTable");
  }

  // GlobalTable carries replica config that CreateTable doesn't accept, so take
  // only the schema-shaped fields across.
  return {
    TableName: properties.TableName,
    AttributeDefinitions: properties.AttributeDefinitions,
    KeySchema: properties.KeySchema,
    BillingMode: properties.BillingMode,
    GlobalSecondaryIndexes: properties.GlobalSecondaryIndexes
  };
};

/**
 * Boots a throwaway DynamoDB Local container, points the AWS SDK at it via
 * AWS_ENDPOINT_URL, and creates the products table. Returns a stop() for afterAll.
 */
export const startDynamoDb = async () => {
  const container: StartedTestContainer = await new GenericContainer(IMAGE)
    .withExposedPorts(PORT)
    // The image's entrypoint is `java`, so the jar invocation is the command.
    // -inMemory keeps everything in RAM; -sharedDb makes every credential set
    // resolve to the same database, which avoids surprises when the SDK picks up
    // a different access key than the one the table was created under.
    .withCommand(["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"])
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(PORT)}`;

  // DynamoDB Local ignores the values but the SDK refuses to sign without them.
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_REGION = "local";
  process.env.AWS_ACCESS_KEY_ID = "local";
  process.env.AWS_SECRET_ACCESS_KEY = "local";

  const admin = new DynamoDBClient({ endpoint });
  const schema = productsTableSchema();
  await admin.send(new CreateTableCommand(schema));
  await waitUntilTableExists({ client: admin, maxWaitTime: 30 }, { TableName: schema.TableName });

  return {
    endpoint,
    admin,
    stop: async () => {
      admin.destroy();
      await container.stop();
      delete process.env.AWS_ENDPOINT_URL;
    }
  };
};
