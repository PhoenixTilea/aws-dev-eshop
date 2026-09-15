#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";

import { ProductsApiStack } from "./stacks/ProductsApiStack";
import { ProductsDbStack } from "./stacks/ProductsDbStack";
import { destroyOnTeardown } from "./removalPolicies";

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

const app = new cdk.App();
const dbStack = new ProductsDbStack(app, "ProductsDbStack", { env });
new ProductsApiStack(app, "ProductsApiStack", { env, productsTable: dbStack.productsTable });
destroyOnTeardown(app);
app.synth();
