/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  test: {
    // Unit tests live in tests/. The e2e/ Playwright specs are run separately
    // via `npm run test:e2e` and must not be collected by Vitest.
    include: ["tests/**/*.test.ts"]
  }
});
