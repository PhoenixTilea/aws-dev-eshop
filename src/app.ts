#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";

import { destroyOnTeardown } from "./removalPolicies";
import { ProductsApiStack } from "./stacks/ProductsApiStack";
import { ProductsDbStack } from "./stacks/ProductsDbStack";
import { ProductsStorageStack } from "./stacks/ProductsStorageStack";

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

const app = new cdk.App();
const dbStack = new ProductsDbStack(app, "ProductsDbStack", { env });
const storageStack = new ProductsStorageStack(app, "ProductsStorageStack", {
  env,
  productsTable: dbStack.productsTable
});
new ProductsApiStack(app, "ProductsApiStack", {
  env,
  productsTable: dbStack.productsTable,
  productsBucket: storageStack.bucket
});
destroyOnTeardown(app);
app.synth();
