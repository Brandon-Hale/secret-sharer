import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "services/create/src/**/*.test.ts",
      "services/retrieve/src/**/*.test.ts",
      "web/lib/**/*.test.ts",
    ],
    // services/integration needs a live DynamoDB endpoint and runs under its
    // own script, so it is deliberately absent from the default suite.
    exclude: ["**/node_modules/**", "**/dist/**", "services/integration/**"],
  },
});
