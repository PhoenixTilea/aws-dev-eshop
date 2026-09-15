import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { PRODUCTS_BUCKET_NAME, PRODUCTS_IMAGE_KEY_PREFIX } from "../../../src/api/constants";
import { ProductsDbStack } from "../../../src/stacks/ProductsDbStack";
import { ProductsStorageStack } from "../../../src/stacks/ProductsStorageStack";
import { makeApp } from "../../helpers/cdk";

// No snapshot for this stack: it carries a Lambda, so every change to the
// trigger's source would churn it. The assertions below pin what matters.

type CfnRef = { Ref?: string; "Fn::GetAtt"?: string[] };

const WRITE_ACTIONS = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"];

describe("ProductsStorageStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const env = { account: "123456789012", region: "eu-west-1" };
    const db = new ProductsDbStack(app, "TestProductsDbStack", { env });
    const stack = new ProductsStorageStack(app, "TestProductsStorageStack", { env, productsTable: db.productsTable });
    template = Template.fromStack(stack);
  });

  type CorsRule = { AllowedMethods: string[]; AllowedHeaders: string[]; AllowedOrigins: string[] };

  const corsRules = (): CorsRule[] =>
    Object.values(template.findResources("AWS::S3::Bucket"))[0].Properties.CorsConfiguration.CorsRules;

  /** The logical id of the trigger function, as opposed to CDK's own helpers. */
  const triggerFunctionId = () => {
    const ids = Object.keys(template.findResources("AWS::Lambda::Function")).filter(id =>
      id.startsWith("ProductImageUploaded")
    );
    if (ids.length !== 1) {
      throw new Error(`Expected exactly one ProductImageUploaded function, found ${ids.length}`);
    }
    return ids[0];
  };

  /** The DynamoDB actions a function's execution role is allowed. */
  const tableActions = (functionId: string): string[] => {
    const roleId: string = template.findResources("AWS::Lambda::Function")[functionId].Properties.Role["Fn::GetAtt"][0];
    return Object.values(template.findResources("AWS::IAM::Policy"))
      .filter(({ Properties }) => Properties.Roles.some((role: CfnRef) => role.Ref === roleId))
      .flatMap(({ Properties }) =>
        Properties.PolicyDocument.Statement.flatMap((statement: { Action: string | string[] }) =>
          [statement.Action].flat()
        )
      )
      .filter((action: string) => action.startsWith("dynamodb:"));
  };

  it("creates exactly one bucket, under the fixed name", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1);
    template.hasResourceProperties("AWS::S3::Bucket", { BucketName: PRODUCTS_BUCKET_NAME });
  });

  it("allows the browser to PUT and GET cross-origin with a Content-Type header", () => {
    // The upload goes straight from the page to S3, so without this the
    // preflight for the signed content-type header is refused. Matched by hand
    // rather than with Match.arrayWith, which is order-sensitive.
    const rule = corsRules().find(({ AllowedMethods }) => AllowedMethods.includes("PUT"));

    expect(rule).toBeDefined();
    expect(rule?.AllowedMethods).toEqual(expect.arrayContaining(["GET", "PUT"]));
    expect(rule?.AllowedHeaders).toContain("Content-Type");
    expect(rule?.AllowedOrigins).toEqual(["*"]);
  });

  it("deletes the bucket and empties it when the stack is destroyed", () => {
    // A bucket that still holds objects blocks the delete, and the fixed name
    // means the next deploy then collides with the leftover.
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete"
    });
    template.resourceCountIs("Custom::S3AutoDeleteObjects", 1);
  });

  it("notifies the trigger on object-created, and only under the image prefix", () => {
    // The prefix has to agree with the key uploadProductImage signs, or nothing
    // ever reaches the trigger.
    template.hasResourceProperties("Custom::S3BucketNotifications", {
      NotificationConfiguration: {
        LambdaFunctionConfigurations: Match.arrayWith([
          Match.objectLike({
            Events: ["s3:ObjectCreated:*"],
            Filter: {
              Key: { FilterRules: [{ Name: "prefix", Value: `${PRODUCTS_IMAGE_KEY_PREFIX}/` }] }
            },
            LambdaFunctionArn: { "Fn::GetAtt": [triggerFunctionId(), "Arn"] }
          })
        ])
      }
    });
  });

  it("lets S3 invoke the trigger", () => {
    template.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunction",
      Principal: "s3.amazonaws.com",
      FunctionName: { "Fn::GetAtt": [triggerFunctionId(), "Arn"] }
    });
  });

  it("lets the trigger write the image keys it collects to the table", () => {
    expect(tableActions(triggerFunctionId())).toEqual(expect.arrayContaining(WRITE_ACTIONS));
  });

  it("gives the trigger a CDK-managed log group, so teardown takes the logs with it", () => {
    // Only true with cdk.json's useCdkManagedLogGroup flag; without it Lambda
    // creates the group at runtime, outside the stack, and it is orphaned.
    template.resourceCountIs("AWS::Logs::LogGroup", 1);
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: { "Fn::Join": ["", ["/aws/lambda/", { Ref: triggerFunctionId() }]] }
    });
  });

  it("retains nothing when the stack is destroyed or a resource is replaced", () => {
    const kept = Object.entries(template.toJSON().Resources as Record<string, Record<string, unknown>>)
      .filter(([, resource]) =>
        [resource.DeletionPolicy, resource.UpdateReplacePolicy].some(
          policy => policy === "Retain" || policy === "RetainExceptOnCreate" || policy === "Snapshot"
        )
      )
      .map(([id]) => id);

    expect(kept).toEqual([]);
  });
});
