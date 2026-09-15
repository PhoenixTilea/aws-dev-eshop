import type { StackProps } from "aws-cdk-lib";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import type { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import type { Construct } from "constructs";
import { join } from "path";

import { PRODUCTS_BUCKET_NAME, PRODUCTS_IMAGE_KEY_PREFIX } from "../api/constants";

type Props = StackProps & {
  productsTable: TableV2;
};

export class ProductsStorageStack extends Stack {
  readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const productImageUploaded = new NodejsFunction(this, "ProductImageUploaded", {
      entry: join(__dirname, "..", "api", "events", "productImageUploaded.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_24_X
    });
    props.productsTable.grants.readWriteData(productImageUploaded);

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
