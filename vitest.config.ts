import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@application": resolve(__dirname, "packages/application"),
      "@database": resolve(__dirname, "packages/database"),
      "@domain": resolve(__dirname, "packages/domain"),
      "@shared": resolve(__dirname, "packages/shared"),
      "@audit": resolve(__dirname, "packages/audit"),
      "@backup": resolve(__dirname, "packages/backup"),
      "@reports": resolve(__dirname, "packages/reports"),
      "@security": resolve(__dirname, "packages/security"),
      "@infrastructure": resolve(__dirname, "packages/infrastructure")
    }
  }
});
