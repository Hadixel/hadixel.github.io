import type { NextConfig } from "next";
// The root `.env` is no longer read here, and that is the point of the gateway rather than tidiness.
// This config used to load the monorepo root `.env` so that a build-time prerender could reach
// Postgres, and the comment above it said so plainly. The panel no longer has a database connection
// to make — it asks the gateway over HTTP with the operator's cookie — so the only address it needs is
// the gateway's. That is `NEXT_PUBLIC_API_URL`, inlined at build and declared in the `build` task's
// `env` in turbo.json, so it is part of the cache key. Which is strictly better than a file outside
// the app deciding what the app was built against: that made the build's result depend on the
// directory it was run from, and nothing said so.

const nextConfig: NextConfig = {
  transpilePackages: ["@kmodern/schema", "@kmodern/adapters", "@kmodern/scraper", "@kmodern/ui"],
  allowedDevOrigins: [process.env.ADMIN_DEV_ORIGIN ?? "192.168.70.176", "localhost", "127.0.0.1"],
  async headers() {
    return [
      {
        source: "/media/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'" },
        ],
      },
    ];
  },
};

export default nextConfig;
