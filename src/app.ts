#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";

import { ProductsApiStack } from "./api/ProductsApiStack";
import { ProductsDbStack } from "./api/ProductsDbStack";

const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

const app = new cdk.App();
new ProductsApiStack(app, "ProductsApiStack", { env });
new ProductsDbStack(app, "ProductsDbStack", { env });
app.synth();
