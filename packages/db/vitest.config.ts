import { defineConfig } from "vitest/config";

// DESTRUCTIVE. These tests truncate the schema they run against, and only ever the disposable
// database that scripts/test-db.sh boots. See tests/setup.ts, which refuses to run otherwise.
export default defineConfig({
  test: {
    // Runs before any test module is imported, so the data client is pointed at the disposable
    // database before anything opens a connection.
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // The suite talks to one database, so tests must not run against it concurrently.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
