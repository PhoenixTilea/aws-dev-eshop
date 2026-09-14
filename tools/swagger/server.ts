import express from "express";
import swaggerUi from "swagger-ui-express";

import { buildSpec } from "../../src/api/openapi";

/**
 * Small Express app for serving a Swagger page for simple testing of the deployed API
 **/
const baseUrl = process.env.API_BASE_URL;
if (!baseUrl) {
  console.error(
    "API_BASE_URL is not set. Use the ProductsApiUrl output from `cdk deploy`, in your shell or in a .env file at the project root."
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);
const spec = buildSpec(baseUrl);

const app = express();

app.get("/openapi.json", (_req, res) => {
  res.json(spec);
});

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    customSiteTitle: "EShop API",
    swaggerOptions: { url: "/openapi.json", displayRequestDuration: true, tryItOutEnabled: true }
  })
);

app.get("/", (_req, res) => {
  res.redirect("/docs");
});

app.listen(port, err => {
  if (err) {
    throw err;
  }
  console.log(`Swagger UI: http://localhost:${port}/docs`);
  console.log(`Sending requests to ${spec.servers?.[0]?.url}`);
});
