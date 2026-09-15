import type { StackProps } from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import type { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { join } from "path";

import { PRODUCTS_BUCKET_NAME, PRODUCTS_IMAGE_KEY_PREFIX, REJECTED_IMAGE_EVENTS_QUEUE_URL } from "../constants";

type Props = StackProps & {
  productsTable: TableV2;
};

export class ProductsStorageStack extends Stack {
  readonly bucket: Bucket;
  readonly failedImageEvents: Queue;
  readonly rejectedImageEvents: Queue;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.failedImageEvents = new Queue(this, "FailedImageEvents", {
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(5)
    });

    this.rejectedImageEvents = new Queue(this, "RejectedImageEvents", {
      retentionPeriod: Duration.days(14),
      visibilityTimeout: Duration.minutes(5)
    });

    const productImageUploaded = new NodejsFunction(this, "ProductImageUploaded", {
      entry: join(__dirname, "..", "api", "events", "productImageUploaded.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_24_X,
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
      onFailure: new SqsDestination(this.failedImageEvents),
      environment: {
        [REJECTED_IMAGE_EVENTS_QUEUE_URL]: this.rejectedImageEvents.queueUrl
      }
    });
    props.productsTable.grants.readWriteData(productImageUploaded);
    this.rejectedImageEvents.grantSendMessages(productImageUploaded);

    this.failedImageEvents
      .metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: "Maximum" })
      .createAlarm(this, "FailedImageEventsAlarm", {
        alarmDescription:
          "productImageUploaded exhausted its retries.",
        threshold: 0,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING
      });

    this.rejectedImageEvents
      .metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5), statistic: "Maximum" })
      .createAlarm(this, "RejectedImageEventsAlarm", {
        alarmDescription:
          "productImageUploaded refused to retry an event.",
        threshold: 0,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING
      });

    this.bucket = new Bucket(this, "ProductsBucket", {
      bucketName: PRODUCTS_BUCKET_NAME,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedHeaders: ["Content-Type", "Content-Length"],
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
          allowedOrigins: ["*"]
        }
      ]
    });
    this.bucket.addObjectCreatedNotification(new LambdaDestination(productImageUploaded), {
      prefix: `${PRODUCTS_IMAGE_KEY_PREFIX}/`
    });
  }
}
