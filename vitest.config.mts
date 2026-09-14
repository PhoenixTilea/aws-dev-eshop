import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No `globals: true` — describe/it/expect are imported explicitly in each file,
    // which keeps tsconfig's `types` array untouched.
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
          // DynamoDB Local needs a moment to come up.
          testTimeout: 30_000,
          hookTimeout: 30_000
        }
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000
        }
      }
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/app.ts"]
    }
  }
});
