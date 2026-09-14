import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Stack } from "aws-cdk-lib";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import type { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";
import { join } from "path";

const settings = (filename: string) => ({
  entry: join(__dirname, "products", `${filename}.ts`),
  handler: "handler",
  runtime: Runtime.NODEJS_24_X
});

type Props = StackProps & {
  productsTable: TableV2;
};

export class ProductsApiStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const { productsTable } = props;

    const getProducts = new NodejsFunction(this, "GetProducts", settings("getProducts"));
    productsTable.grants.readData(getProducts);
    const getProduct = new NodejsFunction(this, "GetProduct", settings("getProduct"));
    productsTable.grants.readData(getProduct);
    const addProduct = new NodejsFunction(this, "AddProduct", settings("addProduct"));
    productsTable.grants.readWriteData(addProduct);
    const updateProduct = new NodejsFunction(this, "UpdateProduct", settings("updateProduct"));
    productsTable.grants.readWriteData(updateProduct);
    const options = new NodejsFunction(this, "Options", settings("options"));

    const api = new RestApi(this, "ProductsApi", {
      deployOptions: {
        stageName: "dev"
      }
    });

    const products = api.root.addResource("products");
    products.addMethod("GET", new LambdaIntegration(getProducts));
    products.addMethod("POST", new LambdaIntegration(addProduct));
    products.addMethod("OPTIONS", new LambdaIntegration(options));

    const productById = products.addResource("{id}");
    productById.addMethod("GET", new LambdaIntegration(getProduct));
    productById.addMethod("PUT", new LambdaIntegration(updateProduct));
    productById.addMethod("OPTIONS", new LambdaIntegration(options));

    new CfnOutput(this, "ProductsApiOutput", { value: api.url });
  }
}
