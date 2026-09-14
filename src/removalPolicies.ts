import { RemovalPolicies } from "aws-cdk-lib/core";
import type { IConstruct } from "constructs";

/**
 * Makes `cdk destroy` delete every resource under `scope`, overriding constructs
 * that retain by default (DynamoDB tables, CDK-managed Lambda log groups). This
 * is a learning project: nothing here is worth keeping after teardown, and a
 * retained `Products` table blocks the next deploy because its name is fixed.
 *
 * CloudFormation reads the policy from the deployed template, so a change here
 * only takes effect on destroy after it has been deployed.
 *
 * Shared by app.ts and the infra tests so the tests see the same policies the
 * real app deploys.
 */
export const destroyOnTeardown = (scope: IConstruct) => {
  RemovalPolicies.of(scope).destroy();
};
