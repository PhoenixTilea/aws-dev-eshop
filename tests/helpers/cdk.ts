import { App } from "aws-cdk-lib";
import { BUNDLING_STACKS } from "aws-cdk-lib/cx-api";
import { readFileSync } from "fs";
import { join } from "path";

import { destroyOnTeardown } from "../../src/removalPolicies";

const { context } = JSON.parse(readFileSync(join(__dirname, "../../cdk.json"), "utf8")) as {
  context: Record<string, unknown>;
};

/**
 * An App that synthesizes what `cdk deploy` would. A bare `new App()` skips the
 * feature flags in cdk.json and falls back to legacy defaults (no CDK-managed log
 * groups, an extra API Gateway CloudWatch role), so tests would pass against a
 * template we never deploy. It also applies the same removal policies as app.ts.
 *
 * Lambda bundling is skipped: asset contents aren't under test, and running
 * esbuild for every function would add seconds to each suite.
 */
export const makeApp = () => {
  const app = new App({ context: { ...context, [BUNDLING_STACKS]: [] } });
  destroyOnTeardown(app);
  return app;
};
