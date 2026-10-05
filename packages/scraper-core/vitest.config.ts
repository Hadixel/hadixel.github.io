import { defineConfig } from "vitest/config";

// The library half of the scraper has no tests of its own: its suite lives with the app that
// consumes it (`apps/scraper/tests`), because that is where the CLI behaviour it covers is.
// `passWithNoTests` says so out loud rather than letting `vitest run` fail on a missing directory.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
