import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { PRODUCTS_TABLE_CATEGORY_INDEX, PRODUCTS_TABLE_NAME } from "../../../src/constants";
import { ProductsDbStack } from "../../../src/stacks/ProductsDbStack";
import { makeApp } from "../../helpers/cdk";

// TableV2 synthesizes AWS::DynamoDB::GlobalTable, not AWS::DynamoDB::Table.
const TABLE = "AWS::DynamoDB::GlobalTable";

describe("ProductsDbStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const stack = new ProductsDbStack(app, "TestProductsDbStack", {
      env: { account: "123456789012", region: "eu-west-1" }
    });
    template = Template.fromStack(stack);
  });

  it("creates exactly one table", () => {
    template.resourceCountIs(TABLE, 1);
  });

  it("keys the table on a string id and bills on demand", () => {
    template.hasResourceProperties(TABLE, {
      TableName: PRODUCTS_TABLE_NAME,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: Match.arrayWith([{ AttributeName: "id", AttributeType: "S" }])
    });
  });

  it("adds the category GSI, partitioned by category and sorted by id", () => {
    template.hasResourceProperties(TABLE, {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: PRODUCTS_TABLE_CATEGORY_INDEX,
          KeySchema: [
            { AttributeName: "category", KeyType: "HASH" },
            { AttributeName: "id", KeyType: "RANGE" }
          ]
        })
      ])
    });
  });

  it("deletes the table when the stack is destroyed", () => {
    template.hasResource(TABLE, {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete"
    });
  });

  it("matches the committed snapshot", () => {
    // Catches unintended drift in everything the assertions above don't name.
    // Run `vitest -u` after a deliberate infrastructure change.
    expect(template.toJSON()).toMatchSnapshot();
  });
});
