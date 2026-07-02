import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // SPA specs only. apps/server runs its own node:test suite, so keep the
    // Vitest scope on the frontend to avoid cross-picking server tests.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
