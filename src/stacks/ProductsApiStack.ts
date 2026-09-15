import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Stack } from "aws-cdk-lib";
import type { IResource } from "aws-cdk-lib/aws-apigateway";
import { LambdaIntegration, ResponseType, RestApi } from "aws-cdk-lib/aws-apigateway";
import type { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";
import { join } from "path";

import { CORS_HEADERS } from "../api/constants";
import { productRoutes } from "../api/products/routes";

const settings = (filename: string) => ({
  entry: join(__dirname, "products", `${filename}.ts`),
  handler: "handler",
  runtime: Runtime.NODEJS_24_X
});

const constructId = (handler: string) => `${handler.charAt(0).toUpperCase()}${handler.slice(1)}`;

type Props = StackProps & {
  productsTable: TableV2;
};

export class ProductsApiStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const { productsTable } = props;

    const api = new RestApi(this, "ProductsApi", {
      deployOptions: {
        stageName: "dev"
      }
    });

    const gatewayCorsHeaders = Object.fromEntries(
      Object.entries(CORS_HEADERS).map(([name, value]) => [name, `'${value}'`])
    );
    api.addGatewayResponse("Default4xx", { type: ResponseType.DEFAULT_4XX, responseHeaders: gatewayCorsHeaders });
    api.addGatewayResponse("Default5xx", { type: ResponseType.DEFAULT_5XX, responseHeaders: gatewayCorsHeaders });

    const resources = new Map<string, IResource>();
    for (const route of productRoutes) {
      const fn = new NodejsFunction(this, constructId(route.handler), settings(route.handler));
      if (route.tableAccess === "readWrite") {
        productsTable.grants.readWriteData(fn);
      } else {
        productsTable.grants.readData(fn);
      }

      const resource = api.root.resourceForPath(route.path);
      resources.set(route.path, resource);
      resource.addMethod(route.method, new LambdaIntegration(fn));
    }

    const options = new NodejsFunction(this, "Options", settings("options"));
    for (const resource of resources.values()) {
      resource.addMethod("OPTIONS", new LambdaIntegration(options));
    }

    new CfnOutput(this, "ProductsApiUrl", { value: api.url });
  }
}
