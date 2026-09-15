import { Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";

import { CORS_HEADERS } from "../../../src/api/constants";
import { productRoutes } from "../../../src/api/products/routes";
import { ProductsApiStack } from "../../../src/stacks/ProductsApiStack";
import { ProductsDbStack } from "../../../src/stacks/ProductsDbStack";
import { ProductsStorageStack } from "../../../src/stacks/ProductsStorageStack";
import { makeApp } from "../../helpers/cdk";

// No snapshot for this stack: every route or handler change would churn it, and
// the assertions below pin down the parts that matter.

type CfnRef = { Ref?: string; "Fn::GetAtt"?: string[] };

const WRITE_ACTIONS = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"];

const routeKey = ({ method, path }: { method: string; path: string }) => `${method} ${path}`;

describe("ProductsApiStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const env = { account: "123456789012", region: "eu-west-1" };
    const db = new ProductsDbStack(app, "TestProductsDbStack", { env });
    const storage = new ProductsStorageStack(app, "TestProductsStorageStack", { env, productsTable: db.productsTable });
    const stack = new ProductsApiStack(app, "TestProductsApiStack", {
      env,
      productsBucket: storage.bucket,
      productsTable: db.productsTable
    });
    template = Template.fromStack(stack);
  });

  /** "/products/{id}" for an API Gateway resource, by walking up its parents. */
  const pathOf = (resource: CfnRef): string => {
    if (resource["Fn::GetAtt"]?.[1] === "RootResourceId") {
      return "";
    }
    const { ParentId, PathPart } = template.findResources("AWS::ApiGateway::Resource")[resource.Ref ?? ""].Properties;
    return `${pathOf(ParentId)}/${PathPart}`;
  };

  /** Every deployed method as "GET /products", with the function it invokes. */
  const deployedMethods = () =>
    Object.values(template.findResources("AWS::ApiGateway::Method")).map(({ Properties }) => {
      const uriParts: unknown[] = Properties.Integration.Uri["Fn::Join"][1];
      const fn = uriParts.find((part): part is Required<Pick<CfnRef, "Fn::GetAtt">> =>
        Boolean(part && typeof part === "object" && "Fn::GetAtt" in part)
      );
      if (!fn) {
        throw new Error(`Method ${Properties.HttpMethod} does not integrate with a function`);
      }
      return {
        route: `${Properties.HttpMethod} ${pathOf(Properties.ResourceId)}`,
        integrationType: Properties.Integration.Type as string,
        functionId: fn["Fn::GetAtt"][0]
      };
    });

  const methodFor = (route: { method: string; path: string }) => {
    const method = deployedMethods().find(m => m.route === routeKey(route));
    if (!method) {
      throw new Error(`${routeKey(route)} is not deployed`);
    }
    return method;
  };

  /** The DynamoDB actions a function's execution role is allowed. */
  const tableActions = (functionId: string): string[] => {
    const roleId: string = template.findResources("AWS::Lambda::Function")[functionId].Properties.Role["Fn::GetAtt"][0];
    return Object.values(template.findResources("AWS::IAM::Policy"))
      .filter(({ Properties }) => Properties.Roles.some((role: CfnRef) => role.Ref === roleId))
      .flatMap(({ Properties }) =>
        Properties.PolicyDocument.Statement.flatMap((statement: { Action: string | string[] }) =>
          [statement.Action].flat()
        )
      )
      .filter((action: string) => action.startsWith("dynamodb:"));
  };

  it("deploys exactly the routes in the contract, plus CORS preflight on each resource", () => {
    const paths = new Set(productRoutes.map(route => route.path));
    const expected = [...productRoutes.map(routeKey), ...[...paths].map(path => `OPTIONS ${path}`)];

    expect(
      deployedMethods()
        .map(m => m.route)
        .sort()
    ).toEqual(expected.sort());
  });

  it.each(productRoutes)("backs $method $path with its own $handler function", route => {
    const method = methodFor(route);

    expect(method.integrationType).toBe("AWS_PROXY");
    // Construct ids are the capitalised handler name, e.g. GetProducts070FDC6E.
    expect(method.functionId.toLowerCase().startsWith(route.handler.toLowerCase())).toBe(true);
    expect(deployedMethods().filter(m => m.functionId === method.functionId)).toHaveLength(1);
  });

  it.each(productRoutes.filter(route => route.tableAccess === "readWrite"))(
    "lets $method $path write to the table",
    route => {
      expect(tableActions(methodFor(route).functionId)).toEqual(expect.arrayContaining(WRITE_ACTIONS));
    }
  );

  it.each(productRoutes.filter(route => route.tableAccess === "read"))(
    "lets $method $path read the table but not write to it",
    route => {
      const actions = tableActions(methodFor(route).functionId);

      expect(actions).toEqual(expect.arrayContaining(["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"]));
      expect(actions.filter(action => WRITE_ACTIONS.includes(action))).toEqual([]);
    }
  );

  it("answers preflight with one shared function that has no table access", () => {
    const preflight = deployedMethods().filter(m => m.route.startsWith("OPTIONS "));
    const functionIds = new Set(preflight.map(m => m.functionId));

    expect(functionIds.size).toBe(1);
    expect(tableActions([...functionIds][0])).toEqual([]);
  });

  it.each(["DEFAULT_4XX", "DEFAULT_5XX"])("sends CORS headers on API Gateway's own %s responses", type => {
    // Gateway response header values are static mapping expressions, so quoted.
    const headers = Object.fromEntries(
      Object.entries(CORS_HEADERS).map(([name, value]) => [`gatewayresponse.header.${name}`, `'${value}'`])
    );

    template.hasResourceProperties("AWS::ApiGateway::GatewayResponse", {
      ResponseType: type,
      ResponseParameters: headers
    });
  });

  it("creates a log group per function, so destroying the stack takes the logs with it", () => {
    // Only true with cdk.json's useCdkManagedLogGroup flag; without it Lambda
    // creates log groups at runtime, outside the stack, and they're orphaned.
    template.resourceCountIs("AWS::Logs::LogGroup", productRoutes.length + 1);
  });

  it("retains nothing when the stack is destroyed or a resource is replaced", () => {
    const kept = Object.entries(template.toJSON().Resources as Record<string, Record<string, unknown>>)
      .filter(([, resource]) =>
        [resource.DeletionPolicy, resource.UpdateReplacePolicy].some(
          policy => policy === "Retain" || policy === "RetainExceptOnCreate" || policy === "Snapshot"
        )
      )
      .map(([id]) => id);

    expect(kept).toEqual([]);
  });

  it("outputs the API URL", () => {
    template.hasOutput("ProductsApiUrl", {});
  });
});
