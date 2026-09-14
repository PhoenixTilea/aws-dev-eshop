import type { APIGatewayEvent } from "aws-lambda";

/**
 * A minimal API Gateway proxy event. The real shape has ~15 required fields
 * (requestContext, resource, stageVariables, ...) that no handler here reads,
 * so we fill in the ones that matter and cast the rest away.
 */
export const makeEvent = (overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent =>
  ({
    body: null,
    headers: {},
    httpMethod: "GET",
    path: "/products",
    pathParameters: null,
    queryStringParameters: null,
    ...overrides
  }) as APIGatewayEvent;
