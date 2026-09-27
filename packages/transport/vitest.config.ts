import { defineConfig } from "vitest/config";

// The consumer-facing contract of the transport: what a caller can rely on, not how it is written.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
