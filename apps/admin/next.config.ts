import type { NextConfig } from "next";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

// Root .env holds DATABASE_URL (packages/db/.env is a symlink to it). Next
// only auto-loads the app-dir .env, so load the monorepo root explicitly so
// build-time prerender + runtime can reach Postgres.
loadDotenv({ path: path.resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@kmodern/db", "@kmodern/schema", "@kmodern/adapters", "@kmodern/scraper", "@kmodern/ui"],
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
