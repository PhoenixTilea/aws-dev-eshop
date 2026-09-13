import type { APIGatewayEvent } from "aws-lambda";

import { createResponse } from "../utils";

export const handler = () =>
  createResponse(200);