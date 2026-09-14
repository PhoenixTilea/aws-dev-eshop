#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";

import { ProductsApiStack } from "./api/ProductsApiStack";
import { ProductsDbStack } from "./api/ProductsDbStack";

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

const app = new cdk.App();
const dbStack = new ProductsDbStack(app, "ProductsDbStack", { env });
new ProductsApiStack(app, "ProductsApiStack", { env, productsTable: dbStack.productsTable });
app.synth();
