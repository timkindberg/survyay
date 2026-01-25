import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use different configs for different test types
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"], // E2E tests run via Playwright, not Vitest
    environment: "node",
    globals: true,
  },
});
