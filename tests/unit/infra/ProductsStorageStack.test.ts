import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import {
  PRODUCTS_BUCKET_NAME,
  PRODUCTS_IMAGE_KEY_PREFIX,
  REJECTED_IMAGE_EVENTS_QUEUE_URL
} from "../../../src/constants";
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

  /** The SQS actions a function's execution role is allowed. */
  const queueActions = (functionId: string): string[] => {
    const roleId: string = template.findResources("AWS::Lambda::Function")[functionId].Properties.Role["Fn::GetAtt"][0];
    return Object.values(template.findResources("AWS::IAM::Policy"))
      .filter(({ Properties }) => Properties.Roles.some((role: CfnRef) => role.Ref === roleId))
      .flatMap(({ Properties }) =>
        Properties.PolicyDocument.Statement.flatMap((statement: { Action: string | string[] }) =>
          [statement.Action].flat()
        )
      )
      .filter((action: string) => action.startsWith("sqs:"));
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

  /** The logical id of the one queue whose name starts with `prefix`. */
  const queueId = (prefix: string) => {
    const ids = Object.keys(template.findResources("AWS::SQS::Queue")).filter(id => id.startsWith(prefix));
    if (ids.length !== 1) {
      throw new Error(`Expected exactly one ${prefix} queue, found ${ids.length}`);
    }
    return ids[0];
  };

  const failureQueueId = () => queueId("FailedImageEvents");
  const rejectedQueueId = () => queueId("RejectedImageEvents");

  it("sends events the trigger gave up on to a failure queue", () => {
    // An `onFailure` destination, not the older DeadLetterConfig: the message
    // wraps the S3 event with the error and request id, so the queue alone says
    // what went wrong. The two are configured on different resources, hence the
    // assertion that the legacy one is absent.
    template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
      FunctionName: { Ref: triggerFunctionId() },
      DestinationConfig: {
        OnFailure: { Destination: { "Fn::GetAtt": [failureQueueId(), "Arn"] } }
      }
    });
    template.hasResourceProperties(
      "AWS::Lambda::Function",
      Match.not(Match.objectLike({ DeadLetterConfig: Match.anyValue() }))
    );
  });

  it("retries a failed invocation twice before giving up, and not for longer than an hour", () => {
    // Safe only because updateProductImages appends under a `contains`
    // condition: a retry of a partly-applied batch re-runs the writes that
    // already landed.
    template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
      FunctionName: { Ref: triggerFunctionId() },
      MaximumRetryAttempts: 2,
      MaximumEventAgeInSeconds: 60 * 60
    });
  });

  it("lets the trigger write to the failure queue", () => {
    expect(queueActions(triggerFunctionId())).toEqual(expect.arrayContaining(["sqs:SendMessage"]));
  });

  it("alarms as soon as a single event reaches the failure queue", () => {
    // Every message is an image that will never be linked to its product, so
    // there is no healthy non-zero depth to tolerate.
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "AWS/SQS",
      MetricName: "ApproximateNumberOfMessagesVisible",
      Dimensions: [{ Name: "QueueName", Value: { "Fn::GetAtt": [failureQueueId(), "QueueName"] } }],
      Threshold: 0,
      ComparisonOperator: "GreaterThanThreshold",
      EvaluationPeriods: 1,
      TreatMissingData: "notBreaching"
    });
  });

  it("keeps the events the trigger refused to retry in a queue of their own", () => {
    // Separate from FailedImageEvents on purpose: that one can be redriven
    // wholesale once the cause is fixed, this one never can, and a single queue
    // would make the two indistinguishable at exactly the moment it matters.
    template.resourceCountIs("AWS::SQS::Queue", 2);
    expect(rejectedQueueId()).not.toEqual(failureQueueId());
  });

  it("tells the trigger where to park the events it refuses to retry", () => {
    // The trigger sends these itself — Lambda has no idea an invocation that
    // returned normally gave up on anything — so it needs the URL and the grant.
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          [REJECTED_IMAGE_EVENTS_QUEUE_URL]: { Ref: rejectedQueueId() }
        })
      }
    });
    expect(queueActions(triggerFunctionId())).toEqual(expect.arrayContaining(["sqs:SendMessage"]));
  });

  it("alarms separately on the two queues, since the response to each differs", () => {
    const alarmed = Object.values(template.findResources("AWS::CloudWatch::Alarm")).map(
      ({ Properties }) => Properties.Dimensions[0].Value["Fn::GetAtt"][0]
    );

    expect(alarmed).toEqual(expect.arrayContaining([failureQueueId(), rejectedQueueId()]));
  });

  it("keeps a parked event long enough to be noticed over a weekend", () => {
    // Nothing drains either queue automatically, so the retention period is the
    // real deadline for acting on an alarm.
    for (const id of [failureQueueId(), rejectedQueueId()]) {
      expect(template.findResources("AWS::SQS::Queue")[id].Properties.MessageRetentionPeriod).toBe(14 * 24 * 60 * 60);
    }
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
